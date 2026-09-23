package session

import (
	"context"
	"fmt"
	"time"

	"github.com/Zalaras/muster/internal/tmux"
)

// RecordLaunch stamps the real tmux target/pane once the window has been spawned, and
// broadcasts the session for the first time (REQ-2). REQ-14: a persist failure rolls the
// tmux target/pane back to what they were, so memory never claims a target the DB never
// recorded.
func (m *Manager) RecordLaunch(ctx context.Context, id int64, tmuxTarget, tmuxPane string) (*Session, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, fmt.Errorf("recording launch: unknown session %d", id)
	}
	prev := sess.Clone()
	sess.TmuxTarget = tmuxTarget
	sess.TmuxPane = tmuxPane
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	wait, done := m.nextWriteTurnLocked(id)
	m.mu.Unlock()

	persist := func() error { return m.store.UpdateSession(ctx, row) }
	if err := m.finishWrite(id, sess, wait, done, persist, snapshot, cloneRestore(prev)); err != nil {
		return nil, fmt.Errorf("persisting launch for session %d: %w", id, err)
	}
	return snapshot, nil
}

// End kills a live session's tmux session (REQ-5, kb:anchor/sessions.end): a final pane
// snapshot is captured, then the tmux session is killed, then the existing liveness
// nudge path (checkOneLiveness/markEnded) observes the now-missing pane and does the
// alive:=false persist + broadcast — the same single code path every other death goes
// through (INV-1). Returns ErrUnknownSession (404) or ErrSessionNotAlive (409
// not_alive, already ended).
//
// REQ-11: id's per-session lock is held for the whole check-then-act, so two concurrent
// Ends can never both pass the alive gate. endLocked is split out because Remove also
// needs to run this same body while already holding the lock itself (End's own
// LockSession call would otherwise deadlock against Remove's).
func (m *Manager) End(ctx context.Context, id int64) (*Session, error) {
	unlock := m.LockSession(id)
	defer unlock()
	return m.endLocked(ctx, id)
}

func (m *Manager) endLocked(ctx context.Context, id int64) (*Session, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, ErrUnknownSession
	}
	if !sess.Alive {
		m.mu.Unlock()
		return nil, ErrSessionNotAlive
	}
	target := sess.TmuxTarget
	m.mu.Unlock()

	if m.paneSnapshotter != nil {
		snapCtx, cancel := context.WithTimeout(ctx, endRemoveTmuxTimeout)
		text, err := m.paneSnapshotter.CapturePane(snapCtx, target)
		cancel()
		if err != nil {
			m.log.Debug().Err(err).Int64("session_id", id).Msg("final pane snapshot capture failed")
		} else {
			m.storeSnapshot(ctx, id, text)
		}
	}

	if m.sessionKiller != nil {
		killCtx, cancel := context.WithTimeout(ctx, endRemoveTmuxTimeout)
		err := m.sessionKiller.KillSession(killCtx, sessionTmuxName(id))
		cancel()
		if err != nil {
			return nil, fmt.Errorf("ending session %d: %w", id, err)
		}
	}

	if m.paneChecker != nil {
		// endOnCheckError:=true here (review cycle 1 Minor 1): we just killed the tmux
		// session ourselves, so a PaneExists error on this specific check is not an
		// ordinary transient hiccup to shrug off until the next poll — End must not
		// return alive:true after a kill it just performed. The periodic poll/nudge
		// callers below keep the conservative default (leave as-is on a check error).
		checkCtx, cancel := context.WithTimeout(ctx, endRemoveTmuxTimeout)
		m.checkOneLiveness(checkCtx, id, target, true)
		cancel()
	} else if _, err := m.markEnded(ctx, id); err != nil {
		return nil, err
	}

	snapshot, ok := m.Get(id)
	if !ok {
		return nil, ErrUnknownSession
	}
	return snapshot, nil
}

// EndAll ends every currently alive session — the `-on-exit=kill` shutdown path
// (REQ-3): each gets a final snapshot, is killed, and its row is marked alive:false
// before the daemon exits. One session's failure is logged and does not stop the rest.
// Returns how many were successfully ended.
func (m *Manager) EndAll(ctx context.Context) int {
	m.mu.Lock()
	var ids []int64
	for id, sess := range m.sessions {
		if sess.Alive {
			ids = append(ids, id)
		}
	}
	m.mu.Unlock()

	ended := 0
	for _, id := range ids {
		if _, err := m.End(ctx, id); err != nil {
			m.log.Error().Err(err).Int64("session_id", id).Msg("ending session at shutdown failed")
			continue
		}
		ended++
	}
	return ended
}

// shellNamesOnSocket lists every muster-<n>-shell tmux session name currently on the
// socket — KillAllShells and ShellCount's shared read, matching the same
// tmux.IsShellSessionName predicate reconcile's own unconditional shell-kill loop uses
// (reportAndSweepUnknown above). A nil sessionKiller (tests that don't wire one) reads as
// no shells, never an error.
func (m *Manager) shellNamesOnSocket(ctx context.Context) ([]string, error) {
	if m.sessionKiller == nil {
		return nil, nil
	}
	names, err := m.sessionKiller.ListSessions(ctx)
	if err != nil {
		return nil, fmt.Errorf("listing tmux sessions: %w", err)
	}
	var shells []string
	for _, name := range names {
		if _, ok := tmux.IsShellSessionName(name); ok {
			shells = append(shells, name)
		}
	}
	return shells, nil
}

// KillAllShells kills every muster-<n>-shell tmux session on the socket — the
// `-on-exit=kill` shutdown path's shell companion to EndAll (REQ-13,
// kb:adr/surfaces-shell-dies-at-kill-shutdown-too). An already-gone shell counts as
// killed (KillSession's own idempotence, kb:adr/actions-kill-is-idempotent); one shell's
// failure is logged and does not stop the rest. Returns how many were successfully
// killed.
func (m *Manager) KillAllShells(ctx context.Context) (int, error) {
	shells, err := m.shellNamesOnSocket(ctx)
	if err != nil {
		return 0, err
	}
	killed := 0
	for _, name := range shells {
		if err := m.sessionKiller.KillSession(ctx, name); err != nil {
			m.log.Warn().Err(err).Str("tmux_session", name).Msg("shutdown: killing shell session failed")
			continue
		}
		killed++
	}
	return killed, nil
}

// ShellCount counts every muster-<n>-shell tmux session on the socket — the on-exit
// prompt's shell count (REQ-13). A caller treats an error as zero shells and proceeds
// with shutdown regardless (never a blocker).
func (m *Manager) ShellCount(ctx context.Context) (int, error) {
	shells, err := m.shellNamesOnSocket(ctx)
	if err != nil {
		return 0, err
	}
	return len(shells), nil
}

// Remove deletes id's row (REQ-6, kb:anchor/sessions.remove): if alive, the End path runs
// first; a failing kill (End's own error) leaves the row untouched and propagates — never
// a deleted row with a running pane (Edge Case 5). On success the in-memory entry and the
// row are both gone and OnRemoved fires (the sessionRemoved broadcast).
//
// REQ-11: id's per-session lock is held for the whole check-then-act, so a Remove can
// never race a concurrent End/Resume for the same id. It calls endLocked directly (not
// End) — End would try to reacquire the same lock and deadlock.
func (m *Manager) Remove(ctx context.Context, id int64) error {
	unlock := m.LockSession(id)
	defer unlock()

	if err := m.removeLocked(ctx, id); err != nil {
		return err
	}

	// The id is never reissued (REQ-2), so nothing can ever contend on this lock again —
	// reclaim it rather than growing the map for the life of the daemon. writeChain's
	// entry is reclaimed the same way and for the same reason: no write for a removed,
	// never-reused id can ever be scheduled again.
	m.mu.Lock()
	delete(m.idLocks, id)
	delete(m.writeChain, id)
	m.mu.Unlock()
	return nil
}

func (m *Manager) removeLocked(ctx context.Context, id int64) error {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return ErrUnknownSession
	}
	alive := sess.Alive
	m.mu.Unlock()

	switch {
	case alive:
		if _, err := m.endLocked(ctx, id); err != nil {
			return fmt.Errorf("removing session %d: %w", id, err)
		}
	case m.sessionKiller != nil:
		// REQ-15: a not-alive row's muster-<id> tmux session may still be running (an
		// earlier kill silently failed, or a repair raced in) — kill it idempotently
		// (REQ-6 makes "already gone" a success) so Remove can never leave an orphan.
		killCtx, cancel := context.WithTimeout(ctx, endRemoveTmuxTimeout)
		err := m.sessionKiller.KillSession(killCtx, sessionTmuxName(id))
		cancel()
		if err != nil {
			return fmt.Errorf("removing session %d: %w", id, err)
		}
	}

	// REQ-14: the row is deleted before the in-memory entry is dropped, and OnRemoved
	// fires only once both have actually succeeded — a failed delete must never look like
	// a completed remove.
	if err := m.store.DeleteSession(ctx, id); err != nil {
		return fmt.Errorf("removing session %d: %w", id, err)
	}
	m.removeFromMemory(id)
	if m.onRemoved != nil {
		m.onRemoved(id)
	}
	return nil
}

// RecordResume stamps the new tmux target/pane after a successful resume spawn (REQ-7,
// kb:anchor/sessions.resume): alive:=true, endedAt cleared, the stale snapshot cleared (a
// fresh pane has nothing captured yet), persisted and broadcast. state is left
// untouched — it becomes idle only once the enveloped SessionStart(source:"resume")
// arrives (REQ-8, via the ordinary Apply/KindResumeBind path).
func (m *Manager) RecordResume(ctx context.Context, id int64, tmuxTarget, tmuxPane string) (*Session, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, ErrUnknownSession
	}
	prev := sess.Clone()

	sess.TmuxTarget = tmuxTarget
	sess.TmuxPane = tmuxPane
	sess.Alive = true
	sess.EndedAt = nil
	sess.LastSnapshot = ""
	sess.LastSnapshotAt = time.Time{}
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	wait, done := m.nextWriteTurnLocked(id)
	m.mu.Unlock()

	// REQ-14: a persist failure rolls every field back — a half-resumed session must
	// never look alive in memory while the DB still has it dead.
	persist := func() error { return m.store.UpdateSession(ctx, row) }
	if err := m.finishWrite(id, sess, wait, done, persist, snapshot, cloneRestore(prev)); err != nil {
		return nil, fmt.Errorf("persisting resume for session %d: %w", id, err)
	}
	return snapshot, nil
}
