package main

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// lockFile points the tool at a fresh lock file and clears any inherited mode, so each
// test starts free and un-nested. flock is per open file description, so a test can hold
// the lock through one fd and be refused through another in the same process.
func lockFile(t *testing.T) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "gates.lock")
	t.Setenv(fileEnv, p)
	t.Setenv(envVar, "")
	return p
}

// hold takes the lock in-test and releases it at cleanup.
func hold(t *testing.T, path string, m mode) func() {
	t.Helper()
	release, err := acquire(path, m, 0, io.Discard)
	require.NoError(t, err)
	t.Cleanup(release)
	return release
}

func runTool(t *testing.T, stdin io.Reader, args ...string) (code int, stdout, stderr string) {
	t.Helper()
	var out, errb bytes.Buffer
	code = run(args, stdin, &out, &errb)
	return code, out.String(), errb.String()
}

func TestUsageRefusals(t *testing.T) {
	lockFile(t)
	cases := []struct {
		name string
		args []string
		want string
	}{
		{"no subcommand", nil, "usage:"},
		{"unknown subcommand", []string{"frob"}, "unknown subcommand"},
		{"status with args", []string{"status", "x"}, "usage:"},
		{"run without mode", []string{"run", "--", "true"}, "exactly one of"},
		{"run with both modes", []string{"run", "--exclusive", "--shared", "--", "true"}, "exactly one of"},
		{"run without --", []string{"run", "--exclusive"}, "needs `--"},
		{"run with nothing after --", []string{"run", "--exclusive", "--"}, "nothing after --"},
		{"bad wait", []string{"run", "--exclusive", "--wait", "soon", "--", "true"}, "not a duration"},
		{"wait without value", []string{"run", "--exclusive", "--wait"}, "--wait needs"},
		{"unknown flag", []string{"hold", "--exclusive", "--now"}, "unknown argument"},
		{"hold with command", []string{"hold", "--shared", "--", "true"}, "hold takes no command"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			code, _, stderr := runTool(t, nil, tc.args...)
			assert.Equal(t, exitUsage, code)
			assert.Contains(t, stderr, tc.want)
		})
	}
}

func TestRunBusyCombinations(t *testing.T) {
	cases := []struct {
		name     string
		held     mode
		want     string // requested mode flag
		wantCode int
	}{
		{"exclusive under exclusive", modeExclusive, "--exclusive", exitBusy},
		{"shared under exclusive", modeExclusive, "--shared", exitBusy},
		{"exclusive under shared", modeShared, "--exclusive", exitBusy},
		{"shared under shared", modeShared, "--shared", exitOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			path := lockFile(t)
			hold(t, path, tc.held)
			marker := filepath.Join(t.TempDir(), "ran")
			code, _, stderr := runTool(t, nil, "run", tc.want, "--wait", "0", "--", "sh", "-c", "touch "+marker)
			assert.Equal(t, tc.wantCode, code)
			_, statErr := os.Stat(marker)
			if tc.wantCode == exitOK {
				assert.NoError(t, statErr, "child must have run")
			} else {
				assert.True(t, os.IsNotExist(statErr), "child must not have run")
				cwd, _ := os.Getwd()
				assert.Contains(t, stderr, "busy after 0s")
				assert.Contains(t, stderr, "pid "+itoa(os.Getpid())+" "+tc.held.String()+" "+cwd)
				assert.Contains(t, stderr, "not a test failure")
			}
		})
	}
}

func TestRunWaitsUntilReleased(t *testing.T) {
	path := lockFile(t)
	release := hold(t, path, modeExclusive)
	go func() {
		time.Sleep(100 * time.Millisecond)
		release()
	}()
	start := time.Now()
	code, _, _ := runTool(t, nil, "run", "--exclusive", "--wait", "5s", "--", "true")
	assert.Equal(t, exitOK, code)
	assert.GreaterOrEqual(t, time.Since(start), 90*time.Millisecond, "must have waited for the holder")
	assert.Less(t, time.Since(start), 4*time.Second, "must not have waited out the timer")
}

func TestWaitingLineNamesTheHolder(t *testing.T) {
	old := tickInterval
	tickInterval = 20 * time.Millisecond
	t.Cleanup(func() { tickInterval = old })
	path := lockFile(t)
	hold(t, path, modeShared)
	code, _, stderr := runTool(t, nil, "run", "--exclusive", "--wait", "120ms", "--", "true")
	assert.Equal(t, exitBusy, code)
	assert.Contains(t, stderr, "gatelock: waiting for exclusive (")
	assert.Contains(t, stderr, "of 120ms) — held by pid "+itoa(os.Getpid())+" shared")
	assert.Contains(t, stderr, "busy after 120ms")
}

func TestAbandonedWaiterReleasesWhenItFinallyWins(t *testing.T) {
	path := lockFile(t)
	release := hold(t, path, modeExclusive)
	code, _, _ := runTool(t, nil, "run", "--exclusive", "--wait", "30ms", "--", "true")
	require.Equal(t, exitBusy, code)
	release() // the abandoned goroutine now wins the lock and must drop it at once
	deadline := time.Now().Add(2 * time.Second)
	for {
		free, err := probeFree(path)
		require.NoError(t, err)
		if free || time.Now().After(deadline) {
			assert.True(t, free, "an abandoned waiter must not keep the lock")
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestReentrancy(t *testing.T) {
	cases := []struct {
		name     string
		ancestor string
		flag     string
		wantCode int
		wantErr  string
	}{
		{"exclusive ancestor covers exclusive", "exclusive", "--exclusive", exitOK, ""},
		{"exclusive ancestor covers shared", "exclusive", "--shared", exitOK, ""},
		{"shared ancestor covers shared", "shared", "--shared", exitOK, ""},
		{"shared ancestor refuses exclusive", "shared", "--exclusive", exitError, "self-deadlock"},
		{"bogus ancestor is a usage error", "bogus", "--shared", exitUsage, "not exclusive or shared"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			path := lockFile(t)
			hold(t, path, modeExclusive) // another holder: only a covered call can still run
			t.Setenv(envVar, tc.ancestor)
			code, _, stderr := runTool(t, nil, "run", tc.flag, "--wait", "0", "--", "true")
			assert.Equal(t, tc.wantCode, code)
			if tc.wantErr != "" {
				assert.Contains(t, stderr, tc.wantErr)
			}
		})
	}
}

func TestRunExportsModeAndPropagatesExitCode(t *testing.T) {
	lockFile(t)
	code, _, _ := runTool(t, nil, "run", "--shared", "--", "sh", "-c", `test "$MUSTER_GATELOCK" = shared`)
	assert.Equal(t, exitOK, code, "child must see MUSTER_GATELOCK=shared")
	code, _, _ = runTool(t, nil, "run", "--exclusive", "--", "sh", "-c", `test "$MUSTER_GATELOCK" = exclusive && exit 7`)
	assert.Equal(t, 7, code, "child exit code must propagate")
}

func TestRunReleasesAfterChildExits(t *testing.T) {
	path := lockFile(t)
	code, _, _ := runTool(t, nil, "run", "--exclusive", "--", "true")
	require.Equal(t, exitOK, code)
	free, err := probeFree(path)
	require.NoError(t, err)
	assert.True(t, free)
	b, _ := os.ReadFile(path)
	assert.Empty(t, string(b), "release drops its own holder line")
}

// signalWriter lets a test block until `hold` has printed `acquired`.
type signalWriter struct {
	mu   sync.Mutex
	buf  bytes.Buffer
	seen chan struct{}
	once sync.Once
}

func (w *signalWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	n, err := w.buf.Write(p)
	if strings.Contains(w.buf.String(), "acquired\n") {
		w.once.Do(func() { close(w.seen) })
	}
	return n, err
}

func TestHoldUntilStdinCloses(t *testing.T) {
	path := lockFile(t)
	pr, pw := io.Pipe()
	out := &signalWriter{seen: make(chan struct{})}
	done := make(chan int, 1)
	go func() { done <- run([]string{"hold", "--exclusive"}, pr, out, io.Discard) }()
	select {
	case <-out.seen:
	case <-time.After(5 * time.Second):
		t.Fatal("hold never printed acquired")
	}
	free, err := probeFree(path)
	require.NoError(t, err)
	assert.False(t, free, "held while stdin is open")
	_, err = acquire(path, modeShared, 0, io.Discard)
	require.Error(t, err, "shared under hold --exclusive is busy")
	require.NoError(t, pw.Close())
	select {
	case code := <-done:
		assert.Equal(t, exitOK, code)
	case <-time.After(5 * time.Second):
		t.Fatal("hold did not exit on stdin EOF")
	}
	free, err = probeFree(path)
	require.NoError(t, err)
	assert.True(t, free, "released on stdin EOF")
}

func TestHoldUnderCoveringAncestorTakesNothing(t *testing.T) {
	path := lockFile(t)
	hold(t, path, modeExclusive)
	t.Setenv(envVar, "exclusive")
	pr, pw := io.Pipe()
	out := &signalWriter{seen: make(chan struct{})}
	done := make(chan int, 1)
	go func() { done <- run([]string{"hold", "--exclusive"}, pr, out, io.Discard) }()
	select {
	case <-out.seen:
	case <-time.After(5 * time.Second):
		t.Fatal("covered hold must still print acquired")
	}
	require.NoError(t, pw.Close())
	assert.Equal(t, exitOK, <-done)
}

func TestStatus(t *testing.T) {
	path := lockFile(t)
	code, out, _ := runTool(t, nil, "status")
	assert.Equal(t, exitOK, code)
	assert.Equal(t, "free\n", out)

	hold(t, path, modeShared)
	code, out, _ = runTool(t, nil, "status")
	assert.Equal(t, exitOK, code)
	cwd, _ := os.Getwd()
	assert.Contains(t, out, "pid "+itoa(os.Getpid())+" shared "+cwd+" since ")
}

func TestReadHoldersDropsDeadPidsAndJunk(t *testing.T) {
	path := lockFile(t)
	dead := holder{pid: 1 << 22, mode: modeExclusive, cwd: "/gone", since: time.Now()} // beyond pid_max
	live := holder{pid: os.Getpid(), mode: modeShared, cwd: "/here", since: time.Now()}
	require.NoError(t, os.WriteFile(path, []byte(dead.line()+"junk line\n"+live.line()), 0o644))
	hs := readHolders(path)
	require.Len(t, hs, 1)
	assert.Equal(t, os.Getpid(), hs[0].pid)
	assert.Equal(t, "/here", hs[0].cwd)
}

func itoa(i int) string { return strconv.Itoa(i) }
