package session

import (
	"context"
	"errors"
	"fmt"

	"github.com/Zalaras/muster/internal/store"
)

// maxRailPosLocked returns the largest RailPos among known sessions, or -1 when there are
// none — LoadAll's one-time seed for nextRailPos, CreateSession's own decision from then
// on: a newly opened session lands at the bottom of the unpinned block
// (kb:adr/rail-order-daemon-owned-per-session-fields). Must be called with m.mu held.
func (m *Manager) maxRailPosLocked() int64 {
	highest := int64(-1)
	for _, s := range m.sessions {
		if s.RailPos > highest {
			highest = s.RailPos
		}
	}
	return highest
}

// railEntriesLocked returns a railEntry view of every known session — the pure input
// railorder.go's applyPin/applyOrder operate over. Must be called with m.mu held.
func (m *Manager) railEntriesLocked() []railEntry {
	out := make([]railEntry, 0, len(m.sessions))
	for _, s := range m.sessions {
		out = append(out, railEntry{ID: s.ID, Pinned: s.Pinned, RailPos: s.RailPos})
	}
	return out
}

// railWrite is one changed session's rail write, fully built while applyRailChangesLocked
// still holds m.mu — row/snapshot/wait/done all reflect that lock scope's mutation, so
// persistAndBroadcastRail's later, unlocked loop only ever waits, persists and restores;
// it never touches sess again to derive anything.
type railWrite struct {
	id       int64
	sess     *Session // live pointer, for finishWrite's identity-checked restore
	prev     *Session // pre-mutation clone, cloneRestore's target on a persist failure
	row      store.SessionRow
	snapshot *Session
	wait     <-chan struct{}
	done     func()
}

// errRailWriteAborted is persistAndBroadcastRail's internal signal for a not-yet-attempted
// write it is rolling back after an earlier one in the same batch failed — never returned
// to a caller.
var errRailWriteAborted = errors.New("rail write aborted by an earlier failure in the same batch")

// applyRailChangesLocked writes each changed entry's Pinned/RailPos into the live
// in-memory session and draws its write ticket, all still under m.mu, returning what
// persistAndBroadcastRail needs to persist and broadcast each one once unlocked. Must be
// called with m.mu held; entries naming a session no longer present (removed between the
// read and the write) are silently skipped.
func (m *Manager) applyRailChangesLocked(changed []railEntry) []railWrite {
	writes := make([]railWrite, 0, len(changed))
	for _, c := range changed {
		sess, ok := m.sessions[c.ID]
		if !ok {
			continue
		}
		prev := sess.Clone()
		sess.Pinned = c.Pinned
		sess.RailPos = c.RailPos
		row := sessionToRow(sess)
		snapshot := sess.Clone()
		wait, done := m.nextWriteTurnLocked(c.ID)
		writes = append(writes, railWrite{id: c.ID, sess: sess, prev: prev, row: row, snapshot: snapshot, wait: wait, done: done})
	}
	return writes
}

// persistAndBroadcastRail persists and broadcasts each of writes in turn — the tail
// shared by SetPinned/SetOrder once the in-memory mutation is done and the lock released:
// every session whose pinned or railPos changed is broadcast. Stops at
// the first persist failure and rolls that one back plus every write still queued behind
// it (a batch that stops partway must never leave memory claiming rail positions the
// DB never recorded) — writes already persisted and broadcast earlier in this call stand.
func (m *Manager) persistAndBroadcastRail(ctx context.Context, writes []railWrite) error {
	for i, w := range writes {
		row := w.row
		persist := func() error { return m.store.UpdateSession(ctx, row) }
		if err := m.finishWrite(w.id, w.sess, w.wait, w.done, persist, w.snapshot, cloneRestore(w.prev)); err != nil {
			for _, rest := range writes[i+1:] {
				_ = m.finishWrite(rest.id, rest.sess, rest.wait, rest.done, func() error { return errRailWriteAborted }, nil, cloneRestore(rest.prev))
			}
			return fmt.Errorf("persisting rail order for session %d: %w", w.id, err)
		}
	}
	return nil
}

// SetPinned applies kb:anchor/sessions.pin's pin mutation to id: pins or unpins it,
// renumbering whatever the invariant requires (railorder.go's applyPin), and persists +
// broadcasts every session whose pinned or railPos changed — nothing when id was
// already in the requested state. Returns ErrUnknownSession if id doesn't exist (the
// server maps it to 404 unknown_session).
func (m *Manager) SetPinned(ctx context.Context, id int64, pinned bool) error {
	m.mu.Lock()
	changed, err := applyPin(m.railEntriesLocked(), id, pinned)
	if err != nil {
		m.mu.Unlock()
		return err
	}
	writes := m.applyRailChangesLocked(changed)
	m.mu.Unlock()

	return m.persistAndBroadcastRail(ctx, writes)
}

// SetOrder applies kb:anchor/sessions.order's full rail-order mutation: the pure
// applyOrder computes the new (pinned, railPos) for every session, and this persists +
// broadcasts only the ones that changed. Returns ErrInvalidOrder for a malformed
// request (the server maps it to 400 invalid_request) — nothing changes on that path.
func (m *Manager) SetOrder(ctx context.Context, ids []int64, pinnedCount int) error {
	m.mu.Lock()
	changed, err := applyOrder(m.railEntriesLocked(), ids, pinnedCount)
	if err != nil {
		m.mu.Unlock()
		return err
	}
	writes := m.applyRailChangesLocked(changed)
	m.mu.Unlock()

	return m.persistAndBroadcastRail(ctx, writes)
}
