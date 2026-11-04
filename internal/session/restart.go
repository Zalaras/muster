package session

import (
	"context"
	"errors"
	"fmt"

	"github.com/Zalaras/muster/internal/claudecode"
)

var ErrNotBehind = errors.New("session not behind")

type RestartClass int

const (
	RestartSkip RestartClass = iota
	RestartQueue
	RestartNow
)

func (s *Session) restartFree() bool {
	return (s.State == StateIdle && s.BackgroundTasks == 0) || s.State == StateFailed
}

func restartDue(s *Session) bool {
	return s.Alive && s.RestartPending && s.restartFree()
}

func (s *Session) clearClaudeVersion() {
	s.ClaudeVersion = ""
	s.ClaudeBehind = false
	s.RestartPending = false
	s.restartHeld = false
}

// adoptClaudeVersion records the version a routed status post reported, reporting whether
// it changed. A dead session never adopts one, so a straggler post cannot refill what a
// death emptied. The caller holds Manager.mu and follows with settleClaudeBehindLocked.
func adoptClaudeVersion(sess *Session, reported *string) bool {
	if reported == nil || !sess.Alive || sess.ClaudeVersion == *reported {
		return false
	}
	sess.ClaudeVersion = *reported
	return true
}

func (m *Manager) settleClaudeBehindLocked(sess *Session) bool {
	if !m.installedChecked {
		return false
	}
	behind := sess.Alive && sess.ClaudeVersion != "" && m.installedClaude != "" &&
		claudecode.OlderVersion(sess.ClaudeVersion, m.installedClaude)
	changed := sess.ClaudeBehind != behind
	sess.ClaudeBehind = behind
	if sess.restartHeld {
		sess.restartHeld = false
		sess.RestartPending = behind
		changed = true
	}
	if !behind && sess.RestartPending {
		sess.RestartPending = false
		changed = true
	}
	return changed
}

func (m *Manager) SetInstalledClaude(ctx context.Context, installed *string) {
	next := ""
	if installed != nil {
		next = *installed
	}
	m.mu.Lock()
	m.installedClaude = next
	m.installedChecked = true
	ids := make([]int64, 0, len(m.sessions))
	for id := range m.sessions {
		ids = append(ids, id)
	}
	m.mu.Unlock()

	for _, id := range ids {
		m.mu.Lock()
		sess, ok := m.sessions[id]
		if !ok {
			m.mu.Unlock()
			continue
		}
		prev := sess.Clone()
		if !m.settleClaudeBehindLocked(sess) {
			m.mu.Unlock()
			continue
		}
		post := sess.Clone()
		if _, err := m.persistWholeRowLocked(ctx, id, sess, prev, post, true); err != nil {
			m.log.Warn().Err(err).Int64("session_id", id).Msg("persisting claude version change failed")
		}
	}
}

func (m *Manager) ClassifyRestart(id int64) RestartClass {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, ok := m.sessions[id]
	switch {
	case !ok, !sess.Alive, sess.ClaudeVersion == "", !sess.ClaudeBehind, sess.ClaudeSessionID == "":
		return RestartSkip
	case sess.restartFree():
		return RestartNow
	default:
		return RestartQueue
	}
}

func (m *Manager) SetRestartPending(ctx context.Context, id int64, pending bool) (bool, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return false, ErrUnknownSession
	}
	if pending && (!sess.Alive || !sess.ClaudeBehind) {
		m.mu.Unlock()
		return false, ErrNotBehind
	}
	if sess.RestartPending == pending {
		m.mu.Unlock()
		return false, nil
	}
	prev := sess.Clone()
	sess.RestartPending = pending
	post := sess.Clone()
	if _, err := m.persistWholeRowLocked(ctx, id, sess, prev, post, true); err != nil {
		return false, fmt.Errorf("persisting restart mark for session %d: %w", id, err)
	}
	return true, nil
}

func (m *Manager) RestartDue() []int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	var ids []int64
	for id, sess := range m.sessions {
		if restartDue(sess) {
			ids = append(ids, id)
		}
	}
	return ids
}

func (m *Manager) IsRestartDue(id int64) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, ok := m.sessions[id]
	return ok && restartDue(sess)
}
