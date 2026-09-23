package session

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
// row: called after the caller has released m.mu having already built row/snapshot from
// the mutation it just made (and drawn wait/done via nextWriteTurnLocked while it still
// held the lock), it waits for any earlier write on the same id to finish, runs persist,
// and — on failure — re-locks and calls restore against the live *Session iff it is still
// exactly the sess this write mutated (id may have been removed entirely in the
// meantime). One persist-failure policy for every setter: memory never claims what
// the DB doesn't hold. On success it broadcasts snapshot, skipped when snapshot is nil
// (SetTranscript's silent write, storeSnapshot's display-only cache). done is always
// called before returning, whether persist succeeded or failed, so the next queued write
// — if any — is never blocked by this one's outcome.
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

// cloneRestore is the ordinary restore func finishWrite's callers pass: prev was cloned
// before the mutation, so putting it back reverts every field in one assignment — Model/
// Context/Attention/Failure included, since a real change to any of those always replaces
// the pointer rather than writing into it, so copying the old
// pointer value back is a full, correct undo.
func cloneRestore(prev *Session) func(*Session) {
	return func(cur *Session) { *cur = *prev }
}
