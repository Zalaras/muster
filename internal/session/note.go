package session

import (
	"context"
	"fmt"
	"strings"
)

func (m *Manager) SetNote(ctx context.Context, id int64, note *string) (bool, error) {
	stored := normalizeNote(note)

	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return false, ErrUnknownSession
	}

	if stringPtrEqual(sess.Note, stored) {
		m.mu.Unlock()
		return false, nil
	}

	prev := sess.Clone()
	sess.Note = stored
	post := sess.Clone()
	if _, err := m.persistWholeRowLocked(ctx, id, sess, prev, post, true); err != nil {
		return false, fmt.Errorf("persisting note for session %d: %w", id, err)
	}
	return true, nil
}

func normalizeNote(note *string) *string {
	if note == nil || strings.TrimSpace(*note) == "" {
		return nil
	}
	text := *note
	return &text
}
