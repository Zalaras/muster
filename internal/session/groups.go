package session

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/Zalaras/muster/internal/store"
)

// MaxGroupNameLen is a group name's length limit, in characters after trimming
// (kb:adr/rail-groups-daemon-rows-whole-list-broadcast).
const MaxGroupNameLen = 40

// Group is a named, ordered, collapsible rail section the developer made (kb:spec/rail).
// Membership is each Session's GroupID, never a field here. Pos is the section's place among
// every section, Ungrouped included.
type Group struct {
	ID        int64
	Name      string
	Pos       int64
	Collapsed bool
}

// UngroupedLayout is the Ungrouped section's place and collapsed flag
// (kb:adr/rail-ungrouped-is-section-zero-on-the-wire): the section that holds every session
// with no group has no row of its own.
type UngroupedLayout struct {
	Pos       int64
	Collapsed bool
}

// GroupRef is a request's optional target section: a nil *GroupRef means the request named
// none, a non-nil one with a nil ID names Ungrouped. PUT /api/sessions/order's groupId needs
// all three of absent, null and an id.
type GroupRef struct {
	ID *int64
}

// GroupDisposition is what DeleteGroup does with the group's sessions.
type GroupDisposition string

const (
	// DispositionUngroup moves the members to Ungrouped, keeping every railPos.
	DispositionUngroup GroupDisposition = "ungroup"
	// DispositionMove moves the members to the end of another group.
	DispositionMove GroupDisposition = "move"
	// DispositionRemove removes every member as DELETE /api/sessions/{id} does.
	DispositionRemove GroupDisposition = "remove"
)

// GroupDeleteResult is DeleteGroup's outcome: Deleted is false only when a remove left a
// member behind, and Sessions reports each member by outcome.
type GroupDeleteResult struct {
	Deleted  bool
	Sessions BatchResult
}

// Group errors the internal/server package branches on to pick an HTTP status.
var (
	// ErrUnknownGroup names a group id no group has (404 unknown_group); ErrUnknownTargetGroup
	// is the same for DeleteGroup's move target, so the response can say which one.
	ErrUnknownGroup       = errors.New("unknown group")
	ErrUnknownTargetGroup = errors.New("unknown target group")
	// ErrInvalidGroupName is a name that is not 1-40 characters after trimming.
	ErrInvalidGroupName = errors.New("invalid group name")
	// ErrInvalidGroupOrder is an order list that does not name every group and Ungrouped
	// exactly once.
	ErrInvalidGroupOrder = errors.New("invalid group order")
	// ErrUngroupedSection is a rename or delete aimed at the Ungrouped section.
	ErrUngroupedSection = errors.New("the ungrouped section cannot be renamed or deleted")
	// ErrInvalidDisposition is a DeleteGroup disposition the manager cannot carry out: an
	// unknown value, a move without a target, or a move onto the group being deleted.
	ErrInvalidDisposition = errors.New("invalid delete disposition")
)

// NormalizeGroupName trims raw and reports whether the result is a valid group name: 1 to
// MaxGroupNameLen characters, counted in runes like a session title.
func NormalizeGroupName(raw string) (string, bool) {
	name := strings.TrimSpace(raw)
	n := utf8.RuneCountInString(name)
	return name, n >= 1 && n <= MaxGroupNameLen
}

// groupIDVal and groupIDPtr convert between Session.GroupID (nil = Ungrouped) and the
// railEntry/section id (0 = Ungrouped).
func groupIDVal(p *int64) int64 {
	if p == nil {
		return ungroupedSection
	}
	return *p
}

func groupIDPtr(id int64) *int64 {
	if id == ungroupedSection {
		return nil
	}
	return &id
}

// Groups returns every group the dashboard may know of, sorted by pos, and the Ungrouped
// layout — the snapshot's groups and ungrouped. A group a launch has created but not yet
// recorded is left out.
func (m *Manager) Groups() ([]Group, UngroupedLayout) {
	m.groupsMu.Lock()
	defer m.groupsMu.Unlock()
	return m.visibleGroupsLocked(), m.ungrouped
}

// GroupExists reports whether id names a group.
func (m *Manager) GroupExists(id int64) bool {
	m.groupsMu.Lock()
	defer m.groupsMu.Unlock()
	_, ok := m.groups[id]
	return ok
}

// groupListLocked returns the groups in no particular order. Must be called with groupsMu held.
func (m *Manager) groupListLocked() []Group {
	out := make([]Group, 0, len(m.groups))
	for _, g := range m.groups {
		out = append(out, g)
	}
	return out
}

// visibleGroupsLocked is groupListLocked sorted by pos, minus the groups a launch holds
// back until its session is recorded (launchGroups). Must be called with groupsMu held.
func (m *Manager) visibleGroupsLocked() []Group {
	m.mu.Lock()
	out := make([]Group, 0, len(m.groups))
	for _, g := range m.groups {
		if _, pending := m.launchGroups[g.ID]; !pending {
			out = append(out, g)
		}
	}
	m.mu.Unlock()
	sort.Slice(out, func(i, j int) bool {
		if out[i].Pos != out[j].Pos {
			return out[i].Pos < out[j].Pos
		}
		return out[i].ID < out[j].ID
	})
	return out
}

// heldGroupIDsLocked returns, in ascending id order, the ids of the groups a launch holds
// back (launchGroups). Must be called with groupsMu held.
func (m *Manager) heldGroupIDsLocked() []int64 {
	m.mu.Lock()
	out := make([]int64, 0, len(m.launchGroups))
	for id := range m.launchGroups {
		out = append(out, id)
	}
	m.mu.Unlock()
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// emitGroupsLocked broadcasts the whole group list (kb:anchor/ws.groups). groupsMu is held
// across the write it announces and the broadcast, so two changes can never reach a client
// out of order. Must be called with groupsMu held.
func (m *Manager) emitGroupsLocked() {
	if m.onGroups != nil {
		m.onGroups(m.visibleGroupsLocked(), m.ungrouped)
	}
}

// setGroupsLocked adopts a persisted layout as the live state. Must be called with groupsMu held.
func (m *Manager) setGroupsLocked(groups []Group, ungrouped UngroupedLayout) {
	next := make(map[int64]Group, len(groups))
	for _, g := range groups {
		next[g.ID] = g
	}
	m.groups = next
	m.ungrouped = ungrouped
}

func toStoreLayout(groups []Group, ungrouped UngroupedLayout) store.GroupLayout {
	rows := make([]store.GroupRow, len(groups))
	for i, g := range groups {
		rows[i] = store.GroupRow{ID: g.ID, Name: g.Name, Pos: g.Pos, Collapsed: g.Collapsed}
	}
	return store.GroupLayout{Groups: rows, Ungrouped: store.UngroupedLayout{Pos: ungrouped.Pos, Collapsed: ungrouped.Collapsed}}
}

// loadGroups reads every group and the Ungrouped layout at startup. An absent Ungrouped
// layout reads as last place, expanded.
func (m *Manager) loadGroups(ctx context.Context) error {
	rows, err := m.store.ListGroups(ctx)
	if err != nil {
		return fmt.Errorf("loading groups: %w", err)
	}
	layout, found, err := m.store.ReadUngroupedLayout(ctx)
	if err != nil {
		return fmt.Errorf("loading ungrouped layout: %w", err)
	}

	groups := make([]Group, len(rows))
	last := int64(-1)
	for i, r := range rows {
		groups[i] = Group{ID: r.ID, Name: r.Name, Pos: r.Pos, Collapsed: r.Collapsed}
		last = max(last, r.Pos)
	}
	ungrouped := UngroupedLayout{Pos: layout.Pos, Collapsed: layout.Collapsed}
	if !found {
		ungrouped = UngroupedLayout{Pos: last + 1}
	}

	m.groupsMu.Lock()
	defer m.groupsMu.Unlock()
	m.setGroupsLocked(groups, ungrouped)
	return nil
}

// sectionIDLocked resolves a request's target section: nil is Ungrouped (0), anything else
// must name a group. Must be called with groupsMu held.
func (m *Manager) sectionIDLocked(ref *int64) (int64, error) {
	if ref == nil {
		return ungroupedSection, nil
	}
	if _, ok := m.groups[*ref]; !ok {
		return 0, ErrUnknownGroup
	}
	return *ref, nil
}

// insertGroupLocked inserts a group just above Ungrouped, renumbering every section 0..n,
// and adopts it without announcing it. Must be called with groupsMu held.
func (m *Manager) insertGroupLocked(ctx context.Context, name string) (Group, error) {
	pos := positionsOf(insertBeforeUngrouped(sectionOrder(m.groupListLocked(), m.ungrouped), newSection))
	others, ungrouped := withPositions(m.groupListLocked(), m.ungrouped, pos)
	row, err := m.store.InsertGroup(ctx, name, pos[newSection], toStoreLayout(others, ungrouped))
	if err != nil {
		return Group{}, fmt.Errorf("creating group: %w", err)
	}
	g := Group{ID: row.ID, Name: row.Name, Pos: row.Pos}
	m.setGroupsLocked(append(others, g), ungrouped)
	return g, nil
}

// deleteGroupRowLocked deletes group id's row, renumbering the sections that remain, and
// adopts the result without announcing it. Must be called with groupsMu held.
func (m *Manager) deleteGroupRowLocked(ctx context.Context, id int64) error {
	pos := positionsOf(removeSection(sectionOrder(m.groupListLocked(), m.ungrouped), id))
	rest := make([]Group, 0, len(m.groups))
	for _, g := range m.groups {
		if g.ID != id {
			rest = append(rest, g)
		}
	}
	rest, ungrouped := withPositions(rest, m.ungrouped, pos)
	if err := m.store.DeleteGroup(ctx, id, toStoreLayout(rest, ungrouped)); err != nil {
		return fmt.Errorf("deleting group %d: %w", id, err)
	}
	m.setGroupsLocked(rest, ungrouped)
	return nil
}

// saveGroupsLocked persists groups and ungrouped as the new layout and adopts them. Must be
// called with groupsMu held.
func (m *Manager) saveGroupsLocked(ctx context.Context, groups []Group, ungrouped UngroupedLayout) error {
	if err := m.store.SaveGroups(ctx, toStoreLayout(groups, ungrouped)); err != nil {
		return fmt.Errorf("saving groups: %w", err)
	}
	m.setGroupsLocked(groups, ungrouped)
	return nil
}

// memberIDsLocked returns the ids of group id's members in railPos order. Must be called
// with groupsMu held.
func (m *Manager) memberIDsLocked(id int64) []int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	var members []*Session
	for _, s := range m.sessions {
		if groupIDVal(s.GroupID) == id {
			members = append(members, s)
		}
	}
	sort.Slice(members, func(i, j int) bool { return members[i].RailPos < members[j].RailPos })
	ids := make([]int64, len(members))
	for i, s := range members {
		ids[i] = s.ID
	}
	return ids
}

// moveSessionsLocked moves ids into section target and persists + broadcasts every session
// whose group, pinned flag or railPos changed. fresh puts the movers at the end of the target
// section (applyGroupMove's firstPos); otherwise they keep their railPos. Must be called with
// groupsMu held.
func (m *Manager) moveSessionsLocked(ctx context.Context, ids []int64, target int64, fresh bool) error {
	m.mu.Lock()
	firstPos := int64(-1)
	if fresh {
		firstPos = m.nextRailPos
	}
	changed, err := applyGroupMove(m.railEntriesLocked(), ids, target, firstPos)
	if err != nil {
		m.mu.Unlock()
		return err
	}
	if fresh {
		m.nextRailPos += int64(len(ids))
	}
	writes := m.applyRailChangesLocked(changed)
	m.mu.Unlock()

	return m.persistAndBroadcastRail(ctx, writes)
}

// validateSessionIDs checks ids against the known sessions without changing anything.
func (m *Manager) validateSessionIDs(ids []int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return validateSessionIDs(m.railEntriesLocked(), ids)
}
