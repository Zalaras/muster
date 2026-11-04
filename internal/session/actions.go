package session

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Zalaras/muster/internal/tmux"
)

// RecordLaunch stamps the real tmux target/pane once the window has been spawned, and
// broadcasts the session for the first time. A persist failure rolls the tmux
// target/pane back to what they were, so memory never claims a target the DB never
// recorded. A fresh launch has reported no directory yet, so Claude's recorded one is cleared.
// A session launched into a new group (CreateLaunchGroup) announces that group first, so no
// client ever sees a groupId it has no group for.
func (m *Manager) RecordLaunch(ctx context.Context, id int64, tmuxTarget, tmuxPane string) (*Session, error) {
	m.announcePendingLaunchGroup(id)

	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, ErrUnknownSession
	}
	prev := sess.Clone()
	sess.TmuxTarget = tmuxTarget
	sess.TmuxPane = tmuxPane
	sess.clearClaudeLocation()
	sess.clearAddedDirs()
	sess.clearClaudeVersion()
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
// alive gate. EndLocked is split out because Remove also needs to run this same body
// while already holding the lock itself (End's own LockSession call would otherwise
// deadlock against Remove's).
func (m *Manager) End(ctx context.Context, id int64) (*Session, error) {
	unlock := m.LockSession(id)
	defer unlock()
	return m.EndLocked(ctx, id)
}

func (m *Manager) EndLocked(ctx context.Context, id int64) (*Session, error) {
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

// BatchResult is what a batch did, by session id (kb:anchor/sessions.end-many,
// kb:adr/actions-bulk-stop-remove-are-daemon-batches). Skipped names a session that was
// unknown at its turn or, for End, no longer alive; Failed one whose operation genuinely
// failed, which a Remove leaves in place. Queued is filled only by a restart batch, for a
// session marked to restart when it is free.
type BatchResult struct {
	Done, Queued, Skipped, Failed []int64
}

type BatchOutcome int

const (
	BatchDone BatchOutcome = iota
	BatchQueued
	BatchSkipped
)

func (r *BatchResult) file(id int64, outcome BatchOutcome) {
	switch outcome {
	case BatchQueued:
		r.Queued = append(r.Queued, id)
	case BatchSkipped:
		r.Skipped = append(r.Skipped, id)
	default:
		r.Done = append(r.Done, id)
	}
}

// EndMany runs End over ids in listed order, each under its own per-session lock, and
// reports the outcome per id. A session already ended or removed is skipped, never an error.
// A repeated id is ErrInvalidOrder and nothing runs.
func (m *Manager) EndMany(ctx context.Context, ids []int64) (BatchResult, error) {
	return m.runBatch(ids, "ending", func(id int64) error {
		_, err := m.EndLocked(ctx, id)
		return err
	})
}

// RemoveMany runs Remove over ids in listed order, each under its own per-session lock, and
// reports the outcome per id. A session removed before its turn is skipped; a failing kill
// leaves the row (Remove's own rule) and reports the id as failed. A repeated id is
// ErrInvalidOrder and nothing runs.
func (m *Manager) RemoveMany(ctx context.Context, ids []int64) (BatchResult, error) {
	return m.runBatch(ids, "removing", func(id int64) error {
		return m.removeLocked(ctx, id)
	})
}

func (m *Manager) runBatch(ids []int64, what string, op func(id int64) error) (BatchResult, error) {
	return m.RunBatch(ids, what, func(id int64) (BatchOutcome, error) { return BatchDone, op(id) })
}

// RunBatch is the one loop behind every list-of-sessions action (End, Remove, Restart): op
// runs with id's lock held, an op error of ErrUnknownSession or ErrSessionNotAlive skips the
// id, any other error fails it, and a nil error files it under the outcome op returned. It
// refuses a list naming an id twice (ErrInvalidOrder) before running anything, the rule
// the batch endpoints' handlers leave to this package as the rail-order ones do.
func (m *Manager) RunBatch(ids []int64, what string, op func(id int64) (BatchOutcome, error)) (BatchResult, error) {
	var result BatchResult
	if hasRepeat(ids) {
		return result, ErrInvalidOrder
	}
	for _, id := range ids {
		var outcome BatchOutcome
		err := func() (err error) {
			unlock := m.LockSession(id)
			defer unlock()
			outcome, err = op(id)
			return err
		}()
		switch {
		case err == nil:
			result.file(id, outcome)
		case errors.Is(err, ErrUnknownSession), errors.Is(err, ErrSessionNotAlive):
			result.Skipped = append(result.Skipped, id)
		default:
			m.log.Error().Err(err).Int64("session_id", id).Msgf("%s session in a batch failed", what)
			result.Failed = append(result.Failed, id)
		}
	}
	return result, nil
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
// End/Resume for the same id. It calls EndLocked directly (not End) — End would try to
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
		if _, err := m.EndLocked(ctx, id); err != nil {
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
// (a fresh pane has nothing captured yet), Claude's recorded directory cleared (it starts
// in the launch directory again), persisted and broadcast. state is left
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
	forgetHeldRequests(sess)
	sess.LastSnapshot = ""
	sess.LastSnapshotAt = time.Time{}
	sess.effortRequested = ""
	sess.clearClaudeLocation()
	sess.clearAddedDirs()
	sess.clearClaudeVersion()
	post := sess.Clone()

	// A persist failure rolls every field this call touched back — a half-resumed session
	// must never look alive in memory while the DB still has it dead.
	snapshot, err := m.persistWholeRowLocked(ctx, id, sess, prev, post, true)
	if err != nil {
		return nil, fmt.Errorf("persisting resume for session %d: %w", id, err)
	}
	return snapshot, nil
}
