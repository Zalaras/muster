package session

import (
	"context"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// batchRig is a fixture rig whose sessions are all live, so a batch has something to end.
func batchRig(t *testing.T) *groupsRig {
	t.Helper()
	return newFixtureRig(t)
}

func TestEndMany(t *testing.T) {
	t.Run("ends each listed live session in listed order and touches no other", func(t *testing.T) {
		r := batchRig(t)
		before := r.snapshotAll()

		res, err := r.mgr.EndMany(r.ctx, r.ids("22", "2", "13"))
		require.NoError(t, err)

		assert.Equal(t, r.ids("22", "2", "13"), res.Done)
		assert.Empty(t, res.Skipped)
		assert.Empty(t, res.Failed)
		for _, label := range []string{"22", "2", "13"} {
			assert.False(t, r.session(label).Alive, label)
			assert.Equal(t, before[label].Group, r.groupOf(label), "End never changes a session's group")
		}
		assert.ElementsMatch(t, []string{tmuxName(r.id("22")), tmuxName(r.id("2")), tmuxName(r.id("13"))}, r.killer.killedNames())
		r.assertBystandersUntouched(before, "22", "2", "13")
		r.assertConsistent()
	})

	t.Run("an unknown id and an already ended session are skipped", func(t *testing.T) {
		r := batchRig(t)
		_, err := r.mgr.End(r.ctx, r.id("3"))
		require.NoError(t, err)
		r.killer.mu.Lock()
		r.killer.killed = nil
		r.killer.mu.Unlock()

		res, err := r.mgr.EndMany(r.ctx, []int64{r.id("1"), 987654, r.id("3")})
		require.NoError(t, err)

		assert.Equal(t, r.ids("1"), res.Done)
		assert.Equal(t, []int64{987654, r.id("3")}, res.Skipped)
		assert.Empty(t, res.Failed)
		assert.Equal(t, []string{tmuxName(r.id("1"))}, r.killer.killedNames(), "a skipped session is never killed again")
	})

	t.Run("a genuine kill failure is reported as failed and the rest still end", func(t *testing.T) {
		r := batchRig(t)
		r.killer.setKillErr(tmuxName(r.id("2")), assert.AnError)

		res, err := r.mgr.EndMany(r.ctx, r.ids("22", "2", "3"))
		require.NoError(t, err)

		assert.Equal(t, r.ids("22", "3"), res.Done)
		assert.Equal(t, r.ids("2"), res.Failed)
		assert.Empty(t, res.Skipped)
		assert.True(t, r.session("2").Alive, "a failed End leaves the session alive")
		assert.False(t, r.session("3").Alive, "a failure in the middle does not stop the batch")
	})

	t.Run("an empty list does nothing", func(t *testing.T) {
		r := batchRig(t)

		res, err := r.mgr.EndMany(r.ctx, nil)
		require.NoError(t, err)

		assert.Equal(t, BatchResult{}, res)
		assert.Empty(t, r.log.kinds())
		assert.Empty(t, r.killer.killedNames())
	})
}

func TestRemoveMany(t *testing.T) {
	t.Run("removes each listed session, stopping live ones first", func(t *testing.T) {
		r := batchRig(t)
		before := r.snapshotAll()

		res, err := r.mgr.RemoveMany(r.ctx, r.ids("23", "1", "12"))
		require.NoError(t, err)

		assert.Equal(t, r.ids("23", "1", "12"), res.Done)
		assert.Empty(t, res.Skipped)
		assert.Empty(t, res.Failed)
		for _, label := range []string{"23", "1", "12"} {
			assert.False(t, r.mgr.Exists(r.labels[label]), label)
		}
		assert.ElementsMatch(t, []string{tmuxName(r.id("23")), tmuxName(r.id("1")), tmuxName(r.id("12"))}, r.killer.killedNames())
		assert.Equal(t, 3, r.log.count("removed"), "one sessionRemoved each")
		r.assertBystandersUntouched(before, "23", "1", "12")
		r.assertConsistent()
	})

	t.Run("an unknown id is skipped, a session already ended is removed", func(t *testing.T) {
		r := batchRig(t)
		_, err := r.mgr.End(r.ctx, r.id("3"))
		require.NoError(t, err)

		res, err := r.mgr.RemoveMany(r.ctx, []int64{987654, r.id("3")})
		require.NoError(t, err)

		assert.Equal(t, r.ids("3"), res.Done)
		assert.Equal(t, []int64{987654}, res.Skipped)
		assert.False(t, r.mgr.Exists(r.id("3")))
	})

	t.Run("a genuine kill failure keeps the row and is reported as failed", func(t *testing.T) {
		r := batchRig(t)
		r.killer.setKillErr(tmuxName(r.id("22")), assert.AnError)

		res, err := r.mgr.RemoveMany(r.ctx, r.ids("21", "22", "23"))
		require.NoError(t, err)

		assert.Equal(t, r.ids("21", "23"), res.Done)
		assert.Equal(t, r.ids("22"), res.Failed)
		assert.True(t, r.mgr.Exists(r.id("22")), "Remove's own rule: a failing kill leaves the row")
		_, err = r.st.GetSession(r.ctx, r.id("22"))
		require.NoError(t, err, "the row is still in the store")
		assert.Equal(t, 2, r.log.count("removed"), "no sessionRemoved for the failed one")
		r.assertConsistent()
	})

	t.Run("an empty list does nothing", func(t *testing.T) {
		r := batchRig(t)

		res, err := r.mgr.RemoveMany(r.ctx, nil)

		require.NoError(t, err)
		assert.Equal(t, BatchResult{}, res)
		assert.Empty(t, r.log.kinds())
	})
}

// TestBatch_ARepeatedIDIsRefusedBeforeAnythingRuns is the duplicate rule the manager owns: a
// list naming an id twice is ErrInvalidOrder with an empty result, and no listed session —
// not the repeated one, not the valid ones around it — is ended, removed or broadcast.
func TestBatch_ARepeatedIDIsRefusedBeforeAnythingRuns(t *testing.T) {
	lists := map[string]func(r *groupsRig) []int64{
		"an adjacent pair":                 func(r *groupsRig) []int64 { return []int64{r.id("3"), r.id("3")} },
		"separated by another session":     func(r *groupsRig) []int64 { return r.ids("1", "2", "1") },
		"after valid ids that would run":   func(r *groupsRig) []int64 { return r.ids("22", "23", "13", "13") },
		"an unknown id repeated":           func(r *groupsRig) []int64 { return []int64{987654, r.id("1"), 987654} },
		"the repeat is the first and last": func(r *groupsRig) []int64 { return r.ids("11", "21", "22", "11") },
	}
	batches := map[string]func(r *groupsRig, ids []int64) (BatchResult, error){
		"EndMany":    func(r *groupsRig, ids []int64) (BatchResult, error) { return r.mgr.EndMany(r.ctx, ids) },
		"RemoveMany": func(r *groupsRig, ids []int64) (BatchResult, error) { return r.mgr.RemoveMany(r.ctx, ids) },
	}
	for batchName, run := range batches {
		for listName, list := range lists {
			t.Run(batchName+"/"+listName, func(t *testing.T) {
				r := batchRig(t)
				before := r.snapshotAll()

				res, err := run(r, list(r))

				require.ErrorIs(t, err, ErrInvalidOrder)
				assert.Equal(t, BatchResult{}, res)
				assert.Empty(t, r.killer.killedNames(), "nothing was killed")
				assert.Empty(t, r.log.kinds(), "nothing was broadcast")
				r.assertBystandersUntouched(before)
				r.assertConsistent()
			})
		}
	}
}

// removingKiller is a TmuxSessions whose kill of one named session first runs a hook, so a
// test can make a later id in a batch disappear while an earlier one is being processed —
// the "removed between the dialog opening and its turn" case, deterministically.
type removingKiller struct {
	*fakeTmuxSessions
	once   sync.Once
	onName string
	hook   func()
}

func (k *removingKiller) KillSession(ctx context.Context, name string) error {
	if name == k.onName {
		k.once.Do(k.hook)
	}
	return k.fakeTmuxSessions.KillSession(ctx, name)
}

// TestRemoveMany_ASessionRemovedBeforeItsTurnIsSkipped is D9's "removed before its turn":
// the second id goes away while the first is being removed, so it is skipped, never failed.
func TestRemoveMany_ASessionRemovedBeforeItsTurnIsSkipped(t *testing.T) {
	r := batchRig(t)
	first, second := r.id("1"), r.id("2")
	killer := &removingKiller{fakeTmuxSessions: r.killer, onName: tmuxName(first)}
	r.mgr = newTestManager(t, r.st, r.pc, r.log.upsert, withTmuxSessions(killer), withOnRemoved(r.log.removed))
	require.NoError(t, r.mgr.LoadAll(r.ctx))
	killer.hook = func() { require.NoError(t, r.mgr.Remove(r.ctx, second)) }

	res, err := r.mgr.RemoveMany(r.ctx, []int64{first, second})
	require.NoError(t, err)

	assert.Equal(t, []int64{first}, res.Done)
	assert.Equal(t, []int64{second}, res.Skipped)
	assert.Empty(t, res.Failed)
	assert.False(t, r.mgr.Exists(first))
	assert.False(t, r.mgr.Exists(second))
}

// TestEndMany_ASessionEndedBeforeItsTurnIsSkipped is the End twin: the later id stops being
// alive while an earlier one is ended.
func TestEndMany_ASessionEndedBeforeItsTurnIsSkipped(t *testing.T) {
	r := batchRig(t)
	first, second := r.id("1"), r.id("2")
	killer := &removingKiller{fakeTmuxSessions: r.killer, onName: tmuxName(first)}
	r.mgr = newTestManager(t, r.st, r.pc, r.log.upsert, withTmuxSessions(killer), withOnRemoved(r.log.removed))
	require.NoError(t, r.mgr.LoadAll(r.ctx))
	killer.hook = func() {
		_, err := r.mgr.End(r.ctx, second)
		require.NoError(t, err)
	}

	res, err := r.mgr.EndMany(r.ctx, []int64{first, second})
	require.NoError(t, err)

	assert.Equal(t, []int64{first}, res.Done)
	assert.Equal(t, []int64{second}, res.Skipped)
	assert.Empty(t, res.Failed)
}
