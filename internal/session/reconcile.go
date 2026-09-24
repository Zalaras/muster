package session

import (
	"context"
	"fmt"

	"github.com/Zalaras/muster/internal/tmux"
)

// ReconcileReport summarizes what Reconcile did, for its own log line and for tests to
// assert against.
type ReconcileReport struct {
	KeptAlive       int
	MarkedEnded     int
	Swept           int
	UnknownSessions []string // muster-<n> tmux sessions on the socket with no row
	// ShellsKilled counts "muster-<n>-shell" tmux sessions killed unconditionally
	// (kb:anchor/state.liveness) — never adopted, and never listed in UnknownSessions.
	ShellsKilled int
}

// Reconcile runs once at daemon startup, synchronously, before the first snapshot is
// served (kb:anchor/state.liveness, kb:adr/lifecycle-reconcile-before-first-snapshot).
// Call after LoadAll and before Start. Classification runs from **one** ListSessions
// snapshot, by tmux name ownership, never from the stored alive/target alone
// (kb:adr/lifecycle-reconcile-converges-with-the-socket):
//   - "muster-<id>" present on the socket → the row owns it: re-derive
//     tmux_target/tmux_pane from tmux, keep alive:=true, persist+broadcast only on an
//     actual change (reviveOwnedSession). This is what stops a live pane from ever being
//     deleted, whatever the stored alive said.
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
// PaneChecker/PaneSnapshotter/TmuxSessions are all required at construction (NewManager
// panics otherwise), so ownership classification is the only classification path — a
// ListSessions call that itself fails is a different case and must NOT read as "every
// not-alive row's pane is confirmed gone": Reconcile instead acts on nothing this cycle
// and leaves every row untouched, and the next successful poll reconciles once the
// socket is reachable again.
//
// A markEnded/DeleteSession failure during the act phase is logged and does not stop the
// rest — in particular the shell sweep, which runs before the act phase, always happens
// regardless.
func (m *Manager) Reconcile(ctx context.Context) ReconcileReport {
	var report ReconcileReport

	names, err := m.tmuxSessions.ListSessions(ctx)
	if err != nil {
		m.log.Warn().Err(err).Msg("reconcile: listing tmux sessions failed; taking no action this cycle")
		m.logReconcile(report)
		return report
	}

	toEnd, toSweep := m.classifySessionsByOwnership(ctx, names, &report)
	m.actOnReconcile(ctx, &report, toEnd, toSweep)
	m.logReconcile(report)
	return report
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
// every toEnd id ended, then delete every toSweep id. A single id's failure is logged and
// does not stop the rest.
func (m *Manager) actOnReconcile(ctx context.Context, report *ReconcileReport, toEnd, toSweep []int64) {
	for _, id := range toEnd {
		if _, err := m.markEnded(ctx, id); err != nil {
			m.log.Error().Err(err).Int64("session_id", id).Msg("reconcile: marking session ended failed")
			continue
		}
		report.MarkedEnded++
	}
	for _, id := range toSweep {
		// announced=false: no client has seen any session yet this boot (Reconcile runs
		// before the first snapshot is served), so a failed delete must still drop the row
		// from memory rather than leave it to be served as if it had been.
		if err := m.removeSessionRecord(ctx, id, false); err != nil {
			m.log.Error().Err(err).Int64("session_id", id).Msg("reconcile: sweeping session failed")
			continue
		}
		report.Swept++
	}
}

// classifySessionsByOwnership classifies ownership from one ListSessions snapshot.
// Every known row present in it is revived/repaired in place (KeptAlive);
// every known row absent from it follows the old alive-based rule exactly (returned via
// toEnd/toSweep for actOnReconcile). Unknown muster-<n> names are reported+logged and
// muster-<n>-shell names are killed unconditionally — both raise the id watermark.
func (m *Manager) classifySessionsByOwnership(ctx context.Context, names []string, report *ReconcileReport) (toEnd, toSweep []int64) {
	rows := collectSessions(m,
		func(*Session) bool { return true },
		func(s *Session) sessionRef { return sessionRef{id: s.ID, alive: s.Alive} },
	)
	knownIDs := make(map[int64]bool, len(rows))
	for _, r := range rows {
		knownIDs[r.id] = true
	}

	classified := classifyTmuxNames(names, knownIDs)

	for _, r := range rows {
		name, present := classified.live[r.id]
		if present {
			m.reviveOwnedSession(ctx, r.id, name)
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

// classifiedTmuxNames is classifyTmuxNames' pure result: names split into the live
// muster-<id> claude-pane names found (known or not — the caller decides), the
// muster-<id>-shell ids to kill unconditionally, the unknown names to report, and the
// highest id seen across every shape — the floor that raises the id watermark
// (kb:adr/lifecycle-session-ids-monotonic-never-reused).
type classifiedTmuxNames struct {
	live         map[int64]string
	shellIDs     []int64
	unknownNames []string
	maxSeen      int64
}

// classifyTmuxNames is the pure name-parsing step, split out of
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
			// A muster-prefixed name matching neither known shape is still
			// reported+logged as unknown — only a name with no muster- prefix at all is
			// an unrelated tmux session ignored entirely. It contributes no id, so it
			// never raises the watermark.
			if tmux.HasSessionPrefix(name) {
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
// and raise the id watermark above every id seen either way.
func (m *Manager) reportAndSweepUnknown(ctx context.Context, classified classifiedTmuxNames, report *ReconcileReport) {
	for _, name := range classified.unknownNames {
		report.UnknownSessions = append(report.UnknownSessions, name)
		m.log.Warn().Str("tmux_session", name).Msg("unknown muster tmux session on socket; not adopted")
	}
	for _, shellID := range classified.shellIDs {
		name := tmux.ShellSessionName(shellID)
		if err := m.tmuxSessions.KillSession(ctx, name); err != nil {
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
// session that is live even though the row does not currently believe it owns it — the
// resume repair for when sessionLauncher.Resume's own spawn collides with
// ErrSessionExists: a live muster-<id> under a not-alive row *is* that row's own pane
// (a SIGKILL landed between an earlier resume's spawn and its persist, or a race with
// Reconcile — kb:adr/lifecycle-reconcile-converges-with-the-socket,
// kb:adr/lifecycle-resume-rebinds-existing-session). Returns ErrUnknownSession for an
// unknown id, or an error naming what went wrong if no live pane can actually be
// confirmed (the tmux session named by id turns out not to exist after all, or
// ResolveSessionTarget isn't supported) — the caller turns that into 500 launch_failed
// without ever quoting raw tmux stderr.
func (m *Manager) RepairOwnedSession(ctx context.Context, id int64) (*Session, error) {
	resolveCtx, cancel := context.WithTimeout(ctx, endRemoveTmuxTimeout)
	target, pane, err := m.tmuxSessions.ResolveSessionTarget(resolveCtx, tmux.SessionName(id))
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
	post := sess.Clone()

	snapshot, err := m.persistWholeRow(ctx, id, sess, prev, post, true)
	if err != nil {
		return nil, fmt.Errorf("persisting repaired session %d: %w", id, err)
	}
	return snapshot, nil
}

// reviveOwnedSession is the repair step for a row whose muster-<id> tmux session is
// present on the socket (kb:adr/lifecycle-reconcile-converges-with-the-socket): it is
// kept alive (reviving an alive=false row rather than leaving it swept) and has its
// tmux_target/tmux_pane re-derived from tmux and persisted+broadcast only if either
// actually changed. A resolve failure (tmux raced the ListSessions snapshot, or
// ResolveSessionTarget isn't supported) is warn-logged and leaves the stored target as-is
// rather than blocking the alive revival.
func (m *Manager) reviveOwnedSession(ctx context.Context, id int64, tmuxName string) {
	target, pane, err := m.tmuxSessions.ResolveSessionTarget(ctx, tmuxName)
	if err != nil {
		m.log.Warn().Err(err).Str("tmux_session", tmuxName).Int64("session_id", id).Msg("reconcile: resolving live session's target failed")
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
	post := sess.Clone()
	if _, err := m.persistWholeRow(ctx, id, sess, prev, post, true); err != nil {
		m.log.Warn().Err(err).Int64("session_id", id).Msg("reconcile: persisting repaired session failed")
	}
}
