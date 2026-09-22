package store

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestInsertSession_UnreadDefaultsFalseLastPromptDefaultsNil covers plan
// rail-card-improvements Schema Changes: the migration's additive columns default to
// unread:0/last_prompt:NULL, and InsertSession never sets either explicitly.
func TestInsertSession_UnreadDefaultsFalseLastPromptDefaultsNil(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)

	assert.False(t, row.Unread)
	assert.Nil(t, row.LastPrompt)
}

// TestUpdateSession_UnreadAndLastPromptRoundTrip covers D10's store half: both new
// columns travel through UpdateSession/GetSession unchanged, in both directions
// (true/set -> false/nil too).
func TestUpdateSession_UnreadAndLastPromptRoundTrip(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)

	prompt := "fix the flaky retry and rerun the suite"
	row.Unread = true
	row.LastPrompt = &prompt
	require.NoError(t, st.UpdateSession(ctx, row))

	got, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.True(t, got.Unread)
	require.NotNil(t, got.LastPrompt)
	assert.Equal(t, prompt, *got.LastPrompt)

	got.Unread = false
	got.LastPrompt = nil
	require.NoError(t, st.UpdateSession(ctx, got))

	got2, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.False(t, got2.Unread)
	assert.Nil(t, got2.LastPrompt)
}
