package tmux

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newTestSocket returns a private, per-test tmux socket name — never "muster" and
// never the user's default server (CLAUDE.md hard rule; this package's own doc comment
// repeats it). The daemon's dedicated tmux session is always named "muster" inside
// whichever socket it's given, so isolation between tests comes entirely from using a
// different socket per test, exactly like the E2E harness's per-run socket.
func newTestSocket(t *testing.T) string {
	t.Helper()
	b := make([]byte, 8)
	_, err := rand.Read(b)
	require.NoError(t, err)
	socket := "muster-test-" + hex.EncodeToString(b)
	t.Cleanup(func() {
		_ = exec.Command("tmux", "-L", socket, "kill-server").Run()
	})
	return socket
}

func sleepCommand() []string {
	return []string{"/bin/sh", "-c", "sleep 60"}
}

func TestNewWindow_ReturnsATargetAndPane(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()

	target, pane, err := c.NewWindow(context.Background(), dir, nil, sleepCommand())
	require.NoError(t, err)

	assert.Regexp(t, `^muster:@\d+$`, target)
	assert.Regexp(t, `^%\d+$`, pane)
}

func TestNewWindow_SetsExtraEnvironmentInThePane(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()
	outFile := filepath.Join(dir, "env-output.txt")

	_, _, err := c.NewWindow(context.Background(), dir, map[string]string{
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

func TestNewWindow_SpawnsInTheGivenDirectory(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()
	outFile := filepath.Join(dir, "pwd-output.txt")

	_, _, err := c.NewWindow(context.Background(), dir, nil, []string{"/bin/sh", "-c", "pwd > " + outFile + "; sleep 60"})
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

func TestNewWindow_ReusesTheSameTmuxSessionAcrossCalls(t *testing.T) {
	socket := newTestSocket(t)
	c := New(socket)
	dir := t.TempDir()

	target1, _, err := c.NewWindow(context.Background(), dir, nil, sleepCommand())
	require.NoError(t, err)
	target2, _, err := c.NewWindow(context.Background(), dir, nil, sleepCommand())
	require.NoError(t, err)

	assert.NotEqual(t, target1, target2, "two windows must get distinct targets")

	out, err := exec.Command("tmux", "-L", socket, "list-sessions", "-F", "#{session_name}").Output()
	require.NoError(t, err)
	assert.Equal(t, "muster\n", string(out), "NewWindow must reuse one tmux session, not create a new one per call")
}

func TestPaneExists_TrueForALiveWindowFalseAfterKill(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()

	target, _, err := c.NewWindow(context.Background(), dir, nil, sleepCommand())
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
	_, _, err := c.NewWindow(context.Background(), dir, nil, sleepCommand())
	require.NoError(t, err)

	exists, err := c.PaneExists(context.Background(), "muster:@999")

	require.NoError(t, err)
	assert.False(t, exists)
}

func TestKillWindow_ErrorsForAnUnknownTarget(t *testing.T) {
	c := New(newTestSocket(t))
	dir := t.TempDir()
	_, _, err := c.NewWindow(context.Background(), dir, nil, sleepCommand())
	require.NoError(t, err)

	err = c.KillWindow(context.Background(), "muster:@999")

	assert.Error(t, err)
}
