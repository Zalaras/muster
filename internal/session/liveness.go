package session

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// Start begins the liveness poll loop. Call once, after LoadAll.
func (m *Manager) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		m.pollLoop(ctx)
	}()
}

// Stop cancels the poll loop and waits for it to exit, giving up when ctx is done. Also
// flags checkOneLiveness's opportunistic callers (see the stopped field doc) to stop
// persisting — set first, so it takes effect for a Nudge racing this call regardless of
// how long the poll-loop wait below takes.
func (m *Manager) Stop(ctx context.Context) {
	m.stopped.Store(true)
	if m.cancel != nil {
		m.cancel()
	}
	done := make(chan struct{})
	go func() {
		m.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
		m.log.Warn().Msg("session manager liveness poll did not stop before shutdown deadline")
	}
}

// Snapshot returns id's last captured pane screen, if any (REQ-4's GET .../pane read
// path) — display source only, never a state source.
func (m *Manager) Snapshot(id int64) (text string, at time.Time, ok bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, exists := m.sessions[id]
	// LastSnapshotAt.IsZero() (never captured) is the honest sentinel, not
	// LastSnapshot == "" (review cycle 1 Minor 2) — a genuinely blank pane that was
	// captured successfully has LastSnapshot == "" too, and must still serve 200 text,
	// not a 404 no_snapshot claiming nothing was ever captured.
	if !exists || sess.LastSnapshotAt.IsZero() {
		return "", time.Time{}, false
	}
	return sess.LastSnapshot, sess.LastSnapshotAt, true
}

// captureSnapshot runs capture-pane for an alive session and persists the result only
// when it changed (REQ-4). A capture error (Edge Case 9: transient tmux failure) is not
// a pane-missing signal — the previous snapshot is kept and liveness is never touched.
func (m *Manager) captureSnapshot(ctx context.Context, id int64, target string) {
	if m.paneSnapshotter == nil {
		return
	}
	text, err := m.paneSnapshotter.CapturePane(ctx, target)
	if err != nil {
		m.log.Debug().Err(err).Int64("session_id", id).Msg("pane snapshot capture failed")
		return
	}
	m.storeSnapshot(ctx, id, text)
}

// storeSnapshot persists text for id iff it differs from what's already stored
// (REQ-4/Schema Changes: "written only when the text changes"). Never logs text (may
// hold prompt text) and never broadcasts — the snapshot isn't part of the Session wire
// object (kb:anchor/sessions.pane's own GET endpoint serves it).
func (m *Manager) storeSnapshot(ctx context.Context, id int64, text string) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	// The diff check alone would short-circuit a genuinely blank first capture (zero
	// value LastSnapshot == "" already equals text == ""), leaving LastSnapshotAt zero
	// forever even though a capture did succeed — Snapshot's IsZero() sentinel would then
	// wrongly report "never captured" (review cycle 2 Minor 2). Requiring LastSnapshotAt
	// to already be set before the diff can skip means the very first capture — blank or
	// not — always persists.
	if !ok || (sess.LastSnapshot == text && !sess.LastSnapshotAt.IsZero()) {
		m.mu.Unlock()
		return
	}
	prev := sess.Clone()
	now := time.Now().UTC()
	sess.LastSnapshot = text
	sess.LastSnapshotAt = now
	wait, done := m.nextWriteTurnLocked(id)
	m.mu.Unlock()

	// snapshot is nil (never broadcasts, see doc above); this still needs id's write
	// ticket and the same persist-failure policy as every other setter (memory must
	// not claim a snapshot the DB doesn't hold) even though its persist is a narrower
	// UpdateSnapshot column set, not the whole-row UpdateSession every other writer uses.
	persist := func() error { return m.store.UpdateSnapshot(ctx, id, text, now) }
	if err := m.finishWrite(id, sess, wait, done, persist, nil, cloneRestore(prev)); err != nil {
		m.log.Error().Err(err).Int64("session_id", id).Msg("persisting pane snapshot failed")
	}
}

func (m *Manager) pollLoop(ctx context.Context) {
	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.checkLiveness(ctx)
		}
	}
}

// checkLiveness polls every alive, fully-launched session's pane and flips it dead on
// the first miss (kb:anchor/state.liveness). State is never touched here.
func (m *Manager) checkLiveness(ctx context.Context) {
	if m.paneChecker == nil {
		return
	}

	// REQ-16/D17: one ListSessions call confirms the tmux server itself is reachable
	// before any pane is believed gone — a server-level failure (tmux unreachable) is
	// transient and must leave every session as-is for the next tick, never read as N
	// simultaneous deaths. Deliberately once per sweep, not once per session.
	if m.sessionKiller != nil {
		if _, err := m.sessionKiller.ListSessions(ctx); err != nil {
			m.log.Warn().Err(err).Msg("liveness sweep: tmux server unreachable; leaving sessions as-is")
			return
		}
	}

	// Collect value copies, not *Session pointers, under the lock (review Major 8):
	// holding a live pointer and reading its field after Unlock races with any writer
	// (e.g. RecordLaunch) mutating the same field concurrently.
	type livenessTarget struct {
		id     int64
		target string
	}
	m.mu.Lock()
	var targets []livenessTarget
	for _, s := range m.sessions {
		if s.Alive && s.TmuxTarget != "" {
			targets = append(targets, livenessTarget{id: s.ID, target: s.TmuxTarget})
		}
	}
	m.mu.Unlock()

	for _, target := range targets {
		m.checkOneLiveness(ctx, target.id, target.target, false)
	}
}

// Nudge immediately re-checks one session's pane liveness rather than waiting for the
// next poll tick (kb:anchor/terminal.ws: a PTY EOF should promptly flip alive:false — "the daemon
// also nudges the liveness poll" — rather than lagging up to the ~5s interval).
func (m *Manager) Nudge(ctx context.Context, sessionID int64) {
	if m.paneChecker == nil {
		return
	}
	m.mu.Lock()
	sess, ok := m.sessions[sessionID]
	var target string
	if ok {
		target = sess.TmuxTarget
	}
	m.mu.Unlock()
	if !ok || target == "" {
		return
	}
	m.checkOneLiveness(ctx, sessionID, target, false)
}

// checkOneLiveness is checkLiveness/Nudge/End's shared body: check one target's pane,
// capture a fresh snapshot while it's alive (REQ-4), and flip the session dead on the
// first miss. endOnCheckError controls what happens when PaneExists itself errors
// (distinct from a clean "pane not found"): the periodic poll/nudge callers pass false
// and leave the session as-is for the next tick (an ordinary transient tmux hiccup —
// review cycle 1 Minor 1), while End passes true because it just killed the session
// itself and a check error there must not leave End reporting alive:true.
func (m *Manager) checkOneLiveness(ctx context.Context, id int64, target string, endOnCheckError bool) {
	exists, err := m.paneChecker.PaneExists(ctx, target)
	if err != nil {
		m.log.Warn().Err(err).Str("tmux_target", target).Msg("liveness check failed")
		if !endOnCheckError {
			return
		}
	} else if exists {
		m.captureSnapshot(ctx, id, target)
		return
	}

	if !endOnCheckError && m.stopped.Load() {
		// Shutdown's Stop has already run (stopped field doc): an opportunistic
		// poll/nudge that was in flight before shutdown began must not persist a
		// pane-gone result after it — shutdown's own on-exit policy or the next boot's
		// reconcile owns the final word now.
		return
	}

	if _, err := m.markEnded(ctx, id); err != nil && !errors.Is(err, ErrUnknownSession) {
		m.log.Error().Err(err).Int64("session_id", id).Msg("persisting liveness update failed")
	}
}

// markEnded flips one session's alive to false with endedAt=now, persists the whole row,
// and broadcasts. Idempotent (already-ended is a no-op, no double broadcast). Shared by
// checkOneLiveness (the ordinary poll/nudge path), Reconcile's mark-ended rows, and End
// (via its own liveness nudge — Implementation Notes: "final snapshot → kill-session →
// liveness nudge"). REQ-14/D16: a persist failure rolls the alive/endedAt flip back, so
// the next poll tick re-checks the session instead of the daemon silently believing it
// dead while the DB still says alive.
func (m *Manager) markEnded(ctx context.Context, id int64) (*Session, error) {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, ErrUnknownSession
	}
	if !sess.Alive {
		snapshot := sess.Clone()
		m.mu.Unlock()
		return snapshot, nil
	}
	prev := sess.Clone()
	sess.Alive = false
	endedAt := time.Now().UTC()
	sess.EndedAt = &endedAt
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	wait, done := m.nextWriteTurnLocked(id)
	m.mu.Unlock()

	persist := func() error { return m.store.UpdateSession(ctx, row) }
	if err := m.finishWrite(id, sess, wait, done, persist, snapshot, cloneRestore(prev)); err != nil {
		return nil, fmt.Errorf("persisting ended session %d: %w", id, err)
	}
	return snapshot, nil
}
