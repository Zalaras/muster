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
// test in this file is about the poller's own gating/diff logic (and reconcile),
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

// terminalsBroadcast is one recorded shellActivityPoller.broadcast call.
type terminalsBroadcast struct {
	sessionID int64
	terminals []terminalWire
}

// recordingActivityBroadcaster is the hub-spy pattern themepoll_test.go's
// recordingThemeBroadcaster already uses, here for the poller's (int64, []terminalWire)
// shape — asserts exact broadcast counts and payloads without a real wsHub.
type recordingActivityBroadcaster struct {
	mu    sync.Mutex
	calls []terminalsBroadcast
}

func (b *recordingActivityBroadcaster) broadcast(id int64, terminals []terminalWire) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.calls = append(b.calls, terminalsBroadcast{sessionID: id, terminals: append([]terminalWire{}, terminals...)})
}

func (b *recordingActivityBroadcaster) all() []terminalsBroadcast {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]terminalsBroadcast, len(b.calls))
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

func terminalPane(id int64, n int, cmd string, alternateOn bool, ttyPath string) tmux.PaneActivity {
	return tmux.PaneActivity{SessionName: tmux.TerminalSessionName(id, n), CurrentCommand: cmd, AlternateOn: alternateOn, Tty: ttyPath}
}

func shellPane(id int64, cmd string, alternateOn bool, ttyPath string) tmux.PaneActivity {
	return terminalPane(id, 1, cmd, alternateOn, ttyPath)
}

func claudePane(id int64, cmd string, alternateOn bool, ttyPath string) tmux.PaneActivity {
	return tmux.PaneActivity{SessionName: tmux.SessionName(id), CurrentCommand: cmd, AlternateOn: alternateOn, Tty: ttyPath}
}

func newPollerWith(lister paneActivityLister, canonical ttyCanonicalChecker, hasShells func() bool, names *terminalNames, b *recordingActivityBroadcaster) *shellActivityPoller {
	return newShellActivityPoller(lister, canonical, hasShells, testShellBase, time.Hour, names, b.broadcast, zerolog.Nop())
}

// newTestPoller builds a shellActivityPoller wired to the given stubs, with hasShells
// always true (a test that specifically needs the gate off builds its own).
func newTestPoller(lister *paneActivityStub, canonical *canonicalStub, b *recordingActivityBroadcaster) *shellActivityPoller {
	return newPollerWith(lister.list, canonical.check, alwaysHasShells, newTerminalNames(), b)
}

func tw(n int, name string, busy bool) terminalWire {
	return terminalWire{N: n, Name: name, Busy: busy}
}

func listFor(id int64, list []terminalWire) map[int64][]terminalWire {
	if list == nil {
		return map[int64][]terminalWire{}
	}
	return map[int64][]terminalWire{id: list}
}

// TestTick_BusyGating_Table is the exhaustive cross-state coverage
// (kb:lesson/invariant-missed-by-per-transition-tests): every case is asserted for both
// the resulting busy verdict AND whether the tty ioctl was even reached, since the whole
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
			require.Len(t, p.Current()["1"], 1)
			assert.Equal(t, tt.wantBusy, p.Current()["1"][0].Busy, "busy verdict")
		})
	}
}

// TestTick_IgnoresNonTerminalPanesOnTheSocket covers that a Claude pane on the same socket
// (which would otherwise read as canonical/busy under this gate) is filtered out by
// ParseTerminalName before the gate is even consulted.
func TestTick_IgnoresNonTerminalPanesOnTheSocket(t *testing.T) {
	lister := newPaneActivityStub(
		claudePane(1, "claude", false, "/dev/ttys000"),
		shellPane(2, "sleep", false, "/dev/ttys002"),
	)
	canonical := newCanonicalStub()
	canonical.setResult("/dev/ttys000", true)
	canonical.setResult("/dev/ttys002", true)
	p := newTestPoller(lister, canonical, &recordingActivityBroadcaster{})

	p.tick(context.Background())

	assert.False(t, canonical.wasQueried("/dev/ttys000"), "a Claude pane must never reach the tty ioctl through the terminal-busy gate")
	assert.Equal(t, map[string][]terminalWire{"2": {tw(1, "shell 1", true)}}, p.Current())
}

// TestTick_TtyErrorReadsOnlyThatTerminalIdle: one terminal's ioctl failing must not fail
// the tick or affect another terminal's verdict; the errored terminal stays listed, idle.
func TestTick_TtyErrorReadsOnlyThatTerminalIdle(t *testing.T) {
	lister := newPaneActivityStub(
		shellPane(1, "sleep", false, "/dev/ttys-gone"),
		shellPane(2, "sleep", false, "/dev/ttys-ok"),
	)
	canonical := newCanonicalStub()
	canonical.setErr("/dev/ttys-gone", errors.New("device not configured"))
	canonical.setResult("/dev/ttys-ok", true)
	p := newTestPoller(lister, canonical, &recordingActivityBroadcaster{})

	p.tick(context.Background())

	assert.Equal(t, map[string][]terminalWire{
		"1": {tw(1, "shell 1", false)},
		"2": {tw(1, "shell 1", true)},
	}, p.Current())
}

// TestTick_GatesTheListerOnHasShellsUnlessAlreadyListing: hasShells=false with nothing
// listed must not exec tmux; with terminals already listed it still polls so exits are seen.
func TestTick_GatesTheListerOnHasShellsUnlessAlreadyListing(t *testing.T) {
	tests := []struct {
		name      string
		hasShells func() bool
		prime     bool
		wantCalls int
	}{
		{"no shells ever opened and none listed: no exec", neverHasShells, false, 0},
		{"shells opened: exec", alwaysHasShells, false, 1},
		{"gate off but terminals already listed: still exec", neverHasShells, true, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			lister := newPaneActivityStub(shellPane(1, "sleep", false, "/dev/ttys001"))
			p := newPollerWith(lister.list, newCanonicalStub().check, alwaysHasShells, newTerminalNames(), &recordingActivityBroadcaster{})
			if tt.prime {
				p.tick(context.Background())
			}
			p.hasShells = tt.hasShells
			lister.mu.Lock()
			lister.calls = 0
			lister.mu.Unlock()

			p.tick(context.Background())

			assert.Equal(t, tt.wantCalls, lister.callCount())
		})
	}
}

// TestTick_ListerErrorLeavesThePreviousListUntouchedAndBroadcastsNothing: a transient tmux
// failure must not read as "every terminal closed".
func TestTick_ListerErrorLeavesThePreviousListUntouchedAndBroadcastsNothing(t *testing.T) {
	lister := newPaneActivityStub(shellPane(1, "sleep", false, "/dev/ttys001"))
	canonical := newCanonicalStub()
	canonical.setResult("/dev/ttys001", true)
	b := &recordingActivityBroadcaster{}
	p := newTestPoller(lister, canonical, b)
	p.tick(context.Background())
	before := p.Current()
	require.Len(t, before["1"], 1)
	b.reset()

	lister.setErr(errors.New("boom: tmux list-panes failed"))
	p.tick(context.Background())

	assert.Equal(t, before, p.Current())
	assert.Empty(t, b.all())
}

// TestTick_ListsEverySessionsTerminalsSortedWithEffectiveNames: terminals arrive from
// tmux in any order, the list is ascending by n (10 after 3), and a developer name
// replaces "shell N".
func TestTick_ListsEverySessionsTerminalsSortedWithEffectiveNames(t *testing.T) {
	lister := newPaneActivityStub(
		terminalPane(7, 3, testShellBase, false, "/dev/t3"),
		terminalPane(9, 1, testShellBase, false, "/dev/t4"),
		terminalPane(7, 1, testShellBase, false, "/dev/t1"),
		terminalPane(7, 10, testShellBase, false, "/dev/t10"),
		terminalPane(7, 2, testShellBase, false, "/dev/t2"),
	)
	names := newTerminalNames()
	names.set(7, 2, "build")
	p := newPollerWith(lister.list, newCanonicalStub().check, alwaysHasShells, names, &recordingActivityBroadcaster{})

	p.tick(context.Background())

	assert.Equal(t, map[string][]terminalWire{
		"7": {tw(1, "shell 1", false), tw(2, "build", false), tw(3, "shell 3", false), tw(10, "shell 10", false)},
		"9": {tw(1, "shell 1", false)},
	}, p.Current())
}

// TestSync_BroadcastsAChangeAtOnceAndOnlyOnce: sync is the on-demand tick the spawn, close
// and rename handlers call, so the change goes out without waiting for the interval.
func TestSync_BroadcastsAChangeAtOnceAndOnlyOnce(t *testing.T) {
	lister := newPaneActivityStub(shellPane(1, testShellBase, false, "/dev/t1"))
	names := newTerminalNames()
	b := &recordingActivityBroadcaster{}
	p := newPollerWith(lister.list, newCanonicalStub().check, alwaysHasShells, names, b)

	p.sync(context.Background(), 1)
	p.sync(context.Background(), 1)
	assert.Equal(t, []terminalsBroadcast{{1, []terminalWire{tw(1, "shell 1", false)}}}, b.all(), "an unchanged list is not re-broadcast")
	b.reset()

	names.set(1, 1, "api")
	p.sync(context.Background(), 1)
	assert.Equal(t, []terminalsBroadcast{{1, []terminalWire{tw(1, "api", false)}}}, b.all(), "a rename is a change")
}

// TestReconcile_Transitions is the list state machine: each row starts from a previous
// list and applies the next tick's, checking the broadcast and the stored list.
func TestReconcile_Transitions(t *testing.T) {
	one := []terminalWire{tw(1, "shell 1", false)}
	two := []terminalWire{tw(1, "shell 1", false), tw(2, "shell 2", false)}
	tests := []struct {
		name      string
		prev      []terminalWire
		next      []terminalWire
		wantBcast [][]terminalWire
	}{
		{"first terminal appears", nil, one, [][]terminalWire{one}},
		{"second terminal appears", one, two, [][]terminalWire{two}},
		{"terminal goes busy", one, []terminalWire{tw(1, "shell 1", true)}, [][]terminalWire{{tw(1, "shell 1", true)}}},
		{"terminal renamed", one, []terminalWire{tw(1, "api", false)}, [][]terminalWire{{tw(1, "api", false)}}},
		{"one of two closes", two, []terminalWire{tw(2, "shell 2", false)}, [][]terminalWire{{tw(2, "shell 2", false)}}},
		{"last terminal gone broadcasts empty list", one, nil, [][]terminalWire{{}}},
		{"unchanged is silent", two, two, nil},
		{"nothing to nothing is silent", nil, nil, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			b := &recordingActivityBroadcaster{}
			p := newPollerWith(nil, nil, alwaysHasShells, newTerminalNames(), b)
			p.reconcile(listFor(1, tt.prev))
			b.reset()

			p.reconcile(listFor(1, tt.next))

			var got [][]terminalWire
			for _, c := range b.all() {
				assert.Equal(t, int64(1), c.sessionID)
				got = append(got, c.terminals)
			}
			assert.Equal(t, tt.wantBcast, got)
			if tt.next == nil {
				assert.Empty(t, p.Current())
			} else {
				assert.Equal(t, tt.next, p.Current()["1"])
			}
		})
	}
}

// TestReconcile_SessionsAreIndependent: a change to one session's terminals never
// broadcasts or alters another's (shared poller, several sessions coexisting).
func TestReconcile_SessionsAreIndependent(t *testing.T) {
	b := &recordingActivityBroadcaster{}
	p := newPollerWith(nil, nil, alwaysHasShells, newTerminalNames(), b)
	p.reconcile(map[int64][]terminalWire{1: {tw(1, "shell 1", true)}, 2: {tw(1, "shell 1", false), tw(2, "shell 2", false)}})
	b.reset()

	p.reconcile(map[int64][]terminalWire{2: {tw(1, "shell 1", false), tw(2, "shell 2", false)}})

	assert.Equal(t, []terminalsBroadcast{{1, []terminalWire{}}}, b.all(), "only session 1 changed")
	assert.Equal(t, map[string][]terminalWire{"2": {tw(1, "shell 1", false), tw(2, "shell 2", false)}}, p.Current())
}

// TestReconcile_ForgetsTheNamesOfTerminalsNoLongerListed: a closed terminal's name must not
// carry over to a later terminal that reuses the number, while survivors keep theirs.
func TestReconcile_ForgetsTheNamesOfTerminalsNoLongerListed(t *testing.T) {
	names := newTerminalNames()
	names.set(1, 1, "api")
	names.set(1, 2, "web")
	names.set(2, 1, "other")
	p := newPollerWith(nil, nil, alwaysHasShells, names, &recordingActivityBroadcaster{})
	p.reconcile(map[int64][]terminalWire{1: {tw(1, "api", false), tw(2, "web", false)}, 2: {tw(1, "other", false)}})

	p.reconcile(map[int64][]terminalWire{1: {tw(1, "api", false)}})

	assert.Equal(t, "api", names.effective(1, 1))
	assert.Equal(t, "shell 2", names.effective(1, 2), "closed terminal's name forgotten")
	assert.Equal(t, "shell 1", names.effective(2, 1), "an emptied session's names forgotten")
}

// TestCurrent_AlwaysNonNilEvenWhenEmpty covers snapshot.terminals "{} when none, always present".
func TestCurrent_AlwaysNonNilEvenWhenEmpty(t *testing.T) {
	p := newPollerWith(nil, nil, alwaysHasShells, newTerminalNames(), &recordingActivityBroadcaster{})

	got := p.Current()

	require.NotNil(t, got)
	assert.Empty(t, got)
}

// TestCurrent_ReturnsACopy: mutating the returned lists must not corrupt the poller's own.
func TestCurrent_ReturnsACopy(t *testing.T) {
	p := newPollerWith(nil, nil, alwaysHasShells, newTerminalNames(), &recordingActivityBroadcaster{})
	p.reconcile(map[int64][]terminalWire{1: {tw(1, "shell 1", false)}})

	p.Current()["1"][0].Name = "mutated"

	assert.Equal(t, "shell 1", p.Current()["1"][0].Name)
}

// TestPoller_StartStop_ImmediateFirstTickThenPromptStop mirrors
// TestThemePoller_StartStop_ImmediateFirstTickThenPromptStop.
func TestPoller_StartStop_ImmediateFirstTickThenPromptStop(t *testing.T) {
	lister := newPaneActivityStub(shellPane(1, "sleep", false, "/dev/ttys001"))
	canonical := newCanonicalStub()
	canonical.setResult("/dev/ttys001", true)
	p := newTestPoller(lister, canonical, &recordingActivityBroadcaster{})

	p.Start()
	require.Eventually(t, func() bool { return lister.callCount() >= 1 }, time.Second, 5*time.Millisecond, "Start must tick immediately")

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	p.Stop(ctx)

	assert.NoError(t, ctx.Err(), "Stop must return well within its deadline for a loop with no in-flight work")
}

// TestShellActivityFeature_ContributeReflectsCurrentTerminals covers the feature's
// snapshot-contribution wiring (Snapshot.Terminals) from newShellActivityFeature's own
// constructor.
func TestShellActivityFeature_ContributeReflectsCurrentTerminals(t *testing.T) {
	hub := newWSHub(zerolog.Nop())
	lister := func(context.Context) ([]tmux.PaneActivity, error) { return nil, nil }
	f := newShellActivityFeature(alwaysHasShells, lister, newTerminalNames(), hub, zerolog.Nop())

	var snap Snapshot
	f.contribute(context.Background(), &snap)
	assert.NotNil(t, snap.Terminals)
	assert.Empty(t, snap.Terminals, "no terminals yet must still be a non-nil empty map")

	f.poller.reconcile(map[int64][]terminalWire{3: {tw(1, "shell 1", true)}, 1: {tw(1, "shell 1", false)}})
	f.contribute(context.Background(), &snap)
	assert.Equal(t, map[string][]terminalWire{"1": {tw(1, "shell 1", false)}, "3": {tw(1, "shell 1", true)}}, snap.Terminals)
}
