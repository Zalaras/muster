package session

import (
	"context"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/tmux"
)

// TestReconcile_KillsEveryShellSessionUnconditionallyAndCountsThem covers: every "muster-<n>-shell" tmux session on the socket is
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

	killer := newFakeTmuxSessions(shellOfKnown, shellOfUnknown, shellOfZero, knownTarget[:len(knownTarget)-len(":@1")])
	pc := newFakePaneChecker()
	pc.setExists(knownTarget, true)
	mgr := newTestManager(t, st, pc, nil, withTmuxSessions(killer))
	require.NoError(t, mgr.LoadAll(ctx))

	report := mgr.Reconcile(ctx)

	assert.Equal(t, 3, report.ShellsKilled, "D11: every shell-named session must be killed and counted, whatever its <n>")
	assert.ElementsMatch(t, []string{shellOfKnown, shellOfUnknown, shellOfZero}, killer.killedNames(),
		"D11: the actual kill calls must be exactly the three shell sessions, not the known Claude session")
}

// TestReconcile_NeverListsAnyShellSessionAsUnknown checks across the same three
// source states as above: a shell session is never appended to
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

	killer := newFakeTmuxSessions(shellOfKnown, shellOfUnknown, shellOfZero, genuinelyUnknownClaudeSession)
	pc := newFakePaneChecker()
	pc.setExists(knownTarget, true)
	mgr := newTestManager(t, st, pc, nil, withTmuxSessions(killer))
	require.NoError(t, mgr.LoadAll(ctx))

	report := mgr.Reconcile(ctx)

	assert.Equal(t, []string{genuinelyUnknownClaudeSession}, report.UnknownSessions,
		"D12: no shell-named session may ever appear in UnknownSessions, but a genuinely unknown non-shell session still must")
}

// TestReconcile_AFailedShellKillIsNotCountedButStillNeverReportedAsUnknown covers the
// error branch manager.go's Reconcile takes for a shell kill: KillSession returning an
// error must not increment ShellsKilled (it did not, in fact, get killed), but the name
// must still never leak into UnknownSessions — the "never adopted" promise does not
// depend on the kill actually succeeding.
func TestReconcile_AFailedShellKillIsNotCountedButStillNeverReportedAsUnknown(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	shellName := tmux.ShellSessionName(42)
	killer := newFakeTmuxSessions(shellName)
	killer.setKillErr(shellName, assertAnError{})
	mgr := newTestManager(t, st, nil, nil, withTmuxSessions(killer))
	require.NoError(t, mgr.LoadAll(ctx))

	report := mgr.Reconcile(ctx)

	assert.Equal(t, 0, report.ShellsKilled, "a kill that errored must not be counted as killed")
	assert.Empty(t, report.UnknownSessions, "a shell name must never be reported as unknown even when its kill failed")
}

// assertAnError is a trivial non-nil error for setKillErr above.
type assertAnError struct{}

func (assertAnError) Error() string { return "kill failed (test double)" }

// TestReconcile_KillsEveryTerminalOfEverySession crosses terminal numbers (1, 2, 10, a
// session with only a later terminal) against known and unknown sessions: each is killed
// and counted, none is reported unknown, and a bystander Claude name is untouched.
func TestReconcile_KillsEveryTerminalOfEverySession(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)

	seed := newTestManager(t, st, nil, nil)
	known, err := seed.CreateSession(ctx, params)
	require.NoError(t, err)
	knownTarget := "muster-" + strconv.FormatInt(known.ID, 10) + ":@1"
	_, err = seed.RecordLaunch(ctx, known.ID, knownTarget, "%1")
	require.NoError(t, err)

	unknownID := known.ID + 999000
	terminals := []string{
		tmux.TerminalSessionName(known.ID, 1), tmux.TerminalSessionName(known.ID, 2), tmux.TerminalSessionName(known.ID, 10),
		tmux.TerminalSessionName(unknownID, 3),
	}
	claude := "muster-" + strconv.FormatInt(known.ID, 10)
	killer := newFakeTmuxSessions(append([]string{claude}, terminals...)...)
	pc := newFakePaneChecker()
	pc.setExists(knownTarget, true)
	mgr := newTestManager(t, st, pc, nil, withTmuxSessions(killer))
	require.NoError(t, mgr.LoadAll(ctx))

	report := mgr.Reconcile(ctx)

	assert.Equal(t, len(terminals), report.ShellsKilled)
	assert.ElementsMatch(t, terminals, killer.killedNames(), "every terminal killed, the Claude session never")
	assert.Empty(t, report.UnknownSessions)
}

// TestClassifyTmuxNames_TerminalNamesRaiseTheWatermarkAndAreKeptAsNames: a terminal name
// with n >= 2 is classified as a terminal to kill (by its full name), not unknown, and its
// session id counts toward the highest id seen.
func TestClassifyTmuxNames_TerminalNamesRaiseTheWatermarkAndAreKeptAsNames(t *testing.T) {
	got := classifyTmuxNames([]string{"muster-5", "muster-9-shell-4", "muster-3-shell", "muster-7-shell-x"}, map[int64]bool{5: true})

	assert.Equal(t, []string{"muster-9-shell-4", "muster-3-shell"}, got.shellNames)
	assert.Equal(t, int64(9), got.maxSeen)
	assert.Equal(t, map[int64]string{5: "muster-5"}, got.live)
	assert.Equal(t, []string{"muster-7-shell-x"}, got.unknownNames, "a malformed terminal suffix is an unknown muster name, not a terminal")
}

// TestKillAllShells_KillsEveryTerminalNumber: the shutdown kill covers terminals beyond the first.
func TestKillAllShells_KillsEveryTerminalNumber(t *testing.T) {
	st := openTestStore(t)
	killer := newFakeTmuxSessions("muster-1", "muster-1-shell", "muster-1-shell-2", "muster-2-shell-3")
	mgr := newTestManager(t, st, nil, nil, withTmuxSessions(killer))

	killed, err := mgr.KillAllShells(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 3, killed)
	assert.ElementsMatch(t, []string{"muster-1-shell", "muster-1-shell-2", "muster-2-shell-3"}, killer.killedNames())
}
