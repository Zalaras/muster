package session

import (
	"context"
	"fmt"
	"time"

	"github.com/Zalaras/muster/internal/claudecode"
)

// Apply feeds one already-routed, already-persisted event into the state machine
// (kb:anchor/state.transitions) and persists + broadcasts the result. claudeSessionID and promptID
// are generic identifiers, not Claude Code payload vocabulary; input is the neutral
// StateInput the claudecode interpreter derived.
//
// enveloped is m4-hook-lifetime's REQ-9 binding-authority signal: it is true iff the
// ingest post carried the kb:anchor/ingest.envelope envelope (i.e. arrived through Muster's own command
// wrapper, never a raw/legacy post). For an enveloped event whose Kind is not itself a
// binder (KindBind/KindClearRebind/KindResumeBind — those already carry their own bind
// logic via applyInput/applyBind below), this session's *actual* claudeSessionID is
// compared against the one this event names before applyInput runs:
//   - never bound (ClaudeSessionID == "") → bind it, no state transition (a lost
//     SessionStart, Edge Case 5).
//   - bound to a different id, and that id has never been this session's → the same
//     rebind SessionStart(source:"clear") gets (reset context/compactions, → started),
//     applied first, so the event that follows lands on a freshly-started session
//     (Edge Case 4).
//   - bound to a different id, but `byClaude[claudeSessionID]` already points at *this*
//     session — meaning this session left that id for its current one already — the
//     event is a reordered straggler from a conversation this session has moved on
//     from (typically the `/clear` pair's own `SessionEnd(reason:"clear")`, since
//     delivery is unordered per CLAUDE.md's hard rule). Rebinding is **monotonic**
//     (kb:anchor/ingest.envelope, decided 2026-08-28, review of this plan, Critical 1): it
//     is routed and applied below, but it never rebinds *backwards* — the current
//     binding, context gauge and compaction counter are left untouched (Edge Case 6a).
//
// Raw (non-enveloped) events never take this path (REQ-10): they keep routing by the
// existing byClaude mapping and never bind or rebind. Status-line posts never call Apply
// at all (REQ-11) — they go through ApplyStatus.
//
// Either way, this function does exactly one persist and one broadcast, whether or not
// the rebind branch ran (D18).
func (m *Manager) Apply(ctx context.Context, musterSessionID int64, claudeSessionID string, promptID *string, input claudecode.StateInput, enveloped bool) (*Session, error) {
	now := time.Now().UTC()

	m.mu.Lock()
	sess, ok := m.sessions[musterSessionID]
	if !ok {
		m.mu.Unlock()
		return nil, ErrUnknownSession
	}
	prev := sess.Clone()
	// claudeSessionID is fixed for the whole call, so byClaude ever gets at most this one
	// key touched below — captured once, before either mutation branch, so a persist
	// failure can put it back exactly as it was (one persist-failure policy for every
	// setter, byClaude included, not just sess's own fields).
	prevOwner, hadPrevOwner := m.byClaude[claudeSessionID]

	if enveloped && !isBindKind(input.Kind) {
		switch {
		case sess.ClaudeSessionID == "":
			sess.ClaudeSessionID = claudeSessionID
			m.byClaude[claudeSessionID] = musterSessionID
		case sess.ClaudeSessionID != claudeSessionID:
			// Monotonic rebind guard (kb:anchor/ingest.envelope, decided 2026-08-28):
			// byClaude never deletes an old claude id on rebind — only a full session
			// removal does that, via removeFromMemory (DeleteSession, Reconcile's
			// sweep, Remove), and Apply would already have failed the m.sessions
			// lookup above in that case, never reaching this branch. So if the
			// incoming id already maps to *this* musterSessionID, this session bound
			// it once before and has since moved on to sess.ClaudeSessionID. That
			// makes the event a reordered straggler, not a forward rebind: route and
			// apply it below (applyInput), but do not reset state/context/compactions
			// and do not move the binding backwards.
			if owner, known := m.byClaude[claudeSessionID]; !known || owner != musterSessionID {
				applyBind(sess, claudeSessionID, claudecode.StateInput{Kind: claudecode.KindClearRebind}, now)
				m.byClaude[claudeSessionID] = musterSessionID
			}
		}
	}

	applyInput(sess, claudeSessionID, promptID, input, now)
	if input.Kind == claudecode.KindBind || input.Kind == claudecode.KindClearRebind {
		m.byClaude[claudeSessionID] = musterSessionID
	}
	// REQ-7/REQ-8: a closing turn sets Unread from the watcher's answer at this moment —
	// true iff no terminal client is attached to this session on either surface, false
	// otherwise. A nil watcher (Config.Watcher unset, most unit tests) counts as
	// unwatched. Every other input kind leaves Unread to setState's own idle-only rule
	// (session.go).
	if input.Kind == claudecode.KindTurnClosed {
		sess.Unread = m.watcher == nil || !m.watcher.Watched(musterSessionID)
	}
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	wait, done := m.nextWriteTurnLocked(musterSessionID)
	m.mu.Unlock()

	restore := func(cur *Session) {
		*cur = *prev
		if hadPrevOwner {
			m.byClaude[claudeSessionID] = prevOwner
		} else {
			delete(m.byClaude, claudeSessionID)
		}
	}
	persist := func() error { return m.store.UpdateSession(ctx, row) }
	if err := m.finishWrite(musterSessionID, sess, wait, done, persist, snapshot, restore); err != nil {
		return nil, fmt.Errorf("persisting session %d: %w", musterSessionID, err)
	}
	return snapshot, nil
}

// isBindKind reports whether kind is one of the three inputs applyInput itself routes
// to applyBind — Apply's envelope-authoritative rebind check (above) only runs for
// everything else, since these three already carry their own binding semantics.
func isBindKind(kind claudecode.InputKind) bool {
	switch kind {
	case claudecode.KindBind, claudecode.KindClearRebind, claudecode.KindResumeBind:
		return true
	default:
		return false
	}
}

// ApplyStatus applies one routed status-line post's neutral StatusUpdate (REQ-4):
// title, model, and context refresh, whichever fields the payload actually carried.
// Persists and broadcasts sessionUpsert only when a surfaced field actually changed
// (applyStatusUpdate's return value) — status posts fire on every tool use, and a
// no-op upsert on every one of them would spam the wire (INV-5's session-side twin).
// Never a state source (INV-1): applyStatusUpdate has no path to state/stateSince/
// attention/failure/alive/compactions/permissionMode.
func (m *Manager) ApplyStatus(ctx context.Context, musterSessionID int64, update claudecode.StatusUpdate) (*Session, error) {
	m.mu.Lock()
	sess, ok := m.sessions[musterSessionID]
	if !ok {
		m.mu.Unlock()
		return nil, ErrUnknownSession
	}
	prev := sess.Clone()

	// Captured before applyStatusUpdate mutates sess, so the wire-visible delta (REQ-12)
	// can be judged independently of the persist-worthy delta applyStatusUpdate itself
	// reports: Model/Context are always replaced wholesale on a real change (never
	// mutated in place, per applyStatusUpdate's own doc comment), so a pointer
	// inequality after is exactly "this field changed"; DisplayTitle() folds in
	// TitleOverride so a Claude-name-only change while an override is set compares equal.
	beforeDisplay := sess.DisplayTitle()
	beforeModel := sess.Model
	beforeContext := sess.Context

	if !applyStatusUpdate(sess, update) {
		snapshot := sess.Clone()
		m.mu.Unlock()
		return snapshot, nil
	}
	row := sessionToRow(sess)
	snapshot := sess.Clone()
	// REQ-12: a status post that only refreshed Claude's name while an override is set
	// persists the row (Title changed, above — applyStatusUpdate reported it) but must
	// not broadcast — the wire object (DisplayTitle()/model/context) is unchanged, and
	// kb:anchor/ws.session's no-no-op-upserts rule stands.
	broadcast := !stringPtrEqual(beforeDisplay, sess.DisplayTitle()) || beforeModel != sess.Model || beforeContext != sess.Context
	wait, done := m.nextWriteTurnLocked(musterSessionID)
	m.mu.Unlock()

	broadcastSnapshot := snapshot
	if !broadcast {
		broadcastSnapshot = nil
	}
	persist := func() error { return m.store.UpdateSession(ctx, row) }
	if err := m.finishWrite(musterSessionID, sess, wait, done, persist, broadcastSnapshot, cloneRestore(prev)); err != nil {
		return nil, fmt.Errorf("persisting status update for session %d: %w", musterSessionID, err)
	}
	return snapshot, nil
}
