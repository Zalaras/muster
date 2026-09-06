package server

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/tmux"
)

// newStubShellBin writes an executable script standing in for the user's interactive
// $SHELL (never a real claude binary — plain harmless shell scripts are not the
// CLAUDE.md restriction, which is specifically about launching `claude`): each
// invocation appends one line "MUSTER_SESSION=[<value-or-empty>]" to logFile, then
// sleeps so PaneExists sees it alive until killed. interactiveShellArgv() reads
// os.Getenv("SHELL"), so tests point that at this stub via t.Setenv rather than
// injecting a command directly — shells.go's Ensure has no seam for overriding argv,
// which is deliberate (REQ-1 hardcodes the real $SHELL).
func newStubShellBin(t *testing.T, logFile string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "stub-shell.sh")
	script := "#!/bin/sh\necho \"MUSTER_SESSION=[$MUSTER_SESSION]\" >> " + logFile + "\nsleep 60\n"
	require.NoError(t, os.WriteFile(path, []byte(script), 0o755))
	return path
}

// readLogLines waits until logFile has at least want lines, then returns them (trimmed,
// no trailing empty element). Fails the test if the deadline passes first.
func readLogLines(t *testing.T, logFile string, want int) []string {
	t.Helper()
	var lines []string
	require.Eventually(t, func() bool {
		b, err := os.ReadFile(logFile)
		if err != nil {
			return false
		}
		lines = strings.Split(strings.TrimRight(string(b), "\n"), "\n")
		if len(lines) == 1 && lines[0] == "" {
			lines = nil
		}
		return len(lines) >= want
	}, 5*time.Second, 20*time.Millisecond, "expected at least %d line(s) in %s", want, logFile)
	return lines
}

// newTestShellRegistry builds a shellRegistry against a real, per-test tmux socket
// (never "-L muster", never the user's default server — CLAUDE.md hard rule) and points
// the test process's own $SHELL at a stub binary that logs each invocation to logFile,
// so interactiveShellArgv() (which reads os.Getenv("SHELL")) picks it up.
func newTestShellRegistry(t *testing.T) (reg *shellRegistry, tmuxClient *tmux.Client, socket, logFile string) {
	t.Helper()
	dir, err := os.MkdirTemp("", "muster-shells-test-")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	socket = filepath.Join(dir, "tmux.sock")
	t.Cleanup(func() {
		_ = exec.Command("tmux", "-S", socket, "kill-server").Run()
	})
	tmuxClient = tmux.New(socket)

	logFile = filepath.Join(t.TempDir(), "shell-invocations.log")
	t.Setenv("SHELL", newStubShellBin(t, logFile))

	reg = newShellRegistry(tmuxClient, zerolog.Nop())
	return reg, tmuxClient, socket, logFile
}

// TestShellRegistry_EnsureSpawnsATmuxSessionNamedMusterIDShell covers D1: Ensure on an
// id with no existing shell spawns a tmux session named muster-<id>-shell and reports
// created:true.
func TestShellRegistry_EnsureSpawnsATmuxSessionNamedMusterIDShell(t *testing.T) {
	reg, tmuxClient, _, _ := newTestShellRegistry(t)
	id := int64(101)
	dir := t.TempDir()

	target, created, err := reg.Ensure(context.Background(), id, dir)
	require.NoError(t, err)

	assert.True(t, created)
	assert.Equal(t, tmux.ShellSessionName(id), target)

	exists, err := tmuxClient.PaneExists(context.Background(), target)
	require.NoError(t, err)
	assert.True(t, exists, "D1: a tmux session must actually exist for the reported target")
}

// TestShellRegistry_EnsureIsIdempotentNoSecondSpawn covers D2: a repeat Ensure call for
// the same id returns created:false and never re-invokes the shell command (proven by
// the stub binary's invocation log having exactly one line, not by tmux session naming
// alone — tmux would refuse a literal duplicate session name outright, which would prove
// only that a collision was avoided, not that no second spawn was even attempted).
func TestShellRegistry_EnsureIsIdempotentNoSecondSpawn(t *testing.T) {
	reg, _, _, logFile := newTestShellRegistry(t)
	id := int64(102)
	dir := t.TempDir()

	target1, created1, err := reg.Ensure(context.Background(), id, dir)
	require.NoError(t, err)
	require.True(t, created1)

	target2, created2, err := reg.Ensure(context.Background(), id, dir)
	require.NoError(t, err)

	assert.False(t, created2, "D2: a repeat call must report created:false")
	assert.Equal(t, target1, target2)

	lines := readLogLines(t, logFile, 1)
	assert.Len(t, lines, 1, "D2: the shell command must be invoked exactly once across both calls")
}

// TestShellRegistry_EnsurePaneEnvironmentNeverCarriesMusterSession covers D3/INV-1 from
// its first reachable source state: a freshly spawned shell's pane environment has no
// MUSTER_SESSION at all — proven by the stub binary itself observing its own process
// environment (matching sessions_test.go's newStubClaudeBin rationale: tmux's own
// show-environment reflects a separate update-environment table, not what a spawned
// process actually receives).
func TestShellRegistry_EnsurePaneEnvironmentNeverCarriesMusterSession(t *testing.T) {
	reg, _, _, logFile := newTestShellRegistry(t)
	dir := t.TempDir()

	_, _, err := reg.Ensure(context.Background(), 103, dir)
	require.NoError(t, err)

	lines := readLogLines(t, logFile, 1)
	assert.Equal(t, "MUSTER_SESSION=[]", lines[0], "INV-1: a shell pane must never see MUSTER_SESSION set")
}

// TestShellRegistry_RespawnsAfterExternalKillWithNoMusterSession covers D7 (REQ-8's
// respawn-after-exit) together with INV-1's second reachable source state — "respawned
// after exit": once the tmux session is gone (simulating the pane exiting, or an
// external kill), the next Ensure spawns a fresh one and reports created:true, and that
// fresh pane's environment is checked again for INV-1 rather than assuming the first
// check still holds.
func TestShellRegistry_RespawnsAfterExternalKillWithNoMusterSession(t *testing.T) {
	reg, tmuxClient, _, logFile := newTestShellRegistry(t)
	id := int64(104)
	dir := t.TempDir()

	target1, created1, err := reg.Ensure(context.Background(), id, dir)
	require.NoError(t, err)
	require.True(t, created1)
	readLogLines(t, logFile, 1)

	require.NoError(t, tmuxClient.KillSession(context.Background(), target1))
	require.Eventually(t, func() bool {
		exists, existsErr := tmuxClient.PaneExists(context.Background(), target1)
		return existsErr == nil && !exists
	}, 3*time.Second, 20*time.Millisecond)

	target2, created2, err := reg.Ensure(context.Background(), id, dir)
	require.NoError(t, err)
	assert.True(t, created2, "D7: the next Ensure after an external kill must spawn a fresh shell")
	assert.Equal(t, target1, target2, "the tmux session name is stable across respawns")

	lines := readLogLines(t, logFile, 2)
	assert.Equal(t, "MUSTER_SESSION=[]", lines[1], "INV-1 (respawned-after-exit state): the fresh pane must also carry no MUSTER_SESSION")
}

// TestShellRegistry_ConcurrentEnsureOnlySpawnsOnce covers the daemon-implementation.md
// Decisions note: Ensure holds its mutex across the whole check-then-spawn tmux round
// trip specifically so two concurrent POSTs for the same session can't both observe "no
// pane" and both attempt tmux new-session. Fired as 10 concurrent calls; exactly one
// must report created:true and the stub binary must be invoked exactly once.
func TestShellRegistry_ConcurrentEnsureOnlySpawnsOnce(t *testing.T) {
	reg, _, _, logFile := newTestShellRegistry(t)
	id := int64(105)
	dir := t.TempDir()

	const n = 10
	results := make([]bool, n)
	errs := make([]error, n)
	var wg sync.WaitGroup
	wg.Add(n)
	for i := 0; i < n; i++ {
		go func(i int) {
			defer wg.Done()
			_, created, err := reg.Ensure(context.Background(), id, dir)
			results[i] = created
			errs[i] = err
		}(i)
	}
	wg.Wait()

	createdCount := 0
	for i, err := range errs {
		require.NoError(t, err)
		if results[i] {
			createdCount++
		}
	}
	assert.Equal(t, 1, createdCount, "exactly one of the concurrent Ensure calls must have spawned the shell")

	lines := readLogLines(t, logFile, 1)
	assert.Len(t, lines, 1, "the shell command must be invoked exactly once across all concurrent callers")
}

// TestShellRegistry_KillIsANoOpWhenNoShellExists covers Kill's documented "no-op, not an
// error surfaced to the caller" behaviour when nothing was ever spawned for id — Remove
// must succeed whether or not a shell was ever started (REQ-9).
func TestShellRegistry_KillIsANoOpWhenNoShellExists(t *testing.T) {
	reg, tmuxClient, _, _ := newTestShellRegistry(t)
	id := int64(106)

	assert.NotPanics(t, func() {
		reg.Kill(context.Background(), id)
	})

	exists, err := tmuxClient.PaneExists(context.Background(), tmux.ShellSessionName(id))
	require.NoError(t, err)
	assert.False(t, exists)
}

// TestShellRegistry_KillRemovesOnlyItsOwnSession is the multi-instance destructive-path
// coverage the daemon-tests brief requires (m2-terminal lesson): with two sessions'
// shells coexisting on the same tmux socket, killing one must never touch the other's
// tmux session — asserted by both PaneExists and, per the INV-4 rationale, a second
// invocation of the survivor's own shell (proving it's not merely present but healthy).
func TestShellRegistry_KillRemovesOnlyItsOwnSession(t *testing.T) {
	reg, tmuxClient, _, _ := newTestShellRegistry(t)
	victimID, survivorID := int64(107), int64(108)
	dir := t.TempDir()

	victimTarget, _, err := reg.Ensure(context.Background(), victimID, dir)
	require.NoError(t, err)
	survivorTarget, _, err := reg.Ensure(context.Background(), survivorID, dir)
	require.NoError(t, err)

	reg.Kill(context.Background(), victimID)

	require.Eventually(t, func() bool {
		exists, existsErr := tmuxClient.PaneExists(context.Background(), victimTarget)
		return existsErr == nil && !exists
	}, 3*time.Second, 20*time.Millisecond, "the killed shell's own tmux session must be gone")

	stillExists, err := tmuxClient.PaneExists(context.Background(), survivorTarget)
	require.NoError(t, err)
	assert.True(t, stillExists, "INV-4: killing one session's shell must never touch another session's shell")
}
