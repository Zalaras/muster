package session

import "context"

// CreateLaunchGroup inserts a group for a launch that has not yet spawned its session
// (kb:adr/launch-new-group-created-with-the-row-or-not-at-all). The group stays out of
// every snapshot and groups broadcast until RecordLaunch announces it with its first
// member, and DiscardLaunchGroup deletes it again if the launch fails, so a refused launch
// leaves no group and tells no client of one.
func (m *Manager) CreateLaunchGroup(ctx context.Context, name string) (Group, error) {
	name, ok := NormalizeGroupName(name)
	if !ok {
		return Group{}, ErrInvalidGroupName
	}
	m.groupsMu.Lock()
	defer m.groupsMu.Unlock()
	g, err := m.insertGroupLocked(ctx, name)
	if err != nil {
		return Group{}, err
	}
	m.mu.Lock()
	m.launchGroups[g.ID] = struct{}{}
	m.mu.Unlock()
	return g, nil
}

// DiscardLaunchGroup deletes a group CreateLaunchGroup made once its launch failed, after the
// launch has rolled its session row back. A group still held back is deleted silently: no
// client was ever told of it. One RecordLaunch already announced is deleted and announced
// gone, but only while it is empty — a session another request moved in is no longer the
// launch's to undo.
func (m *Manager) DiscardLaunchGroup(ctx context.Context, id int64) error {
	m.groupsMu.Lock()
	defer m.groupsMu.Unlock()
	m.mu.Lock()
	_, pending := m.launchGroups[id]
	delete(m.launchGroups, id)
	m.mu.Unlock()
	if pending {
		return m.deleteGroupRowLocked(ctx, id)
	}
	if _, ok := m.groups[id]; !ok || len(m.memberIDsLocked(id)) > 0 {
		return nil
	}
	if err := m.deleteGroupRowLocked(ctx, id); err != nil {
		return err
	}
	m.emitGroupsLocked()
	return nil
}

// announcePendingLaunchGroup releases the launch-held group session id was created in, if
// any, and broadcasts the groups message that makes it visible — RecordLaunch's step before
// the session's first upsert.
func (m *Manager) announcePendingLaunchGroup(id int64) {
	m.mu.Lock()
	var gid int64
	if sess, ok := m.sessions[id]; ok {
		gid = groupIDVal(sess.GroupID)
	}
	_, pending := m.launchGroups[gid]
	m.mu.Unlock()
	if !pending {
		return
	}

	m.groupsMu.Lock()
	defer m.groupsMu.Unlock()
	m.mu.Lock()
	delete(m.launchGroups, gid)
	m.mu.Unlock()
	m.emitGroupsLocked()
}
