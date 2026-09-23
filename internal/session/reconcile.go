package session

import (
	"context"
	"fmt"
	"strings"

	"github.com/Zalaras/muster/internal/tmux"
)

// ReconcileReport summarizes what Reconcile did (REQ-17's log line; D9/D10's test
// assertions).
type ReconcileReport struct {
	KeptAlive       int
	MarkedEnded     int
	Swept           int
	UnknownSessions []string // muster-<n> tmux sessions on the socket with no row (REQ-2)
	// ShellsKilled counts "muster-<n>-shell" tmux sessions killed unconditionally
	// (kb:anchor/state.liveness, plan plain-terminal-session REQ-10) — never adopted, and
	// never listed in UnknownSessions.
	ShellsKilled int
}

// targetResolver is session-lifecycle REQ-9's repair primitive: given a live
// "muster-<id>" tmux session name, resolve its actual window/pane target. It is
// deliberately not part of the Killer interface — Killer test doubles (fakeKiller) never
// implement it, so Manager discovers the capability with an optional type-assertion on
// sessionKiller; a real *tmux.Client satisfies it and enables repair, a fake safely
// leaves it disabled.
type targetResolver interface {
	ResolveSessionTarget(ctx context.Context, name string) (target, pane string, err error)
}

// Reconcile runs once at daemon startup, synchronously, before the first snapshot is
// served (REQ-1/REQ-2/REQ-17, kb:anchor/state.liveness). Call after LoadAll and before
// Start. session-lifecycle REQ-9 rewrote this to classify every known row from **one**
// ListSessions snapshot, by tmux name ownership, rather than trusting the stored
// alive/target — R3's investigation found that reading was never actually cross-checked
// against tmux, only ever produced for a shell-kill/report side effect:
//   - "muster-<id>" present on the socket → the row owns it: re-derive
//     tmux_target/tmux_pane from tmux, keep alive:=true, persist+broadcast only on an
//     actual change (reviveOwnedSession). This is what stops a live pane from ever being
//     deleted, whatever the stored alive said (Edge Cases 5/6/7/8).
//   - "muster-<id>" absent, row alive=true → marked ended and kept (the resume chance
//     is not lost; the *following* startup's absent case sweeps it).
//   - "muster-<id>" absent, row alive=false → swept (deleted; already had its resume
//     chance in an earlier daemon lifetime).
//   - "muster-<n>" with no matching row → reported in UnknownSessions and warn-logged;
//     never adopted, never killed (kb:adr/lifecycle-reconcile-before-first-snapshot) —
//     its id still raises the watermark so it can never be handed to a new row.
//   - "muster-<n>-shell" → killed unconditionally, whatever its <n>; never adopted or
//     reported unknown; its id also raises the watermark.
//
// A handful of tests predating REQ-9 construct a Manager with no SessionKiller at all —
// there is then no way to ever enumerate the socket, so classifySessions (the pre-REQ-9
// alive+PaneExists logic, unchanged) is the only option and remains the fallback for that
// case.
//
// D26/review cycle 2 Major: a ListSessions call that itself fails is a different case and
// must NOT fall back to classifySessions — its `!r.alive { sweep }` branch has no pane
// check at all, so on a socket that briefly can't be reached it would delete every
// not-alive row while their panes are still running, which is the exact orphan class this
// plan exists to close, reached from a new direction. Instead Reconcile acts on nothing
// this cycle and leaves every row untouched; the next successful poll reconciles once the
// socket is reachable again.
//
// REQ-10: unlike before, a markEnded/DeleteSession failure during the act phase is
// logged and does not stop the rest — in particular the shell sweep, which now runs
// before the act phase, always happens regardless.
func (m *Manager) Reconcile(ctx context.Context) (ReconcileReport, error) {
	var report ReconcileReport

	if m.sessionKiller == nil {
		toEnd, toSweep := m.classifySessions(ctx, &report)
		m.actOnReconcile(ctx, &report, toEnd, toSweep)
		m.logReconcile(report)
		return report, nil
	}

	names, err := m.sessionKiller.ListSessions(ctx)
	if err != nil {
		m.log.Warn().Err(err).Msg("reconcile: listing tmux sessions failed; taking no action this cycle")
		m.logReconcile(report)
		return report, nil
	}

	toEnd, toSweep := m.classifySessionsByOwnership(ctx, names, &report)
	m.actOnReconcile(ctx, &report, toEnd, toSweep)
	m.logReconcile(report)
	return report, nil
}

func (m *Manager) logReconcile(report ReconcileReport) {
	m.log.Info().
		Int("kept_alive", report.KeptAlive).
		Int("marked_ended", report.MarkedEnded).
		Int("swept", report.Swept).
		Int("shells_killed", report.ShellsKilled).
		Msg("reconciled sessions")
}

// actOnReconcile is Reconcile's act phase, shared by every classification path: mark
// every toEnd id ended, then delete every toSweep id. REQ-10: a single id's failure is
// logged and does not stop the rest.
func (m *Manager) actOnReconcile(ctx context.Context, report *ReconcileReport, toEnd, toSweep []int64) {
	for _, id := range toEnd {
		if _, err := m.markEnded(ctx, id); err != nil {
			m.log.Error().Err(err).Int64("session_id", id).Msg("reconcile: marking session ended failed")
			continue
		}
		report.MarkedEnded++
	}
	for _, id := range toSweep {
		m.removeFromMemory(id)
		if err := m.store.DeleteSession(ctx, id); err != nil {
			m.log.Error().Err(err).Int64("session_id", id).Msg("reconcile: sweeping session failed")
			continue
		}
		report.Swept++
	}
}

// classifySessionsByOwnership is REQ-9's classification: names is one ListSessions
// snapshot. Every known row present in it is revived/repaired in place (KeptAlive);
// every known row absent from it follows the old alive-based rule exactly (returned via
// toEnd/toSweep for actOnReconcile). Unknown muster-<n> names are reported+logged and
// muster-<n>-shell names are killed unconditionally — both raise the id watermark.
func (m *Manager) classifySessionsByOwnership(ctx context.Context, names []string, report *ReconcileReport) (toEnd, toSweep []int64) {
	m.mu.Lock()
	rows := make([]reconcileRow, 0, len(m.sessions))
	knownIDs := make(map[int64]bool, len(m.sessions))
	for id, sess := range m.sessions {
		rows = append(rows, reconcileRow{id: id, alive: sess.Alive})
		knownIDs[id] = true
	}
	m.mu.Unlock()

	classified := classifyTmuxNames(names, knownIDs)

	resolver, canResolve := m.sessionKiller.(targetResolver)
	for _, r := range rows {
		name, present := classified.live[r.id]
		if present {
			m.reviveOwnedSession(ctx, r.id, name, resolver, canResolve)
			report.KeptAlive++
			continue
		}
		if r.alive {
			toEnd = append(toEnd, r.id)
		} else {
			toSweep = append(toSweep, r.id)
		}
	}

	m.reportAndSweepUnknown(ctx, classified, report)
	return toEnd, toSweep
}

// reconcileRow is a value-copy snapshot of one in-memory session's id/alive, taken under
// m.mu — the shape classifySessionsByOwnership's row-by-row classification operates on
// once the lock is released.
type reconcileRow struct {
	id    int64
	alive bool
}

// classifiedTmuxNames is classifyTmuxNames' pure result: names split into the live
// muster-<id> claude-pane names found (known or not — the caller decides), the
// muster-<id>-shell ids to kill unconditionally, the unknown names to report, and the
// highest id seen across every shape (REQ-9's watermark-raise floor).
type classifiedTmuxNames struct {
	live         map[int64]string
	shellIDs     []int64
	unknownNames []string
	maxSeen      int64
}

// classifyTmuxNames is REQ-9's pure name-parsing step, split out of
// classifySessionsByOwnership to keep it under the gocyclo ceiling
// (docs/conventions.md § Go): no tmux I/O, no lock, just tmux.ParseSessionName/
// IsShellSessionName against knownIDs (every id classifySessionsByOwnership's own row
// snapshot already owns a row for).
func classifyTmuxNames(names []string, knownIDs map[int64]bool) classifiedTmuxNames {
	out := classifiedTmuxNames{live: make(map[int64]string)}
	for _, name := range names {
		if shellID, ok := tmux.IsShellSessionName(name); ok {
			out.shellIDs = append(out.shellIDs, shellID)
			if shellID > out.maxSeen {
				out.maxSeen = shellID
			}
			continue
		}
		id, ok := tmux.ParseSessionName(name)
		if !ok {
			// REQ-9/D22: a muster-prefixed name matching neither known shape is still
			// reported+logged as unknown, same as main did before this plan (Edge
			// Case 22) — only a name with no muster- prefix at all is an unrelated
			// tmux session ignored entirely. It contributes no id, so it never raises
			// the watermark.
			if strings.HasPrefix(name, "muster-") {
				out.unknownNames = append(out.unknownNames, name)
			}
			continue
		}
		out.live[id] = name
		if id > out.maxSeen {
			out.maxSeen = id
		}
		if !knownIDs[id] {
			out.unknownNames = append(out.unknownNames, name)
		}
	}
	return out
}

// reportAndSweepUnknown is classifySessionsByOwnership's tail: report+log every unknown
// muster-<n> (never adopted, never killed), kill every muster-<n>-shell unconditionally,
// and raise the id watermark above every id seen either way (REQ-9).
func (m *Manager) reportAndSweepUnknown(ctx context.Context, classified classifiedTmuxNames, report *ReconcileReport) {
	for _, name := range classified.unknownNames {
		report.UnknownSessions = append(report.UnknownSessions, name)
		m.log.Warn().Str("tmux_session", name).Msg("unknown muster tmux session on socket; not adopted")
	}
	for _, shellID := range classified.shellIDs {
		name := tmux.ShellSessionName(shellID)
		if err := m.sessionKiller.KillSession(ctx, name); err != nil {
			m.log.Warn().Err(err).Str("tmux_session", name).Int64("session_id", shellID).Msg("reconcile: killing orphaned shell session failed")
			continue
		}
		report.ShellsKilled++
	}

	if classified.maxSeen > 0 {
		if err := m.store.BumpIDWatermark(ctx, classified.maxSeen); err != nil {
			m.log.Warn().Err(err).Msg("reconcile: raising session id watermark failed")
		}
	}
}

// RepairOwnedSession re-derives id's tmux_target/tmux_pane from a muster-<id> tmux
// session that is live even though the row does not currently believe it owns it —
// REQ-8's resume repair: when sessionLauncher.Resume's own spawn collides with
// ErrSessionExists, a live muster-<id> under a not-alive row *is* that row's own pane
// (Edge Case 6: a SIGKILL landed between an earlier resume's spawn and its persist, or a
// race with Reconcile). Returns ErrUnknownSession for an unknown id, or an error naming
// what went wrong if no live pane can actually be confirmed (no target resolver wired, or
// the tmux session named by id turns out not to exist after all) — the caller turns
// that into 500 launch_failed without ever quoting raw tmux stderr.
func (m *Manager) RepairOwnedSession(ctx context.Context, id int64) (*Session, error) {
	resolver, canResolve := m.sessionKiller.(targetResolver)
	if !canResolve {
		return nil, fmt.Errorf("repairing session %d: no tmux target resolver available", id)
	}
	resolveCtx, cancel := context.WithTimeout(ctx, endRemoveTmuxTimeout)
	target, pane, err := resolver.ResolveSessionTarget(resolveCtx, sessionTmuxName(id))
	cancel()
	if err != nil {
		return nil, fmt.Errorf("repairing session %d: %w", id, err)
	}

	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil, ErrUnknownSession
	}
	prev := sess.Clone()
	sess.Alive = true
	sess.EndedAt = nil
	sess.TmuxTarget = target
	sess.TmuxPane = pane
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	wait, done := m.nextWriteTurnLocked(id)
	m.mu.Unlock()

	persist := func() error { return m.store.UpdateSession(ctx, row) }
	if err := m.finishWrite(id, sess, wait, done, persist, snapshot, cloneRestore(prev)); err != nil {
		return nil, fmt.Errorf("persisting repaired session %d: %w", id, err)
	}
	return snapshot, nil
}

// reviveOwnedSession is REQ-9's repair step for a row whose muster-<id> tmux session is
// present on the socket: it is kept alive (reviving an alive=false row rather than
// leaving it swept, D9) and, when canResolve, has its tmux_target/tmux_pane re-derived
// from tmux and persisted+broadcast only if either actually changed (D8/D10). A resolve
// failure (tmux raced the ListSessions snapshot) is warn-logged and leaves the stored
// target as-is rather than blocking the alive revival.
func (m *Manager) reviveOwnedSession(ctx context.Context, id int64, tmuxName string, resolver targetResolver, canResolve bool) {
	var target, pane string
	if canResolve {
		var err error
		target, pane, err = resolver.ResolveSessionTarget(ctx, tmuxName)
		if err != nil {
			m.log.Warn().Err(err).Str("tmux_session", tmuxName).Int64("session_id", id).Msg("reconcile: resolving live session's target failed")
		}
	}

	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return
	}
	prev := sess.Clone()
	changed := false
	if !sess.Alive {
		sess.Alive = true
		sess.EndedAt = nil
		changed = true
	}
	if target != "" && (sess.TmuxTarget != target || sess.TmuxPane != pane) {
		sess.TmuxTarget = target
		sess.TmuxPane = pane
		changed = true
	}
	if !changed {
		m.mu.Unlock()
		return
	}
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	wait, done := m.nextWriteTurnLocked(id)
	m.mu.Unlock()

	persist := func() error { return m.store.UpdateSession(ctx, row) }
	if err := m.finishWrite(id, sess, wait, done, persist, snapshot, cloneRestore(prev)); err != nil {
		m.log.Warn().Err(err).Int64("session_id", id).Msg("reconcile: persisting repaired session failed")
	}
}

// classifySessions is Reconcile's first phase: it snapshots the registry under m.mu,
// releases the lock, and only then asks tmux which panes still exist, returning the ids
// to mark ended and the ids to sweep. It writes only report.KeptAlive; the caller owns
// every mutation that follows.
//
// The lock is taken for the snapshot alone and released before the PaneExists calls —
// those are tmux I/O and must never run under m.mu.
func (m *Manager) classifySessions(ctx context.Context, report *ReconcileReport) (toEnd, toSweep []int64) {
	type row struct {
		id     int64
		alive  bool
		target string
	}

	m.mu.Lock()
	rows := make([]row, 0, len(m.sessions))
	for id, sess := range m.sessions {
		rows = append(rows, row{id: id, alive: sess.Alive, target: sess.TmuxTarget})
	}
	m.mu.Unlock()

	for _, r := range rows {
		if !r.alive {
			toSweep = append(toSweep, r.id)
			continue
		}
		exists := true
		if m.paneChecker != nil {
			var err error
			exists, err = m.paneChecker.PaneExists(ctx, r.target)
			if err != nil {
				m.log.Warn().Err(err).Str("tmux_target", r.target).Msg("reconcile: liveness check failed; leaving session as-is")
				report.KeptAlive++
				continue
			}
		}
		if exists {
			report.KeptAlive++
		} else {
			toEnd = append(toEnd, r.id)
		}
	}
	return toEnd, toSweep
}
