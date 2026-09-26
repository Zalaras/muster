package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// newTestModelsFeature builds a *modelsFeature with identify defaulting to one fixed,
// always-resolvable identity — every test below overrides check (and identify, for the
// identity-change cases) rather than touching the real filesystem or $PATH
// (docs/conventions.md § Testing).
func newTestModelsFeature(t *testing.T) *modelsFeature {
	t.Helper()
	return &modelsFeature{
		claudeBin: "claude",
		checkDir:  t.TempDir(),
		identify: func() (claudecode.BinaryIdentity, error) {
			return claudecode.BinaryIdentity{Path: "/fake/claude", Size: 1, ModTime: time.Unix(0, 0)}, nil
		},
		log: zerolog.Nop(),
	}
}

// --- modelsFeature.verdict (D1/D3/D4/D5/INV-3/INV-4) ---

// TestModelsFeature_TwoLookupsSameIdentityOneCheckRun is D1: a model already answered
// under the current identity is served from the cache — a second lookup runs no
// subprocess (REQ-2).
func TestModelsFeature_TwoLookupsSameIdentityOneCheckRun(t *testing.T) {
	f := newTestModelsFeature(t)
	var calls int32
	f.check = func(context.Context, string, string, string) (claudecode.ModelVerdict, error) {
		atomic.AddInt32(&calls, 1)
		return claudecode.ModelRecognised, nil
	}

	first := f.verdict(context.Background(), "sonnet")
	second := f.verdict(context.Background(), "sonnet")

	assert.Equal(t, catalogRecognized, first)
	assert.Equal(t, catalogRecognized, second)
	assert.Equal(t, int32(1), atomic.LoadInt32(&calls), "D1: a cached model must never re-run the check")
}

// TestModelsFeature_FourUncachedModelsCheckedConcurrently is D2: verdicts() fans out one
// goroutine per requested model, so four cold checks run concurrently rather than one
// after another — proven by having the fake run block until all four have started.
func TestModelsFeature_FourUncachedModelsCheckedConcurrently(t *testing.T) {
	f := newTestModelsFeature(t)
	var started int32
	allStarted := make(chan struct{})
	var closeOnce sync.Once
	f.check = func(_ context.Context, _, _, model string) (claudecode.ModelVerdict, error) {
		if atomic.AddInt32(&started, 1) == 4 {
			closeOnce.Do(func() { close(allStarted) })
		}
		select {
		case <-allStarted:
		case <-time.After(2 * time.Second):
			t.Errorf("check for %q: not all four checks started concurrently (REQ-1)", model)
		}
		return claudecode.ModelRecognised, nil
	}

	verdicts := f.verdicts(context.Background(), []string{"sonnet", "opus", "haiku", "fable"})

	assert.Equal(t, int32(4), atomic.LoadInt32(&started))
	for _, v := range verdicts {
		assert.Equal(t, "recognized", v.Verdict, "model %q", v.Model)
	}
}

// TestModelsFeature_ChangedIdentityNeverReturnsOldVerdict is D3/INV-3: a changed
// identity (a Claude Code update, or any in-place replacement of the resolved binary)
// re-runs the check and never returns the superseded identity's cached verdict.
func TestModelsFeature_ChangedIdentityNeverReturnsOldVerdict(t *testing.T) {
	f := newTestModelsFeature(t)
	identityA := claudecode.BinaryIdentity{Path: "/bin/claude", Size: 1, ModTime: time.Unix(1, 0)}
	identityB := claudecode.BinaryIdentity{Path: "/bin/claude", Size: 2, ModTime: time.Unix(2, 0)}
	var identityCalls int32
	f.identify = func() (claudecode.BinaryIdentity, error) {
		if atomic.AddInt32(&identityCalls, 1) == 1 {
			return identityA, nil
		}
		return identityB, nil
	}
	var calls int32
	f.check = func(context.Context, string, string, string) (claudecode.ModelVerdict, error) {
		n := atomic.AddInt32(&calls, 1)
		if n == 1 {
			return claudecode.ModelUnrecognised, nil // identity A's verdict for "zephyr"
		}
		return claudecode.ModelRecognised, nil // identity B's verdict for the same model
	}

	first := f.verdict(context.Background(), "zephyr")
	second := f.verdict(context.Background(), "zephyr")

	assert.Equal(t, catalogUnrecognized, first)
	assert.Equal(t, catalogRecognized, second,
		"INV-3: a lookup under a new identity must never return the old identity's cached verdict")
	assert.Equal(t, int32(2), atomic.LoadInt32(&calls), "the identity change must force a fresh check run")
}

// TestModelsFeature_CheckError_UncheckedAndNeverCached is D4/REQ-3/INV-4's run-error and
// timeout half: an errored check answers unchecked and is never cached, so every
// subsequent lookup runs it again.
func TestModelsFeature_CheckError_UncheckedAndNeverCached(t *testing.T) {
	f := newTestModelsFeature(t)
	var calls int32
	f.check = func(context.Context, string, string, string) (claudecode.ModelVerdict, error) {
		atomic.AddInt32(&calls, 1)
		return claudecode.ModelRecognised, errors.New("wedged binary")
	}

	first := f.verdict(context.Background(), "sonnet")
	second := f.verdict(context.Background(), "sonnet")

	assert.Equal(t, catalogUnchecked, first)
	assert.Equal(t, catalogUnchecked, second)
	assert.Equal(t, int32(2), atomic.LoadInt32(&calls),
		"REQ-3/INV-4: an errored check must never be cached, so a second lookup must run it again")
}

// TestModelsFeature_UnresolvableIdentity_UncheckedWithoutRunningCheck is D4/REQ-3's
// other half: an identity that cannot be resolved (not on $PATH, a dangling symlink)
// answers unchecked without ever invoking the check subprocess.
func TestModelsFeature_UnresolvableIdentity_UncheckedWithoutRunningCheck(t *testing.T) {
	f := newTestModelsFeature(t)
	f.identify = func() (claudecode.BinaryIdentity, error) {
		return claudecode.BinaryIdentity{}, errors.New("claude: not on $PATH")
	}
	var calls int32
	f.check = func(context.Context, string, string, string) (claudecode.ModelVerdict, error) {
		atomic.AddInt32(&calls, 1)
		return claudecode.ModelRecognised, nil
	}

	got := f.verdict(context.Background(), "sonnet")

	assert.Equal(t, catalogUnchecked, got)
	assert.Equal(t, int32(0), atomic.LoadInt32(&calls), "REQ-3: an unresolvable identity must never run the check")
}

// TestModelsFeature_ConcurrentLookupsShareOneRun is D5/REQ-5: two concurrent lookups of
// one (identity, model) must share one run rather than spawning a second check —
// covering the dialog's open-time request racing a Launch pressed before it answers.
func TestModelsFeature_ConcurrentLookupsShareOneRun(t *testing.T) {
	f := newTestModelsFeature(t)
	var calls int32
	release := make(chan struct{})
	f.check = func(context.Context, string, string, string) (claudecode.ModelVerdict, error) {
		atomic.AddInt32(&calls, 1)
		<-release
		return claudecode.ModelRecognised, nil
	}

	start := make(chan struct{})
	results := make([]modelVerdict, 2)
	var wg sync.WaitGroup
	wg.Add(2)
	for i := range results {
		go func(i int) {
			defer wg.Done()
			<-start
			results[i] = f.verdict(context.Background(), "sonnet")
		}(i)
	}
	close(start)
	// Scheduling headroom only, not a correctness wait: the assertion below
	// (calls == 1) holds regardless of interleaving — this just gives both goroutines a
	// chance to reach the shared map before the one run either of them is waiting on is
	// allowed to finish.
	time.Sleep(20 * time.Millisecond)
	close(release)
	wg.Wait()

	assert.Equal(t, int32(1), atomic.LoadInt32(&calls), "REQ-5: two concurrent lookups of one (identity, model) must share one run")
	assert.Equal(t, []modelVerdict{catalogRecognized, catalogRecognized}, results)
}

// TestModelsFeature_CheckInFlightWhenIdentityChanges_NotCachedNorServed is INV-3's only
// non-trivial path, the concurrent one D3 doesn't reach: a check started under identity A
// is still blocked in f.check when a lookup under a new identity B arrives, resets the
// maps and registers its own in-flight run — and A's check then finishes while B's run is
// still going. A's finish must not remove B's still-live in-flight entry (the guard this
// test drives), so a further concurrent B lookup still finds it and shares B's run rather
// than starting a second one for the same model. A's own verdict must still reach its own
// caller, and must never be cached over the top of the verdict B's run produces.
func TestModelsFeature_CheckInFlightWhenIdentityChanges_NotCachedNorServed(t *testing.T) {
	f := newTestModelsFeature(t)
	identityA := claudecode.BinaryIdentity{Path: "/bin/claude", Size: 1, ModTime: time.Unix(1, 0)}
	identityB := claudecode.BinaryIdentity{Path: "/bin/claude", Size: 2, ModTime: time.Unix(2, 0)}
	var identityCalls int32
	f.identify = func() (claudecode.BinaryIdentity, error) {
		// The first caller (A) resolves before the binary changes; every caller after
		// it (B's leader, then B's joiner) resolves the new identity.
		if atomic.AddInt32(&identityCalls, 1) == 1 {
			return identityA, nil
		}
		return identityB, nil
	}

	aStarted := make(chan struct{})
	releaseA := make(chan struct{})
	bStarted := make(chan struct{})
	releaseB := make(chan struct{})
	var checkCalls int32
	f.check = func(context.Context, string, string, string) (claudecode.ModelVerdict, error) {
		switch atomic.AddInt32(&checkCalls, 1) {
		case 1: // A's run, released first so it finishes while B's run below is still going.
			close(aStarted)
			<-releaseA
			return claudecode.ModelRecognised, nil
		case 2: // B's one and only run: a second concurrent B lookup must join this, not start its own.
			close(bStarted)
			<-releaseB
			return claudecode.ModelUnrecognised, nil
		default:
			t.Errorf("a second concurrent lookup under the same (post-change) identity started its own check run instead of sharing the first one")
			return claudecode.ModelUnrecognised, nil
		}
	}

	resultA := make(chan modelVerdict, 1)
	go func() { resultA <- f.verdict(context.Background(), "opus") }()
	<-aStarted // A is registered in-flight under identity A's generation and blocked in its check.

	resultB1 := make(chan modelVerdict, 1)
	go func() { resultB1 <- f.verdict(context.Background(), "opus") }()
	<-bStarted // B's leader has reset the maps under the new identity and is blocked in its own check.

	// Release A while B's run is still in flight, and wait for A's caller to actually
	// receive its result — that return happens only after A's finishing goroutine has run
	// its whole locked cleanup section, so by the time resultA arrives, whatever that
	// section did to f.inflight has already happened.
	close(releaseA)
	gotA := <-resultA

	f.mu.Lock()
	_, stillInFlight := f.inflight["opus"]
	f.mu.Unlock()
	require.True(t, stillInFlight,
		"A's finish must not remove B's still-running in-flight entry for the same model")

	// Now a second concurrent lookup under B's identity: since B's entry survived above,
	// this must join B's run rather than start a second one for "opus".
	resultB2 := make(chan modelVerdict, 1)
	go func() { resultB2 <- f.verdict(context.Background(), "opus") }()

	close(releaseB)
	gotB1 := <-resultB1
	gotB2 := <-resultB2

	assert.Equal(t, catalogUnrecognized, gotB1, "the leader under the new identity must get its own run's verdict")
	assert.Equal(t, catalogUnrecognized, gotB2,
		"a second concurrent lookup under the new identity must be served the same run's verdict, not left to start its own")
	assert.Equal(t, catalogRecognized, gotA,
		"A's own run still answers its own caller — it isn't cancelled just because the identity moved on")
	assert.Equal(t, int32(2), atomic.LoadInt32(&checkCalls),
		"exactly one run for A and one shared run for both B lookups — never a third")

	f.mu.Lock()
	cached, ok := f.cached["opus"]
	f.mu.Unlock()
	require.True(t, ok, "B's run must have cached its verdict")
	assert.Equal(t, catalogUnrecognized, cached,
		"A's late-finishing result must never overwrite the cache the new identity's lookup already filled")
}

// TestModelsFeature_LeaderCancellation_JoinerGetsRealVerdictAndOwnCancelReturnsPromptly is
// REQ-5's other half: sharing one run must not make a joiner's answer depend on whichever
// caller happened to start it, and must not make a joiner ignore its own ctx either. The
// leader's ctx is cancelled while the shared run is still going: a joined waiter with a
// live ctx must still get the run's real verdict, not unchecked, and the leader's own
// cancellation must not turn its own answer into unchecked either. Separately, a waiter
// whose own ctx is already cancelled when it joins must return promptly with unchecked,
// never waiting on the run it can no longer use.
func TestModelsFeature_LeaderCancellation_JoinerGetsRealVerdictAndOwnCancelReturnsPromptly(t *testing.T) {
	f := newTestModelsFeature(t)
	checkStarted := make(chan struct{})
	release := make(chan struct{})
	var startOnce sync.Once
	var checkCalls int32
	f.check = func(ctx context.Context, _, _, _ string) (claudecode.ModelVerdict, error) {
		atomic.AddInt32(&checkCalls, 1)
		startOnce.Do(func() { close(checkStarted) })
		select {
		case <-ctx.Done():
			// Only reachable if the shared run were (wrongly) tied to the leader's own
			// ctx instead of a detached one.
			return claudecode.ModelRecognised, ctx.Err()
		case <-release:
			return claudecode.ModelRecognised, nil
		}
	}

	leaderCtx, cancelLeader := context.WithCancel(context.Background())
	resultLeader := make(chan modelVerdict, 1)
	go func() { resultLeader <- f.verdict(leaderCtx, "opus") }()
	<-checkStarted // the leader is registered in-flight and its run is now blocked in check.

	resultJoiner := make(chan modelVerdict, 1)
	go func() { resultJoiner <- f.verdict(context.Background(), "opus") }()

	cancelLeader()
	// Scheduling headroom only: gives a shared run wrongly tied to the leader's own ctx a
	// real chance to notice the cancellation and return early before the assertions below
	// run — a correct run ignores this regardless of the delay, but a broken one could
	// otherwise race the later close(release) and pass by luck.
	time.Sleep(20 * time.Millisecond)

	// A waiter whose own ctx is already cancelled when it joins must return promptly,
	// without waiting on the still-running check — checked against a timeout rather than
	// a bare channel receive, so a waiter that (wrongly) ignores its own ctx fails this
	// test instead of hanging it.
	ownCtx, cancelOwn := context.WithCancel(context.Background())
	cancelOwn()
	resultOwnCancelled := make(chan modelVerdict, 1)
	go func() { resultOwnCancelled <- f.verdict(ownCtx, "opus") }()
	select {
	case got := <-resultOwnCancelled:
		assert.Equal(t, catalogUnchecked, got,
			"a waiter whose own ctx is already cancelled must not adopt the run's eventual verdict")
	case <-time.After(2 * time.Second):
		t.Fatal("a waiter whose own ctx is cancelled must return promptly instead of waiting on the shared run")
	}

	close(release)
	gotLeader := <-resultLeader
	gotJoiner := <-resultJoiner

	assert.Equal(t, catalogRecognized, gotLeader,
		"the leader's own cancellation must not turn its own answer into unchecked")
	assert.Equal(t, catalogRecognized, gotJoiner,
		"a joined waiter with a live ctx must get the run's real verdict, not unchecked, even though the caller that started the run was cancelled")
	assert.Equal(t, int32(1), atomic.LoadInt32(&checkCalls),
		"only the leader may run a check; every other caller here must share it")
}

// --- GET /api/models handler (D6) ---

// newModelsTestHandler mounts f on its own mux behind the same cookie guard
// server.go's routes() wires every feature through, without building a full *Server —
// a full Server's own *modelsFeature always resolves a real "claude" identity, which on
// a machine with Claude Code installed would let this test's check function reach a
// real subprocess (CLAUDE.md hard rule: never launch a real claude from a unit test).
func newModelsTestHandler(f *modelsFeature) http.Handler {
	mux := http.NewServeMux()
	guard := func(h http.Handler) http.Handler { return requireCookie(testUIToken, writeJSONUnauthorized, h) }
	f.mount(mux, guard)
	return mux
}

func getModelsRequest(t *testing.T, h http.Handler, query string, withCookie bool) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/models"+query, nil)
	if withCookie {
		req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestHandleModels_RequiresCookie(t *testing.T) {
	f := newTestModelsFeature(t)
	f.check = func(context.Context, string, string, string) (claudecode.ModelVerdict, error) {
		return claudecode.ModelRecognised, nil
	}
	h := newModelsTestHandler(f)

	rec := getModelsRequest(t, h, "?model=sonnet", false)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// TestHandleModels_ResponseShape covers D6's 200 body: one entry per distinct requested
// model in first-seen order (REQ-1/D10), and message present iff the verdict is
// unrecognized (Protocol Contract).
func TestHandleModels_ResponseShape(t *testing.T) {
	f := newTestModelsFeature(t)
	f.check = func(_ context.Context, _, _, model string) (claudecode.ModelVerdict, error) {
		if model == "fable" {
			return claudecode.ModelUnrecognised, nil
		}
		return claudecode.ModelRecognised, nil
	}
	h := newModelsTestHandler(f)

	rec := getModelsRequest(t, h, "?model=sonnet&model=fable&model=sonnet&model=opus", true)
	require.Equal(t, http.StatusOK, rec.Code)

	var out modelsResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	require.Len(t, out.Models, 3, "the duplicate sonnet must be collapsed to one entry (D10)")

	got := make([]string, len(out.Models))
	for i, m := range out.Models {
		got[i] = m.Model
	}
	assert.Equal(t, []string{"sonnet", "fable", "opus"}, got, "first-seen request order")

	byModel := map[string]modelVerdictWire{}
	for _, m := range out.Models {
		byModel[m.Model] = m
	}
	assert.Equal(t, "recognized", byModel["sonnet"].Verdict)
	assert.Equal(t, "recognized", byModel["opus"].Verdict)
	assert.Equal(t, "unrecognized", byModel["fable"].Verdict)
	assert.Equal(t, `Claude Code doesn't recognise the model "fable" — update Claude Code, or pick another model`,
		byModel["fable"].Message)

	// message must be present iff verdict is unrecognized (json field, not just Go's
	// zero-valued string) — decode into a generic map so an absent key and an empty
	// string are told apart.
	var raw struct {
		Models []map[string]any `json:"models"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &raw))
	for _, m := range raw.Models {
		if m["verdict"] == "unrecognized" {
			assert.Contains(t, m, "message", "model %v", m["model"])
		} else {
			assert.NotContains(t, m, "message", "message must be present iff verdict is unrecognized; model %v", m["model"])
		}
	}
}

// TestHandleModels_EightDistinctModelsAllowed is D6/D10's boundary: exactly 8 distinct
// values is the documented cap, not yet a refusal (kb:lesson/threshold-tested-only-far-from-its-boundary).
func TestHandleModels_EightDistinctModelsAllowed(t *testing.T) {
	f := newTestModelsFeature(t)
	f.check = func(context.Context, string, string, string) (claudecode.ModelVerdict, error) {
		return claudecode.ModelRecognised, nil
	}
	h := newModelsTestHandler(f)

	rec := getModelsRequest(t, h, "?model=a&model=b&model=c&model=d&model=e&model=f&model=g&model=h", true)

	require.Equal(t, http.StatusOK, rec.Code)
	var out modelsResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	assert.Len(t, out.Models, 8)
}

// TestHandleModels_InvalidRequest covers D6/D10's error cases: no model parameter, an
// empty value (alone or among others), and more than 8 distinct values.
func TestHandleModels_InvalidRequest(t *testing.T) {
	f := newTestModelsFeature(t)
	f.check = func(context.Context, string, string, string) (claudecode.ModelVerdict, error) {
		return claudecode.ModelRecognised, nil
	}
	h := newModelsTestHandler(f)

	tests := []struct {
		name  string
		query string
	}{
		{"no model parameter", ""},
		{"empty value alone", "?model="},
		{"empty value among others", "?model=sonnet&model="},
		{"nine distinct values", "?model=a&model=b&model=c&model=d&model=e&model=f&model=g&model=h&model=i"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := getModelsRequest(t, h, tt.query, true)
			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Equal(t, "invalid_request", decodeErrorCode(t, rec))
		})
	}
}

// --- Launch reads the same cache (D9/REQ-4) ---

// TestLauncher_CachedVerdict_LaunchRunsNoCheck is D9: newSessionLauncher's production
// checkModel closure (REQ-4) takes its verdict from modelsFeature's cache rather than
// running a fresh check, for both a cached unrecognized verdict (refuses) and a cached
// recognized one (proceeds) — the same cache a prior GET /api/models call would have
// already filled.
func TestLauncher_CachedVerdict_LaunchRunsNoCheck(t *testing.T) {
	tests := []struct {
		name         string
		checkVerdict claudecode.ModelVerdict
		wantCached   modelVerdict
		wantRefused  bool
	}{
		{"cached unrecognized refuses without a check run", claudecode.ModelUnrecognised, catalogUnrecognized, true},
		{"cached recognized proceeds without a check run", claudecode.ModelRecognised, catalogRecognized, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openLauncherTestStore(t)
			mgr := newSessionTestManager(t, st)
			fake := newFakeTmux()

			f := newTestModelsFeature(t)
			var checkCalls int32
			f.check = func(context.Context, string, string, string) (claudecode.ModelVerdict, error) {
				atomic.AddInt32(&checkCalls, 1)
				return tt.checkVerdict, nil
			}
			// Prime the cache the way the dialog's own GET /api/models request would,
			// before Launch is ever called.
			require.Equal(t, tt.wantCached, f.verdict(context.Background(), "zephyr"))
			require.Equal(t, int32(1), atomic.LoadInt32(&checkCalls))

			l := newSessionLauncher(st, mgr, fake, LaunchConfig{
				HookScript: "/bin/true", StatusLineScript: "/bin/true",
			}, f, zerolog.Nop())

			_, lerr := l.Launch(context.Background(), createSessionRequest{
				Directory: t.TempDir(), Model: "zephyr", PermissionMode: "default",
			})

			assert.Equal(t, int32(1), atomic.LoadInt32(&checkCalls),
				"REQ-4: Launch must read the cache filled above, never run its own check")
			if tt.wantRefused {
				require.NotNil(t, lerr)
				assert.Equal(t, "model_unrecognized", lerr.code)
			} else {
				assert.Nil(t, lerr)
			}
		})
	}
}
