package session

import (
	"context"
	"fmt"
)

// SetTitle applies kb:anchor/sessions.title's PUT .../title mutation
// (kb:adr/rename-muster-owned-title-override-wins): sets or clears id's title override
// under the lock and persists+broadcasts iff the wire title or the override itself
// changed — a request that would leave both unchanged neither writes nor broadcasts.
// Returns ErrUnknownSession for a missing id (the server maps it to 404
// unknown_session).
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

	post := sess.Clone()
	if _, err := m.persistWholeRow(ctx, id, sess, prev, post, true); err != nil {
		return false, fmt.Errorf("persisting title for session %d: %w", id, err)
	}
	return true, nil
}
