package session

import (
	"context"
	"errors"

	"github.com/Zalaras/muster/internal/claudecode"
)

// interruptTarget is a value copy of what the sweep needs about one session with an open
// turn, taken under m.mu.
type interruptTarget struct {
	id              int64
	claudeSessionID string
	transcriptPath  string
	promptID        string
}

type interruptMark struct {
	promptID string
	offset   int64
}

// sweepInterrupts asks the injected checker, for every alive session with an open turn,
// whether its transcript records an interrupt of the current prompt, and lands those that
// do in idle (kb:adr/lifecycle-interrupt-read-from-transcript). An interrupt emits no hook,
// so the transcript is the only place it shows. The checker runs outside m.mu; Apply
// re-validates the prompt under the lock, so a turn that closed meanwhile is left alone.
// A checker error leaves the session unchanged until the next tick. A nil checker
// disables the sweep.
func (m *Manager) sweepInterrupts(ctx context.Context) {
	if m.interruptChecker == nil || m.stopped.Load() {
		return
	}
	m.pruneInterruptActed()
	targets := collectSessions(m,
		func(s *Session) bool {
			return s.Alive && s.inOpenTurn() && s.currentPromptID != "" && s.TranscriptPath != ""
		},
		func(s *Session) interruptTarget {
			return interruptTarget{id: s.ID, claudeSessionID: s.ClaudeSessionID, transcriptPath: s.TranscriptPath, promptID: s.currentPromptID}
		},
	)
	for _, t := range targets {
		offset, err := m.interruptChecker(t.transcriptPath, t.promptID)
		if err != nil {
			m.log.Debug().Err(err).Int64("session_id", t.id).Msg("interrupt check failed; retrying next tick")
			continue
		}
		if offset <= 0 || !m.interruptIsNew(t, offset) {
			continue
		}
		promptID := t.promptID
		if _, err := m.Apply(ctx, t.id, t.claudeSessionID, &promptID, claudecode.StateInput{Kind: claudecode.KindTurnInterrupted}, false); err != nil && !errors.Is(err, ErrUnknownSession) {
			m.log.Error().Err(err).Int64("session_id", t.id).Msg("persisting interrupt failed")
			continue
		}
		m.recordInterruptActed(t, offset)
	}
}

func (m *Manager) interruptIsNew(t interruptTarget, offset int64) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	mark, ok := m.interruptActed[t.id]
	return !ok || mark.promptID != t.promptID || offset > mark.offset
}

func (m *Manager) recordInterruptActed(t interruptTarget, offset int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.interruptActed[t.id] = interruptMark{promptID: t.promptID, offset: offset}
}

// pruneInterruptActed drops marks of removed sessions and of sessions now on another
// prompt. A closed turn has no current prompt, so its mark is kept until the prompt
// reopens or is replaced.
func (m *Manager) pruneInterruptActed() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, mark := range m.interruptActed {
		s, ok := m.sessions[id]
		if !ok || (s.currentPromptID != "" && s.currentPromptID != mark.promptID) {
			delete(m.interruptActed, id)
		}
	}
}
