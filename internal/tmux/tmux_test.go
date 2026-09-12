package tmux

import (
	"context"
	"crypto/rand"
	"os"
	"os/exec"
	"path/filepath"
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

// TestNewClient_UsesAPerTestSocketNeverTheSharedDefault is a documentation-style
// regression guard for the CLAUDE.md hard rule and D12: this package's own New must
// never be called with the literal default socket name in a test. It doesn't call tmux
// at all — it just pins the expectation that "muster" (the production default) is never
// passed to New() anywhere in this file.
func TestNewClient_UsesAPerTestSocketNeverTheSharedDefault(t *testing.T) {
	c := New(newTestSocket(t))
	assert.NotEqual(t, "muster", c.socket)
}

// TestKillSession_RemovesTheWholeSessionErrorsForAnUnknownName covers m4-reconcile
// REQ-5's End path: kill-session by name actually removes the session (not just one
// window — under the one-window-per-session topology the two are equivalent per the
// plan's Implementation Notes), and an unknown session name errors rather than
// silently no-op'ing.
func TestKillSession_RemovesTheWholeSessionErrorsForAnUnknownName(t *testing.T) {
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
	assert.Error(t, err, "killing an unknown session name must error")
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
