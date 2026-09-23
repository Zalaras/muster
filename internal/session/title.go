package session

import (
	"context"
	"fmt"
)

// SetTitle applies kb:anchor/sessions.title's PUT .../title mutation (REQ-10/REQ-11):
// sets or clears id's title override under the lock and persists+broadcasts iff the
// wire title or the override itself changed — a no-op request (edge cases 3/4) neither
// writes nor broadcasts. Returns ErrUnknownSession for a missing id (the server maps it
// to 404 unknown_session).
func (m *Manager) SetTitle(ctx context.Context, id int64, title *string) (bool, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return false, ErrUnknownSession
	}

	prev := sess.Clone()
	beforeDisplay := sess.DisplayTitle()
	beforeOverride := sess.TitleOverride
	sess.TitleOverride = title

	if stringPtrEqual(beforeDisplay, sess.DisplayTitle()) && stringPtrEqual(beforeOverride, sess.TitleOverride) {
		m.mu.Unlock()
		return false, nil
	}

	row := sessionToRow(sess)
	snapshot := sess.Clone()
	wait, done := m.nextWriteTurnLocked(id)
	m.mu.Unlock()

	persist := func() error { return m.store.UpdateSession(ctx, row) }
	if err := m.finishWrite(id, sess, wait, done, persist, snapshot, cloneRestore(prev)); err != nil {
		return false, fmt.Errorf("persisting title for session %d: %w", id, err)
	}
	return true, nil
}

// MarkSeen clears id's Unread flag (plan rail-card-improvements REQ-8): the attach side
// effect on either terminal surface, called before the first byte is forwarded.
// Persists and broadcasts one sessionUpsert only when Unread was actually true (D8) — an
// already-read session's attach neither writes nor broadcasts. Returns ErrUnknownSession
// for a missing id.
func (m *Manager) MarkSeen(ctx context.Context, id int64) error {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return ErrUnknownSession
	}
	if !sess.Unread {
		m.mu.Unlock()
		return nil
	}
	prev := sess.Clone()
	sess.Unread = false
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	wait, done := m.nextWriteTurnLocked(id)
	m.mu.Unlock()

	persist := func() error { return m.store.UpdateSession(ctx, row) }
	if err := m.finishWrite(id, sess, wait, done, persist, snapshot, cloneRestore(prev)); err != nil {
		return fmt.Errorf("marking session %d seen: %w", id, err)
	}
	return nil
}
