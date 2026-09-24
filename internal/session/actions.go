package session

import (
	"context"
	"fmt"
	"time"

	"github.com/Zalaras/muster/internal/tmux"
)

// RecordLaunch stamps the real tmux target/pane once the window has been spawned, and
// broadcasts the session for the first time. A persist failure rolls the tmux
// target/pane back to what they were, so memory never claims a target the DB never
// recorded.
func (m *Manager) RecordLaunch(ctx context.Context, id int64, tmuxTarget, tmuxPane string) (*Session, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, ErrUnknownSession
	}
	prev := sess.Clone()
	sess.TmuxTarget = tmuxTarget
	sess.TmuxPane = tmuxPane
	post := sess.Clone()

	snapshot, err := m.persistWholeRowLocked(ctx, id, sess, prev, post, true)
	if err != nil {
		return nil, fmt.Errorf("persisting launch for session %d: %w", id, err)
	}
	return snapshot, nil
}

// End kills a live session's tmux session (kb:anchor/sessions.end): a final pane
// snapshot is captured, then the tmux session is killed, then the existing liveness
// nudge path (checkOneLiveness/markEnded) observes the now-missing pane and does the
// alive:=false persist + broadcast — the same single code path every other death goes
// through (kb:adr/lifecycle-liveness-from-pane-existence). Returns ErrUnknownSession
// (404) or ErrSessionNotAlive (409 not_alive, already ended).
//
// id's per-session lock is held for the whole check-then-act
// (kb:adr/actions-serialized-per-session), so two concurrent Ends can never both pass the
// alive gate. endLocked is split out because Remove also needs to run this same body
// while already holding the lock itself (End's own LockSession call would otherwise
// deadlock against Remove's).
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

	snapCtx, cancel := context.WithTimeout(ctx, endRemoveTmuxTimeout)
	m.captureAndStoreSnapshot(snapCtx, ctx, id, target)
	cancel()

	if err := m.killSessionWithTimeout(ctx, id); err != nil {
		return nil, fmt.Errorf("ending session %d: %w", id, err)
	}

	// endOnCheckError:=true here: we just killed the tmux
	// session ourselves, so a PaneExists error on this specific check is not an
	// ordinary transient hiccup to shrug off until the next poll — End must not
	// return alive:true after a kill it just performed. The periodic poll/nudge
	// callers keep the conservative default (leave as-is on a check error).
	checkCtx, cancel2 := context.WithTimeout(ctx, endRemoveTmuxTimeout)
	m.checkOneLiveness(checkCtx, id, target, true)
	cancel2()

	snapshot, ok := m.Get(id)
	if !ok {
		return nil, ErrUnknownSession
	}
	return snapshot, nil
}

// killSessionWithTimeout kills id's tmux Claude-pane session, bounded by
// endRemoveTmuxTimeout — the identical timeout-construction-and-cancel pair End and
// Remove's not-alive path both need.
func (m *Manager) killSessionWithTimeout(ctx context.Context, id int64) error {
	killCtx, cancel := context.WithTimeout(ctx, endRemoveTmuxTimeout)
	defer cancel()
	return m.tmuxSessions.KillSession(killCtx, tmux.SessionName(id))
}

// EndAll ends every currently alive session — the `-on-exit=kill` shutdown path
// (kb:adr/lifecycle-shutdown-leaves-sessions-running): each gets a final snapshot, is
// killed, and its row is marked alive:false before the daemon exits. One session's
// failure is logged and does not stop the rest. Returns how many were successfully
// ended.
func (m *Manager) EndAll(ctx context.Context) int {
	ids := collectSessions(m, func(s *Session) bool { return s.Alive }, func(s *Session) int64 { return s.ID })

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

// ShellNames lists every muster-<n>-shell tmux session name currently on the socket —
// KillAllShells and ShellCount's shared read, matching the same tmux.IsShellSessionName
// predicate reconcile.go's own unconditional shell-kill loop uses. Exported so
// internal/server's restart-impact endpoint asks this one place too, rather than listing
// tmux sessions on its own.
func (m *Manager) ShellNames(ctx context.Context) ([]string, error) {
	names, err := m.tmuxSessions.ListSessions(ctx)
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
// `-on-exit=kill` shutdown path's shell companion to EndAll
// (kb:adr/surfaces-shell-dies-at-kill-shutdown-too). An already-gone shell counts as
// killed (KillSession's own idempotence, kb:adr/actions-kill-is-idempotent); one shell's
// failure is logged and does not stop the rest. Returns how many were successfully
// killed.
func (m *Manager) KillAllShells(ctx context.Context) (int, error) {
	shells, err := m.ShellNames(ctx)
	if err != nil {
		return 0, err
	}
	killed := 0
	for _, name := range shells {
		if err := m.tmuxSessions.KillSession(ctx, name); err != nil {
			m.log.Warn().Err(err).Str("tmux_session", name).Msg("shutdown: killing shell session failed")
			continue
		}
		killed++
	}
	return killed, nil
}

// ShellCount counts every muster-<n>-shell tmux session on the socket — the on-exit
// prompt's shell count. A caller treats an error as zero shells and proceeds with
// shutdown regardless (never a blocker).
func (m *Manager) ShellCount(ctx context.Context) (int, error) {
	shells, err := m.ShellNames(ctx)
	if err != nil {
		return 0, err
	}
	return len(shells), nil
}

// Remove deletes id's row (kb:anchor/sessions.remove,
// kb:adr/actions-remove-allowed-on-live-session): if alive, the End path runs first; a
// failing kill (End's own error) leaves the row untouched and propagates — never a
// deleted row with a running pane. On success the in-memory entry and the row are both
// gone and OnRemoved fires (the sessionRemoved broadcast).
//
// id's per-session lock is held for the whole check-then-act
// (kb:adr/actions-serialized-per-session), so a Remove can never race a concurrent
// End/Resume for the same id. It calls endLocked directly (not End) — End would try to
// reacquire the same lock and deadlock.
func (m *Manager) Remove(ctx context.Context, id int64) error {
	unlock := m.LockSession(id)
	defer unlock()
	return m.removeLocked(ctx, id)
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

	if alive {
		if _, err := m.endLocked(ctx, id); err != nil {
			return fmt.Errorf("removing session %d: %w", id, err)
		}
	} else {
		// A not-alive row's muster-<id> tmux session may still be running (an earlier
		// kill silently failed, or a repair raced in) — kill it idempotently
		// (kb:adr/actions-kill-is-idempotent makes "already gone" a success) so Remove
		// can never leave an orphan.
		if err := m.killSessionWithTimeout(ctx, id); err != nil {
			return fmt.Errorf("removing session %d: %w", id, err)
		}
	}

	// Remove's row was announced (a sessionUpsert went out for it), so
	// removeSessionRecord's announced=true order applies: store first, so a failed delete
	// never looks like a completed remove.
	return m.removeSessionRecord(ctx, id, true)
}

// RecordResume stamps the new tmux target/pane after a successful resume spawn
// (kb:anchor/sessions.resume): alive:=true, endedAt cleared, the stale snapshot cleared
// (a fresh pane has nothing captured yet), persisted and broadcast. state is left
// untouched — it becomes idle only once the enveloped SessionStart(source:"resume")
// arrives (kb:adr/lifecycle-resume-rebinds-existing-session, via the ordinary
// Apply/KindResumeBind path).
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
	post := sess.Clone()

	// A persist failure rolls every field this call touched back — a half-resumed session
	// must never look alive in memory while the DB still has it dead.
	snapshot, err := m.persistWholeRowLocked(ctx, id, sess, prev, post, true)
	if err != nil {
		return nil, fmt.Errorf("persisting resume for session %d: %w", id, err)
	}
	return snapshot, nil
}
