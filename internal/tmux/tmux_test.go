package tmux

import (
	"bytes"
	"context"
	"crypto/rand"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/tmux/tmuxtest"
)

// newTestSocket returns a private, per-test tmux socket *path* (plan v1-cleanup REQ-4:
// the shared helper every one of this file's tests now uses instead of its own copy of
// the same os.MkdirTemp + kill-server idiom — see tmuxtest.Socket's own doc comment for
// the sun_path rationale). This also exercises the -S code path (REQ-5) on every test
// that uses it.
func newTestSocket(t *testing.T) string {
	t.Helper()
	return tmuxtest.Socket(t)
}

// nextID returns a small unique-enough int64 per test so concurrently running tests
// (different sockets) never collide on a tmux session name; each test only ever calls
// this for its own socket, so a monotonically increasing counter is unnecessary — a
// random value avoids any cross-test coordination.
func nextID(t *testing.T) int64 {
	t.Helper()
	b := make([]byte, 4)
	_, err := rand.Read(b)
	require.NoError(t, err)
	return int64(b[0])<<24 | int64(b[1])<<16 | int64(b[2])<<8 | int64(b[3])
}

func sleepCommand() []string {
	return []string{"/bin/sh", "-c", "sleep 60"}
}

func TestNewSession_ReturnsATargetAndPane(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()

	target, pane, err := c.NewSession(context.Background(), nextID(t), dir, nil, sleepCommand())
	require.NoError(t, err)

	assert.Regexp(t, `^muster-\d+:@\d+$`, target)
	assert.Regexp(t, `^%\d+$`, pane)
}

func TestNewSession_NamesTheTmuxSessionMusterDashID(t *testing.T) {
	socket := newTestSocket(t)
	c := New(socket)
	dir := t.TempDir()
	id := nextID(t)
	wantName := "muster-" + strconv.FormatInt(id, 10)

	target, _, err := c.NewSession(context.Background(), id, dir, nil, sleepCommand())
	require.NoError(t, err)

	assert.Equal(t, wantName+":", target[:len(wantName)+1])

	out, err := exec.Command("tmux", "-S", socket, "list-sessions", "-F", "#{session_name}").Output()
	require.NoError(t, err)
	assert.Equal(t, wantName+"\n", string(out))
}

func TestNewSession_SetsExtraEnvironmentInThePane(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()
	outFile := filepath.Join(dir, "env-output.txt")

	_, _, err := c.NewSession(context.Background(), nextID(t), dir, map[string]string{
		"MUSTER_TEST_VAR": "hello123",
	}, []string{"/bin/sh", "-c", "echo $MUSTER_TEST_VAR > " + outFile + "; sleep 60"})
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		b, readErr := os.ReadFile(outFile)
		return readErr == nil && len(b) > 0
	}, 5*time.Second, 50*time.Millisecond)

	got, err := os.ReadFile(outFile)
	require.NoError(t, err)
	assert.Equal(t, "hello123\n", string(got))
}

func TestNewSession_SpawnsInTheGivenDirectory(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()
	outFile := filepath.Join(dir, "pwd-output.txt")

	_, _, err := c.NewSession(context.Background(), nextID(t), dir, nil, []string{"/bin/sh", "-c", "pwd > " + outFile + "; sleep 60"})
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		b, readErr := os.ReadFile(outFile)
		return readErr == nil && len(b) > 0
	}, 5*time.Second, 50*time.Millisecond)

	got, err := os.ReadFile(outFile)
	require.NoError(t, err)
	// Resolve symlinks (macOS temp dirs are often under a /private/var/... real path
	// that /var/... symlinks to) before comparing.
	wantDir, err := filepath.EvalSymlinks(dir)
	require.NoError(t, err)
	gotDir, err := filepath.EvalSymlinks(trimTrailingNewline(string(got)))
	require.NoError(t, err)
	assert.Equal(t, wantDir, gotDir)
}

func trimTrailingNewline(s string) string {
	if len(s) > 0 && s[len(s)-1] == '\n' {
		return s[:len(s)-1]
	}
	return s
}

// TestNewSession_DifferentIDsCreateDistinctTmuxSessions replaces the old (m1-topology)
// "reuses the same tmux session across calls" test: since m2-terminal, one tmux
// *session* per Muster session is the topology (Tiles needs concurrent live attaches,
// and a tmux client attaches to a session, not a window) — two NewSession calls with
// different ids must produce two distinct tmux sessions, not two windows in one shared
// session.
func TestNewSession_DifferentIDsCreateDistinctTmuxSessions(t *testing.T) {
	socket := newTestSocket(t)
	c := New(socket)
	dir := t.TempDir()
	id1, id2 := nextID(t), nextID(t)+1

	target1, _, err := c.NewSession(context.Background(), id1, dir, nil, sleepCommand())
	require.NoError(t, err)
	target2, _, err := c.NewSession(context.Background(), id2, dir, nil, sleepCommand())
	require.NoError(t, err)

	assert.NotEqual(t, target1, target2)

	out, err := exec.Command("tmux", "-S", socket, "list-sessions", "-F", "#{session_name}").Output()
	require.NoError(t, err)
	names := map[string]bool{}
	for _, n := range splitLines(string(out)) {
		names[n] = true
	}
	assert.Len(t, names, 2, "two different ids must create two distinct tmux sessions")
	assert.True(t, names["muster-"+strconv.FormatInt(id1, 10)])
	assert.True(t, names["muster-"+strconv.FormatInt(id2, 10)])
}

func splitLines(s string) []string {
	var out []string
	cur := ""
	for _, r := range s {
		if r == '\n' {
			if cur != "" {
				out = append(out, cur)
			}
			cur = ""
			continue
		}
		cur += string(r)
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}

// TestNewSession_ASlashContainingSocketCreatesTheSocketFileAtThatPath covers D9: a
// -tmux-socket value containing "/" is used as a filesystem path (-S), and a session on
// it actually creates the socket file there.
func TestNewSession_ASlashContainingSocketCreatesTheSocketFileAtThatPath(t *testing.T) {
	base, err := os.MkdirTemp("", "muster-tmux-")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(base) })
	socket := filepath.Join(base, "nested", "tmux.sock")
	require.NoError(t, os.MkdirAll(filepath.Dir(socket), 0o700))
	c := New(socket)
	dir := t.TempDir()
	t.Cleanup(func() { _ = exec.Command("tmux", "-S", socket, "kill-server").Run() })

	_, _, err = c.NewSession(context.Background(), nextID(t), dir, nil, sleepCommand())
	require.NoError(t, err)

	require.FileExists(t, socket, "a socket value containing \"/\" must create the socket file at that exact path")
}

// TestSocketFlag_PathUsesDashSBareNameUsesDashL covers D9's other half directly against
// the flag-building logic, without spawning any real tmux server for the bare-name case
// (which would otherwise land a socket in tmux's shared $TMPDIR/tmux-$UID/ directory —
// exactly what D12 forbids in tests).
func TestSocketFlag_PathUsesDashSBareNameUsesDashL(t *testing.T) {
	tests := []struct {
		name   string
		socket string
		want   []string
	}{
		{"bare name", "muster", []string{"-L", "muster"}},
		{"absolute path", "/tmp/scratch/tmux.sock", []string{"-S", "/tmp/scratch/tmux.sock"}},
		{"relative path with slash", "./scratch/tmux.sock", []string{"-S", "./scratch/tmux.sock"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := New(tt.socket)
			assert.Equal(t, tt.want, c.socketFlag())
		})
	}
}

func TestPaneExists_TrueForALiveWindowFalseAfterKill(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()

	target, _, err := c.NewSession(context.Background(), nextID(t), dir, nil, sleepCommand())
	require.NoError(t, err)

	exists, err := c.PaneExists(context.Background(), target)
	require.NoError(t, err)
	assert.True(t, exists)

	require.NoError(t, c.KillWindow(context.Background(), target))

	exists, err = c.PaneExists(context.Background(), target)
	require.NoError(t, err)
	assert.False(t, exists, "the liveness poll's only signal: a killed pane must report as gone")
}

// TestPaneExists_CancelledContextReturnsWrappedContextCanceled covers REQ-11/D8: an
// already-cancelled context must never read as "tmux answered and said gone" — run wraps
// ctx.Err() rather than returning a bare *exec.ExitError, so errors.As inside PaneExists
// misses the ExitError branch and this returns (false, err) with errors.Is(err,
// context.Canceled) holding, not (false, nil). The session stays genuinely alive
// throughout (sanity check below) — a regression that reverted run's ctx.Err() wrap would
// make this read (false, nil) instead, exactly the "deadline mistaken for not there" bug
// REQ-11 exists to close.
func TestPaneExists_CancelledContextReturnsWrappedContextCanceled(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()
	id := nextID(t)
	target, _, err := c.NewSession(context.Background(), id, dir, nil, sleepCommand())
	require.NoError(t, err)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	exists, existsErr := c.PaneExists(ctx, target)

	require.Error(t, existsErr, "REQ-11/D8: a cancelled context must surface as an error, never (false, nil)")
	assert.False(t, exists)
	require.ErrorIs(t, existsErr, context.Canceled)

	// Sanity: the session was never actually asked about — it must still be alive.
	stillExists, err := c.PaneExists(context.Background(), target)
	require.NoError(t, err)
	assert.True(t, stillExists, "sanity: the cancelled call must not itself have killed anything")
}

func TestPaneExists_EmptyTargetIsFalseWithNoError(t *testing.T) {
	c := New(newTestSocket(t))

	exists, err := c.PaneExists(context.Background(), "")

	require.NoError(t, err)
	assert.False(t, exists)
}

func TestPaneExists_UnknownTargetOnARunningServerIsFalseWithNoError(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()
	// Start the server/session so has-session succeeds, but ask about a window that was
	// never created.
	_, _, err := c.NewSession(context.Background(), nextID(t), dir, nil, sleepCommand())
	require.NoError(t, err)

	exists, err := c.PaneExists(context.Background(), "muster-999999:@999")

	require.NoError(t, err)
	assert.False(t, exists)
}

func TestKillWindow_ErrorsForAnUnknownTarget(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()
	_, _, err := c.NewSession(context.Background(), nextID(t), dir, nil, sleepCommand())
	require.NoError(t, err)

	err = c.KillWindow(context.Background(), "muster-999999:@999")

	assert.Error(t, err)
}

// TestAttachArgv_IncludesTheSocketFlagAndTarget covers the AttachArgv helper
// termbridge relies on to spawn the attach process — never invoked via a prefix key
// (package doc comment), always this literal CLI argv.
func TestAttachArgv_IncludesTheSocketFlagAndTarget(t *testing.T) {
	c := New("/tmp/scratch/tmux.sock")

	argv := c.AttachArgv("muster-7:@1")

	assert.Equal(t, []string{"tmux", "-S", "/tmp/scratch/tmux.sock", "attach-session", "-t", "muster-7:@1"}, argv)
}

// TestResizeWindowAndDisplayVar_RoundTripTheRequestedGeometry covers D4: a
// resize-window call is reflected exactly by the #{window_width}/#{window_height}
// oracle (never clipped/padded) — the same oracle daemon-impl's manual smoke test used.
func TestResizeWindowAndDisplayVar_RoundTripTheRequestedGeometry(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()

	target, _, err := c.NewSession(context.Background(), nextID(t), dir, nil, sleepCommand())
	require.NoError(t, err)

	require.NoError(t, c.ResizeWindow(context.Background(), target, 120, 40))

	width, err := c.DisplayVar(context.Background(), target, "#{window_width}")
	require.NoError(t, err)
	assert.Equal(t, "120", width)

	height, err := c.DisplayVar(context.Background(), target, "#{window_height}")
	require.NoError(t, err)
	assert.Equal(t, "40", height)
}

// TestDisplayVar_UnknownTargetReturnsEmptyWithNoError documents measured tmux behaviour
// (not asserted anywhere in the plan): unlike list-panes/kill-window, `display-message
// -t <unknown>` does not exit non-zero for an unresolvable target — it silently expands
// the format to empty. DisplayVar is a test-oracle-only helper (never a production
// state source per CLAUDE.md), so this is here to pin the actually-observed behaviour
// rather than an assumed one, not to test tmux itself.
func TestDisplayVar_UnknownTargetReturnsEmptyWithNoError(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()
	_, _, err := c.NewSession(context.Background(), nextID(t), dir, nil, sleepCommand())
	require.NoError(t, err)

	out, err := c.DisplayVar(context.Background(), "muster-999999:@999", "#{window_width}")

	require.NoError(t, err)
	assert.Empty(t, out)
}

// TestNewSession_AppliesServerOptionsOnFreshServer covers D8 (window-size manual) plus
// the rest of REQ-4's carry-over config (FINDINGS §7) and the manually-verified `prefix
// None` (daemon-implementation.md Decisions) — asserted here automatically via
// show-options rather than only by hand.
func TestNewSession_AppliesServerOptionsOnFreshServer(t *testing.T) {
	socket := newTestSocket(t)
	c := New(socket)
	dir := t.TempDir()

	_, _, err := c.NewSession(context.Background(), nextID(t), dir, nil, sleepCommand())
	require.NoError(t, err)

	tests := []struct {
		option string
		want   string
	}{
		{"window-size", "manual"},
		{"escape-time", "0"},
		{"status", "off"},
		{"mouse", "off"},
		{"destroy-unattached", "off"},
		{"detach-on-destroy", "on"},
		{"prefix", "None"},
		{"prefix2", "None"},
	}
	for _, tt := range tests {
		t.Run(tt.option, func(t *testing.T) {
			out, err := exec.Command("tmux", "-S", socket, "show-options", "-g", tt.option).Output()
			require.NoError(t, err)
			assert.Equal(t, tt.option+" "+tt.want+"\n", string(out))
		})
	}
}

// TestNewSession_AppliesServerOptionsOnlyOnceOnAnAlreadyRunningServer covers the
// "applies once per socket server" claim (serverRunning preflight): a second
// NewSession on the same socket must not error trying to re-apply server options (some
// tmux versions warn/behave oddly on redundant global sets) and the option must remain
// exactly as set.
func TestNewSession_AppliesServerOptionsOnlyOnceOnAnAlreadyRunningServer(t *testing.T) {
	socket := newTestSocket(t)
	c := New(socket)
	dir := t.TempDir()

	_, _, err := c.NewSession(context.Background(), nextID(t), dir, nil, sleepCommand())
	require.NoError(t, err)
	_, _, err = c.NewSession(context.Background(), nextID(t)+1, dir, nil, sleepCommand())
	require.NoError(t, err)

	out, err := exec.Command("tmux", "-S", socket, "show-options", "-g", "window-size").Output()
	require.NoError(t, err)
	assert.Equal(t, "window-size manual\n", string(out))
}

// TestNewNamedSession_ApplyServerOptionsFailureLeavesNoSessionAndReturnsTheOriginalError
// covers D6/REQ-5/Edge Case 4: `tmux new-session` succeeds, then applyServerOptions fails
// on the fresh server — the session it just created must be killed before NewNamedSession
// returns, and the returned error must still be the original applyServerOptions failure,
// not a kill failure masking it. serverOptions is swapped for a deliberately invalid tmux
// option for the duration of the test (restored via t.Cleanup) rather than requiring a new
// injectable seam — this file is inside package tmux, so it already has access to the
// unexported var.
func TestNewNamedSession_ApplyServerOptionsFailureLeavesNoSessionAndReturnsTheOriginalError(t *testing.T) {
	socket := newTestSocket(t)
	c := New(socket)
	dir := t.TempDir()
	name := "muster-" + strconv.FormatInt(nextID(t), 10)

	orig := serverOptions
	serverOptions = [][]string{{"set-option", "-g", "not-a-real-tmux-option", "nonsense"}}
	t.Cleanup(func() { serverOptions = orig })

	_, _, err := c.NewNamedSession(context.Background(), name, dir, nil, sleepCommand())

	require.Error(t, err)
	assert.Contains(t, err.Error(), "applying tmux option", "the original applyServerOptions failure must survive, not a kill failure")

	names, listErr := c.ListSessions(context.Background())
	require.NoError(t, listErr)
	assert.NotContains(t, names, name, "D6/REQ-5: a session created just before a fatal applyServerOptions failure must not be leaked")
}

// TestKillLeakedSession_RemovesAnExistingSessionAndIsANoOpForAnUnknownName covers REQ-5's
// shared cleanup helper (tmux.go's killLeakedSession) directly: it removes a session that
// actually exists, and is a silent no-op — never a panic, never a hang — for a name
// nothing ever created. This is what closes the len(fields)!=2 post-create branch's
// coverage gap (previously documented in daemon-tests.md as covered-by-inspection only,
// since that branch's own trigger — a malformed `new-session -F` output shape — has no
// deterministic oracle): both post-create failure branches share this one helper, so
// testing it directly covers what calling it from either branch would exercise, without
// needing to force the branch itself.
func TestKillLeakedSession_RemovesAnExistingSessionAndIsANoOpForAnUnknownName(t *testing.T) {
	socket := newTestSocket(t)
	c := New(socket)
	dir := t.TempDir()
	id := nextID(t)
	name := "muster-" + strconv.FormatInt(id, 10)

	_, _, err := c.NewSession(context.Background(), id, dir, nil, sleepCommand())
	require.NoError(t, err)

	c.killLeakedSession(context.Background(), name)

	names, err := c.ListSessions(context.Background())
	require.NoError(t, err)
	assert.NotContains(t, names, name, "killLeakedSession must actually remove an existing session")

	// A name nothing ever created: reaching this line at all (no panic) plus the test
	// finishing well within its default timeout (no hang) is the assertion.
	c.killLeakedSession(context.Background(), "muster-does-not-exist-at-all")
}

// TestMaxSessionID_NoServerReturnsZero covers D2: a socket with no tmux server at all
// (mirroring ListSessions' own "no server yet" shape) floors at 0, never erroring.
func TestMaxSessionID_NoServerReturnsZero(t *testing.T) {
	c := New(newTestSocket(t))

	id, err := c.MaxSessionID(context.Background())

	require.NoError(t, err)
	assert.Equal(t, int64(0), id)
}

// TestMaxSessionID_ReturnsTheHighestIDAcrossBothClaudeAndShellSessionNames covers REQ-3:
// the floor is the max over one ListSessions of both "muster-<id>" and
// "muster-<id>-shell" — a shell session's id must count too, since REQ-9's watermark-raise
// on a killed shell depends on the same primitive.
func TestMaxSessionID_ReturnsTheHighestIDAcrossBothClaudeAndShellSessionNames(t *testing.T) {
	socket := newTestSocket(t)
	c := New(socket)
	dir := t.TempDir()

	_, _, err := c.NewSession(context.Background(), 3, dir, nil, sleepCommand())
	require.NoError(t, err)
	_, _, err = c.NewNamedSession(context.Background(), ShellSessionName(9), dir, nil, sleepCommand())
	require.NoError(t, err)
	_, _, err = c.NewSession(context.Background(), 5, dir, nil, sleepCommand())
	require.NoError(t, err)

	got, err := c.MaxSessionID(context.Background())

	require.NoError(t, err)
	assert.Equal(t, int64(9), got, "the shell session's id must count toward the floor too")
}

// TestMaxSessionID_IgnoresNonMusterSessions covers REQ-3's other half: a tmux session on
// the socket that doesn't match either naming convention at all must never move the floor.
func TestMaxSessionID_IgnoresNonMusterSessions(t *testing.T) {
	socket := newTestSocket(t)
	c := New(socket)
	dir := t.TempDir()

	_, _, err := c.NewNamedSession(context.Background(), "not-a-muster-session-at-all", dir, nil, sleepCommand())
	require.NoError(t, err)

	got, err := c.MaxSessionID(context.Background())

	require.NoError(t, err)
	assert.Equal(t, int64(0), got)
}

// TestParseSessionName covers REQ-3's bare "muster-<N>" mirror of IsShellSessionName:
// only the plain Claude-pane shape parses, never the shell suffix or an unrelated name.
func TestParseSessionName(t *testing.T) {
	id, ok := ParseSessionName("muster-42")
	require.True(t, ok)
	assert.Equal(t, int64(42), id)

	_, ok = ParseSessionName("muster-42-shell")
	assert.False(t, ok, "shell names are IsShellSessionName's territory, not ParseSessionName's")

	_, ok = ParseSessionName("not-a-muster-session")
	assert.False(t, ok)

	_, ok = ParseSessionName("muster-not-a-number")
	assert.False(t, ok)
}

// TestNewNamedSession_DuplicateNameWrapsErrSessionExists covers REQ-4: a tmux
// "duplicate session" failure on new-session is wrapped so callers can branch on it with
// errors.Is, never by matching tmux's own stderr text themselves.
func TestNewNamedSession_DuplicateNameWrapsErrSessionExists(t *testing.T) {
	socket := newTestSocket(t)
	c := New(socket)
	dir := t.TempDir()
	name := "muster-" + strconv.FormatInt(nextID(t), 10)

	_, _, err := c.NewNamedSession(context.Background(), name, dir, nil, sleepCommand())
	require.NoError(t, err)

	_, _, err = c.NewNamedSession(context.Background(), name, dir, nil, sleepCommand())

	require.Error(t, err)
	assert.ErrorIs(t, err, ErrSessionExists, "REQ-4: a duplicate-session tmux failure must be wrapped as ErrSessionExists")
}

// TestNewClient_UsesAPerTestSocketNeverTheSharedDefault is a documentation-style
// regression guard for the CLAUDE.md hard rule and D12: this package's own New must
// never be called with the literal default socket name in a test. It doesn't call tmux
// at all — it just pins the expectation that "muster" (the production default) is never
// passed to New() anywhere in this file.
func TestNewClient_UsesAPerTestSocketNeverTheSharedDefault(t *testing.T) {
	c := New(newTestSocket(t))
	assert.NotEqual(t, "muster", c.socket)
}

// TestKillSession_RemovesTheWholeSessionIdempotentForAnUnknownName covers m4-reconcile
// REQ-5's End path (kill-session by name actually removes the session — not just one
// window; under the one-window-per-session topology the two are equivalent per the
// plan's Implementation Notes) and plan session-lifecycle REQ-6: killing an already-gone
// session name is success, not an error — the same "no such session" exit PaneExists and
// ListSessions already treat as "not there" rather than a real failure. This replaces the
// pre-session-lifecycle assertion that an unknown name must error; REQ-6 changes that
// contract deliberately (kb:adr/actions-kill-is-idempotent).
func TestKillSession_RemovesTheWholeSessionIdempotentForAnUnknownName(t *testing.T) {
	socket := newTestSocket(t)
	c := New(socket)
	dir := t.TempDir()
	id := nextID(t)
	name := "muster-" + strconv.FormatInt(id, 10)

	_, _, err := c.NewSession(context.Background(), id, dir, nil, sleepCommand())
	require.NoError(t, err)

	require.NoError(t, c.KillSession(context.Background(), name))

	out, listErr := exec.Command("tmux", "-S", socket, "list-sessions", "-F", "#{session_name}").CombinedOutput()
	require.Error(t, listErr, "the server has no sessions left at all: %s", out)

	err = c.KillSession(context.Background(), "muster-does-not-exist")
	assert.NoError(t, err, "REQ-6: killing an already-gone session name must be treated as a successful kill")
}

// TestKillSession_UnreachableSocketReturnsAnErrorWhileTheSessionIsStillAlive covers plan
// session-lifecycle D20/review Critical 1: an unreachable socket must never read as "the
// session is gone". PaneExists collapses every *exec.ExitError — including tmux's own
// "error connecting to <path> (Permission denied)" for a chmod'd-unreadable socket — to
// (false, nil), so KillSession's own ExitError-then-PaneExists-verify (tmux.go's
// KillSession doc comment) sees stillThere=false, checkErr=nil and reports success even
// though the session is provably still running underneath. Measured against the real
// installed tmux binary (review.md Critical 1's own repro, reproduced by hand before
// writing this test):
//
//	$ tmux -S <sock> new-session -d -s muster-N 'sleep 60'      # exit 0
//	$ chmod 000 <sock>
//	$ tmux -S <sock> kill-session -t muster-N
//	error connecting to <sock> (Permission denied)               # exit 1
//	$ chmod 700 <sock> && tmux -S <sock> list-sessions -F '#{session_name}'
//	muster-N                                                      # still alive throughout
//
// Not built on tmuxtest.Socket(t): that helper's own kill-server cleanup would itself
// fail against a still-chmod'd-000 socket and leak the tmux server process, so this test
// manages its own socket directory and registers a chmod-back-then-kill-server cleanup
// (LIFO: registered after the chmod 000, so it runs before the directory removal).
func TestKillSession_UnreachableSocketReturnsAnErrorWhileTheSessionIsStillAlive(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("running as root can still read a chmod 000 socket, which would invert this test's assertions")
	}

	dir, err := os.MkdirTemp("", "muster-tmuxtest-unreachable-")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	socket := filepath.Join(dir, "tmux.sock")

	c := New(socket)
	spawnDir := t.TempDir()
	id := nextID(t)
	name := "muster-" + strconv.FormatInt(id, 10)

	target, _, err := c.NewSession(context.Background(), id, spawnDir, nil, sleepCommand())
	require.NoError(t, err)

	require.NoError(t, os.Chmod(socket, 0o000))
	t.Cleanup(func() {
		_ = os.Chmod(socket, 0o700) // restore access before kill-server, or it would fail and leak the server
		_ = exec.Command("tmux", "-S", socket, "kill-server").Run()
	})

	killErr := c.KillSession(context.Background(), name)
	require.Error(t, killErr, "D20/Critical 1: an unreachable socket must not read as a successful kill")

	_, existsErr := c.PaneExists(context.Background(), target)
	require.Error(t, existsErr, "D20/Critical 1: PaneExists must surface a couldn't-ask failure as an error, not (false, nil)")

	require.NoError(t, os.Chmod(socket, 0o700))
	names, listErr := c.ListSessions(context.Background())
	require.NoError(t, listErr)
	assert.Contains(t, names, name, "sanity: the session was genuinely alive behind the unreachable socket the whole time")
}

// TestKillSession_CancelledContextNeverReadsAsASuccessfulKill covers REQ-5(d)/D8's own
// "checkErr != nil" clause via a cancelled context rather than the chmod-based repro
// above (session-lifecycle D20's own scenario is unreachable-socket specific): run wraps
// ctx.Err() rather than a bare *exec.ExitError (REQ-11), so KillSession's own
// errors.As(err, &exitErr) misses and it returns the wrapped context error directly,
// without ever reaching the post-kill PaneExists verify at all — the session is
// genuinely alive throughout, proving this never silently reads as REQ-6's idempotent
// "already gone" success.
func TestKillSession_CancelledContextNeverReadsAsASuccessfulKill(t *testing.T) {
	socket := newTestSocket(t)
	c := New(socket)
	dir := t.TempDir()
	id := nextID(t)
	name := "muster-" + strconv.FormatInt(id, 10)
	_, _, err := c.NewSession(context.Background(), id, dir, nil, sleepCommand())
	require.NoError(t, err)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	killErr := c.KillSession(ctx, name)

	require.Error(t, killErr, "REQ-11/D8: a cancelled context must never be mistaken for a successful (idempotent) kill")
	require.ErrorIs(t, killErr, context.Canceled)

	names, listErr := c.ListSessions(context.Background())
	require.NoError(t, listErr)
	assert.Contains(t, names, name, "sanity: the cancelled call must not itself have killed anything")
}

// TestKillSession_PostKillRecheckStillThereReturnsTheOriginalKillError covers REQ-5(d)/D8's
// "stillThere" clause: kill-session exits non-zero (an *exec.ExitError, the branch
// KillSession treats as "maybe gone, maybe a real failure — go verify"), and the post-kill
// PaneExists recheck itself reports the target is still there. KillSession's doc comment
// says the honest report in that case is the *original* kill-session error, not a
// synthesized "still there" error and not REQ-6's idempotent success. Real tmux gives no
// deterministic way to make kill-session fail with an ExitError while the target
// demonstrably survives (daemon-tests' own analysis, plans/general-cleanup/daemon-tests.md
// implementation-bug row), so this drives it through Client.exec directly — the seam
// daemon-impl added for exactly this case (tmux.go's exec field doc comment).
func TestKillSession_PostKillRecheckStillThereReturnsTheOriginalKillError(t *testing.T) {
	name := "muster-99"
	const killStderrMarker = "fake-tmux-kill-session-failure-marker"

	c := &Client{
		socket: "irrelevant-fake-socket",
		exec: func(ctx context.Context, _ string, args ...string) (stdout, stderr []byte, err error) {
			switch {
			case slices.Contains(args, "kill-session"):
				// A real *exec.ExitError (not a hand-built one) so KillSession's
				// errors.As(err, &exitErr) matches exactly as it would against real
				// tmux — only the exit status and captured stderr are faked. Stdout is
				// deliberately not folded in here (the exec seam keeps the two streams
				// separate; run's own error text is what re-joins them).
				cmd := exec.CommandContext(ctx, "sh", "-c", "echo "+killStderrMarker+" >&2; exit 1")
				var errBuf bytes.Buffer
				cmd.Stderr = &errBuf
				runErr := cmd.Run()
				return nil, errBuf.Bytes(), runErr
			case slices.Contains(args, "list-panes"):
				// PaneExists' recheck: a nil error from run means "found it" (stillThere).
				return []byte("ok"), nil, nil
			default:
				t.Fatalf("unexpected tmux subcommand: %v", args)
				return nil, nil, nil
			}
		},
	}

	killErr := c.KillSession(context.Background(), name)

	require.Error(t, killErr, "REQ-5(d)/D8: a still-there recheck must not read as REQ-6's idempotent success")
	assert.Contains(t, killErr.Error(), killStderrMarker,
		"the ORIGINAL kill-session error must be returned, not a synthesized still-there error")
	assert.Contains(t, killErr.Error(), name)
	var exitErr *exec.ExitError
	assert.ErrorAs(t, killErr, &exitErr, "the original error's *exec.ExitError must still be in the chain")
}

// TestIsConnectionFailure covers plan session-lifecycle D24/review cycle 2 Critical:
// isConnectionFailure matches only EACCES's wording ("Permission denied"), so EPERM's
// distinct wording ("Operation not permitted" — measured by the reviewer under
// sandbox-exec, not reproduced here per the lead's instruction: a sandbox-exec dependency
// in a unit test would be fragile and environment-dependent) leaves cycle 1's whole
// defect reachable unchanged through any sandboxing mechanism that denies socket access
// with EPERM rather than EACCES (sandbox-exec, an MDM profile, the app sandbox).
//
// The three negative cases are measured directly against the real installed tmux binary
// (not guessed), because they are exactly what a review cycle 2 finding says a naive fix
// (matching bare "error connecting to") broke — seven then-green PaneExists-against-
// no-server-yet tests, in the reviewer's own scratch-copy experiment:
//
//	$ tmux -S <nonexistent-path> list-sessions
//	error connecting to <path> (No such file or directory)              # no socket file at all
//	$ touch <path>; tmux -S <path> list-sessions
//	error connecting to <path> (Socket operation on non-socket)         # a file, not a socket
//	$ tmux -S <path> new-session -d ...; tmux -S <path> kill-server; tmux -S <path> list-sessions
//	no server running on <path>                                        # a real socket, server exited
func TestIsConnectionFailure(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			"EACCES wording matches (already guarded by D20)",
			errors.New(`exit status 1: error connecting to /tmp/muster-x/tmux.sock (Permission denied)`),
			true,
		},
		{
			"EPERM wording must also match (D24: sandboxed denial, review cycle 2 Critical)",
			errors.New(`exit status 1: error connecting to /tmp/muster-x/tmux.sock (Operation not permitted)`),
			true,
		},
		{
			"no socket file at all must not match — the ordinary no-server-yet reading",
			errors.New(`exit status 1: error connecting to /tmp/muster-x/tmux.sock (No such file or directory)`),
			false,
		},
		{
			"a non-socket file at the path must not match — a fixture defect, not a live server",
			errors.New(`exit status 1: error connecting to /tmp/muster-x/tmux.sock (Socket operation on non-socket)`),
			false,
		},
		{
			"a real socket whose server already exited must not match",
			errors.New(`exit status 1: no server running on /tmp/muster-x/tmux.sock`),
			false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, isConnectionFailure(tt.err))
		})
	}
}

// TestListSessions_UnreachableSocketReturnsAnErrorWhileASessionIsStillAlive covers plan
// session-lifecycle D25/review cycle 2 Major: ListSessions still collapses every
// *exec.ExitError to (nil, nil), so an unreachable socket reads as "no sessions at all"
// rather than "I couldn't find out" — the worst call site for that collapse, since
// Reconcile treats an empty ListSessions snapshot as ground truth (D26 covers the
// consequence). Same shape as D20: a self-managed socket directory (not
// tmuxtest.Socket(t), whose kill-server cleanup would itself fail against a still-
// unreadable socket and leak the server), chmod 000, restore-then-kill-server registered
// after the chmod so LIFO ordering runs it first, skipped under a root euid.
func TestListSessions_UnreachableSocketReturnsAnErrorWhileASessionIsStillAlive(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("running as root can still read a chmod 000 socket, which would invert this test's assertion")
	}

	dir, err := os.MkdirTemp("", "muster-tmuxtest-unreachable-")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	socket := filepath.Join(dir, "tmux.sock")

	c := New(socket)
	spawnDir := t.TempDir()
	id := nextID(t)
	name := "muster-" + strconv.FormatInt(id, 10)

	_, _, err = c.NewSession(context.Background(), id, spawnDir, nil, sleepCommand())
	require.NoError(t, err)

	require.NoError(t, os.Chmod(socket, 0o000))
	t.Cleanup(func() {
		_ = os.Chmod(socket, 0o700) // restore access before kill-server, or it would fail and leak the server
		_ = exec.Command("tmux", "-S", socket, "kill-server").Run()
	})

	names, listErr := c.ListSessions(context.Background())
	require.Error(t, listErr, "D25/Major: an unreachable socket must not read as an empty session list")
	assert.Empty(t, names, "a couldn't-ask failure must not also claim a (misleadingly empty) list of names")

	require.NoError(t, os.Chmod(socket, 0o700))
	aliveNames, err := c.ListSessions(context.Background())
	require.NoError(t, err)
	assert.Contains(t, aliveNames, name, "sanity: the session was genuinely alive behind the unreachable socket the whole time")
}

// TestListSessions_ReturnsEveryNameNoServerIsAnEmptyResultNotAnError covers m4-reconcile
// REQ-2's tmux primitive: every session name on the socket comes back, and a socket with
// no server running yet (never touched by NewSession) is an empty, non-error result — the
// same shape PaneExists already treats as "not there" rather than a real failure.
func TestListSessions_ReturnsEveryNameNoServerIsAnEmptyResultNotAnError(t *testing.T) {
	t.Run("no server yet is empty, not an error", func(t *testing.T) {
		c := New(newTestSocket(t))

		names, err := c.ListSessions(context.Background())

		require.NoError(t, err)
		assert.Empty(t, names)
	})

	t.Run("every session name on the socket is returned", func(t *testing.T) {
		socket := newTestSocket(t)
		c := New(socket)
		dir := t.TempDir()
		id1, id2 := nextID(t), nextID(t)+1
		name1 := "muster-" + strconv.FormatInt(id1, 10)
		name2 := "muster-" + strconv.FormatInt(id2, 10)

		_, _, err := c.NewSession(context.Background(), id1, dir, nil, sleepCommand())
		require.NoError(t, err)
		_, _, err = c.NewSession(context.Background(), id2, dir, nil, sleepCommand())
		require.NoError(t, err)

		names, err := c.ListSessions(context.Background())
		require.NoError(t, err)
		assert.ElementsMatch(t, []string{name1, name2}, names)
	})

	t.Run("killing every session leaves an empty, non-error result (mirrors the no-server-yet shape)", func(t *testing.T) {
		socket := newTestSocket(t)
		c := New(socket)
		dir := t.TempDir()
		id := nextID(t)
		name := "muster-" + strconv.FormatInt(id, 10)
		_, _, err := c.NewSession(context.Background(), id, dir, nil, sleepCommand())
		require.NoError(t, err)
		require.NoError(t, c.KillSession(context.Background(), name))

		names, err := c.ListSessions(context.Background())
		require.NoError(t, err)
		assert.Empty(t, names)
	})
}

// TestCapturePane_ReturnsPaneTextAndTrimsTrailingBlankLines covers m4-reconcile REQ-4's
// snapshot primitive: the captured text contains what the pane actually printed, and
// trailing blank lines (capture-pane pads to the pane's height) are trimmed so the UI's
// pre.snapshot doesn't scroll into emptiness.
func TestCapturePane_ReturnsPaneTextAndTrimsTrailingBlankLines(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()
	marker := "muster-capture-pane-marker-hello"

	target, _, err := c.NewSession(context.Background(), nextID(t), dir, nil,
		[]string{"/bin/sh", "-c", "echo " + marker + "; sleep 60"})
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		text, capErr := c.CapturePane(context.Background(), target)
		return capErr == nil && strings.Contains(text, marker)
	}, 3*time.Second, 50*time.Millisecond)

	text, err := c.CapturePane(context.Background(), target)
	require.NoError(t, err)
	assert.Contains(t, text, marker)
	assert.False(t, strings.HasSuffix(text, "\n"), "trailing blank lines must be trimmed")
}

// TestCapturePane_UnknownTargetErrors documents that, unlike DisplayVar, capture-pane
// against a nonexistent target errors rather than silently returning empty text — the
// same "tmux exits non-zero for an unresolvable target" shape PaneExists/KillWindow rely
// on, not DisplayVar's special case.
func TestCapturePane_UnknownTargetErrors(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()
	_, _, err := c.NewSession(context.Background(), nextID(t), dir, nil, sleepCommand())
	require.NoError(t, err)

	_, err = c.CapturePane(context.Background(), "muster-999999:@999")

	assert.Error(t, err)
}

// TestCapturePane_FailureNeverLeaksPaneTextIntoTheError covers review cycle 1 Minor
// 4/R3: runCapture keeps stdout and stderr in separate buffers (unlike run's
// CombinedOutput), so a failing capture-pane's error can only ever carry tmux's own
// stderr diagnostic, never the pane text that was captured moments earlier from the same
// target. Captures a marker successfully, kills the window (so the target genuinely
// existed and had real captured text), then re-captures the same now-gone target and
// asserts neither the error nor the (necessarily empty) returned text contains the
// marker.
//
// Read this as a mechanism guard, not a reproduction of the historical leak: the real
// tmux binary under test never actually writes pane text to stdout alongside a non-zero
// exit (an unknown target fails with only a stderr diagnostic, confirmed by probing this
// exact scenario during review cycle 1's Fix Attempt 1 — "failures write only to
// stderr"), so this test cannot force the failure mode runCapture guards against and its
// green result is not evidence such a leak ever fired in production. What it does prove
// is the mechanism: even the marker from a *successful* prior capture of the same target
// is absent from the next call's error, which is the strongest assertion obtainable
// without a fake exec.Cmd seam. Review cycle 2 Minor 8 flagged this distinction; noted
// here so a future reader doesn't mistake this test for proof a leak once existed.
func TestCapturePane_FailureNeverLeaksPaneTextIntoTheError(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()
	marker := "muster-capture-leak-marker-should-never-appear-in-an-error"

	target, _, err := c.NewSession(context.Background(), nextID(t), dir, nil,
		[]string{"/bin/sh", "-c", "echo " + marker + "; sleep 60"})
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		text, capErr := c.CapturePane(context.Background(), target)
		return capErr == nil && strings.Contains(text, marker)
	}, 3*time.Second, 50*time.Millisecond)

	require.NoError(t, c.KillWindow(context.Background(), target))

	text, err := c.CapturePane(context.Background(), target)

	require.Error(t, err)
	assert.Empty(t, text, "a failing capture must return no text at all, never a partial stdout")
	assert.NotContains(t, err.Error(), marker, "R3: a capture-pane failure's error must never carry previously-captured pane text")
}

// TestValidateSocket pins the up-front rejection of a -S path over AF_UNIX's sun_path
// limit (m2 review cycle-2 Minor 8): without it the failure surfaces later as a bare
// "File name too long" from inside tmux. Named (-L) sockets are never length-checked.
func TestValidateSocket(t *testing.T) {
	long := "/" + strings.Repeat("a", 103) // 104 bytes total, one over the limit

	assert.NoError(t, ValidateSocket("muster"), "named sockets pass")
	assert.NoError(t, ValidateSocket("/tmp/short/tmux.sock"), "short paths pass")
	assert.NoError(t, ValidateSocket(strings.Repeat("a", 103)), "long *names* are not paths and pass")
	assert.NoError(t, ValidateSocket("/"+strings.Repeat("a", 102)), "exactly 103 bytes passes")

	err := ValidateSocket(long)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "sun_path", "the error explains the limit")
}
