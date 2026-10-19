package server

import (
	"context"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
)

// closingSpawner is a fakeTmux whose NewSession succeeds and then closes the store, so the
// launch's RecordLaunch that follows fails to persist with the pane already spawned. It
// records every KillSession name, which fakeTmux only counts.
type closingSpawner struct {
	*fakeTmux
	st *store.Store

	mu     sync.Mutex
	killed []string
}

func (c *closingSpawner) NewSession(ctx context.Context, id int64, dir string, env map[string]string, command []string) (target, pane string, err error) {
	target, pane, err = c.fakeTmux.NewSession(ctx, id, dir, env, command)
	if err == nil {
		err = c.st.Close()
	}
	return target, pane, err
}

func (c *closingSpawner) KillSession(ctx context.Context, name string) error {
	c.mu.Lock()
	c.killed = append(c.killed, name)
	c.mu.Unlock()
	return c.fakeTmux.KillSession(ctx, name)
}

// TestLauncher_RecordLaunchFailureRollsBack: a RecordLaunch that fails after the spawn kills
// the spawned tmux session and leaves no session behind, answering launch_failed.
func TestLauncher_RecordLaunchFailureRollsBack(t *testing.T) {
	st := openLauncherTestStore(t)
	mgr := newSessionTestManager(t, st)
	spawner := &closingSpawner{fakeTmux: newFakeTmux(), st: st}
	l := newEffortLauncher(st, mgr, nil)
	l.tmux = spawner

	sess, lerr := l.Launch(context.Background(), createSessionRequest{Directory: t.TempDir(), Model: "opus", PermissionMode: "auto"})

	assert.Nil(t, sess)
	require.NotNil(t, lerr)
	assert.Equal(t, launchFailed(), lerr)
	ids := spawner.newSessionIDsSeen()
	require.Len(t, ids, 1, "a record failure is not retried")
	assert.Equal(t, []string{tmux.SessionName(ids[0])}, spawner.killed, "the spawned tmux session is killed exactly once")
	assert.Empty(t, mgr.List(), "no session is left in memory")
	_, ok := mgr.Get(ids[0])
	assert.False(t, ok)
}
