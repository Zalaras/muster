package session

import (
	"context"
	"fmt"

	"github.com/Zalaras/muster/internal/claudecode"
)

type Effort struct {
	Level *string
}

type EffortWarning struct {
	Requested string
	Actual    *string
	Model     *string
}

func (s *Session) EffortLevel() string {
	if s.Effort == nil || s.Effort.Level == nil {
		return ""
	}
	return *s.Effort.Level
}

func adoptEffort(sess *Session, reading *claudecode.StatusEffort) bool {
	if reading == nil {
		return false
	}
	changed := false
	if sess.Effort == nil || !stringPtrEqual(sess.Effort.Level, reading.Level) {
		sess.Effort = &Effort{Level: copyString(reading.Level)}
		changed = true
	}
	if sess.effortRequested != "" {
		checkLaunchedEffort(sess, reading.Level)
		changed = true
	}
	return changed
}

func checkLaunchedEffort(sess *Session, actual *string) {
	requested := sess.effortRequested
	sess.effortRequested = ""
	if actual != nil && *actual == requested {
		return
	}
	warning := &EffortWarning{Requested: requested, Actual: copyString(actual)}
	if sess.Model != nil {
		model := sess.Model.DisplayName
		warning.Model = &model
	}
	sess.EffortWarning = warning
}

func copyString(p *string) *string {
	if p == nil {
		return nil
	}
	v := *p
	return &v
}

func (m *Manager) ClearEffortWarning(ctx context.Context, id int64) error {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return ErrUnknownSession
	}
	if sess.EffortWarning == nil {
		m.mu.Unlock()
		return nil
	}
	prev := sess.Clone()
	sess.EffortWarning = nil
	post := sess.Clone()
	if _, err := m.persistWholeRowLocked(ctx, id, sess, prev, post, true); err != nil {
		return fmt.Errorf("clearing effort warning for session %d: %w", id, err)
	}
	return nil
}
