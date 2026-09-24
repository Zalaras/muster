package session

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// currentTicketChan reads id's write-chain head under m.mu — the channel the next ticket
// drawn for id will be handed as its wait. Comparable by identity, so a test can tell
// whether some goroutine has drawn a new ticket since it last looked.
func currentTicketChan(mgr *Manager, id int64) chan struct{} {
	mgr.mu.Lock()
	defer mgr.mu.Unlock()
	return mgr.writeChain[id]
}

// drawWriteTicket draws id's next write ticket exactly as every real setter does under
// m.mu, and reports the ticket's own channel (mgr.writeChain[id] immediately after the
// draw) alongside the usual wait/done pair — a test-only seam for forcing two writers'
// ticket order deterministically, since the interleavings these tests prove can't be
// forced through real store-call timing.
func drawWriteTicket(mgr *Manager, id int64) (wait <-chan struct{}, done func(), mine chan struct{}) {
	mgr.mu.Lock()
	defer mgr.mu.Unlock()
	wait, done = mgr.nextWriteTurnLocked(id)
	return wait, done, mgr.writeChain[id]
}

// waitForTicketDrawn blocks until id's write-chain head is no longer prev, i.e. some
// other goroutine has drawn a ticket behind it — or fails the test after a generous
// timeout. The draw-and-block that follows (nextWriteTurnLocked, then finishWrite's
// <-wait) happens under m.mu with no I/O, so this settles almost immediately once the
// other goroutine is scheduled at all.
func waitForTicketDrawn(t *testing.T, mgr *Manager, id int64, prev chan struct{}) {
	t.Helper()
	require.Eventually(t, func() bool {
		return currentTicketChan(mgr, id) != prev
	}, 2*time.Second, time.Millisecond, "no new write ticket was drawn for session %d behind the gate", id)
}

// requireChainIdle asserts wait — the previous ticket nextWriteTurnLocked handed back —
// is either absent (a fresh id) or already closed (every earlier write on this id has
// already resolved), so the gate this test is about to hold open is genuinely the head of
// the chain and not itself queued behind a still-in-flight write from setup.
func requireChainIdle(t *testing.T, wait <-chan struct{}) {
	t.Helper()
	if wait == nil {
		return
	}
	select {
	case <-wait:
	default:
		t.Fatal("write chain must be idle (every setup write already resolved) before the gate is drawn")
	}
}

// canceledContext returns a context that is already Done — passing it to a setter forces
// its persist to fail immediately (ExecContext checks ctx before doing any I/O), without
// needing to close the whole store, which would fail every other write on the manager too.
func canceledContext() context.Context {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	return ctx
}

// TestPersistFailure_LaterQueuedWriteSurvivesAnEarlierFailedRestore proves
// restoreChangedFields' per-field compare-and-swap, combined with wholeRowPersist's
// live-at-persist-time read, holds for any write-queue depth, not just a single in-flight
// write: a failing write's restore must revert only the field(s) it itself changed, never
// a different writer's own change already queued behind it, and a later write's persisted
// row must never carry an earlier, failed write's field. Proven at depth 2, both when the
// second write survives and when it also fails.
//
// Two writers on the same session id, ticket order forced white-box
// (drawWriteTicket/waitForTicketDrawn): the earlier ticket (SetTitle, given an
// already-canceled context so its persist fails deterministically) mutates and queues
// first; the later ticket (MarkSeen) mutates a *different* field before the earlier one's
// failure has resolved — exactly the interleaving a real MarkSeen call on a request
// context canceled by a closing tab produces.
func TestPersistFailure_LaterQueuedWriteSurvivesAnEarlierFailedRestore(t *testing.T) {
	t.Run("earlier write fails, later write succeeds: only the later write's field survives", func(t *testing.T) {
		st := openTestStore(t)
		rec := &upsertsRecorder{}
		mgr := newTestManager(t, st, nil, rec.record)
		dir := t.TempDir()
		sess := createLaunchedSession(t, mgr, st, dir)
		ctx := context.Background()
		_, err := mgr.Apply(ctx, sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, true)
		require.NoError(t, err, "seed Unread=true so the later write (MarkSeen) has something to clear")
		before, ok := mgr.Get(sess.ID)
		require.True(t, ok)
		require.True(t, before.Unread)
		require.Nil(t, before.TitleOverride)

		gateWait, gateDone, gateChan := drawWriteTicket(mgr, sess.ID)
		requireChainIdle(t, gateWait)

		title := "renamed-by-the-failing-write"
		var wg sync.WaitGroup
		var errTitle, errMarkSeen error
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errTitle = mgr.SetTitle(canceledContext(), sess.ID, &title)
		}()
		waitForTicketDrawn(t, mgr, sess.ID, gateChan)
		titleChan := currentTicketChan(mgr, sess.ID)

		wg.Add(1)
		go func() {
			defer wg.Done()
			errMarkSeen = mgr.MarkSeen(ctx, sess.ID)
		}()
		waitForTicketDrawn(t, mgr, sess.ID, titleChan)

		gateDone()
		wg.Wait()

		require.Error(t, errTitle, "a canceled context must fail SetTitle's persist")
		require.NoError(t, errMarkSeen)

		after, ok := mgr.Get(sess.ID)
		require.True(t, ok)
		assert.Nil(t, after.TitleOverride, "the failed write's own field must be rolled back")
		assert.False(t, after.Unread, "the later write's own field must survive the earlier write's restore")

		persisted, err := st.GetSession(ctx, sess.ID)
		require.NoError(t, err)
		assert.Nil(t, persisted.TitleOverride, "the persisted row must never carry the failed write's field")
		assert.False(t, persisted.Unread, "the persisted row must carry only the later write's own change")
	})

	t.Run("both writes fail: memory keeps neither change, matching the DB", func(t *testing.T) {
		st := openTestStore(t)
		rec := &upsertsRecorder{}
		mgr := newTestManager(t, st, nil, rec.record)
		dir := t.TempDir()
		sess := createLaunchedSession(t, mgr, st, dir)
		ctx := context.Background()
		_, err := mgr.Apply(ctx, sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, true)
		require.NoError(t, err, "seed Unread=true so the later write (MarkSeen) has something to clear")
		before, ok := mgr.Get(sess.ID)
		require.True(t, ok)

		gateWait, gateDone, gateChan := drawWriteTicket(mgr, sess.ID)
		requireChainIdle(t, gateWait)

		title := "renamed-by-the-first-failing-write"
		var wg sync.WaitGroup
		var errTitle, errMarkSeen error
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errTitle = mgr.SetTitle(canceledContext(), sess.ID, &title)
		}()
		waitForTicketDrawn(t, mgr, sess.ID, gateChan)
		titleChan := currentTicketChan(mgr, sess.ID)

		wg.Add(1)
		go func() {
			defer wg.Done()
			// MarkSeen itself takes ctx as a plain argument, so its own persist is made to
			// fail the same way SetTitle's is: an already-canceled context.
			errMarkSeen = mgr.MarkSeen(canceledContext(), sess.ID)
		}()
		waitForTicketDrawn(t, mgr, sess.ID, titleChan)

		gateDone()
		wg.Wait()

		require.Error(t, errTitle)
		require.Error(t, errMarkSeen)

		after, ok := mgr.Get(sess.ID)
		require.True(t, ok)
		assert.Equal(t, before, after, "with both writes failed, memory must claim neither change — never the first write's field re-applied by the second write's own restore")

		persisted, err := st.GetSession(ctx, sess.ID)
		require.NoError(t, err)
		assert.Nil(t, persisted.TitleOverride)
		assert.True(t, persisted.Unread, "the DB must still hold its original value: neither failed write ever reached it")
	})
}

// TestPersistFailure_RailWriteSurvivesAnUnrelatedSetterFailedRestore is the rail-batch
// variant of the interleaving above: a plain setter (SetTitle) and a rail write
// (SetPinned) queued on the very same session id, not two writes both inside the same
// rail batch. The rail abort path (persistAndBroadcastRail) has the identical exposure
// whenever any other setter has queued a write on a session in the batch — this proves
// its own restoreChangedFields-based restore correctly leaves a bystander setter's field
// alone, the same as the plain-setter-vs-plain-setter case above.
func TestPersistFailure_RailWriteSurvivesAnUnrelatedSetterFailedRestore(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	ctx := context.Background()
	dir := t.TempDir()
	a := createLaunchedSession(t, mgr, st, dir)
	_ = createLaunchedSession(t, mgr, st, dir) // b: gives SetPinned something to renumber
	before, ok := mgr.Get(a.ID)
	require.True(t, ok)
	require.False(t, before.Pinned)

	gateWait, gateDone, gateChan := drawWriteTicket(mgr, a.ID)
	requireChainIdle(t, gateWait)

	title := "renamed-by-the-failing-write"
	var wg sync.WaitGroup
	var errTitle, errPin error
	wg.Add(1)
	go func() {
		defer wg.Done()
		_, errTitle = mgr.SetTitle(canceledContext(), a.ID, &title)
	}()
	waitForTicketDrawn(t, mgr, a.ID, gateChan)
	titleChan := currentTicketChan(mgr, a.ID)

	wg.Add(1)
	go func() {
		defer wg.Done()
		errPin = mgr.SetPinned(ctx, a.ID, true)
	}()
	waitForTicketDrawn(t, mgr, a.ID, titleChan)

	gateDone()
	wg.Wait()

	require.Error(t, errTitle)
	require.NoError(t, errPin)

	after, ok := mgr.Get(a.ID)
	require.True(t, ok)
	assert.Nil(t, after.TitleOverride, "the failed setter's own field must be rolled back")
	assert.True(t, after.Pinned, "the rail write's own field must survive the unrelated setter's failed restore")

	persisted, err := st.GetSession(ctx, a.ID)
	require.NoError(t, err)
	assert.Nil(t, persisted.TitleOverride)
	assert.True(t, persisted.Pinned, "the persisted row must carry the rail write's own change, not the failed setter's")
}

// TestRemoveSessionRecord_QueuedWriteBehindARemovalNeverPersistsOrBroadcasts proves
// removal is sequenced through the same write turnstile every setter uses: a write
// already queued behind a removal must find the session gone at its own turn and never
// resurrect it — no sessionUpsert may follow a sessionRemoved for the same id. Ticket
// order forced white-box the same way as the tests above.
func TestRemoveSessionRecord_QueuedWriteBehindARemovalNeverPersistsOrBroadcasts(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	var removedIDs []int64
	mgr := newTestManager(t, st, nil, rec.record, withOnRemoved(func(id int64) { removedIDs = append(removedIDs, id) }))
	ctx := context.Background()
	dir := t.TempDir()
	sess := createLaunchedSession(t, mgr, st, dir)
	beforeBroadcasts := len(rec.all())

	gateWait, gateDone, gateChan := drawWriteTicket(mgr, sess.ID)
	requireChainIdle(t, gateWait)

	var wg sync.WaitGroup
	var errRemove, errTitle error
	wg.Add(1)
	go func() {
		defer wg.Done()
		errRemove = mgr.removeSessionRecord(ctx, sess.ID, true)
	}()
	waitForTicketDrawn(t, mgr, sess.ID, gateChan)
	removeChan := currentTicketChan(mgr, sess.ID)

	title := "should-never-persist"
	wg.Add(1)
	go func() {
		defer wg.Done()
		_, errTitle = mgr.SetTitle(ctx, sess.ID, &title)
	}()
	waitForTicketDrawn(t, mgr, sess.ID, removeChan)

	gateDone()
	wg.Wait()

	require.NoError(t, errRemove)
	require.Error(t, errTitle, "a write queued behind a removal must fail, not resurrect the row")
	require.ErrorIs(t, errTitle, ErrUnknownSession)

	assert.False(t, mgr.Exists(sess.ID))
	for _, s := range mgr.List() {
		assert.NotEqual(t, sess.ID, s.ID, "a removed session must never resurface in List()")
	}
	assert.Equal(t, []int64{sess.ID}, removedIDs, "the removal's own sessionRemoved must fire exactly once")

	_, err := st.GetSession(ctx, sess.ID)
	require.Error(t, err, "the row must stay deleted — the queued write must never have re-inserted or updated it")

	newBroadcasts := rec.all()[beforeBroadcasts:]
	for _, s := range newBroadcasts {
		assert.NotEqual(t, sess.ID, s.ID, "no sessionUpsert for the removed id may follow its sessionRemoved")
	}
}

// TestDeleteSession_StoreFailureStillDropsMemory proves the launch-rollback path
// (announced=false) drops the in-memory row even when the store delete itself fails, or a
// session no client was ever told about becomes visible in the next List()/snapshot purely
// because a DB error happened to land.
func TestDeleteSession_StoreFailureStillDropsMemory(t *testing.T) {
	st := openTestStore(t)
	mgr := newTestManager(t, st, nil, nil)
	dir := t.TempDir()
	params := createParams(dir)
	params.RepoID = seedRepo(t, st, dir)
	sess, err := mgr.CreateSession(context.Background(), params)
	require.NoError(t, err)
	require.True(t, mgr.Exists(sess.ID))

	require.NoError(t, st.Close())

	err = mgr.DeleteSession(context.Background(), sess.ID)
	require.Error(t, err, "the store failure must still surface to the caller")

	assert.False(t, mgr.Exists(sess.ID), "a never-announced session must never stay visible after its rollback, even when the store delete failed")
	for _, s := range mgr.List() {
		assert.NotEqual(t, sess.ID, s.ID, "the never-announced session must not appear in List()")
	}
}

// TestReconcile_SweptRowStoreFailureStillDropsMemory is
// TestDeleteSession_StoreFailureStillDropsMemory's sibling for Reconcile's own
// announced=false removal path (the sweep): a not-alive row absent from the tmux listing
// must still disappear from memory even when the store delete fails.
func TestReconcile_SweptRowStoreFailureStillDropsMemory(t *testing.T) {
	st := openTestStore(t)
	killer := newFakeTmuxSessions() // no muster-<id> sessions at all: absent from tmux
	mgr := newTestManager(t, st, nil, nil, withTmuxSessions(killer))
	dir := t.TempDir()
	sess := createLaunchedSession(t, mgr, st, dir)

	// A not-alive row absent from tmux is exactly Reconcile's sweep condition
	// (classifySessionsByOwnership) — markEnded needs the store open to persist this.
	_, err := mgr.markEnded(context.Background(), sess.ID)
	require.NoError(t, err)

	require.NoError(t, st.Close())

	report := mgr.Reconcile(context.Background())
	assert.Equal(t, 0, report.Swept, "the failed delete is logged and does not count as a successful sweep")

	assert.False(t, mgr.Exists(sess.ID), "a swept row must never stay visible after a failed delete")
	for _, s := range mgr.List() {
		assert.NotEqual(t, sess.ID, s.ID, "the swept row must not appear in List()")
	}
}

// --- persist/broadcast ordering: wholeRowPersist's live-read-and-broadcast, both inside
// finishWrite's own persist closure, must keep memory, the DB and every broadcast agreeing
// for any mix of success/failure/removal queued on the same id ---

// TestBroadcastAndPersist_EarlierSuccessLaterFailureLeavesMemoryMatchingDB proves
// restoreChangedFields' revert target is the write chain's last *persisted* row, not the
// failing write's own stale prev: SetTitle succeeds first and, at its own turn, commits a
// row read live from memory — which by then already carries Unread=true from a preceding
// Apply — while MarkSeen, queued behind it on the same id, then fails. MarkSeen's restore
// must land Unread back on what the chain actually committed, not on Unread's value from
// before either write started, or memory would disagree with both the DB and the last
// broadcast.
func TestBroadcastAndPersist_EarlierSuccessLaterFailureLeavesMemoryMatchingDB(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	mgr := newTestManager(t, st, nil, rec.record)
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	ctx := context.Background()
	_, err := mgr.Apply(ctx, sess.ID, "claude-1", nil, claudecode.StateInput{Kind: claudecode.KindTurnClosed}, true)
	require.NoError(t, err, "seed Unread=true so MarkSeen's own field has something to fail on")

	gateWait, gateDone, gateChan := drawWriteTicket(mgr, sess.ID)
	requireChainIdle(t, gateWait)

	title := "t1-ok"
	var wg sync.WaitGroup
	var errTitle, errMarkSeen error
	wg.Add(1)
	go func() {
		defer wg.Done()
		_, errTitle = mgr.SetTitle(ctx, sess.ID, &title)
	}()
	waitForTicketDrawn(t, mgr, sess.ID, gateChan)
	titleChan := currentTicketChan(mgr, sess.ID)

	wg.Add(1)
	go func() {
		defer wg.Done()
		errMarkSeen = mgr.MarkSeen(canceledContext(), sess.ID)
	}()
	waitForTicketDrawn(t, mgr, sess.ID, titleChan)

	gateDone()
	wg.Wait()

	require.NoError(t, errTitle)
	require.Error(t, errMarkSeen)

	mem, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	db, err := st.GetSession(ctx, sess.ID)
	require.NoError(t, err)
	last := rec.all()[len(rec.all())-1]
	assert.Equal(t, db.Unread, mem.Unread, "memory must match the DB after the later write's restore")
	assert.Equal(t, db.Unread, last.Unread, "the last broadcast must also agree with the DB")
}

// TestBroadcastAndPersist_WriteAheadOfRemovalNeverBroadcastsAfterRemoval proves a write
// drawn ahead of a Remove on the same id finishes its own persist and broadcast — both
// inside wholeRowPersist's closure, strictly before finishWrite's deferred done() runs —
// before the Remove's own sessionRemoved goes out, never after: a client must never see a
// sessionUpsert for an id it was already told is gone. onUpsert holds its own append open
// until onRemoved has fired (or a generous timeout), so a broadcast sent after done() —
// racing the removal's own onRemoved instead of strictly preceding it — shows up as
// "removed" landing in order first.
func TestBroadcastAndPersist_WriteAheadOfRemovalNeverBroadcastsAfterRemoval(t *testing.T) {
	st := openTestStore(t)
	var mu sync.Mutex
	var order []string
	removed := make(chan struct{})
	var armed bool
	onUpsert := func(*Session) {
		mu.Lock()
		a := armed
		mu.Unlock()
		if a {
			select {
			case <-removed:
			case <-time.After(500 * time.Millisecond):
			}
		}
		mu.Lock()
		order = append(order, "upsert")
		mu.Unlock()
	}
	mgr := newTestManager(t, st, nil, onUpsert, withOnRemoved(func(int64) {
		mu.Lock()
		order = append(order, "removed")
		mu.Unlock()
		close(removed)
	}))
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	ctx := context.Background()
	mu.Lock()
	armed = true
	order = nil // createLaunchedSession's own launch broadcasts once before this test arms
	mu.Unlock()

	gateWait, gateDone, gateChan := drawWriteTicket(mgr, sess.ID)
	requireChainIdle(t, gateWait)
	title := "ahead"
	var wg sync.WaitGroup
	wg.Add(1)
	go func() { defer wg.Done(); _, _ = mgr.SetTitle(ctx, sess.ID, &title) }()
	waitForTicketDrawn(t, mgr, sess.ID, gateChan)
	titleChan := currentTicketChan(mgr, sess.ID)
	wg.Add(1)
	go func() { defer wg.Done(); _ = mgr.removeSessionRecord(ctx, sess.ID, true) }()
	waitForTicketDrawn(t, mgr, sess.ID, titleChan)
	gateDone()
	wg.Wait()

	assert.Equal(t, []string{"upsert", "removed"}, order)
}

// TestBroadcastAndPersist_TwoSuccessfulWritesBroadcastInTicketOrder proves broadcast order
// follows ticket order, not whichever write's persist happens to return from the store
// first: the earlier-ticketed SetTitle("first") is held inside onUpsert until the
// later-ticketed SetTitle("second") has already mutated and broadcast, then released. If
// wholeRowPersist's live read and broadcast happened after finishWrite's done() released
// the next ticket rather than inside its own persist closure, "first"'s broadcast could
// still land after "second"'s.
func TestBroadcastAndPersist_TwoSuccessfulWritesBroadcastInTicketOrder(t *testing.T) {
	st := openTestStore(t)
	var mu sync.Mutex
	var titles []string
	second := make(chan struct{})
	var armed bool
	onUpsert := func(s *Session) {
		mu.Lock()
		a := armed
		mu.Unlock()
		tt := ""
		if s.TitleOverride != nil {
			tt = *s.TitleOverride
		}
		if a && tt == "first" {
			select {
			case <-second:
			case <-time.After(500 * time.Millisecond):
			}
		}
		mu.Lock()
		titles = append(titles, tt)
		mu.Unlock()
		if tt == "second" {
			close(second)
		}
	}
	mgr := newTestManager(t, st, nil, onUpsert)
	sess := createLaunchedSession(t, mgr, st, t.TempDir())
	ctx := context.Background()
	mu.Lock()
	armed = true
	mu.Unlock()

	gateWait, gateDone, gateChan := drawWriteTicket(mgr, sess.ID)
	requireChainIdle(t, gateWait)
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		// "first" persists from live memory at its turn; held inside onUpsert until
		// "second" has mutated and broadcast.
		v := "first"
		_, _ = mgr.SetTitle(ctx, sess.ID, &v)
	}()
	waitForTicketDrawn(t, mgr, sess.ID, gateChan)
	gateDone()
	// Give "first" a moment to reach its own turn and start persisting before "second"
	// mutates — there's no chain-head signal to poll for a write that hasn't drawn a
	// ticket yet, since it draws its own ticket internally rather than through the
	// test's drawWriteTicket seam.
	time.Sleep(50 * time.Millisecond)
	wg.Add(1)
	go func() { defer wg.Done(); v := "second"; _, _ = mgr.SetTitle(ctx, sess.ID, &v) }()
	wg.Wait()

	mem, ok := mgr.Get(sess.ID)
	require.True(t, ok)
	require.Equal(t, "second", *mem.TitleOverride)
	assert.Equal(t, "second", titles[len(titles)-1], "the last broadcast must equal memory's own final value")
}

// TestSetOrder_QueuedBehindRemovalSkipsOnlyTheRemovedSession proves
// persistAndBroadcastRail treats ErrUnknownSession — this batch entry's session removed out
// from under it by a Remove drawn ahead of the batch on the same id — as "skip this one,
// keep going", not as a genuine failure that aborts and rolls back every other entry in the
// same SetOrder/SetPinned call.
func TestSetOrder_QueuedBehindRemovalSkipsOnlyTheRemovedSession(t *testing.T) {
	st := openTestStore(t)
	rec := &upsertsRecorder{}
	var mu sync.Mutex
	var removedIDs []int64
	mgr := newTestManager(t, st, nil, rec.record, withOnRemoved(func(id int64) {
		mu.Lock()
		removedIDs = append(removedIDs, id)
		mu.Unlock()
	}))
	ctx := context.Background()
	dir := t.TempDir()
	a := createLaunchedSession(t, mgr, st, dir)
	b := createLaunchedSession(t, mgr, st, dir)
	c := createLaunchedSession(t, mgr, st, dir)

	gateWait, gateDone, gateChan := drawWriteTicket(mgr, a.ID)
	requireChainIdle(t, gateWait)

	var wg sync.WaitGroup
	var errRemove, errOrder error
	wg.Add(1)
	go func() {
		defer wg.Done()
		errRemove = mgr.removeSessionRecord(ctx, a.ID, true)
	}()
	waitForTicketDrawn(t, mgr, a.ID, gateChan)

	wg.Add(1)
	go func() {
		defer wg.Done()
		errOrder = mgr.SetOrder(ctx, []int64{c.ID, b.ID, a.ID}, 0)
	}()
	// SetOrder draws its own write tickets for all three ids internally, with no
	// chain-head signal a test can poll for a batch call the way drawWriteTicket gives
	// one for a single id — best-effort wait for it to have drawn a's ticket (behind the
	// removal) before the gate opens.
	time.Sleep(50 * time.Millisecond)

	gateDone()
	wg.Wait()

	require.NoError(t, errRemove)
	require.NoError(t, errOrder, "one removed session in the batch must not fail the whole SetOrder call")
	mu.Lock()
	gotRemoved := append([]int64(nil), removedIDs...)
	mu.Unlock()
	assert.Equal(t, []int64{a.ID}, gotRemoved)

	_, ok := mgr.Get(a.ID)
	assert.False(t, ok, "a must still be gone")

	bAfter, ok := mgr.Get(b.ID)
	require.True(t, ok)
	cAfter, ok := mgr.Get(c.ID)
	require.True(t, ok)

	persistedB, err := st.GetSession(ctx, b.ID)
	require.NoError(t, err)
	persistedC, err := st.GetSession(ctx, c.ID)
	require.NoError(t, err)
	assert.Equal(t, bAfter.RailPos, persistedB.RailPos, "b's rail write must have persisted despite a's removal in the same batch")
	assert.Equal(t, cAfter.RailPos, persistedC.RailPos, "c's rail write must have persisted despite a's removal in the same batch")
}
