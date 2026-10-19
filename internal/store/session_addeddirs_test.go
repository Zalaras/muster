package store

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// storedAddedDirs reads the raw added_dirs column, NULL as nil, so a test sees the storage
// format and not just the row type's view of it.
func storedAddedDirs(t *testing.T, st *Store, id int64) *string {
	t.Helper()
	var raw *string
	require.NoError(t, st.db.QueryRowContext(context.Background(), `SELECT added_dirs FROM session WHERE id = ?`, id).Scan(&raw))
	return raw
}

// TestSession_AddedDirsColumn is REQ-4's storage half: the list is a JSON array of paths in
// order, an empty or nil list is NULL (never "[]" or an empty string), a new row starts NULL,
// and each row reads back its own list.
func TestSession_AddedDirsColumn(t *testing.T) {
	cases := []struct {
		name    string
		dirs    []string
		wantRaw *string
		wantGot []string
	}{
		{name: "nil is NULL", dirs: nil, wantRaw: nil, wantGot: nil},
		{name: "empty is NULL", dirs: []string{}, wantRaw: nil, wantGot: nil},
		{name: "one path", dirs: []string{"/private/tmp/infra"}, wantRaw: ptr(`["/private/tmp/infra"]`), wantGot: []string{"/private/tmp/infra"}},
		{
			name: "order and awkward characters survive", dirs: []string{"/z/last", `/a/with "quote"`, "/b/with space/ünï"},
			wantRaw: ptr(`["/z/last","/a/with \"quote\"","/b/with space/ünï"]`), wantGot: []string{"/z/last", `/a/with "quote"`, "/b/with space/ünï"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			st := openTestStore(t)
			ctx := context.Background()
			row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: seedTestRepo(t, st), Directory: "/tmp/proj", PermissionMode: "default"})
			require.NoError(t, err)
			assert.Nil(t, row.AddedDirs, "a new row has no added directories")
			assert.Nil(t, storedAddedDirs(t, st, row.ID))

			row.AddedDirs = tc.dirs
			require.NoError(t, st.UpdateSession(ctx, row))

			assert.Equal(t, tc.wantRaw, storedAddedDirs(t, st, row.ID))
			got, err := st.GetSession(ctx, row.ID)
			require.NoError(t, err)
			assert.Equal(t, tc.wantGot, got.AddedDirs)
		})
	}
}

// TestSession_AddedDirsClearBackToNull: launch, resume and every death write the list empty
// over a held one, and the column goes back to NULL.
func TestSession_AddedDirsClearBackToNull(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: seedTestRepo(t, st), Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)
	row.AddedDirs = []string{"/private/tmp/infra"}
	require.NoError(t, st.UpdateSession(ctx, row))
	require.NotNil(t, storedAddedDirs(t, st, row.ID), "fixture: the column is set")

	row.AddedDirs = nil
	require.NoError(t, st.UpdateSession(ctx, row))

	assert.Nil(t, storedAddedDirs(t, st, row.ID))
	got, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.Nil(t, got.AddedDirs)
}

// TestListSessions_EachRowReadsItsOwnAddedDirs: the list query selects the same column as the
// single-row one, in the right scan position, and rows do not share a list.
func TestListSessions_EachRowReadsItsOwnAddedDirs(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)
	var ids []int64
	for _, dirs := range [][]string{{"/a", "/b"}, nil, {"/c"}} {
		row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
		require.NoError(t, err)
		row.AddedDirs = dirs
		require.NoError(t, st.UpdateSession(ctx, row))
		ids = append(ids, row.ID)
	}

	rows, err := st.ListSessions(ctx)

	require.NoError(t, err)
	byID := map[int64][]string{}
	for _, r := range rows {
		byID[r.ID] = r.AddedDirs
	}
	assert.Equal(t, map[int64][]string{ids[0]: {"/a", "/b"}, ids[1]: nil, ids[2]: {"/c"}}, byID)
}

// TestSession_CorruptAddedDirsColumnReadsAsNone: a column that is not a JSON array of strings
// (a hand edit, a truncated write) must not fail the load of every session; it reads as none
// and the row's other fields are intact.
func TestSession_CorruptAddedDirsColumnReadsAsNone(t *testing.T) {
	for _, corrupt := range []string{"not json", `{"a":1}`, `[1,2]`, ""} {
		t.Run(corrupt, func(t *testing.T) {
			st := openTestStore(t)
			ctx := context.Background()
			row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: seedTestRepo(t, st), Directory: "/tmp/proj", PermissionMode: "default"})
			require.NoError(t, err)
			_, err = st.db.ExecContext(ctx, `UPDATE session SET added_dirs = ? WHERE id = ?`, corrupt, row.ID)
			require.NoError(t, err)

			got, err := st.GetSession(ctx, row.ID)

			require.NoError(t, err)
			assert.Empty(t, got.AddedDirs)
			assert.Equal(t, "/tmp/proj", got.Directory)
			rows, err := st.ListSessions(ctx)
			require.NoError(t, err)
			require.Len(t, rows, 1)
		})
	}
}
