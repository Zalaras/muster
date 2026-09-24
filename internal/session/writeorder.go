package session

import (
	"context"
	"fmt"
	"reflect"
	"slices"
)

// nextWriteTurnLocked draws id's next write ticket — must be called with m.mu held,
// and before it is released, so tickets are handed out in exactly the order their
// mutations happened. wait is the previous ticket's completion signal (nil when none is
// outstanding, the common case); done closes this ticket's own signal, letting whoever
// drew the next one proceed. See writeChain's field doc for the guard.
func (m *Manager) nextWriteTurnLocked(id int64) (wait <-chan struct{}, done func()) {
	if m.writeChain == nil {
		m.writeChain = make(map[int64]chan struct{})
	}
	wait = m.writeChain[id]
	mine := make(chan struct{})
	m.writeChain[id] = mine
	return wait, func() { close(mine) }
}

// recordPersistedLocked records row as the last one this id's chain actually got into the
// DB — must be called with m.mu held. wholeRowPersist and railPersist both call it, inside
// their own persist closures, right after a successful store write and before broadcasting
// — see restoreChangedFields' doc for why the value recorded here, not a failing write's
// own pre-mutation clone, is what a later failure on the same id restores a field to.
func (m *Manager) recordPersistedLocked(id int64, row *Session) {
	if m.lastPersisted == nil {
		m.lastPersisted = make(map[int64]*Session)
	}
	m.lastPersisted[id] = row
}

// finishWrite is the single writer tail shared by every method that persists a Session
// row: called after the caller has released m.mu having already drawn wait/done via
// nextWriteTurnLocked while it still held the lock, it waits for any earlier write on the
// same id to finish, runs persist, and — on failure — re-locks and calls restore against
// the live *Session iff it is still exactly the sess this write mutated (id may have been
// removed entirely in the meantime). One persist-failure policy for every setter: memory
// never claims what the DB doesn't hold. On success it broadcasts snapshot, skipped when
// snapshot is nil — every whole-row setter passes nil here and broadcasts itself from
// inside persist instead, and so does the rail batch's own persist (wholeRowPersist's and
// railPersist's docs say why it has to happen there, not after finishWrite returns);
// SetTranscript's silent write and storeSnapshot's display-only cache pass nil because they
// never broadcast at all. done is always called before returning, whether persist
// succeeded or failed, so the next queued write — if any — is never blocked by this one's
// outcome, and never unblocked before this one's own broadcast (when it has one) has
// already gone out.
func (m *Manager) finishWrite(id int64, sess *Session, wait <-chan struct{}, done func(), persist func() error, snapshot *Session, restore func(*Session)) error {
	if wait != nil {
		<-wait
	}
	defer done()

	if err := persist(); err != nil {
		m.mu.Lock()
		if cur, ok := m.sessions[id]; ok && cur == sess {
			restore(cur)
		}
		m.mu.Unlock()
		return err
	}
	if snapshot != nil {
		m.broadcast(snapshot)
	}
	return nil
}

// persistWholeRowLocked is the shared tail every whole-row setter (SetTitle, MarkSeen,
// SetTranscript, SetPlan, MarkPlanWritten, ApplyPlanScan, RecordLaunch, RecordResume,
// markEnded, RepairOwnedSession, reviveOwnedSession, ApplyStatus) calls once its mutation
// is done, in place of hand-writing finishWrite's row/ticket/persist/restore wiring itself.
// Called with m.mu still held — sess already mutated, prev its pre-mutation clone, post
// its clone taken immediately after, in the same locked section — it draws sess's write
// ticket, releases the lock, and runs the write through finishWrite.
//
// persist rebuilds the row (and, if broadcast, the snapshot to send) from cur's *live*
// state only when finishWrite actually calls it — i.e. at this write's own turn, after any
// earlier write queued on the same id has already resolved, success or restored failure —
// rather than freezing either one now. A row frozen at mutation time could otherwise bake
// in a different write's mutation before that write is even known to succeed: this
// session's Unread and a concurrent status update's Model can both land on the same
// in-memory Session between one write's mutation and its turn, and if the frozen row was
// built in between, a later write's own frozen row would carry the first write's field
// even after it fails and rolls back. Building the row from cur only at persist time means
// it always reflects every earlier write's real, finished outcome. restore must revert
// only the field(s) this write itself changed (restoreChangedFields, built from the
// prev/post pair) — never the whole struct, which would erase a field a write queued
// behind this one has already moved on to.
//
// Returns the session as it stood right after a successful persist (nil on failure or on
// an id removed out from under this write, e.g. by a Remove queued ahead of it in the same
// turnstile — persist declines to resurrect a row that's gone).
func (m *Manager) persistWholeRowLocked(ctx context.Context, id int64, sess, prev, post *Session, broadcast bool) (*Session, error) {
	wait, done := m.nextWriteTurnLocked(id)
	m.mu.Unlock()

	persist, result := m.wholeRowPersist(ctx, id, sess, broadcast)
	if err := m.finishWrite(id, sess, wait, done, persist, nil, m.restoreChangedFields(id, prev, post)); err != nil {
		return nil, err
	}
	return *result, nil
}

// wholeRowPersist builds the persist closure every whole-row write hands to finishWrite —
// persistWholeRowLocked's own callers, Apply (which needs an extra byClaude restore step
// beyond restoreChangedFields, so it can't call persistWholeRowLocked itself), and
// persistAndBroadcastRail's per-write loop (manager_rail.go), which already drew its own
// write ticket in applyRailChangesLocked and so calls this directly rather than through
// persistWholeRowLocked. One identity-checked live read of id's row, for every write in the
// package, is the point: re-reads id's row from live memory and clones it into *result,
// only once finishWrite actually invokes the closure — see persistWholeRowLocked's own doc
// for why that timing matters.
//
// When broadcast is true, the closure sends the fresh sessionUpsert itself, and records the
// persisted clone as id's new m.lastPersisted entry, before returning — both still inside
// finishWrite's call to persist(), and therefore strictly before finishWrite's own deferred
// done() releases the next write queued on the same id. Doing this here, not after
// finishWrite returns, is what keeps persist order and broadcast order both following
// ticket order: a broadcast sent after done() could race a later write's own persist and
// reach clients out of mutation order, or let a write queued ahead of a Remove broadcast
// its sessionUpsert after that Remove's sessionRemoved.
//
// *result stays nil until a successful persist. A rail write ignores it (persistAndBroadcastRail
// only needs the error) — persistWholeRowLocked's own callers are the ones that need the
// resulting Session.
func (m *Manager) wholeRowPersist(ctx context.Context, id int64, sess *Session, broadcast bool) (persist func() error, result **Session) {
	var out *Session
	return func() error {
		m.mu.Lock()
		cur, ok := m.sessions[id]
		if !ok || cur != sess {
			m.mu.Unlock()
			return ErrUnknownSession
		}
		row := sessionToRow(cur)
		out = cur.Clone()
		m.mu.Unlock()
		if err := m.store.UpdateSession(ctx, row); err != nil {
			return err
		}
		m.mu.Lock()
		m.recordPersistedLocked(id, out)
		m.mu.Unlock()
		if broadcast {
			m.broadcast(out)
		}
		return nil
	}, &out
}

// restoreIfUnchanged reverts *field to target iff it still reads as post — i.e. nothing
// has changed it since the mutation post recorded — leaving it alone otherwise.
// restoreChangedFields' one primitive, parameterized over each field's type rather than
// repeated inline once per field.
func restoreIfUnchanged[T comparable](field *T, post, target T) {
	if *field == post {
		*field = target
	}
}

// restoreChangedFields returns finishWrite's restore func for one write on id: prev is
// sess's clone from immediately before this write's mutation, post its clone from
// immediately after (both taken in the same locked section, so nothing else could have
// touched sess in between) — the pair identifies exactly this write's own diff. On
// failure, each field this write changed is reverted only if cur still reads as post for
// it, i.e. nobody else's write has changed it since (a field a write queued behind this
// one has already moved on from is left alone) — but the value it reverts *to* is
// m.lastPersisted[id]'s field, the last row this id's write chain actually got into the
// DB, falling back to prev only when nothing has persisted for id yet (a fresh session, or
// this manager's own first write on it).
//
// Reverting to prev itself, rather than the last persisted row, would be wrong once any
// write is queued behind another on the same id: an earlier write in the turnstile can
// already have persisted and broadcast a live-read row that carries this write's own
// still-in-flight field (wholeRowPersist builds its row from live memory at its own turn,
// not from a value frozen at mutation time), and reverting past that committed value on
// this write's failure would leave memory disagreeing with both the DB and the last
// broadcast — not just with this write's own failed mutation. With no write racing on the
// same id, m.lastPersisted[id] already equals prev, so the effect on a single in-flight
// write is identical to the old copy-prev-back behaviour; this is a refinement of it, not a
// different policy, for any queue depth or mix of success/failure:
//
//   - earlier write succeeds, later write (same or a different field) fails: the later
//     write's restore target is the earlier write's own committed value, not this write's
//     stale prev — memory ends up matching the DB and the last broadcast.
//   - earlier write fails, later write succeeds: the earlier write's restore leaves the
//     later write's already-mutated field alone (post-comparison unchanged), same as
//     before.
//   - both fail: neither committed anything, so m.lastPersisted[id] never moved — both
//     restores land on the same pre-chain value prev already held, matching the DB, which
//     never saw either write.
//   - a rail batch write behind a plain setter, or vice versa, on the same id: the shared
//     m.lastPersisted[id] makes no distinction between a whole-row and a rail write: it is
//     an update to id, not to a particular setter's shape.
//
// Only fields some setter can actually mutate after creation are listed — ID, RepoID,
// Directory, Branch, IsWorktree, FirstLaunchHere and CreatedAt never change once a session
// exists, so there's nothing to restore there. currentPromptID/closedPromptIDs are
// in-memory-only guard fields (session.go's doc), never part of SessionRow, but Apply is
// still the only writer that ever touches them, and a failed Apply must roll every field it
// touched back together, guard fields included, or memory would disagree with itself about
// which fields a rejected Apply call actually took effect for — so they go through the same
// CAS as every state-machine field. See mustCoverEverySessionField below for what keeps
// this list, and the immutable list above it, honest against Session's own field set.
func (m *Manager) restoreChangedFields(id int64, prev, post *Session) func(*Session) {
	return func(cur *Session) {
		last := m.lastPersisted[id]
		if last == nil {
			last = prev
		}
		restoreIfUnchanged(&cur.TmuxTarget, post.TmuxTarget, last.TmuxTarget)
		restoreIfUnchanged(&cur.TmuxPane, post.TmuxPane, last.TmuxPane)
		restoreIfUnchanged(&cur.ClaudeSessionID, post.ClaudeSessionID, last.ClaudeSessionID)
		restoreIfUnchanged(&cur.Title, post.Title, last.Title)
		restoreIfUnchanged(&cur.State, post.State, last.State)
		restoreIfUnchanged(&cur.StateSince, post.StateSince, last.StateSince)
		restoreIfUnchanged(&cur.PermissionMode, post.PermissionMode, last.PermissionMode)
		restoreIfUnchanged(&cur.PermissionModeSource, post.PermissionModeSource, last.PermissionModeSource)
		// Model/Context/Attention/Failure compare by pointer identity: a real change
		// always allocates a fresh pointer rather than writing through the old one
		// (applyBind's doc, machine.go; Session.Clone's own contract), so pointer
		// equality is exactly "unchanged since post".
		restoreIfUnchanged(&cur.Model, post.Model, last.Model)
		restoreIfUnchanged(&cur.Context, post.Context, last.Context)
		restoreIfUnchanged(&cur.Compactions, post.Compactions, last.Compactions)
		restoreIfUnchanged(&cur.Attention, post.Attention, last.Attention)
		restoreIfUnchanged(&cur.Failure, post.Failure, last.Failure)
		restoreIfUnchanged(&cur.LastActivity, post.LastActivity, last.LastActivity)
		restoreIfUnchanged(&cur.Alive, post.Alive, last.Alive)
		restoreIfUnchanged(&cur.EndedAt, post.EndedAt, last.EndedAt)
		restoreIfUnchanged(&cur.LastSnapshot, post.LastSnapshot, last.LastSnapshot)
		restoreIfUnchanged(&cur.LastSnapshotAt, post.LastSnapshotAt, last.LastSnapshotAt)
		restoreIfUnchanged(&cur.Pinned, post.Pinned, last.Pinned)
		restoreIfUnchanged(&cur.RailPos, post.RailPos, last.RailPos)
		restoreIfUnchanged(&cur.TitleOverride, post.TitleOverride, last.TitleOverride)
		restoreIfUnchanged(&cur.TranscriptPath, post.TranscriptPath, last.TranscriptPath)
		restoreIfUnchanged(&cur.PlanPath, post.PlanPath, last.PlanPath)
		restoreIfUnchanged(&cur.PlanExists, post.PlanExists, last.PlanExists)
		restoreIfUnchanged(&cur.Unread, post.Unread, last.Unread)
		restoreIfUnchanged(&cur.LastPrompt, post.LastPrompt, last.LastPrompt)
		restoreIfUnchanged(&cur.currentPromptID, post.currentPromptID, last.currentPromptID)
		// closedPromptIDs is a []string, not comparable, so it can't go through
		// restoreIfUnchanged's generic — slices.Equal is its "unchanged since post" test.
		if slices.Equal(cur.closedPromptIDs, post.closedPromptIDs) {
			cur.closedPromptIDs = last.closedPromptIDs
		}
	}
}

// restoredSessionFields names every Session field the restoreIfUnchanged calls above
// actually cover. immutableSessionFields names every field restoreChangedFields' own doc
// says never changes once a session exists, so there is nothing to restore there. Together
// they are a second, hand-written list that must agree with Session's own field set — the
// same "two places that must agree will not" hazard restoreChangedFields' single copy of
// the DB row already avoids. CheckSessionFieldCoverage below is what keeps them honest.
var restoredSessionFields = []string{
	"TmuxTarget", "TmuxPane", "ClaudeSessionID", "Title", "State", "StateSince",
	"PermissionMode", "PermissionModeSource", "Model", "Context", "Compactions",
	"Attention", "Failure", "LastActivity", "Alive", "EndedAt", "LastSnapshot",
	"LastSnapshotAt", "Pinned", "RailPos", "TitleOverride", "TranscriptPath",
	"PlanPath", "PlanExists", "Unread", "LastPrompt", "currentPromptID", "closedPromptIDs",
}

var immutableSessionFields = []string{
	"ID", "RepoID", "Directory", "Branch", "IsWorktree", "FirstLaunchHere", "CreatedAt",
}

// CheckSessionFieldCoverage reports every Session field name that restoredSessionFields
// and immutableSessionFields between them fail to account for exactly once: left out of
// both (a new mutable field that forgot to be added to restoreChangedFields, and would
// otherwise silently survive a failed write's restore), or named in both (ambiguous). An
// empty result means the two lists are a complete, non-overlapping partition of Session's
// actual fields — CLAUDE.md's "no init() magic" rule keeps this out of an init(), so a
// caller (daemon-tests: one assertion against an empty slice) runs it instead.
func CheckSessionFieldCoverage() []string {
	seen := make(map[string]int, len(restoredSessionFields)+len(immutableSessionFields))
	for _, group := range [][]string{restoredSessionFields, immutableSessionFields} {
		for _, name := range group {
			seen[name]++
		}
	}
	var problems []string
	t := reflect.TypeOf(Session{})
	for i := range t.NumField() {
		name := t.Field(i).Name
		if seen[name] != 1 {
			problems = append(problems, fmt.Sprintf("Session.%s: listed %d times across restoredSessionFields/immutableSessionFields, want exactly 1", name, seen[name]))
		}
	}
	return problems
}
