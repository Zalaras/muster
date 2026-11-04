package store

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestSession_RestartColumnsDefaultAndRoundTrip: a new row holds no running version and no
// pending mark, UpdateSession writes both, and clearing them goes back to NULL and false
// without disturbing the row beside it.
func TestSession_RestartColumnsDefaultAndRoundTrip(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)
	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)
	other, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)

	for _, r := range []SessionRow{row, other} {
		fresh, getErr := st.GetSession(ctx, r.ID)
		require.NoError(t, getErr)
		assert.Nil(t, fresh.ClaudeVersion, "NULL until a status post reports one")
		assert.False(t, fresh.RestartPending)
	}

	row.ClaudeVersion = ptr("2.1.317")
	row.RestartPending = true
	require.NoError(t, st.UpdateSession(ctx, row))
	got, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.Equal(t, ptr("2.1.317"), got.ClaudeVersion)
	assert.True(t, got.RestartPending)

	untouched, err := st.GetSession(ctx, other.ID)
	require.NoError(t, err)
	assert.Nil(t, untouched.ClaudeVersion)
	assert.False(t, untouched.RestartPending)

	rows, err := st.ListSessions(ctx)
	require.NoError(t, err)
	byID := map[int64]SessionRow{}
	for _, r := range rows {
		byID[r.ID] = r
	}
	assert.Equal(t, ptr("2.1.317"), byID[row.ID].ClaudeVersion, "ListSessions reads the same columns")
	assert.True(t, byID[row.ID].RestartPending)

	got.ClaudeVersion, got.RestartPending = nil, false
	require.NoError(t, st.UpdateSession(ctx, got))
	cleared, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.Nil(t, cleared.ClaudeVersion)
	assert.False(t, cleared.RestartPending)
}
