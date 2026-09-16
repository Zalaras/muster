package server

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/tmux"
	"github.com/Zalaras/muster/internal/tmux/tmuxtest"
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
// so interactiveShellArgv() (which reads os.Getenv("SHELL")) picks it up. Used only by
// this file's keep-real tests (plan v1-cleanup REQ-3's Implementation Notes list); the
// three that move to fakes use newFakeShellRegistry below instead.
func newTestShellRegistry(t *testing.T) (reg *shellRegistry, tmuxClient *tmux.Client, socket, logFile string) {
	t.Helper()
	socket = tmuxtest.Socket(t)
	tmuxClient = tmux.New(socket)

	logFile = filepath.Join(t.TempDir(), "shell-invocations.log")
	t.Setenv("SHELL", newStubShellBin(t, logFile))

	reg = newShellRegistry(tmuxClient, zerolog.Nop())
	return reg, tmuxClient, socket, logFile
}

// newFakeShellRegistry builds a shellRegistry against a fakeTmux (REQ-3): no real tmux
// server is ever started. Used only by tests whose assertion is a call count or an
// error's propagation, never a tmux-observable effect (the log-file/real-process
// assertions above stay on newTestShellRegistry's real socket).
func newFakeShellRegistry() (*shellRegistry, *fakeTmux) {
	fake := newFakeTmux()
	return newShellRegistry(fake, zerolog.Nop()), fake
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
// the same id returns created:false and never re-invokes the shell command — proven
// directly by the fake's own spawn count (REQ-3's "strengthening": the fake states this
// as a call count rather than inferring it from tmux session naming, which would only
// prove a collision was avoided, not that no second spawn was even attempted).
func TestShellRegistry_EnsureIsIdempotentNoSecondSpawn(t *testing.T) {
	reg, fake := newFakeShellRegistry()
	id := int64(102)
	dir := t.TempDir()

	target1, created1, err := reg.Ensure(context.Background(), id, dir)
	require.NoError(t, err)
	require.True(t, created1)

	target2, created2, err := reg.Ensure(context.Background(), id, dir)
	require.NoError(t, err)

	assert.False(t, created2, "D2: a repeat call must report created:false")
	assert.Equal(t, target1, target2)
	assert.Equal(t, 1, fake.newNamedSessionCalls, "D2: the shell command must be invoked exactly once across both calls")
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
// must report created:true and the fake's spawn count must be exactly one.
func TestShellRegistry_ConcurrentEnsureOnlySpawnsOnce(t *testing.T) {
	reg, fake := newFakeShellRegistry()
	id := int64(105)
	dir := t.TempDir()

	const n = 10
	results := make([]bool, n)
	errs := make([]error, n)
	var wg sync.WaitGroup
	wg.Add(n)
	for i := range n {
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
	assert.Equal(t, 1, fake.newNamedSessionCalls, "the shell command must be invoked exactly once across all concurrent callers")
}

// TestShellRegistry_KillIsANoOpWhenNoShellExists covers Kill's documented "no-op, not an
// error surfaced to the caller" behaviour when nothing was ever spawned for id — Remove
// must succeed whether or not a shell was ever started (REQ-9).
func TestShellRegistry_KillIsANoOpWhenNoShellExists(t *testing.T) {
	reg, fake := newFakeShellRegistry()
	id := int64(106)

	assert.NotPanics(t, func() {
		reg.Kill(context.Background(), id)
	})

	exists, err := fake.PaneExists(context.Background(), tmux.ShellSessionName(id))
	require.NoError(t, err)
	assert.False(t, exists)
}

// blockingNamedSessionTmux is REQ-5(a)/D4's paneSpawner double: NewNamedSession for
// blockTarget blocks until unblock() is called (or ctx is done), signalling entered once
// it's actually inside the block — every other target returns at once. It satisfies
// shellRegistry's full paneSpawner surface even though Ensure only ever calls
// PaneExists/NewNamedSession.
type blockingNamedSessionTmux struct {
	blockTarget string
	entered     chan struct{}
	release     chan struct{}
	enterOnce   sync.Once
}

func newBlockingNamedSessionTmux(blockTarget string) *blockingNamedSessionTmux {
	return &blockingNamedSessionTmux{blockTarget: blockTarget, entered: make(chan struct{}), release: make(chan struct{})}
}

func (b *blockingNamedSessionTmux) unblock() { close(b.release) }

func (b *blockingNamedSessionTmux) NewSession(_ context.Context, _ int64, _ string, _ map[string]string, _ []string) (string, string, error) {
	return "", "", nil
}
func (b *blockingNamedSessionTmux) NewNamedSession(ctx context.Context, name, _ string, _ map[string]string, _ []string) (target, pane string, err error) {
	if name == b.blockTarget {
		b.enterOnce.Do(func() { close(b.entered) })
		select {
		case <-b.release:
		case <-ctx.Done():
			return "", "", ctx.Err()
		}
	}
	return name, "%1", nil
}
func (b *blockingNamedSessionTmux) PaneExists(_ context.Context, _ string) (bool, error) {
	return false, nil
}
func (b *blockingNamedSessionTmux) KillWindow(_ context.Context, _ string) error  { return nil }
func (b *blockingNamedSessionTmux) KillSession(_ context.Context, _ string) error { return nil }
func (b *blockingNamedSessionTmux) MaxSessionID(_ context.Context) (int64, error) { return 0, nil }

// TestShellRegistry_ConcurrentEnsureOnDifferentIDsDoesNotSerialize covers REQ-5(a)/D4: a
// paneSpawner whose NewNamedSession for id 1's shell blocks must not delay id 2's Ensure
// — the registry's per-id lock (session-lifecycle REQ-12's replacement for the old single
// global mutex, see shells.go's shellRegistry doc comment) means two different ids' Ensure
// calls never block each other. A build that regressed shellRegistry.lockID back to one
// shared mutex would make id 2's call below hang until id 1's NewNamedSession is released.
func TestShellRegistry_ConcurrentEnsureOnDifferentIDsDoesNotSerialize(t *testing.T) {
	id1, id2 := int64(201), int64(202)
	fake := newBlockingNamedSessionTmux(tmux.ShellSessionName(id1))
	reg := newShellRegistry(fake, zerolog.Nop())
	dir := t.TempDir()

	errCh := make(chan error, 1)
	go func() {
		_, _, err := reg.Ensure(context.Background(), id1, dir)
		errCh <- err
	}()

	select {
	case <-fake.entered:
	case <-time.After(2 * time.Second):
		t.Fatal("id1's Ensure never reached the blocked NewNamedSession call")
	}

	id2Done := make(chan struct{})
	go func() {
		_, _, err := reg.Ensure(context.Background(), id2, dir)
		assert.NoError(t, err)
		close(id2Done)
	}()

	select {
	case <-id2Done:
	case <-time.After(2 * time.Second):
		t.Fatal("REQ-5(a)/D4: id2's Ensure was blocked by id1's still-in-flight NewNamedSession — the per-id lock regressed to a global one")
	}

	fake.unblock()
	require.NoError(t, <-errCh)
}

// TestShellRegistry_EnsureOnCollisionRechecksAndReportsNotCreated covers REQ-5(b)/D4's
// positive clause: when NewNamedSession fails with tmux.ErrSessionExists (a concurrent
// spawn elsewhere beat this one to it), Ensure re-checks with PaneExists — and when that
// re-check finds the pane, returns created:false with no error, never surfacing the
// collision as a failure.
func TestShellRegistry_EnsureOnCollisionRechecksAndReportsNotCreated(t *testing.T) {
	fake := &racyCollisionTmux{recheckFindsPane: true}
	reg := newShellRegistry(fake, zerolog.Nop())
	id := int64(203)

	target, created, err := reg.Ensure(context.Background(), id, t.TempDir())

	require.NoError(t, err, "REQ-5(b)/D4: a re-checked collision must not surface as an error")
	assert.False(t, created)
	assert.Equal(t, tmux.ShellSessionName(id), target)
}

// TestShellRegistry_EnsureOnCollisionWithFailedRecheckReturnsSpawnError covers Edge Case
// 6/REQ-5(b)'s negative clause, shared with D4: when the post-collision re-check finds the
// pane gone (not merely raced), Ensure returns the original spawn error rather than a
// false created:false.
func TestShellRegistry_EnsureOnCollisionWithFailedRecheckReturnsSpawnError(t *testing.T) {
	fake := &racyCollisionTmux{recheckFindsPane: false}
	reg := newShellRegistry(fake, zerolog.Nop())

	_, _, err := reg.Ensure(context.Background(), 204, t.TempDir())

	require.Error(t, err, "Edge Case 6: a re-check that finds the pane gone must still surface the spawn error")
	assert.ErrorIs(t, err, tmux.ErrSessionExists)
}

// racyCollisionTmux is REQ-5(b)/D4's paneSpawner double: PaneExists returns false on its
// first call (the pre-spawn check Ensure makes) and, from the second call on, either true
// (recheckFindsPane) or false — modelling "a concurrent spawn elsewhere beat this one to
// it" versus "gone before the re-check could confirm it". NewNamedSession always fails
// with tmux.ErrSessionExists, so Ensure always reaches the re-check path.
type racyCollisionTmux struct {
	mu               sync.Mutex
	calls            int
	recheckFindsPane bool
}

func (f *racyCollisionTmux) NewSession(_ context.Context, _ int64, _ string, _ map[string]string, _ []string) (string, string, error) {
	return "", "", nil
}
func (f *racyCollisionTmux) NewNamedSession(_ context.Context, _, _ string, _ map[string]string, _ []string) (string, string, error) {
	return "", "", tmux.ErrSessionExists
}
func (f *racyCollisionTmux) PaneExists(_ context.Context, _ string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if f.calls == 1 {
		return false, nil
	}
	return f.recheckFindsPane, nil
}
func (f *racyCollisionTmux) KillWindow(_ context.Context, _ string) error  { return nil }
func (f *racyCollisionTmux) KillSession(_ context.Context, _ string) error { return nil }
func (f *racyCollisionTmux) MaxSessionID(_ context.Context) (int64, error) { return 0, nil }

// neverRespondingTmux is REQ-5(c)/D4's paneSpawner double: NewNamedSession blocks until
// its ctx is done and returns ctx.Err() — a tmux call that simply never returns, the
// shape shellTmuxTimeout exists to bound.
type neverRespondingTmux struct{}

func (neverRespondingTmux) NewSession(_ context.Context, _ int64, _ string, _ map[string]string, _ []string) (string, string, error) {
	return "", "", nil
}
func (neverRespondingTmux) NewNamedSession(ctx context.Context, _, _ string, _ map[string]string, _ []string) (string, string, error) {
	<-ctx.Done()
	return "", "", ctx.Err()
}
func (neverRespondingTmux) PaneExists(_ context.Context, _ string) (bool, error) { return false, nil }
func (neverRespondingTmux) KillWindow(_ context.Context, _ string) error         { return nil }
func (neverRespondingTmux) KillSession(_ context.Context, _ string) error        { return nil }
func (neverRespondingTmux) MaxSessionID(_ context.Context) (int64, error)        { return 0, nil }

// TestShellRegistry_EnsureBoundedByShellTmuxTimeoutWhenTmuxNeverReturns covers REQ-5(c)/D4:
// Ensure is called with an unbounded context (context.Background(), no caller-side
// deadline) against a tmux that never returns; it must still return an error within
// shellTmuxTimeout plus slack, not hang forever — proof that Ensure's own
// context.WithTimeout(ctx, shellTmuxTimeout) around the tmux call is what bounds it, not
// the caller's context.
func TestShellRegistry_EnsureBoundedByShellTmuxTimeoutWhenTmuxNeverReturns(t *testing.T) {
	reg := newShellRegistry(neverRespondingTmux{}, zerolog.Nop())

	start := time.Now()
	_, _, err := reg.Ensure(context.Background(), 205, t.TempDir())
	elapsed := time.Since(start)

	require.Error(t, err, "REQ-5(c)/D4: Ensure must not hang forever behind a wedged tmux")
	assert.GreaterOrEqual(t, elapsed, shellTmuxTimeout, "Ensure must actually wait out shellTmuxTimeout, not return early")
	assert.Less(t, elapsed, shellTmuxTimeout+2*time.Second, "Ensure must return within shellTmuxTimeout plus slack")
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
