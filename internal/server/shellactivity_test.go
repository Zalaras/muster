package server

import (
	"context"
	"errors"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/tmux"
)

// testShellBase is the shell basename fed to every poller built in this file —
// interactiveShellArgv()'s "zsh" in production, an arbitrary fixed value here so tests
// never depend on $SHELL.
const testShellBase = "zsh"

// paneActivityStub is the paneActivityLister test double: a controllable, in-memory
// stand-in for tmux.Client.ListPaneActivity — never a real tmux invocation, since every
// test in this file is about the poller's own gating/diff logic (D5/D8/D9, reconcile),
// not a tmux-observable effect (internal/tmux/activity_test.go covers those for real).
type paneActivityStub struct {
	mu    sync.Mutex
	panes []tmux.PaneActivity
	err   error
	calls int
}

func newPaneActivityStub(panes ...tmux.PaneActivity) *paneActivityStub {
	return &paneActivityStub{panes: panes}
}

func (s *paneActivityStub) list(_ context.Context) ([]tmux.PaneActivity, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls++
	if s.err != nil {
		return nil, s.err
	}
	out := make([]tmux.PaneActivity, len(s.panes))
	copy(out, s.panes)
	return out, nil
}

func (s *paneActivityStub) setErr(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.err = err
}

func (s *paneActivityStub) callCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.calls
}

// canonicalStub is the ttyCanonicalChecker test double, keyed by tty path — lets a table
// test set a different ICANON reading (or error) per pane without a real pty.
type canonicalStub struct {
	mu      sync.Mutex
	results map[string]bool
	errs    map[string]error
	calls   []string
}

func newCanonicalStub() *canonicalStub {
	return &canonicalStub{results: make(map[string]bool), errs: make(map[string]error)}
}

func (c *canonicalStub) check(ttyPath string) (bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.calls = append(c.calls, ttyPath)
	if err, ok := c.errs[ttyPath]; ok {
		return false, err
	}
	return c.results[ttyPath], nil
}

func (c *canonicalStub) setResult(ttyPath string, canonical bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.results[ttyPath] = canonical
}

func (c *canonicalStub) setErr(ttyPath string, err error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.errs[ttyPath] = err
}

func (c *canonicalStub) wasQueried(ttyPath string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return slices.Contains(c.calls, ttyPath)
}

// activityBroadcast is one recorded shellActivityPoller.broadcast call.
type activityBroadcast struct {
	sessionID int64
	busy      bool
}

// recordingActivityBroadcaster is the hub-spy pattern themepoll_test.go's
// recordingThemeBroadcaster already uses, here for the poller's (int64, bool) shape —
// asserts exact broadcast counts and payloads without a real wsHub.
type recordingActivityBroadcaster struct {
	mu    sync.Mutex
	calls []activityBroadcast
}

func (b *recordingActivityBroadcaster) broadcast(id int64, busy bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.calls = append(b.calls, activityBroadcast{sessionID: id, busy: busy})
}

func (b *recordingActivityBroadcaster) all() []activityBroadcast {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]activityBroadcast, len(b.calls))
	copy(out, b.calls)
	return out
}

func (b *recordingActivityBroadcaster) reset() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.calls = nil
}

func alwaysHasShells() bool { return true }
func neverHasShells() bool  { return false }

func shellPane(id int64, cmd string, alternateOn bool, ttyPath string) tmux.PaneActivity {
	return tmux.PaneActivity{SessionName: tmux.ShellSessionName(id), CurrentCommand: cmd, AlternateOn: alternateOn, Tty: ttyPath}
}

func claudePane(id int64, cmd string, alternateOn bool, ttyPath string) tmux.PaneActivity {
	return tmux.PaneActivity{SessionName: tmux.SessionName(id), CurrentCommand: cmd, AlternateOn: alternateOn, Tty: ttyPath}
}

// newTestPoller builds a shellActivityPoller wired to the given stubs, with hasShells
// always true (a test that specifically needs the gate off builds its own).
func newTestPoller(lister *paneActivityStub, canonical *canonicalStub, b *recordingActivityBroadcaster) *shellActivityPoller {
	return newShellActivityPoller(lister.list, canonical.check, alwaysHasShells, testShellBase, time.Hour, b.broadcast, zerolog.Nop())
}

// TestTick_BusyGating_Table is D5/D8/D9's exhaustive cross-state coverage
// (kb:lesson/invariant-missed-by-per-transition-tests): every case is asserted for both
// the resulting busy verdict AND whether the tty ioctl was even reached, since D5's whole
// point (surfaced by shellactivity.go's own comment) is that AlternateOn/idle-shell skip
// the ioctl entirely rather than merely overriding its result.
func TestTick_BusyGating_Table(t *testing.T) {
	const tty = "/dev/ttys001"
	tests := []struct {
		name             string
		pane             tmux.PaneActivity
		canonicalResult  bool
		canonicalErr     error
		wantBusy         bool
		wantIoctlQueried bool
	}{
		{
			name:             "idle shell prompt is never busy and skips the ioctl (D5)",
			pane:             shellPane(1, testShellBase, false, tty),
			canonicalResult:  true, // would read busy if the ioctl were wrongly consulted
			wantBusy:         false,
			wantIoctlQueried: false,
		},
		{
			name:             "vim (alternate screen) is never busy and skips the ioctl (D5, edge case 7)",
			pane:             shellPane(1, "vim", true, tty),
			canonicalResult:  false, // would read raw/not-busy anyway; still must not be queried
			wantBusy:         false,
			wantIoctlQueried: false,
		},
		{
			name:             "a backgrounded job leaves the shell foreground, never busy (D5, edge case 9)",
			pane:             shellPane(1, testShellBase, false, tty),
			canonicalResult:  true,
			wantBusy:         false,
			wantIoctlQueried: false,
		},
		{
			name:             "nested claude in the alternate screen is never busy (D5, edge case 8)",
			pane:             shellPane(1, "claude", true, tty),
			canonicalResult:  true,
			wantBusy:         false,
			wantIoctlQueried: false,
		},
		{
			name:             "a silent canonical-mode command IS busy (D9, edge case 21)",
			pane:             shellPane(1, "sleep", false, tty),
			canonicalResult:  true,
			wantBusy:         true,
			wantIoctlQueried: true,
		},
		{
			name:             "a noisy canonical-mode command is busy (ordinary case)",
			pane:             shellPane(1, "go", false, tty),
			canonicalResult:  true,
			wantBusy:         true,
			wantIoctlQueried: true,
		},
		{
			name:             "a REPL waiting on the normal screen is never busy (D8, edge case 20)",
			pane:             shellPane(1, "python3", false, tty),
			canonicalResult:  false,
			wantBusy:         false,
			wantIoctlQueried: true,
		},
		{
			name:             "a raw-tty program not on the alternate screen is never busy (D8, edge cases 18/19: CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN / trust prompt)",
			pane:             shellPane(1, "claude", false, tty),
			canonicalResult:  false,
			wantBusy:         false,
			wantIoctlQueried: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			lister := newPaneActivityStub(tt.pane)
			canonical := newCanonicalStub()
			canonical.setResult(tty, tt.canonicalResult)
			b := &recordingActivityBroadcaster{}
			p := newTestPoller(lister, canonical, b)

			p.tick(context.Background())

			assert.Equal(t, tt.wantIoctlQueried, canonical.wasQueried(tty), "ioctl-queried expectation")
			gotBusy := slices.Contains(p.Current(), int64(1))
			assert.Equal(t, tt.wantBusy, gotBusy, "busy verdict")
		})
	}
}

// TestTick_IgnoresNonShellPanesOnTheSocket covers that a Claude pane on the same socket
// (which would otherwise read as canonical/busy under this gate) is filtered out by
// IsShellSessionName before the gate is even consulted — the poller must never treat a
// Claude pane's own foreground process as shell activity.
func TestTick_IgnoresNonShellPanesOnTheSocket(t *testing.T) {
	lister := newPaneActivityStub(
		claudePane(1, "claude", false, "/dev/ttys000"), // a Claude pane: canonical, would read busy under the shell gate
		shellPane(2, "sleep", false, "/dev/ttys002"),
	)
	canonical := newCanonicalStub()
	canonical.setResult("/dev/ttys000", true)
	canonical.setResult("/dev/ttys002", true)
	b := &recordingActivityBroadcaster{}
	p := newTestPoller(lister, canonical, b)

	p.tick(context.Background())

	assert.False(t, canonical.wasQueried("/dev/ttys000"), "a Claude pane must never reach the tty ioctl through the shell-busy gate")
	assert.ElementsMatch(t, []int64{2}, p.Current())
}

// TestTick_TtyErrorExcludesOnlyThatSessionFromTheTick covers the "tty vanished between
// list-panes and the ioctl" comment in shellactivity.go: one session's ioctl failing must
// not fail the whole tick or affect an unrelated session's busy verdict in the same tick.
func TestTick_TtyErrorExcludesOnlyThatSessionFromTheTick(t *testing.T) {
	lister := newPaneActivityStub(
		shellPane(1, "sleep", false, "/dev/ttys-gone"),
		shellPane(2, "sleep", false, "/dev/ttys-ok"),
	)
	canonical := newCanonicalStub()
	canonical.setErr("/dev/ttys-gone", errors.New("device not configured"))
	canonical.setResult("/dev/ttys-ok", true)
	b := &recordingActivityBroadcaster{}
	p := newTestPoller(lister, canonical, b)

	p.tick(context.Background())

	assert.ElementsMatch(t, []int64{2}, p.Current(), "the errored session must sit this tick out, never crash it or contaminate the other session's verdict")
}

// TestTick_SkipsListerEntirelyWhenNoShellsExist covers the Gotchas clause: "must not run
// a tmux invocation when no shell exists" — hasShells=false must short-circuit before the
// lister is ever called.
func TestTick_SkipsListerEntirelyWhenNoShellsExist(t *testing.T) {
	lister := newPaneActivityStub(shellPane(1, "sleep", false, "/dev/ttys001"))
	canonical := newCanonicalStub()
	b := &recordingActivityBroadcaster{}
	p := newShellActivityPoller(lister.list, canonical.check, neverHasShells, testShellBase, time.Hour, b.broadcast, zerolog.Nop())

	p.tick(context.Background())

	assert.Equal(t, 0, lister.callCount(), "no shell has ever been opened: the poller must not exec tmux at all")
	assert.Empty(t, p.Current())
}

// TestTick_CallsListerWhenShellsExist is SkipsListerEntirelyWhenNoShellsExist's positive
// counterpart, from the other reachable hasShells state.
func TestTick_CallsListerWhenShellsExist(t *testing.T) {
	lister := newPaneActivityStub()
	canonical := newCanonicalStub()
	b := &recordingActivityBroadcaster{}
	p := newTestPoller(lister, canonical, b)

	p.tick(context.Background())

	assert.Equal(t, 1, lister.callCount())
}

// TestTick_ListerErrorLeavesThePreviousBusySetUntouchedAndBroadcastsNothing covers a
// transient tmux failure mid-poll: the tick must not treat a lister error as "everyone
// went idle" (which would spuriously broadcast every previously-busy session false).
func TestTick_ListerErrorLeavesThePreviousBusySetUntouchedAndBroadcastsNothing(t *testing.T) {
	lister := newPaneActivityStub(shellPane(1, "sleep", false, "/dev/ttys001"))
	canonical := newCanonicalStub()
	canonical.setResult("/dev/ttys001", true)
	b := &recordingActivityBroadcaster{}
	p := newTestPoller(lister, canonical, b)
	p.tick(context.Background())
	require.ElementsMatch(t, []int64{1}, p.Current())
	b.reset()

	lister.setErr(errors.New("boom: tmux list-panes failed"))
	p.tick(context.Background())

	assert.ElementsMatch(t, []int64{1}, p.Current(), "a lister failure must leave the last-known busy set intact")
	assert.Empty(t, b.all(), "a lister failure must never broadcast a spurious idle transition")
}

// TestReconcile_BroadcastsOnceOnGoingBusy covers the empty->busy transition.
func TestReconcile_BroadcastsOnceOnGoingBusy(t *testing.T) {
	b := &recordingActivityBroadcaster{}
	p := newShellActivityPoller(nil, nil, alwaysHasShells, testShellBase, time.Hour, b.broadcast, zerolog.Nop())

	p.reconcile(map[int64]bool{1: true})

	assert.Equal(t, []activityBroadcast{{1, true}}, b.all())
	assert.ElementsMatch(t, []int64{1}, p.Current())
}

// TestReconcile_BroadcastsOnceOnGoingIdle covers the busy->absent transition, the same
// path E7 (shell exits while busy) and E8 (daemon restart mid-command) both take: neither
// distinguishes itself at this layer, both just mean the session id is missing from
// newBusy.
func TestReconcile_BroadcastsOnceOnGoingIdle(t *testing.T) {
	b := &recordingActivityBroadcaster{}
	p := newShellActivityPoller(nil, nil, alwaysHasShells, testShellBase, time.Hour, b.broadcast, zerolog.Nop())
	p.reconcile(map[int64]bool{1: true})
	b.reset()

	p.reconcile(map[int64]bool{})

	assert.Equal(t, []activityBroadcast{{1, false}}, b.all())
	assert.Empty(t, p.Current())
}

// TestReconcile_NoBroadcastWhenUnchanged covers the steady-state busy->busy tick, the
// common case a 1s poller spends most of its time in.
func TestReconcile_NoBroadcastWhenUnchanged(t *testing.T) {
	b := &recordingActivityBroadcaster{}
	p := newShellActivityPoller(nil, nil, alwaysHasShells, testShellBase, time.Hour, b.broadcast, zerolog.Nop())
	p.reconcile(map[int64]bool{1: true})
	b.reset()

	p.reconcile(map[int64]bool{1: true})

	assert.Empty(t, b.all())
	assert.ElementsMatch(t, []int64{1}, p.Current())
}

// TestReconcile_MultipleSessionsIndependentNoCrossTalk covers INV-4/E11: two sessions
// going busy in the same reconcile broadcast independently, and a later change to one
// never touches the other's entry in Current().
func TestReconcile_MultipleSessionsIndependentNoCrossTalk(t *testing.T) {
	b := &recordingActivityBroadcaster{}
	p := newShellActivityPoller(nil, nil, alwaysHasShells, testShellBase, time.Hour, b.broadcast, zerolog.Nop())

	p.reconcile(map[int64]bool{1: true, 2: true})
	assert.ElementsMatch(t, []activityBroadcast{{1, true}, {2, true}}, b.all())
	assert.ElementsMatch(t, []int64{1, 2}, p.Current())
	b.reset()

	p.reconcile(map[int64]bool{2: true}) // session 1 went idle; session 2 unchanged
	assert.Equal(t, []activityBroadcast{{1, false}}, b.all(), "INV-4: session 2 going untouched must produce no broadcast for it")
	assert.ElementsMatch(t, []int64{2}, p.Current())
}

// TestCurrent_AlwaysNonNilEvenWhenEmpty covers the snapshot.shellsBusy Protocol Contract
// clause "[] when none, always present" at the poller layer buildSnapshot reads from.
func TestCurrent_AlwaysNonNilEvenWhenEmpty(t *testing.T) {
	p := newShellActivityPoller(nil, nil, alwaysHasShells, testShellBase, time.Hour, func(int64, bool) {}, zerolog.Nop())

	got := p.Current()

	require.NotNil(t, got)
	assert.Empty(t, got)
}

// TestCurrent_ReturnsSortedAscending covers Current's own sort contract — a reconnecting
// client re-syncing shellsBusy should see a stable, deterministic order, not map
// iteration order.
func TestCurrent_ReturnsSortedAscending(t *testing.T) {
	b := &recordingActivityBroadcaster{}
	p := newShellActivityPoller(nil, nil, alwaysHasShells, testShellBase, time.Hour, b.broadcast, zerolog.Nop())

	p.reconcile(map[int64]bool{9: true, 1: true, 5: true})

	assert.Equal(t, []int64{1, 5, 9}, p.Current())
}

// TestPoller_StartStop_ImmediateFirstTickThenPromptStop mirrors
// TestThemePoller_StartStop_ImmediateFirstTickThenPromptStop/TestUsagePoller_StartStop_LoopExitsPromptly:
// Start must tick immediately (never waiting out the first full interval) and Stop must
// return promptly rather than leaking the poll goroutine.
func TestPoller_StartStop_ImmediateFirstTickThenPromptStop(t *testing.T) {
	lister := newPaneActivityStub(shellPane(1, "sleep", false, "/dev/ttys001"))
	canonical := newCanonicalStub()
	canonical.setResult("/dev/ttys001", true)
	b := &recordingActivityBroadcaster{}
	p := newShellActivityPoller(lister.list, canonical.check, alwaysHasShells, testShellBase, time.Hour, b.broadcast, zerolog.Nop())

	p.Start()
	require.Eventually(t, func() bool { return lister.callCount() >= 1 }, time.Second, 5*time.Millisecond, "Start must tick immediately")

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	p.Stop(ctx)

	assert.NoError(t, ctx.Err(), "Stop must return well within its deadline for a loop with no in-flight work")
}

// TestShellActivityFeature_ContributeReflectsCurrentBusySet covers the feature's
// snapshot-contribution wiring (state.go's Snapshot.ShellsBusy) end to end from
// newShellActivityFeature's own constructor, without waiting on the real 1s poll
// interval: reconcile is called directly on the feature's own poller (same package), the
// way a real tick would, and contribute must read it back faithfully.
func TestShellActivityFeature_ContributeReflectsCurrentBusySet(t *testing.T) {
	hub := newWSHub(zerolog.Nop())
	lister := func(context.Context) ([]tmux.PaneActivity, error) { return nil, nil }
	f := newShellActivityFeature(alwaysHasShells, lister, hub, zerolog.Nop())

	var snap Snapshot
	f.contribute(context.Background(), &snap)
	assert.Equal(t, []int64{}, snap.ShellsBusy, "no busy session yet must still be a non-nil empty slice")

	f.poller.reconcile(map[int64]bool{3: true, 1: true})
	f.contribute(context.Background(), &snap)
	assert.Equal(t, []int64{1, 3}, snap.ShellsBusy)
}
