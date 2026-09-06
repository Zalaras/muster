package session

import (
	"context"
	"strconv"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/tmux"
)

// TestReconcile_KillsEveryShellSessionUnconditionallyAndCountsThem covers D11 (plan
// plain-terminal-session REQ-10): every "muster-<n>-shell" tmux session on the socket is
// killed regardless of whose <n> it names — crossed against every reachable relationship
// between the shell's <n> and this daemon lifetime's own known sessions (a known alive
// session's own shell, an id that matches no session at all, and id 0), per the
// daemon-tests brief's "assert an invariant from every reachable source state, not just
// the convenient one" rule.
func TestReconcile_KillsEveryShellSessionUnconditionallyAndCountsThem(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	params := createParams(dir)
	params.RepoID = repoID

	seed := newTestManager(t, st, nil, nil)
	knownSess, err := seed.CreateSession(ctx, params)
	require.NoError(t, err)
	knownTarget := "muster-" + strconv.FormatInt(knownSess.ID, 10) + ":@1"
	_, err = seed.RecordLaunch(ctx, knownSess.ID, knownTarget, "%1")
	require.NoError(t, err)

	shellOfKnown := tmux.ShellSessionName(knownSess.ID)
	shellOfUnknown := tmux.ShellSessionName(knownSess.ID + 999000) // no session has this id
	shellOfZero := tmux.ShellSessionName(0)

	killer := newFakeKiller(shellOfKnown, shellOfUnknown, shellOfZero, knownTarget[:len(knownTarget)-len(":@1")])
	pc := newFakePaneChecker()
	pc.setExists(knownTarget, true)
	mgr := NewManager(Config{Store: st, Logger: zerolog.Nop(), PaneChecker: pc, SessionKiller: killer})
	require.NoError(t, mgr.LoadAll(ctx))

	report, err := mgr.Reconcile(ctx)
	require.NoError(t, err)

	assert.Equal(t, 3, report.ShellsKilled, "D11: every shell-named session must be killed and counted, whatever its <n>")
	assert.ElementsMatch(t, []string{shellOfKnown, shellOfUnknown, shellOfZero}, killer.killedNames(),
		"D11: the actual kill calls must be exactly the three shell sessions, not the known Claude session")
}

// TestReconcile_NeverListsAnyShellSessionAsUnknown covers D12 across the same three
// source states as D11 above: a shell session is never appended to
// ReconcileReport.UnknownSessions, whether or not its <n> happens to match a session
// this daemon lifetime actually knows about.
func TestReconcile_NeverListsAnyShellSessionAsUnknown(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	repoID := seedRepo(t, st, dir)
	params := createParams(dir)
	params.RepoID = repoID

	seed := newTestManager(t, st, nil, nil)
	knownSess, err := seed.CreateSession(ctx, params)
	require.NoError(t, err)
	knownTarget := "muster-" + strconv.FormatInt(knownSess.ID, 10) + ":@1"
	_, err = seed.RecordLaunch(ctx, knownSess.ID, knownTarget, "%1")
	require.NoError(t, err)

	shellOfKnown := tmux.ShellSessionName(knownSess.ID)
	shellOfUnknown := tmux.ShellSessionName(knownSess.ID + 999000)
	shellOfZero := tmux.ShellSessionName(0)
	genuinelyUnknownClaudeSession := "muster-999999999" // NOT a shell name — must still be reported

	killer := newFakeKiller(shellOfKnown, shellOfUnknown, shellOfZero, genuinelyUnknownClaudeSession)
	pc := newFakePaneChecker()
	pc.setExists(knownTarget, true)
	mgr := NewManager(Config{Store: st, Logger: zerolog.Nop(), PaneChecker: pc, SessionKiller: killer})
	require.NoError(t, mgr.LoadAll(ctx))

	report, err := mgr.Reconcile(ctx)
	require.NoError(t, err)

	assert.Equal(t, []string{genuinelyUnknownClaudeSession}, report.UnknownSessions,
		"D12: no shell-named session may ever appear in UnknownSessions, but a genuinely unknown non-shell session still must")
}

// TestReconcile_AFailedShellKillIsNotCountedButStillNeverReportedAsUnknown covers the
// error branch manager.go's Reconcile takes for a shell kill: KillSession returning an
// error must not increment ShellsKilled (it did not, in fact, get killed), but the name
// must still never leak into UnknownSessions — REQ-10's "never adopted" promise does not
// depend on the kill actually succeeding.
func TestReconcile_AFailedShellKillIsNotCountedButStillNeverReportedAsUnknown(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	shellName := tmux.ShellSessionName(42)
	killer := newFakeKiller(shellName)
	killer.setKillErr(shellName, assertAnError{})
	mgr := NewManager(Config{Store: st, Logger: zerolog.Nop(), SessionKiller: killer})
	require.NoError(t, mgr.LoadAll(ctx))

	report, err := mgr.Reconcile(ctx)
	require.NoError(t, err)

	assert.Equal(t, 0, report.ShellsKilled, "a kill that errored must not be counted as killed")
	assert.Empty(t, report.UnknownSessions, "a shell name must never be reported as unknown even when its kill failed")
}

// assertAnError is a trivial non-nil error for setKillErr above.
type assertAnError struct{}

func (assertAnError) Error() string { return "kill failed (test double)" }
