package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
	"github.com/Zalaras/muster/internal/usage"
)

// newPollerHolders builds the Aggregator and ModelScoped a poller feeds on one store. A
// non-nil onChange is called whenever either holder takes a value, as usageFeature wires
// notifyPoller in production.
func newPollerHolders(t *testing.T, onChange func()) (*usage.Aggregator, *usage.ModelScoped) {
	t.Helper()
	st := newPollerTestStore(t)
	changed := func() {
		if onChange != nil {
			onChange()
		}
	}
	agg := usage.NewAggregator(usage.Config{Store: st, Logger: zerolog.Nop(), OnChange: func(usage.Snapshot) { changed() }})
	ms := usage.NewModelScoped(usage.ModelScopedConfig{Store: st, Logger: zerolog.Nop(), OnChange: func(usage.ModelSnapshot) { changed() }})
	return agg, ms
}

func rfc3339(t time.Time) string { return t.UTC().Format(time.RFC3339Nano) }

// bucketsBody is a usage response carrying the two top-level windows and the Fable model
// window; a nil bucket is omitted.
func bucketsBody(five, seven *claudecodetest.UsageBucketOpt) string {
	return claudecodetest.UsageAPIBucketsBody(five, seven, claudecodetest.UsageWindowOpt{DisplayName: "Fable", Percent: 61, ResetsAt: rfc3339(time.Now().Add(240 * time.Hour))})
}

func newBucketPoller(t *testing.T, stub *usageAPIStub, reader claudecode.TokenReader, onChange func()) (*usagePoller, *usage.Aggregator, *usage.ModelScoped) {
	t.Helper()
	agg, ms := newPollerHolders(t, onChange)
	return newUsagePoller(stub.srv.Client(), stub.srv.URL, reader, time.Hour, agg, ms, zerolog.Nop()), agg, ms
}

// TestUsagePoller_Tick_SuccessFeedsBucketsAndWindows covers REQ-1/D1: a successful call
// offers the 5h and 7d windows to the aggregator alongside the per-model windows.
func TestUsagePoller_Tick_SuccessFeedsBucketsAndWindows(t *testing.T) {
	five := &claudecodetest.UsageBucketOpt{Percent: 40, ResetsAt: rfc3339(time.Now().Add(time.Hour))}
	seven := &claudecodetest.UsageBucketOpt{Percent: 25, ResetsAt: rfc3339(time.Now().Add(48 * time.Hour))}
	cases := []struct {
		name                  string
		five, seven           *claudecodetest.UsageBucketOpt
		wantFive, wantSeven   float64
		fiveKnown, sevenKnown bool
	}{
		{"both windows", five, seven, 40, 25, true, true},
		{"only five_hour", five, nil, 40, 0, true, false},
		{"only seven_day", nil, seven, 0, 25, false, true},
		{"neither", nil, nil, 0, 0, false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			stub := newUsageAPIStub("success")
			defer stub.Close()
			stub.setBody(bucketsBody(tc.five, tc.seven))
			p, agg, ms := newBucketPoller(t, stub, fakeTokenReader(alwaysOKTokenReader), nil)

			p.tick(context.Background())

			snap := agg.Current()
			assert.Equal(t, tc.fiveKnown, snap.FiveHour != nil)
			assert.Equal(t, tc.sevenKnown, snap.SevenDay != nil)
			if tc.fiveKnown {
				assert.Equal(t, tc.wantFive, snap.FiveHour.UsedPct)
			}
			if tc.sevenKnown {
				assert.Equal(t, tc.wantSeven, snap.SevenDay.UsedPct)
			}
			assert.Equal(t, tc.fiveKnown || tc.sevenKnown, snap.SampledAt != nil, "SampledAt is nil iff both buckets are")
			require.Len(t, ms.Current().Windows, 1, "the per-model windows are still recorded")
		})
	}
}

// TestUsagePoller_Tick_PastResetBucketsAreNotAdopted covers REQ-3 at the seam: a call
// answering with the old window (its reset already passed) leaves the bars as they were.
func TestUsagePoller_Tick_PastResetBucketsAreNotAdopted(t *testing.T) {
	stub := newUsageAPIStub("success")
	defer stub.Close()
	past := rfc3339(time.Now().Add(-time.Hour))
	stub.setBody(bucketsBody(&claudecodetest.UsageBucketOpt{Percent: 100, ResetsAt: past}, &claudecodetest.UsageBucketOpt{Percent: 100, ResetsAt: past}))
	p, agg, ms := newBucketPoller(t, stub, fakeTokenReader(alwaysOKTokenReader), nil)

	p.tick(context.Background())

	snap := agg.Current()
	assert.Nil(t, snap.FiveHour)
	assert.Nil(t, snap.SevenDay)
	assert.Nil(t, snap.SampledAt)
	assert.NotNil(t, ms.Current().Windows, "the model windows are unaffected")
}

// TestUsagePoller_Tick_RepeatedIdenticalCallBroadcastsNothingNew covers REQ-9 at the
// seam: the second identical call changes neither holder, so neither notifies.
func TestUsagePoller_Tick_RepeatedIdenticalCallBroadcastsNothingNew(t *testing.T) {
	stub := newUsageAPIStub("success")
	defer stub.Close()
	stub.setBody(bucketsBody(
		&claudecodetest.UsageBucketOpt{Percent: 40, ResetsAt: rfc3339(time.Now().Add(time.Hour))},
		&claudecodetest.UsageBucketOpt{Percent: 25, ResetsAt: rfc3339(time.Now().Add(48 * time.Hour))}))
	var changes int32
	p, _, _ := newBucketPoller(t, stub, fakeTokenReader(alwaysOKTokenReader), func() { atomic.AddInt32(&changes, 1) })

	p.tick(context.Background())
	afterFirst := atomic.LoadInt32(&changes)
	require.NotZero(t, afterFirst)
	p.tick(context.Background())

	assert.Equal(t, afterFirst, atomic.LoadInt32(&changes))
}

// TestUsagePoller_Tick_FailureLeavesBucketsAsTheyWere covers REQ-7/D10 from both source
// states (never fetched, a good fetch before) for every failure kind.
func TestUsagePoller_Tick_FailureLeavesBucketsAsTheyWere(t *testing.T) {
	failures := []struct {
		name  string
		mode  string
		token func(context.Context) (string, error)
		kind  string
	}{
		{"no-credentials", "success", func(context.Context) (string, error) { return "", claudecode.ErrNoCredentials }, "no-credentials"},
		{"unauthorized", "401", alwaysOKTokenReader, "unauthorized"},
		{"unreachable", "500", alwaysOKTokenReader, "unreachable"},
	}
	for _, known := range []bool{false, true} {
		for _, f := range failures {
			name := f.name + "/never fetched"
			if known {
				name = f.name + "/after a good fetch"
			}
			t.Run(name, func(t *testing.T) {
				stub := newUsageAPIStub("success")
				defer stub.Close()
				stub.setBody(bucketsBody(
					&claudecodetest.UsageBucketOpt{Percent: 40, ResetsAt: rfc3339(time.Now().Add(time.Hour))},
					&claudecodetest.UsageBucketOpt{Percent: 25, ResetsAt: rfc3339(time.Now().Add(48 * time.Hour))}))
				good, agg, ms := newBucketPoller(t, stub, fakeTokenReader(alwaysOKTokenReader), nil)
				if known {
					good.tick(context.Background())
					require.NotNil(t, agg.Current().FiveHour)
				}
				before := agg.Current()
				stub.setMode(f.mode)
				failing := newUsagePoller(stub.srv.Client(), stub.srv.URL, fakeTokenReader(f.token), time.Hour, agg, ms, zerolog.Nop())

				failing.tick(context.Background())

				after := agg.Current()
				assert.Equal(t, before, after, "a failed call changes neither bucket nor SampledAt")
				require.NotNil(t, ms.Current().Error)
				assert.Equal(t, f.kind, *ms.Current().Error, "only modelScopedError reports the failure")
			})
		}
	}

	t.Run("connection refused", func(t *testing.T) {
		stub := newUsageAPIStub("success")
		closedURL := stub.srv.URL
		stub.Close()
		agg, ms := newPollerHolders(t, nil)
		p := newUsagePoller(http.DefaultClient, closedURL, fakeTokenReader(alwaysOKTokenReader), time.Hour, agg, ms, zerolog.Nop())

		p.tick(context.Background())

		assert.Nil(t, agg.Current().FiveHour)
		assert.Nil(t, agg.Current().SevenDay)
		require.NotNil(t, ms.Current().Error)
		assert.Equal(t, "unreachable", *ms.Current().Error)
	})
}

func TestNextReset(t *testing.T) {
	now := time.Date(2099, 1, 1, 12, 0, 0, 0, time.UTC)
	at := now.Add
	snap := func(five, seven *time.Time) usage.Snapshot {
		var s usage.Snapshot
		if five != nil {
			s.FiveHour = &usage.Bucket{ResetsAt: *five}
		}
		if seven != nil {
			s.SevenDay = &usage.Bucket{ResetsAt: *seven}
		}
		return s
	}
	t1, t2, t3, tPast, tNow := at(time.Hour), at(2*time.Hour), at(3*time.Hour), at(-time.Hour), now
	cases := []struct {
		name    string
		snap    usage.Snapshot
		windows []usage.ModelWindow
		want    time.Time
		wantOK  bool
	}{
		{"nothing known", snap(nil, nil), nil, time.Time{}, false},
		{"five-hour only", snap(&t2, nil), nil, t2, true},
		{"seven-day only", snap(nil, &t2), nil, t2, true},
		{"earliest of five-hour and seven-day", snap(&t3, &t2), nil, t2, true},
		{"model window earliest", snap(&t3, &t2), []usage.ModelWindow{{ResetsAt: t3}, {ResetsAt: t1}}, t1, true},
		{"model window alone", snap(nil, nil), []usage.ModelWindow{{ResetsAt: t2}}, t2, true},
		{"a passed reset is never waited for", snap(&tPast, &t3), []usage.ModelWindow{{ResetsAt: tPast}}, t3, true},
		{"a reset equal to now has passed", snap(&tNow, nil), nil, time.Time{}, false},
		{"only passed resets", snap(&tPast, &tPast), []usage.ModelWindow{{ResetsAt: tPast}}, time.Time{}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := nextReset(now, tc.snap, tc.windows)

			assert.Equal(t, tc.wantOK, ok)
			assert.True(t, tc.want.Equal(got), "want %v got %v", tc.want, got)
		})
	}
}

// startNotifyingPoller builds a poller whose holders notify its reset watcher the way
// usageFeature does, hourly timer so only the reset wake can cause a second call.
func startNotifyingPoller(t *testing.T, stub *usageAPIStub) (*usagePoller, *usage.Aggregator) {
	t.Helper()
	var ptr atomic.Pointer[usagePoller]
	agg, ms := newPollerHolders(t, func() {
		if p := ptr.Load(); p != nil {
			p.notify()
		}
	})
	p := newUsagePoller(stub.srv.Client(), stub.srv.URL, fakeTokenReader(alwaysOKTokenReader), time.Hour, agg, ms, zerolog.Nop())
	ptr.Store(p)
	return p, agg
}

func recordStatus(t *testing.T, agg *usage.Aggregator, fiveResetsAt, sevenResetsAt time.Time) {
	t.Helper()
	require.NoError(t, agg.Record(context.Background(), usage.Sample{
		FiveHour: usage.Bucket{UsedPct: 100, ResetsAt: fiveResetsAt},
		SevenDay: usage.Bucket{UsedPct: 50, ResetsAt: sevenResetsAt},
	}))
}

// TestUsagePoller_ResetWake covers REQ-4/D4: a call is made at the reset instant of the
// 5h bucket, the 7d bucket and a per-model window, each wakes it exactly once, and the
// endpoint is hit after the instant.
func TestUsagePoller_ResetWake(t *testing.T) {
	const delay = 400 * time.Millisecond
	far := 48 * time.Hour
	cases := []struct {
		name string
		// arrange runs before Start and returns the instant the poller must wake at.
		arrange func(t *testing.T, stub *usageAPIStub, agg *usage.Aggregator) time.Time
	}{
		{"five-hour bucket", func(t *testing.T, _ *usageAPIStub, agg *usage.Aggregator) time.Time {
			reset := time.Now().Add(delay)
			recordStatus(t, agg, reset, time.Now().Add(far))
			return reset
		}},
		{"seven-day bucket", func(t *testing.T, _ *usageAPIStub, agg *usage.Aggregator) time.Time {
			reset := time.Now().Add(delay)
			recordStatus(t, agg, time.Now().Add(far), reset)
			return reset
		}},
		{"per-model window learned from the start-up call", func(_ *testing.T, stub *usageAPIStub, _ *usage.Aggregator) time.Time {
			reset := time.Now().Add(delay)
			stub.setBody(claudecodetest.UsageAPIBody(claudecodetest.UsageWindowOpt{DisplayName: "Fable", Percent: 61, ResetsAt: rfc3339(reset)}))
			return reset
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			stub := newUsageAPIStub("success")
			defer stub.Close()
			p, agg := startNotifyingPoller(t, stub)
			reset := tc.arrange(t, stub, agg)

			p.Start()
			defer p.Stop(context.Background())

			require.Eventually(t, func() bool { return stub.reqCount() >= 2 }, 3*time.Second, 10*time.Millisecond, "the reset instant must wake a call without any timer or click")
			assert.False(t, stub.lastHit().Before(reset), "the wake call comes at or after the reset instant, not before")
			assert.Never(t, func() bool { return stub.reqCount() > 2 }, 400*time.Millisecond, 20*time.Millisecond, "each reset instant wakes the poller once")
		})
	}
}

// TestUsagePoller_ResetWake_FollowsAMovedReset covers the watcher re-arming: a reset that
// moves later before it passes (a fresher value arrived) no longer wakes a call.
func TestUsagePoller_ResetWake_FollowsAMovedReset(t *testing.T) {
	stub := newUsageAPIStub("success")
	defer stub.Close()
	p, agg := startNotifyingPoller(t, stub)
	recordStatus(t, agg, time.Now().Add(700*time.Millisecond), time.Now().Add(72*time.Hour))
	p.Start()
	defer p.Stop(context.Background())
	require.Eventually(t, func() bool { return stub.reqCount() >= 1 }, time.Second, 5*time.Millisecond)

	recordStatus(t, agg, time.Now().Add(48*time.Hour), time.Now().Add(72*time.Hour))

	assert.Never(t, func() bool { return stub.reqCount() > 1 }, time.Second, 20*time.Millisecond, "the earlier instant is no longer a known reset")
}

// TestUsagePoller_ResetWake_CoalescesWithTheCallInFlight covers D4/Edge Case 7: resets
// falling while a call is in flight cost at most one extra call.
func TestUsagePoller_ResetWake_CoalescesWithTheCallInFlight(t *testing.T) {
	release := make(chan struct{})
	var requests int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if atomic.AddInt32(&requests, 1) == 1 {
			<-release
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"limits": []}`))
	}))
	defer srv.Close()
	var ptr atomic.Pointer[usagePoller]
	agg, ms := newPollerHolders(t, func() {
		if p := ptr.Load(); p != nil {
			p.notify()
		}
	})
	p := newUsagePoller(srv.Client(), srv.URL, fakeTokenReader(alwaysOKTokenReader), time.Hour, agg, ms, zerolog.Nop())
	ptr.Store(p)
	soon := time.Now().Add(300 * time.Millisecond)
	recordStatus(t, agg, soon, soon.Add(50*time.Millisecond))
	p.Start()
	defer p.Stop(context.Background())
	require.Eventually(t, func() bool { return atomic.LoadInt32(&requests) >= 1 }, time.Second, 5*time.Millisecond)

	require.Eventually(t, func() bool { return time.Now().After(soon.Add(150 * time.Millisecond)) }, time.Second, 10*time.Millisecond, "both resets pass while the first call is held in flight")
	close(release)

	require.Eventually(t, func() bool { return atomic.LoadInt32(&requests) >= 2 }, time.Second, 5*time.Millisecond)
	assert.Never(t, func() bool { return atomic.LoadInt32(&requests) > 2 }, 400*time.Millisecond, 20*time.Millisecond, "both resets passed during one call: at most one extra call")
}

// TestUsagePoller_NoResetKnownMakesNoExtraCall covers the watcher idling with nothing to wait for.
func TestUsagePoller_NoResetKnownMakesNoExtraCall(t *testing.T) {
	stub := newUsageAPIStub("success-empty")
	defer stub.Close()
	p, _ := startNotifyingPoller(t, stub)
	p.Start()
	defer p.Stop(context.Background())
	require.Eventually(t, func() bool { return stub.reqCount() >= 1 }, time.Second, 5*time.Millisecond)

	assert.Never(t, func() bool { return stub.reqCount() > 1 }, 300*time.Millisecond, 20*time.Millisecond)
}

// TestUsagePoller_StopEndsAnArmedWatcher guards the watcher goroutine against outliving Stop.
func TestUsagePoller_StopEndsAnArmedWatcher(t *testing.T) {
	stub := newUsageAPIStub("success")
	defer stub.Close()
	p, agg := startNotifyingPoller(t, stub)
	recordStatus(t, agg, time.Now().Add(time.Hour), time.Now().Add(48*time.Hour))
	p.Start()
	require.Eventually(t, func() bool { return stub.reqCount() >= 1 }, time.Second, 5*time.Millisecond)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	p.Stop(ctx)

	assert.NoError(t, ctx.Err(), "Stop returns promptly while the watcher waits on an hour-away reset")
}

// TestUsageFeature_PollingDisabledHasNoWatcher covers D5: with polling off there is no
// poller, so no reset wakes a call, and the holders' change callbacks cope with that.
func TestUsageFeature_PollingDisabledHasNoWatcher(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	require.Nil(t, srv.usage.poller)
	assert.NotPanics(t, func() {
		srv.usage.notifyPoller()
		require.NoError(t, srv.usage.aggregator.RecordFetch(context.Background(),
			&usage.Bucket{UsedPct: 10, ResetsAt: time.Now().Add(time.Hour)}, nil))
	})
	require.NotNil(t, srv.usage.aggregator.Current().FiveHour, "the bucket is held; nothing re-fetches it at its reset")
}
