package store

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSessionRow_ScratchpadDirDefaultsNilAndRoundTrips(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)
	assert.Nil(t, row.ScratchpadDir)

	dir := "/private/tmp/claude-501/-p/sid/scratchpad"
	row.ScratchpadDir = &dir
	require.NoError(t, st.UpdateSession(ctx, row))

	got, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	require.NotNil(t, got.ScratchpadDir)
	assert.Equal(t, dir, *got.ScratchpadDir)
}
