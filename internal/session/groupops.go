package session

import (
	"context"
	"fmt"
)

// CreateGroup creates a group named name just above Ungrouped, optionally moving sessionIDs
// into it at the end of the new section in listed order (kb:anchor/groups.create).
// Broadcasts the groups message, then one sessionUpsert per moved session. Returns
// ErrInvalidGroupName, ErrUnknownSession for an unknown id and ErrInvalidOrder for a
// repeated one; nothing is created on those paths.
func (m *Manager) CreateGroup(ctx context.Context, name string, sessionIDs []int64) (Group, error) {
	name, ok := NormalizeGroupName(name)
	if !ok {
		return Group{}, ErrInvalidGroupName
	}
	if err := m.validateSessionIDs(sessionIDs); err != nil {
		return Group{}, err
	}

	m.groupsMu.Lock()
	defer m.groupsMu.Unlock()
	g, err := m.insertGroupLocked(ctx, name)
	if err != nil {
		return Group{}, err
	}
	m.emitGroupsLocked()
	if err := m.moveSessionsLocked(ctx, sessionIDs, g.ID, true); err != nil {
		return g, fmt.Errorf("moving sessions into group %d: %w", g.ID, err)
	}
	return g, nil
}

// UpdateGroup renames group id and/or sets its collapsed flag (kb:anchor/groups.update); id
// 0 is the Ungrouped section, which has no name to change (ErrUngroupedSection). Broadcasts
// the groups message only when something changed.
func (m *Manager) UpdateGroup(ctx context.Context, id int64, name *string, collapsed *bool) error {
	if name != nil {
		trimmed, ok := NormalizeGroupName(*name)
		if !ok {
			return ErrInvalidGroupName
		}
		name = &trimmed
	}

	m.groupsMu.Lock()
	defer m.groupsMu.Unlock()
	groups, ungrouped := m.groupListLocked(), m.ungrouped
	changed := false
	if id == ungroupedSection {
		if name != nil {
			return ErrUngroupedSection
		}
		if collapsed != nil && *collapsed != ungrouped.Collapsed {
			ungrouped.Collapsed, changed = *collapsed, true
		}
	} else {
		if _, ok := m.groups[id]; !ok {
			return ErrUnknownGroup
		}
		for i := range groups {
			if groups[i].ID == id {
				groups[i], changed = withFields(groups[i], name, collapsed)
			}
		}
	}
	if !changed {
		return nil
	}
	if err := m.saveGroupsLocked(ctx, groups, ungrouped); err != nil {
		return err
	}
	m.emitGroupsLocked()
	return nil
}

// withFields returns g with the given name and collapsed flag applied (nil leaves a field
// alone), and whether either differed from what g held.
func withFields(g Group, name *string, collapsed *bool) (Group, bool) {
	changed := false
	if name != nil && *name != g.Name {
		g.Name, changed = *name, true
	}
	if collapsed != nil && *collapsed != g.Collapsed {
		g.Collapsed, changed = *collapsed, true
	}
	return g, changed
}

// SetGroupsOrder applies PUT /api/groups/order (kb:anchor/groups.order): every section's pos
// becomes its index in order, which must list every group a client has been told of and 0
// (Ungrouped) exactly once (ErrInvalidGroupOrder). A group a launch holds back
// (launchGroups) is not one of them: it keeps its place just above Ungrouped until the launch
// announces it. Broadcasts the groups message only when a pos changed.
func (m *Manager) SetGroupsOrder(ctx context.Context, order []int64) error {
	m.groupsMu.Lock()
	defer m.groupsMu.Unlock()
	if err := validateSectionOrder(order, m.visibleGroupsLocked()); err != nil {
		return err
	}
	full := withHeldAboveUngrouped(order, m.heldGroupIDsLocked())
	groups, ungrouped := withPositions(m.groupListLocked(), m.ungrouped, positionsOf(full))
	if ungrouped.Pos == m.ungrouped.Pos && !groupPosChanged(groups, m.groups) {
		return nil
	}
	if err := m.saveGroupsLocked(ctx, groups, ungrouped); err != nil {
		return err
	}
	m.emitGroupsLocked()
	return nil
}

// groupPosChanged reports whether any group in next sits at a different pos than in current.
func groupPosChanged(next []Group, current map[int64]Group) bool {
	for _, g := range next {
		if current[g.ID].Pos != g.Pos {
			return true
		}
	}
	return false
}

// SetAllCollapsed sets every group's and the Ungrouped section's collapsed flag in one write
// (kb:anchor/groups.collapsed); the groups message goes out only when something changed.
func (m *Manager) SetAllCollapsed(ctx context.Context, collapsed bool) error {
	m.groupsMu.Lock()
	defer m.groupsMu.Unlock()
	groups, ungrouped := m.groupListLocked(), m.ungrouped
	changed := ungrouped.Collapsed != collapsed
	ungrouped.Collapsed = collapsed
	for i := range groups {
		changed = changed || groups[i].Collapsed != collapsed
		groups[i].Collapsed = collapsed
	}
	if !changed {
		return nil
	}
	if err := m.saveGroupsLocked(ctx, groups, ungrouped); err != nil {
		return err
	}
	m.emitGroupsLocked()
	return nil
}

// SetSessionsGroup applies PUT /api/sessions/group (kb:anchor/sessions.group): every listed
// session not already in groupID (nil is Ungrouped) joins the end of that section in listed
// order. Returns ErrUnknownSession for an unknown id, ErrInvalidOrder for a repeated one and
// ErrUnknownGroup; nothing changes on those paths.
func (m *Manager) SetSessionsGroup(ctx context.Context, ids []int64, groupID *int64) error {
	if err := m.validateSessionIDs(ids); err != nil {
		return err
	}
	m.groupsMu.Lock()
	defer m.groupsMu.Unlock()
	target, err := m.sectionIDLocked(groupID)
	if err != nil {
		return err
	}
	return m.moveSessionsLocked(ctx, ids, target, true)
}

// DeleteGroup deletes group id (kb:anchor/groups.delete) and does disposition to its
// members: ungroup keeps their railPos in Ungrouped, move puts them at the end of group to,
// remove removes each as Remove does (to is read only for move). Member upserts and
// sessionRemoveds go out first, then the groups message. A remove that leaves a member
// behind keeps the group, and reports Deleted false.
func (m *Manager) DeleteGroup(ctx context.Context, id int64, disposition GroupDisposition, to int64) (GroupDeleteResult, error) {
	if id == ungroupedSection {
		return GroupDeleteResult{}, ErrUngroupedSection
	}
	if disposition == DispositionRemove {
		return m.deleteGroupRemoving(ctx, id)
	}

	m.groupsMu.Lock()
	defer m.groupsMu.Unlock()
	if _, ok := m.groups[id]; !ok {
		return GroupDeleteResult{}, ErrUnknownGroup
	}
	target := ungroupedSection
	switch disposition {
	case DispositionUngroup:
	case DispositionMove:
		if to == id {
			return GroupDeleteResult{}, ErrInvalidDisposition
		}
		if _, ok := m.groups[to]; !ok {
			return GroupDeleteResult{}, ErrUnknownTargetGroup
		}
		target = to
	default:
		return GroupDeleteResult{}, ErrInvalidDisposition
	}

	members := m.memberIDsLocked(id)
	if err := m.moveSessionsLocked(ctx, members, target, disposition == DispositionMove); err != nil {
		return GroupDeleteResult{}, fmt.Errorf("moving members out of group %d: %w", id, err)
	}
	if err := m.deleteGroupRowLocked(ctx, id); err != nil {
		return GroupDeleteResult{}, err
	}
	m.emitGroupsLocked()
	return GroupDeleteResult{Deleted: true, Sessions: BatchResult{Done: members}}, nil
}

// deleteGroupRemoving is DeleteGroup's remove disposition. RemoveMany takes each member's
// per-session lock (kb:adr/actions-serialized-per-session), so groupsMu is not held across
// it: only the row's deletion at the end is a group write.
func (m *Manager) deleteGroupRemoving(ctx context.Context, id int64) (GroupDeleteResult, error) {
	m.groupsMu.Lock()
	if _, ok := m.groups[id]; !ok {
		m.groupsMu.Unlock()
		return GroupDeleteResult{}, ErrUnknownGroup
	}
	members := m.memberIDsLocked(id)
	m.groupsMu.Unlock()

	result, err := m.RemoveMany(ctx, members)
	if err != nil {
		return GroupDeleteResult{}, err
	}

	m.groupsMu.Lock()
	defer m.groupsMu.Unlock()
	if _, ok := m.groups[id]; !ok {
		return GroupDeleteResult{Deleted: true, Sessions: result}, nil
	}
	if len(m.memberIDsLocked(id)) > 0 {
		return GroupDeleteResult{Sessions: result}, nil
	}
	if err := m.deleteGroupRowLocked(ctx, id); err != nil {
		return GroupDeleteResult{Sessions: result}, err
	}
	m.emitGroupsLocked()
	return GroupDeleteResult{Deleted: true, Sessions: result}, nil
}
