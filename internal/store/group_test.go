package store

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// groupsByID indexes ListGroups' unordered result so a test asserts rows by id.
func groupsByID(t *testing.T, st *Store) map[int64]GroupRow {
	t.Helper()
	rows, err := st.ListGroups(context.Background())
	require.NoError(t, err)
	out := make(map[int64]GroupRow, len(rows))
	for _, r := range rows {
		out[r.ID] = r
	}
	return out
}

func TestListGroups_EmptyStoreHasNoGroups(t *testing.T) {
	st := openTestStore(t)

	rows, err := st.ListGroups(context.Background())

	require.NoError(t, err)
	assert.Empty(t, rows)
}

func TestReadUngroupedLayout(t *testing.T) {
	tests := []struct {
		name      string
		stored    *string // nil = the kv key was never written
		wantFound bool
		want      UngroupedLayout
	}{
		{"never written reads as absent", nil, false, UngroupedLayout{}},
		{"a written layout reads back", ptr(`{"pos":3,"collapsed":true}`), true, UngroupedLayout{Pos: 3, Collapsed: true}},
		{"a corrupt value reads as absent, never an error", ptr(`{not json`), false, UngroupedLayout{}},
		{"an empty object reads as the zero layout, present", ptr(`{}`), true, UngroupedLayout{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openTestStore(t)
			ctx := context.Background()
			if tt.stored != nil {
				require.NoError(t, st.KVSet(ctx, ungroupedLayoutKey, *tt.stored))
			}

			got, found, err := st.ReadUngroupedLayout(ctx)

			require.NoError(t, err)
			assert.Equal(t, tt.wantFound, found)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestInsertGroup_ReturnsTheRowAndWritesTheDisplacedLayoutTogether(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	first, err := st.InsertGroup(ctx, "First", 0, GroupLayout{Ungrouped: UngroupedLayout{Pos: 1}})
	require.NoError(t, err)

	// The second group lands at pos 1; the layout it carries shifts First stays put and
	// Ungrouped moves down, all in the same transaction as the insert.
	second, err := st.InsertGroup(ctx, "Second", 1, GroupLayout{
		Groups:    []GroupRow{{ID: first.ID, Name: "First", Pos: 0}},
		Ungrouped: UngroupedLayout{Pos: 2, Collapsed: true},
	})
	require.NoError(t, err)

	assert.Equal(t, "Second", second.Name)
	assert.Equal(t, int64(1), second.Pos)
	assert.False(t, second.Collapsed)
	assert.NotEqual(t, first.ID, second.ID)
	rows := groupsByID(t, st)
	require.Len(t, rows, 2)
	assert.Equal(t, GroupRow{ID: first.ID, Name: "First", Pos: 0}, rows[first.ID])
	assert.Equal(t, GroupRow{ID: second.ID, Name: "Second", Pos: 1}, rows[second.ID])
	layout, found, err := st.ReadUngroupedLayout(ctx)
	require.NoError(t, err)
	assert.True(t, found)
	assert.Equal(t, UngroupedLayout{Pos: 2, Collapsed: true}, layout)
}

func TestInsertGroup_DisplacedLayoutRewritesOtherGroupsPositions(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	a, err := st.InsertGroup(ctx, "A", 0, GroupLayout{Ungrouped: UngroupedLayout{Pos: 1}})
	require.NoError(t, err)

	// Inserting above A: A moves from 0 to 1, Ungrouped from 1 to 2.
	b, err := st.InsertGroup(ctx, "B", 0, GroupLayout{
		Groups:    []GroupRow{{ID: a.ID, Name: "A", Pos: 1}},
		Ungrouped: UngroupedLayout{Pos: 2},
	})
	require.NoError(t, err)

	rows := groupsByID(t, st)
	assert.Equal(t, int64(1), rows[a.ID].Pos)
	assert.Equal(t, int64(0), rows[b.ID].Pos)
}

// TestInsertGroup_RollsTheRowBackWhenTheLayoutWriteFails is the atomicity claim: a crash
// between the row and the layout it displaced must never leave two sections on one place,
// so a failing layout write takes the inserted row with it. The kv table is dropped to make
// the Ungrouped blob's write fail after the row's insert has already run.
func TestInsertGroup_RollsTheRowBackWhenTheLayoutWriteFails(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	_, err := st.db.ExecContext(ctx, `DROP TABLE kv`)
	require.NoError(t, err)

	_, err = st.InsertGroup(ctx, "Ghost", 0, GroupLayout{})

	require.Error(t, err)
	assert.Empty(t, groupsByID(t, st), "the group row must not survive a failed layout write")
}

func TestSaveGroups_RewritesNameCollapsedPosAndUngroupedInOneWrite(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	a, err := st.InsertGroup(ctx, "A", 0, GroupLayout{Ungrouped: UngroupedLayout{Pos: 1}})
	require.NoError(t, err)
	b, err := st.InsertGroup(ctx, "B", 1, GroupLayout{Groups: []GroupRow{{ID: a.ID, Name: "A", Pos: 0}}, Ungrouped: UngroupedLayout{Pos: 2}})
	require.NoError(t, err)

	err = st.SaveGroups(ctx, GroupLayout{
		Groups: []GroupRow{
			{ID: a.ID, Name: "A renamed", Pos: 2, Collapsed: true},
			{ID: b.ID, Name: "B", Pos: 0},
		},
		Ungrouped: UngroupedLayout{Pos: 1, Collapsed: true},
	})
	require.NoError(t, err)

	rows := groupsByID(t, st)
	assert.Equal(t, GroupRow{ID: a.ID, Name: "A renamed", Pos: 2, Collapsed: true}, rows[a.ID])
	assert.Equal(t, GroupRow{ID: b.ID, Name: "B", Pos: 0}, rows[b.ID])
	layout, _, err := st.ReadUngroupedLayout(ctx)
	require.NoError(t, err)
	assert.Equal(t, UngroupedLayout{Pos: 1, Collapsed: true}, layout)
}

func TestSaveGroups_LeavesGroupsItDoesNotNameAlone(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	a, err := st.InsertGroup(ctx, "A", 0, GroupLayout{Ungrouped: UngroupedLayout{Pos: 1}})
	require.NoError(t, err)
	b, err := st.InsertGroup(ctx, "B", 1, GroupLayout{Groups: []GroupRow{{ID: a.ID, Name: "A", Pos: 0}}, Ungrouped: UngroupedLayout{Pos: 2}})
	require.NoError(t, err)

	require.NoError(t, st.SaveGroups(ctx, GroupLayout{Groups: []GroupRow{{ID: a.ID, Name: "A2", Pos: 0}}, Ungrouped: UngroupedLayout{Pos: 2}}))

	assert.Equal(t, GroupRow{ID: b.ID, Name: "B", Pos: 1}, groupsByID(t, st)[b.ID], "an unnamed group keeps every column")
}

func TestDeleteGroup_RemovesTheRowAndRewritesTheRemainingLayout(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	a, err := st.InsertGroup(ctx, "A", 0, GroupLayout{Ungrouped: UngroupedLayout{Pos: 1}})
	require.NoError(t, err)
	b, err := st.InsertGroup(ctx, "B", 1, GroupLayout{Groups: []GroupRow{{ID: a.ID, Name: "A", Pos: 0}}, Ungrouped: UngroupedLayout{Pos: 2}})
	require.NoError(t, err)

	// Deleting A closes the gap: B to 0, Ungrouped to 1.
	require.NoError(t, st.DeleteGroup(ctx, a.ID, GroupLayout{
		Groups:    []GroupRow{{ID: b.ID, Name: "B", Pos: 0}},
		Ungrouped: UngroupedLayout{Pos: 1},
	}))

	rows := groupsByID(t, st)
	require.Len(t, rows, 1)
	assert.Equal(t, int64(0), rows[b.ID].Pos)
	layout, _, err := st.ReadUngroupedLayout(ctx)
	require.NoError(t, err)
	assert.Equal(t, int64(1), layout.Pos)
}

// TestSessionGroupID_RoundTripsThroughInsertUpdateAndGet covers the column this plan adds to
// the session row: set at insert, changed and cleared through UpdateSession, absent by default.
func TestSessionGroupID_RoundTripsThroughInsertUpdateAndGet(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)
	g1, err := st.InsertGroup(ctx, "One", 0, GroupLayout{Ungrouped: UngroupedLayout{Pos: 1}})
	require.NoError(t, err)
	g2, err := st.InsertGroup(ctx, "Two", 1, GroupLayout{Groups: []GroupRow{{ID: g1.ID, Name: "One", Pos: 0}}, Ungrouped: UngroupedLayout{Pos: 2}})
	require.NoError(t, err)

	plain, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/p", PermissionMode: "default"})
	require.NoError(t, err)
	grouped, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/p", PermissionMode: "default", GroupID: &g1.ID})
	require.NoError(t, err)

	assert.Nil(t, plain.GroupID, "a session inserted with no group is Ungrouped")
	require.NotNil(t, grouped.GroupID)
	assert.Equal(t, g1.ID, *grouped.GroupID)

	grouped.GroupID = &g2.ID
	require.NoError(t, st.UpdateSession(ctx, grouped))
	got, err := st.GetSession(ctx, grouped.ID)
	require.NoError(t, err)
	require.NotNil(t, got.GroupID)
	assert.Equal(t, g2.ID, *got.GroupID)

	got.GroupID = nil
	require.NoError(t, st.UpdateSession(ctx, got))
	got, err = st.GetSession(ctx, grouped.ID)
	require.NoError(t, err)
	assert.Nil(t, got.GroupID)

	list, err := st.ListSessions(ctx)
	require.NoError(t, err)
	for _, r := range list {
		assert.Nil(t, r.GroupID, "ListSessions scans the column too")
	}
}
