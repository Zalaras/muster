package session

import (
	"context"
	"fmt"
	"os"
)

// SetTranscript records id's latest known transcript path, persisting only when it
// actually changed and never broadcasting — every hook carries the same field, and a
// no-op write per hook would double the ingest worker's SQLite traffic. Refused (no
// persist, changed=false) when claudeSessionID no longer names id's current binding
// (kb:spec/reader: "a hook whose Claude session id the session has already left never
// moves the transcript or the plan") — a straggler from before a `/clear` must never
// move the transcript backwards. Returns ErrUnknownSession for an unknown id.
func (m *Manager) SetTranscript(ctx context.Context, id int64, claudeSessionID, path string) (bool, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return false, ErrUnknownSession
	}
	if sess.ClaudeSessionID != claudeSessionID || sess.TranscriptPath == path {
		m.mu.Unlock()
		return false, nil
	}
	prev := sess.Clone()
	sess.TranscriptPath = path
	row := sessionToRow(sess)
	wait, done := m.nextWriteTurnLocked(id)
	m.mu.Unlock()

	// snapshot is nil: SetTranscript never broadcasts, but it still shares id's
	// write-ordering turnstile — it writes the same whole row every other setter does, so
	// an out-of-turn persist here would just as easily clobber a newer field elsewhere in
	// the row.
	persist := func() error { return m.store.UpdateSession(ctx, row) }
	if err := m.finishWrite(id, sess, wait, done, persist, nil, cloneRestore(prev)); err != nil {
		return false, fmt.Errorf("persisting transcript path for session %d: %w", id, err)
	}
	return true, nil
}

// SetPlan records id's derived plan file, persisting and broadcasting a sessionUpsert
// only when path or exists actually changed. Refused (no persist, changed=false, the
// session's current snapshot returned) when claudeSessionID no longer names id's current
// binding (kb:spec/reader) — a straggler's scan or write must never move the plan.
// path == "" is the wire plan:null. Callers
// that already know the real path to write (observeWrite's exists-true flip) call this
// directly; a transcript scan that may find nothing goes through ApplyPlanScan instead,
// which is the only place the sticky-once-named retention rule is decided.
func (m *Manager) SetPlan(ctx context.Context, id int64, claudeSessionID, path string, exists bool) (*Session, bool, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, false, ErrUnknownSession
	}
	if sess.ClaudeSessionID != claudeSessionID || (sess.PlanPath == path && sess.PlanExists == exists) {
		snapshot := sess.Clone()
		m.mu.Unlock()
		return snapshot, false, nil
	}
	prev := sess.Clone()
	sess.PlanPath = path
	sess.PlanExists = exists
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	wait, done := m.nextWriteTurnLocked(id)
	m.mu.Unlock()

	persist := func() error { return m.store.UpdateSession(ctx, row) }
	if err := m.finishWrite(id, sess, wait, done, persist, snapshot, cloneRestore(prev)); err != nil {
		return nil, false, fmt.Errorf("persisting plan for session %d: %w", id, err)
	}
	return snapshot, true, nil
}

// MarkPlanWritten flips id's PlanExists to true iff its currently-committed PlanPath is
// still expectedPath and PlanExists is still false — internal/server/reader.go's
// observeWrite exists-flip: the decision and the write happen in one Manager.mu critical
// section against the value actually committed *now*, never against a path the caller
// read earlier through Get() outside the lock. Without this, a concurrent ApplyPlanScan
// naming a different plan could be overwritten back to the stale path SetPlan's generic
// (path, exists) signature would otherwise blindly write (observeWrite used to call
// SetPlan directly for this; SetPlan itself is unchanged and still used by callers that
// already hold the real, current path). Refused (no persist, changed=false) when
// claudeSessionID no longer names id's current binding (kb:spec/reader), same as SetPlan.
func (m *Manager) MarkPlanWritten(ctx context.Context, id int64, claudeSessionID, expectedPath string) (*Session, bool, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, false, ErrUnknownSession
	}
	if sess.ClaudeSessionID != claudeSessionID || sess.PlanPath != expectedPath || sess.PlanExists {
		snapshot := sess.Clone()
		m.mu.Unlock()
		return snapshot, false, nil
	}
	prev := sess.Clone()
	sess.PlanExists = true
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	wait, done := m.nextWriteTurnLocked(id)
	m.mu.Unlock()

	persist := func() error { return m.store.UpdateSession(ctx, row) }
	if err := m.finishWrite(id, sess, wait, done, persist, snapshot, cloneRestore(prev)); err != nil {
		return nil, false, fmt.Errorf("persisting plan for session %d: %w", id, err)
	}
	return snapshot, true, nil
}

// ApplyPlanScan commits one transcript scan's result
// (kb:adr/reader-plan-sticky-once-named) — the sole place the sticky-once-named
// retention rule is decided. foundPath == "" is a scan that found nothing (a planless
// transcript, or one that no longer exists); foundPath != "" is a scan that named a
// plan and always replaces. The retain-or-replace decision, the stat that re-derives
// exists, and the write all happen inside one Manager.mu critical section, so a scan
// that finds nothing can never read a plan another goroutine is about to commit, decide
// to keep "no plan", and then write that decision over the newer one — the read of the
// currently-committed PlanPath and the write of the final PlanPath/PlanExists are
// atomic with each other. The stat is a local os.Stat, so it runs under the lock rather
// than in a separate step that could go stale between reading and committing. Refused
// (no persist, changed=false) when claudeSessionID no longer names id's current binding
// (kb:spec/reader), same as SetPlan.
func (m *Manager) ApplyPlanScan(ctx context.Context, id int64, claudeSessionID, foundPath string) (*Session, bool, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, false, ErrUnknownSession
	}
	if sess.ClaudeSessionID != claudeSessionID {
		snapshot := sess.Clone()
		m.mu.Unlock()
		return snapshot, false, nil
	}

	path := foundPath
	if path == "" {
		path = sess.PlanPath
	}
	exists := false
	if path != "" {
		if info, statErr := os.Stat(path); statErr == nil && !info.IsDir() {
			exists = true
		}
	}

	if sess.PlanPath == path && sess.PlanExists == exists {
		snapshot := sess.Clone()
		m.mu.Unlock()
		return snapshot, false, nil
	}
	prev := sess.Clone()
	sess.PlanPath = path
	sess.PlanExists = exists
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	wait, done := m.nextWriteTurnLocked(id)
	m.mu.Unlock()

	persist := func() error { return m.store.UpdateSession(ctx, row) }
	if err := m.finishWrite(id, sess, wait, done, persist, snapshot, cloneRestore(prev)); err != nil {
		return nil, false, fmt.Errorf("persisting plan for session %d: %w", id, err)
	}
	return snapshot, true, nil
}
