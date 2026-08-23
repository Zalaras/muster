package store

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// seedTestRepo inserts a minimal repo row so InsertSession's repo_id foreign key has
// somewhere valid to point.
func seedTestRepo(t *testing.T, st *Store) int64 {
	t.Helper()
	repo, _, err := st.UpsertRepo(context.Background(), UpsertRepoParams{
		Path: "/tmp/proj", Name: "proj", Model: "sonnet", PermissionMode: "default",
	})
	require.NoError(t, err)
	return repo.ID
}

// TestInsertSession_SeedsStartedStateAndSeedSourceLatch covers REQ-1/REQ-2's row shape:
// state started, permission mode latch source "seed", alive, a placeholder tmux_target.
func TestInsertSession_SeedsStartedStateAndSeedSourceLatch(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)
	title := "My Session"
	branch := "main"
	model := "sonnet"

	row, err := st.InsertSession(ctx, InsertSessionParams{
		RepoID: repoID, Directory: "/tmp/proj", Branch: &branch, IsWorktree: false,
		Title: &title, PermissionMode: "default", Model: &model, FirstLaunchHere: true,
	})
	require.NoError(t, err)

	assert.Equal(t, "started", row.State)
	assert.Equal(t, "", row.TmuxTarget, "tmux_target is a placeholder until RecordLaunch")
	assert.Equal(t, "default", row.PermissionMode)
	assert.Equal(t, "seed", row.PermissionModeSource)
	assert.True(t, row.Alive)
	assert.True(t, row.FirstLaunchHere)
	assert.Nil(t, row.ClaudeSessionID)
	assert.Nil(t, row.TmuxPane)
	require.NotNil(t, row.Title)
	assert.Equal(t, "My Session", *row.Title)
	require.NotNil(t, row.Branch)
	assert.Equal(t, "main", *row.Branch)
	assert.Equal(t, 0, row.Compactions)
	assert.Nil(t, row.EndedAt)
}

func TestInsertSession_NilOptionalFieldsRoundTripAsNil(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	row, err := st.InsertSession(ctx, InsertSessionParams{
		RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default", FirstLaunchHere: false,
	})
	require.NoError(t, err)

	assert.Nil(t, row.Branch, "branch is null when not git")
	assert.Nil(t, row.Title)
	assert.Nil(t, row.Model)
	assert.False(t, row.FirstLaunchHere)

	// m3-gauges REQ-8: InsertSession is untouched — the new columns default NULL.
	assert.Nil(t, row.ModelDisplayName)
	assert.Nil(t, row.ContextUsedPct)
	assert.Nil(t, row.ContextTotalInputTokens)
	assert.Nil(t, row.ContextWindowSize)
}

func TestGetSession_ReturnsErrorForUnknownID(t *testing.T) {
	st := openTestStore(t)

	_, err := st.GetSession(context.Background(), 999)

	assert.Error(t, err)
}

// TestUpdateSession_RoundTripsEveryField covers the whole-object update path the
// manager relies on for its every-mutation persistence guarantee (docs/protocol.md
// §5.3's "whole-object sessionUpsert" design).
func TestUpdateSession_RoundTripsEveryField(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	row, err := st.InsertSession(ctx, InsertSessionParams{
		RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default", FirstLaunchHere: true,
	})
	require.NoError(t, err)

	claudeID := "claude-1"
	pane := "%12"
	title := "Renamed"
	branch := "feature/x"
	model := "haiku"
	modelDisplayName := "Haiku 4.5"
	attentionReason := "permission"
	attentionSince := time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)
	failureError := "server_error"
	failureMessage := "boom"
	lastActivity := "did the thing"
	endedAt := time.Date(2026, 8, 22, 13, 0, 0, 0, time.UTC)
	contextUsedPct := 42.0
	contextTotalInputTokens := int64(84000)
	contextWindowSize := int64(200000)

	row.TmuxTarget = "muster:@4"
	row.TmuxPane = &pane
	row.ClaudeSessionID = &claudeID
	row.Title = &title
	row.Branch = &branch
	row.IsWorktree = true
	row.State = "needs_input"
	row.StateSince = time.Date(2026, 8, 22, 11, 0, 0, 0, time.UTC)
	row.PermissionMode = "plan"
	row.PermissionModeSource = "hook"
	row.Model = &model
	row.ModelDisplayName = &modelDisplayName
	row.Compactions = 4
	row.AttentionReason = &attentionReason
	row.AttentionSince = &attentionSince
	row.FailureError = &failureError
	row.FailureMessage = &failureMessage
	row.LastActivity = &lastActivity
	row.Alive = false
	row.EndedAt = &endedAt
	row.FirstLaunchHere = false
	row.ContextUsedPct = &contextUsedPct
	row.ContextTotalInputTokens = &contextTotalInputTokens
	row.ContextWindowSize = &contextWindowSize

	require.NoError(t, st.UpdateSession(ctx, row))

	got, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)

	assert.Equal(t, "muster:@4", got.TmuxTarget)
	require.NotNil(t, got.TmuxPane)
	assert.Equal(t, "%12", *got.TmuxPane)
	require.NotNil(t, got.ClaudeSessionID)
	assert.Equal(t, "claude-1", *got.ClaudeSessionID)
	require.NotNil(t, got.Title)
	assert.Equal(t, "Renamed", *got.Title)
	require.NotNil(t, got.Branch)
	assert.Equal(t, "feature/x", *got.Branch)
	assert.True(t, got.IsWorktree)
	assert.Equal(t, "needs_input", got.State)
	assert.True(t, got.StateSince.Equal(row.StateSince))
	assert.Equal(t, "plan", got.PermissionMode)
	assert.Equal(t, "hook", got.PermissionModeSource)
	require.NotNil(t, got.Model)
	assert.Equal(t, "haiku", *got.Model)
	require.NotNil(t, got.ModelDisplayName)
	assert.Equal(t, "Haiku 4.5", *got.ModelDisplayName)
	assert.Equal(t, 4, got.Compactions)
	require.NotNil(t, got.ContextUsedPct)
	assert.Equal(t, 42.0, *got.ContextUsedPct)
	require.NotNil(t, got.ContextTotalInputTokens)
	assert.Equal(t, int64(84000), *got.ContextTotalInputTokens)
	require.NotNil(t, got.ContextWindowSize)
	assert.Equal(t, int64(200000), *got.ContextWindowSize)
	require.NotNil(t, got.AttentionReason)
	assert.Equal(t, "permission", *got.AttentionReason)
	require.NotNil(t, got.AttentionSince)
	assert.True(t, got.AttentionSince.Equal(attentionSince))
	require.NotNil(t, got.FailureError)
	assert.Equal(t, "server_error", *got.FailureError)
	require.NotNil(t, got.FailureMessage)
	assert.Equal(t, "boom", *got.FailureMessage)
	require.NotNil(t, got.LastActivity)
	assert.Equal(t, "did the thing", *got.LastActivity)
	assert.False(t, got.Alive)
	require.NotNil(t, got.EndedAt)
	assert.True(t, got.EndedAt.Equal(endedAt))
	assert.False(t, got.FirstLaunchHere)
}

// TestUpdateSession_CanClearPointerFieldsBackToNil covers a clear-rebind's reset (no
// stale attention/failure survives a rebind that never touches those fields again).
func TestUpdateSession_CanClearPointerFieldsBackToNil(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)

	reason := "idle"
	row.AttentionReason = &reason
	row.AttentionSince = ptr(time.Now().UTC())
	require.NoError(t, st.UpdateSession(ctx, row))

	row.AttentionReason = nil
	row.AttentionSince = nil
	require.NoError(t, st.UpdateSession(ctx, row))

	got, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.Nil(t, got.AttentionReason)
	assert.Nil(t, got.AttentionSince)
}

// TestUpdateSession_ContextFieldsRoundTripAllOrNothingIncludingBackToNil covers INV-2's
// storage-level twin: the three context columns travel all-non-nil (a real status post)
// or all-nil (unknown / REQ-9's /clear reset) — this locks in both directions of that
// round trip, not just the fill direction TestUpdateSession_RoundTripsEveryField covers.
func TestUpdateSession_ContextFieldsRoundTripAllOrNothingIncludingBackToNil(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)

	usedPct := 84.0
	totalInputTokens := int64(168000)
	windowSize := int64(200000)
	row.ContextUsedPct = &usedPct
	row.ContextTotalInputTokens = &totalInputTokens
	row.ContextWindowSize = &windowSize
	require.NoError(t, st.UpdateSession(ctx, row))

	filled, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	require.NotNil(t, filled.ContextUsedPct)
	assert.Equal(t, 84.0, *filled.ContextUsedPct)

	// REQ-9: a /clear resets context back to all-nil — the persisted row must be able to
	// travel back to unknown, not just forward to filled.
	row.ContextUsedPct = nil
	row.ContextTotalInputTokens = nil
	row.ContextWindowSize = nil
	require.NoError(t, st.UpdateSession(ctx, row))

	cleared, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.Nil(t, cleared.ContextUsedPct)
	assert.Nil(t, cleared.ContextTotalInputTokens)
	assert.Nil(t, cleared.ContextWindowSize)
}

func TestDeleteSession_RemovesTheRow(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)

	require.NoError(t, st.DeleteSession(ctx, row.ID))

	_, err = st.GetSession(ctx, row.ID)
	assert.Error(t, err)
}

func TestListSessions_ReturnsEveryRow(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	_, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj-a", PermissionMode: "default"})
	require.NoError(t, err)
	_, err = st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj-b", PermissionMode: "plan"})
	require.NoError(t, err)

	rows, err := st.ListSessions(ctx)
	require.NoError(t, err)
	assert.Len(t, rows, 2)
}

func TestListSessions_EmptyStoreReturnsNoRowsNoError(t *testing.T) {
	st := openTestStore(t)

	rows, err := st.ListSessions(context.Background())
	require.NoError(t, err)
	assert.Empty(t, rows)
}
