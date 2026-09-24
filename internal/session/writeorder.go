package session

import (
	"context"
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

// finishWrite is the single writer tail shared by every method that persists a Session
// row: called after the caller has released m.mu having already drawn wait/done via
// nextWriteTurnLocked while it still held the lock, it waits for any earlier write on the
// same id to finish, runs persist, and — on failure — re-locks and calls restore against
// the live *Session iff it is still exactly the sess this write mutated (id may have been
// removed entirely in the meantime). One persist-failure policy for every setter: memory
// never claims what the DB doesn't hold. On success it broadcasts snapshot, skipped when
// snapshot is nil — every whole-row setter passes nil here and broadcasts itself from
// inside persist instead (persistWholeRow's doc says why); SetTranscript's silent write
// and storeSnapshot's display-only cache pass nil because they never broadcast at all.
// done is always called before returning, whether persist succeeded or failed, so the next
// queued write — if any — is never blocked by this one's outcome.
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

// persistWholeRow is the shared tail every whole-row setter (SetTitle, MarkSeen,
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
func (m *Manager) persistWholeRow(ctx context.Context, id int64, sess, prev, post *Session, broadcast bool) (*Session, error) {
	wait, done := m.nextWriteTurnLocked(id)
	m.mu.Unlock()

	persist, result := m.wholeRowPersist(ctx, id, sess)
	if err := m.finishWrite(id, sess, wait, done, persist, nil, restoreChangedFields(prev, post)); err != nil {
		return nil, err
	}
	if broadcast {
		m.broadcast(*result)
	}
	return *result, nil
}

// wholeRowPersist builds the persist closure persistWholeRow (and Apply, which needs an
// extra byClaude restore step beyond restoreChangedFields, so it can't call
// persistWholeRow itself) hand to finishWrite: re-reads id's row from live memory, and
// clones it into *result, only once finishWrite actually invokes the closure — see
// persistWholeRow's own doc for why that timing matters. *result stays nil until a
// successful persist. Split out of persistWholeRow so this identity-checked read lives in
// one place regardless of which restore a caller needs.
func (m *Manager) wholeRowPersist(ctx context.Context, id int64, sess *Session) (persist func() error, result **Session) {
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
		return m.store.UpdateSession(ctx, row)
	}, &out
}

// restoreIfUnchanged reverts *field to prev iff it still reads as post — i.e. nothing has
// changed it since the mutation prev/post recorded — leaving it alone otherwise.
// restoreChangedFields' one primitive, parameterized over each field's type rather than
// repeated inline once per field.
func restoreIfUnchanged[T comparable](field *T, prev, post T) {
	if *field == post {
		*field = prev
	}
}

// restoreChangedFields returns finishWrite's restore func for the common case: prev is
// sess's clone from immediately before this write's mutation, post its clone from
// immediately after (both taken in the same locked section, so nothing else could have
// touched sess in between) — the pair records exactly this write's own diff. On failure,
// each field is only reverted to prev's value if it still reads as post's value, i.e.
// nobody else's write has changed it since; a field a write queued behind this one has
// already moved on from is left alone. This is a strict refinement of a whole-struct
// restore, not a different policy: with no write racing on the same id, every field still
// equals post and the effect is identical to copying prev back whole.
//
// Only fields some setter can actually mutate after creation are listed — ID, RepoID,
// Directory, Branch, IsWorktree, FirstLaunchHere and CreatedAt never change once a session
// exists, so there's nothing to restore there. currentPromptID/closedPromptIDs are
// in-memory-only guard fields (session.go's doc), never part of SessionRow, but Apply is
// still the only writer that ever touches them, so restoring them the same CAS way keeps
// them exactly in step with the state-machine fields Apply's own restore reverts them
// alongside (manager_writeorder_test.go's TestPersistFailure_RollsBackEveryMutationUniformly
// asserts full byte-identity, guard fields included).
func restoreChangedFields(prev, post *Session) func(*Session) {
	return func(cur *Session) {
		restoreIfUnchanged(&cur.TmuxTarget, prev.TmuxTarget, post.TmuxTarget)
		restoreIfUnchanged(&cur.TmuxPane, prev.TmuxPane, post.TmuxPane)
		restoreIfUnchanged(&cur.ClaudeSessionID, prev.ClaudeSessionID, post.ClaudeSessionID)
		restoreIfUnchanged(&cur.Title, prev.Title, post.Title)
		restoreIfUnchanged(&cur.State, prev.State, post.State)
		restoreIfUnchanged(&cur.StateSince, prev.StateSince, post.StateSince)
		restoreIfUnchanged(&cur.PermissionMode, prev.PermissionMode, post.PermissionMode)
		restoreIfUnchanged(&cur.PermissionModeSource, prev.PermissionModeSource, post.PermissionModeSource)
		// Model/Context/Attention/Failure compare by pointer identity: a real change always
		// allocates a fresh pointer rather than writing through the old one (Critical 1's
		// rule, Session.Clone's doc), so pointer equality is exactly "unchanged since post".
		restoreIfUnchanged(&cur.Model, prev.Model, post.Model)
		restoreIfUnchanged(&cur.Context, prev.Context, post.Context)
		restoreIfUnchanged(&cur.Compactions, prev.Compactions, post.Compactions)
		restoreIfUnchanged(&cur.Attention, prev.Attention, post.Attention)
		restoreIfUnchanged(&cur.Failure, prev.Failure, post.Failure)
		restoreIfUnchanged(&cur.LastActivity, prev.LastActivity, post.LastActivity)
		restoreIfUnchanged(&cur.Alive, prev.Alive, post.Alive)
		restoreIfUnchanged(&cur.EndedAt, prev.EndedAt, post.EndedAt)
		restoreIfUnchanged(&cur.LastSnapshot, prev.LastSnapshot, post.LastSnapshot)
		restoreIfUnchanged(&cur.LastSnapshotAt, prev.LastSnapshotAt, post.LastSnapshotAt)
		restoreIfUnchanged(&cur.Pinned, prev.Pinned, post.Pinned)
		restoreIfUnchanged(&cur.RailPos, prev.RailPos, post.RailPos)
		restoreIfUnchanged(&cur.TitleOverride, prev.TitleOverride, post.TitleOverride)
		restoreIfUnchanged(&cur.TranscriptPath, prev.TranscriptPath, post.TranscriptPath)
		restoreIfUnchanged(&cur.PlanPath, prev.PlanPath, post.PlanPath)
		restoreIfUnchanged(&cur.PlanExists, prev.PlanExists, post.PlanExists)
		restoreIfUnchanged(&cur.Unread, prev.Unread, post.Unread)
		restoreIfUnchanged(&cur.LastPrompt, prev.LastPrompt, post.LastPrompt)
		restoreIfUnchanged(&cur.currentPromptID, prev.currentPromptID, post.currentPromptID)
		// closedPromptIDs is a []string, not comparable, so it can't go through
		// restoreIfUnchanged's generic — slices.Equal is its "unchanged since post" test.
		if slices.Equal(cur.closedPromptIDs, post.closedPromptIDs) {
			cur.closedPromptIDs = prev.closedPromptIDs
		}
	}
}
