package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
	"github.com/Zalaras/muster/internal/claudecode/claudecodetest"
	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/usage"
)

// fakeTokenReader builds a claudecode.TokenReader from a plain func — the D8-style
// injected seam, used here so poller tests never touch a real token source (Keychain or
// file).
func fakeTokenReader(fn func(ctx context.Context) (string, error)) claudecode.TokenReader {
	return fn
}

// oneFableWindowBody is a realistic usage-endpoint response body carrying one per-model
// window named "Fable" at 61% — built via claudecodetest so this file (outside
// internal/claudecode) never has to spell the endpoint's own wire vocabulary itself (the
// D3 boundary check on plan usage-model-bar).
var oneFableWindowBody = claudecodetest.UsageAPIBody(claudecodetest.UsageWindowOpt{DisplayName: "Fable", Percent: 61, ResetsAt: "2026-09-01T13:59:59Z"})

// usageAPIStub is a controllable fake for the per-model usage endpoint: Mode picks the
// canned response, and Requests counts every hit — exactly the harness D7's poller tests
// need (success / 401 / 5xx / connection-refused / coalescing), without ever reaching a
// real network endpoint (REQ-13).
type usageAPIStub struct {
	mu       sync.Mutex
	mode     string // "success" | "success-empty" | "401" | "500"
	srv      *httptest.Server
	requests int32
}

func newUsageAPIStub(mode string) *usageAPIStub {
	s := &usageAPIStub{mode: mode}
	s.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&s.requests, 1)
		s.mu.Lock()
		mode := s.mode
		s.mu.Unlock()
		switch mode {
		case "401":
			w.WriteHeader(http.StatusUnauthorized)
		case "500":
			w.WriteHeader(http.StatusInternalServerError)
		case "success-empty":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"limits": []}`))
		default:
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(oneFableWindowBody))
		}
	}))
	return s
}

func (s *usageAPIStub) setMode(mode string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.mode = mode
}

func (s *usageAPIStub) reqCount() int32 { return atomic.LoadInt32(&s.requests) }

func (s *usageAPIStub) Close() { s.srv.Close() }

func alwaysOKTokenReader(_ context.Context) (string, error) { return "tok", nil }

// TestUsagePoller_Tick_SuccessRecordsWindows covers D7's success case: a fetch that
// succeeds ends up recorded on the ModelScoped holder.
func TestUsagePoller_Tick_SuccessRecordsWindows(t *testing.T) {
	stub := newUsageAPIStub("success")
	defer stub.Close()
	ms := usage.NewModelScoped(usage.ModelScopedConfig{Store: newPollerTestStore(t), Logger: zerolog.Nop()})
	p := newUsagePoller(stub.srv.Client(), stub.srv.URL, fakeTokenReader(alwaysOKTokenReader), time.Hour, ms, zerolog.Nop())

	p.tick(context.Background())

	snap := ms.Current()
	require.Len(t, snap.Windows, 1)
	assert.Equal(t, "Fable", snap.Windows[0].DisplayName)
	assert.Equal(t, 61.0, snap.Windows[0].UsedPct)
	assert.Nil(t, snap.Error)
	assert.NotNil(t, snap.At)
}

// TestUsagePoller_Tick_NoCredentialsSetsErrorKeepsListNil covers REQ-6/INV-3 from the
// never-fetched source state: a token-read failure sets "no-credentials" and never
// invents a list.
func TestUsagePoller_Tick_NoCredentialsSetsErrorKeepsListNil(t *testing.T) {
	stub := newUsageAPIStub("success")
	defer stub.Close()
	ms := usage.NewModelScoped(usage.ModelScopedConfig{Store: newPollerTestStore(t), Logger: zerolog.Nop()})
	failingReader := fakeTokenReader(func(_ context.Context) (string, error) { return "", claudecode.ErrNoCredentials })
	p := newUsagePoller(stub.srv.Client(), stub.srv.URL, failingReader, time.Hour, ms, zerolog.Nop())

	p.tick(context.Background())

	snap := ms.Current()
	assert.Nil(t, snap.Windows)
	assert.Nil(t, snap.At)
	require.NotNil(t, snap.Error)
	assert.Equal(t, "no-credentials", *snap.Error)
	assert.Equal(t, int32(0), stub.reqCount(), "no token means FetchUsage must never even be attempted")
}

// TestUsagePoller_Tick_UnauthorizedKeepsLastGoodListAndAt covers REQ-6/INV-3 from the
// "after a good fetch" source state (m1-sessions lesson: assert invariants from every
// reachable state, not just the convenient boot one).
func TestUsagePoller_Tick_UnauthorizedKeepsLastGoodListAndAt(t *testing.T) {
	stub := newUsageAPIStub("success")
	defer stub.Close()
	ms := usage.NewModelScoped(usage.ModelScopedConfig{Store: newPollerTestStore(t), Logger: zerolog.Nop()})
	p := newUsagePoller(stub.srv.Client(), stub.srv.URL, fakeTokenReader(alwaysOKTokenReader), time.Hour, ms, zerolog.Nop())

	p.tick(context.Background())
	good := ms.Current()
	require.NotNil(t, good.Windows)
	require.NotNil(t, good.At)

	stub.setMode("401")
	p.tick(context.Background())

	after := ms.Current()
	assert.Equal(t, good.Windows, after.Windows, "a 401 must never change the last-good list")
	assert.Equal(t, good.At, after.At, "a 401 must never change the last-good fetch time")
	require.NotNil(t, after.Error)
	assert.Equal(t, "unauthorized", *after.Error)
}

// TestUsagePoller_Tick_5xxMapsToUnreachable covers the "anything else" branch of
// usageErrorKind.
func TestUsagePoller_Tick_5xxMapsToUnreachable(t *testing.T) {
	stub := newUsageAPIStub("500")
	defer stub.Close()
	ms := usage.NewModelScoped(usage.ModelScopedConfig{Store: newPollerTestStore(t), Logger: zerolog.Nop()})
	p := newUsagePoller(stub.srv.Client(), stub.srv.URL, fakeTokenReader(alwaysOKTokenReader), time.Hour, ms, zerolog.Nop())

	p.tick(context.Background())

	snap := ms.Current()
	require.NotNil(t, snap.Error)
	assert.Equal(t, "unreachable", *snap.Error)
	assert.Nil(t, snap.Windows)
}

// TestUsagePoller_Tick_ConnectionRefusedMapsToUnreachable covers the same mapping from
// an actually-unreachable endpoint, not just a 5xx response.
func TestUsagePoller_Tick_ConnectionRefusedMapsToUnreachable(t *testing.T) {
	stub := newUsageAPIStub("success")
	closedURL := stub.srv.URL
	stub.Close() // now nothing is listening
	ms := usage.NewModelScoped(usage.ModelScopedConfig{Store: newPollerTestStore(t), Logger: zerolog.Nop()})
	p := newUsagePoller(http.DefaultClient, closedURL, fakeTokenReader(alwaysOKTokenReader), time.Hour, ms, zerolog.Nop())

	p.tick(context.Background())

	snap := ms.Current()
	require.NotNil(t, snap.Error)
	assert.Equal(t, "unreachable", *snap.Error)
}

// TestUsagePoller_Tick_EmptyLimitsIsARecordedEmptySuccess covers Edge Case 4: a 200 with
// no per-model windows is success, not "unreachable" or "no-credentials" — the
// poller must still call Record with a non-nil empty slice per its own doc comment
// ("a successful fetch is represented as a non-nil ... slice even when
// report.ModelScoped itself is nil").
func TestUsagePoller_Tick_EmptyLimitsIsARecordedEmptySuccess(t *testing.T) {
	stub := newUsageAPIStub("success-empty")
	defer stub.Close()
	ms := usage.NewModelScoped(usage.ModelScopedConfig{Store: newPollerTestStore(t), Logger: zerolog.Nop()})
	p := newUsagePoller(stub.srv.Client(), stub.srv.URL, fakeTokenReader(alwaysOKTokenReader), time.Hour, ms, zerolog.Nop())

	p.tick(context.Background())

	snap := ms.Current()
	assert.NotNil(t, snap.Windows, "an empty successful fetch must not collapse to the never-fetched nil")
	assert.Empty(t, snap.Windows)
	assert.NotNil(t, snap.At)
	assert.Nil(t, snap.Error)
}

// TestUsagePoller_Refresh_ChannelCoalescesToOneBufferedSignal is a direct test of the
// Refresh() coalescing contract at the channel level (Edge Case 7): any number of
// concurrent calls collapse into at most one pending signal.
func TestUsagePoller_Refresh_ChannelCoalescesToOneBufferedSignal(t *testing.T) {
	ms := usage.NewModelScoped(usage.ModelScopedConfig{Store: newPollerTestStore(t), Logger: zerolog.Nop()})
	p := newUsagePoller(http.DefaultClient, "http://unused.invalid", fakeTokenReader(alwaysOKTokenReader), time.Hour, ms, zerolog.Nop())

	p.Refresh()
	p.Refresh()
	p.Refresh()

	select {
	case <-p.refresh:
	default:
		t.Fatal("expected exactly one buffered refresh signal")
	}
	select {
	case <-p.refresh:
		t.Fatal("expected only one buffered refresh signal, found a second")
	default:
	}
}

// TestUsagePoller_Refresh_ConcurrentRefreshesWhileATickIsInFlightCoalesceToOneExtraFetch
// covers D7's "refresh coalescing" requirement (Edge Case 7/8) deterministically: the
// loop goroutine is busy inside Start's immediate fetch (held open by the handler) when
// three Refresh() calls land, so at most one signal can ever be buffered — releasing the
// held request must then produce exactly one more fetch, not three.
//
// A "fire Refresh() twice back-to-back after the first fetch already returned" version
// of this test is inherently racy: the loop goroutine may already have drained the first
// buffered signal before the second Refresh() call runs, so both sends can legitimately
// succeed without violating the coalescing contract at all. Holding the first request
// open removes that race by construction.
func TestUsagePoller_Refresh_ConcurrentRefreshesWhileATickIsInFlightCoalesceToOneExtraFetch(t *testing.T) {
	release := make(chan struct{})
	var requests int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if atomic.AddInt32(&requests, 1) == 1 {
			<-release // hold Start's immediate fetch in flight until the test releases it
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(oneFableWindowBody))
	}))
	defer srv.Close()

	ms := usage.NewModelScoped(usage.ModelScopedConfig{Store: newPollerTestStore(t), Logger: zerolog.Nop()})
	p := newUsagePoller(srv.Client(), srv.URL, fakeTokenReader(alwaysOKTokenReader), time.Hour, ms, zerolog.Nop())

	p.Start()
	defer p.Stop(context.Background())

	require.Eventually(t, func() bool { return atomic.LoadInt32(&requests) >= 1 }, time.Second, 5*time.Millisecond, "Start must fetch immediately (REQ-1)")

	// The loop goroutine is now blocked inside tick()'s HTTP call — any number of
	// Refresh() calls here can buffer at most one signal (Edge Case 8: "a refresh
	// arriving while a fetch is already in flight is picked up as the very next tick").
	p.Refresh()
	p.Refresh()
	p.Refresh()

	close(release)

	require.Eventually(t, func() bool { return atomic.LoadInt32(&requests) >= 2 }, time.Second, 5*time.Millisecond, "the coalesced refresh must still produce one more fetch once the in-flight one completes")
	time.Sleep(150 * time.Millisecond)
	assert.Equal(t, int32(2), atomic.LoadInt32(&requests), "three refreshes fired while a tick was in flight must coalesce into exactly one extra fetch")
}

// TestUsagePoller_StartStop_LoopExitsPromptly guards against a goroutine leak: Stop must
// return once the loop has actually exited.
func TestUsagePoller_StartStop_LoopExitsPromptly(t *testing.T) {
	stub := newUsageAPIStub("success")
	defer stub.Close()
	ms := usage.NewModelScoped(usage.ModelScopedConfig{Store: newPollerTestStore(t), Logger: zerolog.Nop()})
	p := newUsagePoller(stub.srv.Client(), stub.srv.URL, fakeTokenReader(alwaysOKTokenReader), time.Hour, ms, zerolog.Nop())

	p.Start()
	require.Eventually(t, func() bool { return stub.reqCount() >= 1 }, time.Second, 5*time.Millisecond)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	p.Stop(ctx)

	assert.NoError(t, ctx.Err(), "Stop must return well within its deadline for a loop with no in-flight work")
}

// newPollerTestStore opens a fresh, migrated SQLite store for a ModelScoped holder —
// poller tests only care about the in-memory Current() state, but ModelScoped.Record
// always persists through a real store.
func newPollerTestStore(t *testing.T) *store.Store {
	t.Helper()
	st, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "muster.db"))
	require.NoError(t, err)
	t.Cleanup(func() { _ = st.Close() })
	return st
}
