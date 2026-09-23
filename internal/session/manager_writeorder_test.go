package session

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// fakeResolvingKiller extends fakeKiller (manager_test.go) with ResolveSessionTarget, so
// it also satisfies targetResolver — needed only by RepairOwnedSession, which
// type-asserts its SessionKiller port for that capability (manager.go:647).
type fakeResolvingKiller struct {
	*fakeKiller
	target, pane string
}

func (f *fakeResolvingKiller) ResolveSessionTarget(_ context.Context, _ string) (string, string, error) {
	return f.target, f.pane, nil
}

// --- Critical 1: a changed Model must never mutate one a clone already shares ---

// TestApplyBind_DoesNotMutateAModelSharedByAnEarlierClone covers a-C1, deterministically:
// a clone taken via Get/List shares its *Model pointer with the live session
// (Session.Clone is a shallow copy). Rebinding to a different Claude session id must
// swap in a fresh *Model rather than writing through the old one, or the earlier clone's
// Model.ID would change too, breaking Clone's "otherwise-immutable snapshot" contract.
func TestApplyBind_DoesNotMutateAModelSharedByAnEarlierClone(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	dir := t.TempDir()
	sess := createLaunchedSession(t, mgr, st, dir)
	ctx := context.Background()

	modelA := "claude-model-a"
	_, err := mgr.Apply(ctx, sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind, Model: &modelA}, true)
	require.NoError(t, err)

	before, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	require.NotNil(t, before.Model)
	require.Equal(t, modelA, before.Model.ID)

	// A different claude session id escalates to KindClearRebind (machine.go:129), the
	// same path a real `/clear` or resume drives.
	modelB := "claude-model-b"
	_, err = mgr.Apply(ctx, sess.ID, "claude-2", nil, claudecode.StateInput{Kind: claudecode.KindBind, Model: &modelB}, true)
	require.NoError(t, err)

	assert.Equal(t, modelA, before.Model.ID, "a-C1: a clone taken before the rebind must keep reporting the old model, not have it mutated out from under it")

	after, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	assert.Equal(t, modelB, after.Model.ID)
}

// TestApplyBind_ConcurrentWithListNeverRacesOnModel is a-C1's race-detector-driven half:
// one goroutine rebinds with alternating models while another concurrently lists
// sessions and reads the Model.ID each clone reports, unsynchronized (the same read
// internal/server's wire mapping performs). Pre-fix, applyBind wrote into the shared
// *Model in place, so `go test -race` reports a DATA RACE between that write and this
// read. Run this file's tests with -race, as the daemon-tests gate always does.
func TestApplyBind_ConcurrentWithListNeverRacesOnModel(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	dir := t.TempDir()
	sess := createLaunchedSession(t, mgr, st, dir)
	ctx := context.Background()

	modelA, modelB := "claude-model-a", "claude-model-b"
	_, err := mgr.Apply(ctx, sess.ID, "claude-seed", nil, claudecode.StateInput{Kind: claudecode.KindBind, Model: &modelA}, true)
	require.NoError(t, err)

	const iterations = 500
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		for i := range iterations {
			claudeID, model := "claude-a", &modelA
			if i%2 == 0 {
				claudeID, model = "claude-b", &modelB
			}
			_, _ = mgr.Apply(ctx, sess.ID, claudeID, nil, claudecode.StateInput{Kind: claudecode.KindBind, Model: model}, true)
		}
	}()
	go func() {
		defer wg.Done()
		for range iterations {
			for _, s := range mgr.List() {
				if s.Model != nil {
					_ = s.Model.ID // unsynchronized read — a-C1's exact race
				}
			}
		}
	}()
	wg.Wait()

	_, ok := mgr.Get(sess.ID)
	assert.True(t, ok)
}

// --- a-M2: CreateSession's railPos must be decided and advanced in one critical section ---

// TestCreateSession_ConcurrentLaunchesForDifferentDirectoriesGetDistinctRailPos covers
// a-M2 at the Manager level (TestLauncher_ConcurrentLaunchesForTheSameDirectoryProduceTwoDistinctRows's
// shape, one level down): two concurrent CreateSession calls must never both read the
// same "next" railPos, since InsertSession's own round trip separates the read from the
// registration that would make it visible to a second caller. Looped, since the
// pre-fix collision is real but timing-dependent.
func TestCreateSession_ConcurrentLaunchesForDifferentDirectoriesGetDistinctRailPos(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	ctx := context.Background()

	const trials = 50
	for trial := range trials {
		dirA, dirB := t.TempDir(), t.TempDir()
		paramsA := createParams(dirA)
		paramsA.RepoID = seedRepo(t, st, dirA)
		paramsB := createParams(dirB)
		paramsB.RepoID = seedRepo(t, st, dirB)

		var wg sync.WaitGroup
		wg.Add(2)
		var a, b *Session
		var errA, errB error
		go func() { defer wg.Done(); a, errA = mgr.CreateSession(ctx, paramsA) }()
		go func() { defer wg.Done(); b, errB = mgr.CreateSession(ctx, paramsB) }()
		wg.Wait()

		require.NoErrorf(t, errA, "trial %d", trial)
		require.NoErrorf(t, errB, "trial %d", trial)
		assert.NotEqualf(t, a.RailPos, b.RailPos, "trial %d: concurrent CreateSession calls must never allocate the same railPos", trial)
	}
}

// TestCreateSession_AfterRailReorderStillExceedsEveryExistingRailPos proves nextRailPos
// (a monotonic counter, seeded once and only ever incremented) can't collide with a rail
// SetOrder/SetPinned have since rewritten: rebuild() (railorder.go) renumbers the whole
// rail as a contiguous 0..n-1 index every time, which can only ever move existing
// RailPos values *down* toward 0 — never past nextRailPos, which already accounted for
// every session that exists. A new session must still land strictly after all of them.
func TestCreateSession_AfterRailReorderStillExceedsEveryExistingRailPos(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	ctx := context.Background()
	dir := t.TempDir()
	a := createLaunchedSession(t, mgr, st, dir)
	b := createLaunchedSession(t, mgr, st, dir)
	c := createLaunchedSession(t, mgr, st, dir)

	require.NoError(t, mgr.SetOrder(ctx, []int64{c.ID, a.ID, b.ID}, 0))
	require.NoError(t, mgr.SetPinned(ctx, a.ID, true)) // renumbers the whole rail again

	var maxExisting int64 = -1
	for _, s := range mgr.List() {
		if s.RailPos > maxExisting {
			maxExisting = s.RailPos
		}
	}

	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)
	next, err := mgr.CreateSession(ctx, params)
	require.NoError(t, err)

	assert.Greater(t, next.RailPos, maxExisting, "a new session's railPos must exceed every existing one even after the rail has been rebuilt")
}

// --- b-M1/a-S2: MarkPlanWritten's exists-flip must be a CAS against the committed path ---

// TestMarkPlanWritten_RefusesAStalePathAndFlipsExistsOnlyForTheCommittedOne covers b-M1/
// a-S2's exact reproduction: observeWrite reads PlanPath outside the lock, so by the
// time it calls MarkPlanWritten a concurrent ApplyPlanScan may have already moved
// PlanPath on. MarkPlanWritten must re-check against the value committed *now*, not the
// caller's stale read — and must still flip a path that IS still current.
func TestMarkPlanWritten_RefusesAStalePathAndFlipsExistsOnlyForTheCommittedOne(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	dir := t.TempDir()

	t.Run("stale path is refused, current path (P2) is untouched", func(t *testing.T) {
		sess := createLaunchedSession(t, mgr, st, dir)
		ctx := context.Background()
		_, err := mgr.Apply(ctx, sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
		require.NoError(t, err)

		const stalePath = "/tmp/plan-stale.md"
		_, changed, err := mgr.SetPlan(ctx, sess.ID, "claude-1", stalePath, false)
		require.NoError(t, err)
		require.True(t, changed)

		// A concurrent scan moves PlanPath on before observeWrite's flip lands.
		p2 := writeTempPlanFile(t, "plan-current.md")
		_, changed, err = mgr.ApplyPlanScan(ctx, sess.ID, "claude-1", p2)
		require.NoError(t, err)
		require.True(t, changed)
		before := len(rec.all())

		got, changed, err := mgr.MarkPlanWritten(ctx, sess.ID, "claude-1", stalePath)
		require.NoError(t, err)
		assert.False(t, changed, "b-M1: a stale expectedPath must never commit")
		assert.Equal(t, p2, got.PlanPath, "the current, scan-committed path must survive untouched")
		assert.True(t, got.PlanExists)
		assert.Len(t, rec.all(), before, "a refused flip must not broadcast")

		persisted, err := st.GetSession(ctx, sess.ID)
		require.NoError(t, err)
		require.NotNil(t, persisted.PlanPath)
		assert.Equal(t, p2, *persisted.PlanPath, "the DB must never have been overwritten back to the stale path")
	})

	t.Run("current path flips exists and broadcasts once", func(t *testing.T) {
		sess := createLaunchedSession(t, mgr, st, dir)
		ctx := context.Background()
		_, err := mgr.Apply(ctx, sess.ID, "claude-2", nil, claudecode.StateInput{Kind: claudecode.KindBind}, true)
		require.NoError(t, err)

		const path = "/tmp/plan-b.md"
		_, changed, err := mgr.SetPlan(ctx, sess.ID, "claude-2", path, false)
		require.NoError(t, err)
		require.True(t, changed)
		before := len(rec.all())

		got, changed, err := mgr.MarkPlanWritten(ctx, sess.ID, "claude-2", path)
		require.NoError(t, err)
		assert.True(t, changed)
		assert.Equal(t, path, got.PlanPath)
		assert.True(t, got.PlanExists)
		assert.Len(t, rec.all(), before+1, "the exists-flip must broadcast exactly once")

		persisted, err := st.GetSession(ctx, sess.ID)
		require.NoError(t, err)
		assert.True(t, persisted.PlanExists)
	})
}

// writeTempPlanFile creates a real file under the test's temp dir so ApplyPlanScan's own
// exists derivation (a local os.Stat) lands PlanExists true, matching a scan that found
// a real plan.
func writeTempPlanFile(t *testing.T, name string) string {
	t.Helper()
	path := t.TempDir() + "/" + name
	require.NoError(t, os.WriteFile(path, []byte("# plan"), 0o600))
	return path
}

// --- S1: every persist-touching setter shares one rollback-on-failure policy ---

// TestPersistFailure_RollsBackEveryMutationUniformly covers S1's widened finding: only
// RecordLaunch/RecordResume/markEnded used to roll back a failed persist, leaving every
// other setter free to leave memory ahead of the DB. Table-driven since every row shares
// the same setup/assert shape (build a bound, launched session, close the store, call
// the setter, assert the in-memory session is byte-identical to its pre-call clone and
// nothing broadcast) and differs only in which setter runs.
func TestPersistFailure_RollsBackEveryMutationUniformly(t *testing.T) {
	title := "renamed"
	tests := []struct {
		name string
		call func(ctx context.Context, mgr *Manager, sess *Session) error
	}{
		{"Apply", func(ctx context.Context, mgr *Manager, sess *Session) error {
			// A no-op-shaped input (e.g. re-closing an already-idle turn) leaves nothing
			// for finishWrite to actually roll back, proving nothing about S1 — this must
			// be a genuine mutation (state idle->working, LastPrompt, currentPromptID).
			promptID, prompt := "closed-store-prompt", "hello"
			_, err := mgr.Apply(ctx, sess.ID, "claude-1", &promptID, claudecode.StateInput{Kind: claudecode.KindTurnActivity, Prompt: &prompt}, true)
			return err
		}},
		{"ApplyStatus", func(ctx context.Context, mgr *Manager, sess *Session) error {
			_, err := mgr.ApplyStatus(ctx, sess.ID, claudecode.StatusUpdate{Title: &title})
			return err
		}},
		{"SetTitle", func(ctx context.Context, mgr *Manager, sess *Session) error {
			_, err := mgr.SetTitle(ctx, sess.ID, &title)
			return err
		}},
		{"MarkSeen", func(ctx context.Context, mgr *Manager, sess *Session) error {
			// Unread must actually be true, or MarkSeen no-ops before ever reaching the
			// store (manager.go:1035-1038) and this row would prove nothing.
			return mgr.MarkSeen(ctx, sess.ID)
		}},
		{"SetTranscript", func(ctx context.Context, mgr *Manager, sess *Session) error {
			_, err := mgr.SetTranscript(ctx, sess.ID, "claude-1", "/tmp/t.jsonl")
			return err
		}},
		{"SetPlan", func(ctx context.Context, mgr *Manager, sess *Session) error {
			_, _, err := mgr.SetPlan(ctx, sess.ID, "claude-1", "/tmp/plan.md", false)
			return err
		}},
		{"MarkPlanWritten", func(ctx context.Context, mgr *Manager, sess *Session) error {
			_, _, err := mgr.MarkPlanWritten(ctx, sess.ID, "claude-1", sess.PlanPath)
			return err
		}},
		{"ApplyPlanScan", func(ctx context.Context, mgr *Manager, sess *Session) error {
			_, _, err := mgr.ApplyPlanScan(ctx, sess.ID, "claude-1", "/tmp/plan2.md")
			return err
		}},
		{"RepairOwnedSession", func(ctx context.Context, mgr *Manager, sess *Session) error {
			_, err := mgr.RepairOwnedSession(ctx, sess.ID)
			return err
		}},
		{"RecordResume", func(ctx context.Context, mgr *Manager, sess *Session) error {
			_, err := mgr.RecordResume(ctx, sess.ID, "muster-resumed:@1", "%9")
			return err
		}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			st := openTestStore(t)
			rec := &upsertsRecorder{}
			killer := &fakeResolvingKiller{fakeKiller: newFakeKiller(), target: "muster-resumed:@1", pane: "%9"}
			mgr := NewManager(Config{
				Store: st, Logger: zerolog.Nop(), PaneChecker: nil, SessionKiller: killer, OnUpsert: rec.record,
				PollInterval: 10 * time.Millisecond,
			})
			ctx := context.Background()
			dir := t.TempDir()
			sess := createLaunchedSession(t, mgr, st, dir)
			_, err := mgr.Apply(ctx, sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, true)
			require.NoError(t, err, "seed Unread=true so MarkSeen has something to clear")
			before, ok := mgr.Get(sess.ID)
			require.True(t, ok)
			beforeBroadcasts := len(rec.all())

			require.NoError(t, st.Close())

			err = tc.call(ctx, mgr, sess)
			require.Error(t, err, "a persist failure must surface as an error")

			after, ok := mgr.Get(sess.ID)
			require.True(t, ok)
			assert.Equal(t, before, after, "S1: a failed persist must leave the in-memory session exactly as it was")
			assert.Len(t, rec.all(), beforeBroadcasts, "a failed persist must never broadcast")
		})
	}
}

// TestPersistFailure_RailBatchRollsBackEveryQueuedWrite covers S1's rail-tail half:
// persistAndBroadcastRail used to stop at the first persist failure with every
// already-mutated-in-memory entry left in place — including ones behind the failure that
// were never even attempted. With a closed store the very first write in the batch
// fails, so every one of the 3 affected sessions must roll back, not just it.
func TestPersistFailure_RailBatchRollsBackEveryQueuedWrite(t *testing.T) {
	tests := []struct {
		name string
		call func(ctx context.Context, mgr *Manager, a, b, c *Session) error
	}{
		{"SetOrder", func(ctx context.Context, mgr *Manager, a, b, c *Session) error {
			return mgr.SetOrder(ctx, []int64{c.ID, b.ID, a.ID}, 0)
		}},
		{"SetPinned", func(ctx context.Context, mgr *Manager, _, _, c *Session) error {
			// Pinning c (previously the last unpinned entry) also renumbers a and b
			// (railorder.go's rebuild), so all three are affected — the multi-instance
			// coexistence shape a destructive/batch path needs.
			return mgr.SetPinned(ctx, c.ID, true)
		}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			st := openTestStore(t)
			rec := &upsertsRecorder{}
			mgr := newTestManager(t, st, nil, rec.record)
			ctx := context.Background()
			dir := t.TempDir()
			a := createLaunchedSession(t, mgr, st, dir)
			b := createLaunchedSession(t, mgr, st, dir)
			c := createLaunchedSession(t, mgr, st, dir)

			beforeA, _ := mgr.Get(a.ID)
			beforeB, _ := mgr.Get(b.ID)
			beforeC, _ := mgr.Get(c.ID)
			beforeBroadcasts := len(rec.all())

			require.NoError(t, st.Close())

			err := tc.call(ctx, mgr, a, b, c)
			require.Error(t, err, "a closed store must surface as an error, not a silent partial apply")

			afterA, _ := mgr.Get(a.ID)
			afterB, _ := mgr.Get(b.ID)
			afterC, _ := mgr.Get(c.ID)
			assert.Equal(t, beforeA, afterA, "a bystander behind the failed write must roll back too")
			assert.Equal(t, beforeB, afterB, "a bystander behind the failed write must roll back too")
			assert.Equal(t, beforeC, afterC)
			assert.Len(t, rec.all(), beforeBroadcasts, "no partial rail write may broadcast")
		})
	}
}

// --- S1: the write-ordering ticket itself, white-box, since real DB-call timing can't
// be forced deterministically ---

// TestWriteTurns_FinishWriteOrdersPersistsByTicketNotGoroutineStartOrder drives
// nextWriteTurnLocked/finishWrite directly: three tickets are drawn for the same id in
// order, then their finishWrite calls are started from goroutines in the *reverse* order
// (the last-drawn ticket's goroutine first) with the first-drawn ticket's persist
// carrying an artificial delay. If persist order followed goroutine scheduling or
// per-call latency rather than the ticket each call drew under mu, ticket 3 (or 2) would
// win the shared slice.
func TestWriteTurns_FinishWriteOrdersPersistsByTicketNotGoroutineStartOrder(t *testing.T) {
	m := &Manager{}
	const id = int64(1)

	m.mu.Lock()
	wait1, done1 := m.nextWriteTurnLocked(id)
	m.mu.Unlock()
	require.Nil(t, wait1, "the first ticket for a fresh id has nothing to wait on")

	m.mu.Lock()
	wait2, done2 := m.nextWriteTurnLocked(id)
	m.mu.Unlock()
	require.NotNil(t, wait2)

	m.mu.Lock()
	wait3, done3 := m.nextWriteTurnLocked(id)
	m.mu.Unlock()
	require.NotNil(t, wait3)

	var orderMu sync.Mutex
	var order []int
	noopRestore := func(*Session) {}

	run := func(wait <-chan struct{}, done func(), n int, delay time.Duration) <-chan struct{} {
		finished := make(chan struct{})
		go func() {
			defer close(finished)
			persist := func() error {
				time.Sleep(delay)
				orderMu.Lock()
				order = append(order, n)
				orderMu.Unlock()
				return nil
			}
			_ = m.finishWrite(id, nil, wait, done, persist, nil, noopRestore)
		}()
		return finished
	}

	f3 := run(wait3, done3, 3, 0)
	f2 := run(wait2, done2, 2, 0)
	f1 := run(wait1, done1, 1, 50*time.Millisecond)

	<-f1
	<-f2
	<-f3

	assert.Equal(t, []int{1, 2, 3}, order, "persists must run in exactly the order their tickets were drawn, regardless of goroutine start order or injected delay")
}
