package session

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The launch-group lifecycle (kb:adr/launch-new-group-created-with-the-row-or-not-at-all): a
// group a launch inserted stays invisible until RecordLaunch announces it with its first
// member, and a failed launch deletes it without any client having been told.

func TestCreateLaunchGroup_IsInvisibleUntilTheLaunchIsRecorded(t *testing.T) {
	r := newFixtureRig(t)

	g, err := r.mgr.CreateLaunchGroup(r.ctx, " Hotfix ")

	require.NoError(t, err)
	assert.Equal(t, "Hotfix", g.Name)
	groups, _ := r.mgr.Groups()
	for _, visible := range groups {
		assert.NotEqual(t, g.ID, visible.ID, "a launch-held group is left out of the snapshot's list")
	}
	assert.Contains(t, r.groupRowIDs(), g.ID, "but its row exists")
	assert.True(t, r.mgr.GroupExists(g.ID), "CreateSession can name it")
	assert.Empty(t, r.log.kinds(), "nothing is broadcast")
}

func TestCreateLaunchGroup_RefusesAnInvalidName(t *testing.T) {
	r := newGroupsRig(t)

	_, err := r.mgr.CreateLaunchGroup(r.ctx, "   ")

	require.ErrorIs(t, err, ErrInvalidGroupName)
	assert.Empty(t, r.groupRows())
}

// TestRecordLaunch_AnnouncesAPendingGroupBeforeTheSessionUpsert is the contract's "groups
// before the upsert that joins": a client applying messages in order never sees a groupId it
// has no group for.
func TestRecordLaunch_AnnouncesAPendingGroupBeforeTheSessionUpsert(t *testing.T) {
	r := newFixtureRig(t)
	g, err := r.mgr.CreateLaunchGroup(r.ctx, "Hotfix")
	require.NoError(t, err)
	p := createParams(r.dir)
	p.RepoID = r.repoID
	p.GroupID = &g.ID
	sess, err := r.mgr.CreateSession(r.ctx, p)
	require.NoError(t, err)
	assert.Empty(t, r.log.kinds(), "CreateSession broadcasts nothing")

	_, err = r.mgr.RecordLaunch(r.ctx, sess.ID, "muster-9:@1", "%1")

	require.NoError(t, err)
	assert.Equal(t, []string{"groups", fmt.Sprintf("upsert:%d", sess.ID)}, r.log.kinds())
	announced := r.log.lastGroups(t)
	var names []string
	for _, ag := range announced.groups {
		names = append(names, ag.Name)
	}
	assert.Contains(t, names, "Hotfix")
	events := r.log.all()
	require.NotNil(t, events[1].groupID)
	assert.Equal(t, g.ID, *events[1].groupID)
	groups, _ := r.mgr.Groups()
	assert.Len(t, groups, 3, "the group is visible from now on")
	r.assertConsistent()
}

func TestDiscardLaunchGroup_BeforeTheAnnouncementDeletesSilently(t *testing.T) {
	r := newFixtureRig(t)
	namesBefore := r.sectionNames()
	g, err := r.mgr.CreateLaunchGroup(r.ctx, "Ghost")
	require.NoError(t, err)

	require.NoError(t, r.mgr.DiscardLaunchGroup(r.ctx, g.ID))

	assert.Empty(t, r.log.kinds(), "D10: no groups message ever names the group")
	assert.NotContains(t, r.groupRowIDs(), g.ID)
	assert.False(t, r.mgr.GroupExists(g.ID))
	assert.Equal(t, namesBefore, r.sectionNames())
	r.assertConsistent()
}

func TestDiscardLaunchGroup_AfterTheAnnouncementDeletesAndAnnouncesWhileEmpty(t *testing.T) {
	r := newFixtureRig(t)
	g, err := r.mgr.CreateLaunchGroup(r.ctx, "Late")
	require.NoError(t, err)
	p := createParams(r.dir)
	p.RepoID = r.repoID
	p.GroupID = &g.ID
	sess, err := r.mgr.CreateSession(r.ctx, p)
	require.NoError(t, err)
	_, err = r.mgr.RecordLaunch(r.ctx, sess.ID, "muster-9:@1", "%1")
	require.NoError(t, err)
	// The launch's later step failed: its session row is rolled back, then the group.
	require.NoError(t, r.mgr.Remove(r.ctx, sess.ID))
	r.log.reset()

	require.NoError(t, r.mgr.DiscardLaunchGroup(r.ctx, g.ID))

	assert.Equal(t, []string{"groups"}, r.log.kinds(), "clients were told of the group, so they are told it is gone")
	for _, ag := range r.log.lastGroups(t).groups {
		assert.NotEqual(t, "Late", ag.Name)
	}
	assert.NotContains(t, r.groupRowIDs(), g.ID)
	r.assertConsistent()
}

func TestDiscardLaunchGroup_LeavesAnAnnouncedGroupThatHasGainedAMember(t *testing.T) {
	r := newFixtureRig(t)
	g, err := r.mgr.CreateLaunchGroup(r.ctx, "Kept")
	require.NoError(t, err)
	p := createParams(r.dir)
	p.RepoID = r.repoID
	p.GroupID = &g.ID
	sess, err := r.mgr.CreateSession(r.ctx, p)
	require.NoError(t, err)
	_, err = r.mgr.RecordLaunch(r.ctx, sess.ID, "muster-9:@1", "%1")
	require.NoError(t, err)
	r.log.reset()

	require.NoError(t, r.mgr.DiscardLaunchGroup(r.ctx, g.ID))

	assert.Empty(t, r.log.kinds())
	assert.True(t, r.mgr.GroupExists(g.ID), "a session another request moved in is no longer the launch's to undo")
}

func TestDiscardLaunchGroup_UnknownGroupIsANoOp(t *testing.T) {
	r := newFixtureRig(t)

	require.NoError(t, r.mgr.DiscardLaunchGroup(r.ctx, 424242))

	assert.Empty(t, r.log.kinds())
}

// TestLaunchGroup_AnotherGroupChangeInBetweenNeverShowsThePendingGroup is the reason
// visibleGroupsLocked exists: while a launch holds a group back, another window's group
// change broadcasts the whole list, and that list must not name the held group.
func TestLaunchGroup_AnotherGroupChangeInBetweenNeverShowsThePendingGroup(t *testing.T) {
	r := newFixtureRig(t)
	held, err := r.mgr.CreateLaunchGroup(r.ctx, "Held")
	require.NoError(t, err)

	renamed := "A renamed"
	require.NoError(t, r.mgr.UpdateGroup(r.ctx, r.groupA, &renamed, nil))
	require.NoError(t, r.mgr.SetAllCollapsed(r.ctx, true))
	_, err = r.mgr.CreateGroup(r.ctx, "Other", nil)
	require.NoError(t, err)

	for _, e := range r.log.all() {
		require.Equal(t, "groups", e.kind)
		for _, g := range e.groups {
			assert.NotEqual(t, held.ID, g.ID, "the held group appeared in a groups broadcast")
		}
	}
	require.NoError(t, r.mgr.DiscardLaunchGroup(r.ctx, held.ID))
	r.assertConsistent()
}

// --- CreateSession with a group ---

func TestCreateSession_IntoAGroupLandsAtTheEndOfItsSection(t *testing.T) {
	r := newFixtureRig(t)
	before := r.snapshotAll()

	sess := r.launch(&r.groupA)

	require.NotNil(t, sess.GroupID)
	assert.Equal(t, r.groupA, *sess.GroupID)
	var highest int64
	for _, f := range before {
		highest = max(highest, f.RailPos)
	}
	assert.Greater(t, sess.RailPos, highest, "D16: the new session's railPos is the highest, so the end of its section")
	got, ok := r.mgr.Get(sess.ID)
	require.True(t, ok)
	assert.Equal(t, r.groupA, groupIDVal(got.GroupID))
	assert.Equal(t, []string{"11", "12", "13", ""}, r.members(r.groupA), "existing members keep their order and the new session (no fixture label) follows")
	r.assertConsistent()
}

func TestCreateSession_UnknownGroupIsRefusedAndCreatesNoRow(t *testing.T) {
	r := newFixtureRig(t)
	rowsBefore, err := r.st.ListSessions(r.ctx)
	require.NoError(t, err)
	missing := int64(424242)
	p := createParams(r.dir)
	p.RepoID = r.repoID
	p.GroupID = &missing

	_, err = r.mgr.CreateSession(r.ctx, p)

	require.ErrorIs(t, err, ErrUnknownGroup)
	rowsAfter, err := r.st.ListSessions(r.ctx)
	require.NoError(t, err)
	assert.Len(t, rowsAfter, len(rowsBefore))
	assert.Empty(t, r.log.kinds())
}
