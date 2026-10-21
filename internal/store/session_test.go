package store

import (
	"context"
	"strings"
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
	assert.Empty(t, row.TmuxTarget, "tmux_target is a placeholder until RecordLaunch")
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

// TestInsertSession_RailPosRoundTripsPinnedDefaultsFalse covers plan order-sidebar's
// Schema Changes note: InsertSessionParams.RailPos is written verbatim, and pinned
// always starts false regardless of RailPos (a caller has no way to seed pinned:true at
// insert time — REQ-1 says every new session starts pinned:false).
func TestInsertSession_RailPosRoundTripsPinnedDefaultsFalse(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	row, err := st.InsertSession(ctx, InsertSessionParams{
		RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default", RailPos: 7,
	})
	require.NoError(t, err)

	assert.Equal(t, int64(7), row.RailPos)
	assert.False(t, row.Pinned)
}

// TestUpdateSession_PinnedAndRailPosRoundTrip covers the manager's SetPinned/SetOrder
// persistence path directly against the store: both fields travel through
// UpdateSession/GetSession unchanged, in both directions (pinned true->false too).
func TestUpdateSession_PinnedAndRailPosRoundTrip(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)

	row.Pinned = true
	row.RailPos = 3
	require.NoError(t, st.UpdateSession(ctx, row))

	got, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.True(t, got.Pinned)
	assert.Equal(t, int64(3), got.RailPos)

	got.Pinned = false
	got.RailPos = 0
	require.NoError(t, st.UpdateSession(ctx, got))

	got2, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.False(t, got2.Pinned)
	assert.Equal(t, int64(0), got2.RailPos)
}

// TestInsertSession_AllocatesAboveHighestExistingIDAndWritesWatermark covers D1: a store
// seeded with ids 1..7 allocates 8 for the next InsertSession and persists the watermark
// (kv['session.id_watermark']) so a later delete can never let that id come back.
func TestInsertSession_AllocatesAboveHighestExistingIDAndWritesWatermark(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	for range 7 {
		_, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
		require.NoError(t, err)
	}

	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)
	assert.Equal(t, int64(8), row.ID)

	watermark, ok, err := st.KVGet(ctx, "session.id_watermark")
	require.NoError(t, err)
	require.True(t, ok, "REQ-1: InsertSession must persist the id watermark")
	assert.Equal(t, "8", watermark)
}

// TestInsertSession_MinIDFloorsAllocationEvenAboveTheExistingMax covers REQ-1's MinID
// semantics directly at the store level: the caller-supplied floor (from REQ-7's
// MaxSessionID probe) can exceed every row already in the table, and the new row's id
// must land strictly above it, not just above the table's own max(id).
func TestInsertSession_MinIDFloorsAllocationEvenAboveTheExistingMax(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	_, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)

	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default", MinID: 50})
	require.NoError(t, err)
	assert.Equal(t, int64(51), row.ID)

	watermark, ok, err := st.KVGet(ctx, "session.id_watermark")
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, "51", watermark)
}

func TestGetSession_ReturnsErrorForUnknownID(t *testing.T) {
	st := openTestStore(t)

	_, err := st.GetSession(context.Background(), 999)

	assert.Error(t, err)
}

// TestUpdateSession_RoundTripsEveryField covers the whole-object update path the
// manager relies on for its every-mutation persistence guarantee
// (kb:anchor/ws.session's "whole-object sessionUpsert" design).
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
	pendingResume := "claude-pending"
	row.PendingResumeClaudeSessionID = &pendingResume
	claudeDir := "/private/tmp/proj/.claude/worktrees/probewt"
	row.ClaudeDir = &claudeDir
	row.AddedDirs = []string{"/private/tmp/infra", "/private/tmp/with space/docs"}
	row.EffortKnown = true
	row.EffortLevel = ptr("high")
	row.EffortRequested = ptr("max")
	row.EffortWarningRequested = ptr("max")
	row.EffortWarningActual = ptr("high")
	row.EffortWarningModel = ptr("Opus 4.5")

	require.NoError(t, st.UpdateSession(ctx, row))

	got, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)

	require.NotNil(t, got.PendingResumeClaudeSessionID)
	assert.Equal(t, "claude-pending", *got.PendingResumeClaudeSessionID)
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
	require.NotNil(t, got.ClaudeDir)
	assert.Equal(t, claudeDir, *got.ClaudeDir)
	assert.Equal(t, []string{"/private/tmp/infra", "/private/tmp/with space/docs"}, got.AddedDirs)
	assert.True(t, got.EffortKnown)
	assert.Equal(t, ptr("high"), got.EffortLevel)
	assert.Equal(t, ptr("max"), got.EffortRequested)
	assert.Equal(t, ptr("max"), got.EffortWarningRequested)
	assert.Equal(t, ptr("high"), got.EffortWarningActual)
	assert.Equal(t, ptr("Opus 4.5"), got.EffortWarningModel)

	// REQ-7: launch and resume clear the column back to NULL, not to an empty string.
	row.ClaudeDir = nil
	require.NoError(t, st.UpdateSession(ctx, row))
	cleared, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.Nil(t, cleared.ClaudeDir)
}

// TestInsertSession_PendingResumeClaudeSessionIDRoundTrips covers the persisted
// pending-resume hold (kb:adr/launch-resume-pending-hold-persisted): a non-nil id written
// at insert reads back, a nil one stays NULL, and a whole-row update can clear it.
func TestInsertSession_PendingResumeClaudeSessionIDRoundTrips(t *testing.T) {
	tests := []struct {
		name string
		in   *string
	}{
		{name: "non-nil id is stored", in: ptr("claude-pending")},
		{name: "nil stays nil", in: nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openTestStore(t)
			ctx := context.Background()
			repoID := seedTestRepo(t, st)

			row, err := st.InsertSession(ctx, InsertSessionParams{
				RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default",
				PendingResumeClaudeSessionID: tt.in,
			})
			require.NoError(t, err)
			assert.Equal(t, tt.in, row.PendingResumeClaudeSessionID)

			got, err := st.GetSession(ctx, row.ID)
			require.NoError(t, err)
			assert.Equal(t, tt.in, got.PendingResumeClaudeSessionID)

			got.PendingResumeClaudeSessionID = nil
			require.NoError(t, st.UpdateSession(ctx, got))
			cleared, err := st.GetSession(ctx, row.ID)
			require.NoError(t, err)
			assert.Nil(t, cleared.PendingResumeClaudeSessionID)
		})
	}
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

// TestInsertSession_TitleOverrideDefaultsNil covers plan ui-text-and-focus's Schema
// Changes note: InsertSessionParams carries no TitleOverride field at all — a new session
// never starts with an override (REQ-9's "no default, no backfill" is trivially true for
// a freshly inserted row too).
func TestInsertSession_TitleOverrideDefaultsNil(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)

	assert.Nil(t, row.TitleOverride)
}

// TestUpdateSession_TitleOverrideRoundTrip covers D9: title_override survives insert ->
// update -> load, in both directions (setting it, and clearing it back to nil — REQ-10's
// "clear the override" path persists a NULL, not an empty string).
func TestUpdateSession_TitleOverrideRoundTrip(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)
	require.Nil(t, row.TitleOverride, "sanity: no override at insert time")

	override := "User's Rename"
	row.TitleOverride = &override
	require.NoError(t, st.UpdateSession(ctx, row))

	got, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	require.NotNil(t, got.TitleOverride)
	assert.Equal(t, "User's Rename", *got.TitleOverride)

	got.TitleOverride = nil
	require.NoError(t, st.UpdateSession(ctx, got))

	cleared, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.Nil(t, cleared.TitleOverride, "clearing the override must persist a NULL, not survive as a stale value")
}

// TestSession_NoteColumnDefaultsNilAndRoundTripsTextByteForByte covers REQ-1/D5 at the
// store: a fresh row has a NULL note; whitespace, newlines, frontmatter and a multi-megabyte
// text come back exactly; a row with no note scans as nil, never as an empty string; and one
// session's note write never touches another's.
func TestSession_NoteColumnDefaultsNilAndRoundTripsTextByteForByte(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)
	insert := func() SessionRow {
		row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
		require.NoError(t, err)
		return row
	}
	row, other := insert(), insert()
	require.Nil(t, row.Note, "a fresh row has no note")

	otherText := "other session's note"
	other.Note = &otherText
	require.NoError(t, st.UpdateSession(ctx, other))

	texts := []string{
		"plain",
		"  leading and trailing \n\t ",
		"---\ntitle: x\n---\n\n```mermaid\ngraph TD\n```\n",
		"a\r\nb\r\n",
		"naïve ✓ 日本語",
		strings.Repeat("a line of the developer's own text\n", 100_000),
	}
	for _, text := range texts {
		row.Note = &text
		require.NoError(t, st.UpdateSession(ctx, row))

		got, err := st.GetSession(ctx, row.ID)
		require.NoError(t, err)
		require.NotNil(t, got.Note)
		assert.Equal(t, text, *got.Note)
	}

	row.Note = nil
	require.NoError(t, st.UpdateSession(ctx, row))
	cleared, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.Nil(t, cleared.Note, "clearing persists a NULL, not an empty string")

	untouched, err := st.GetSession(ctx, other.ID)
	require.NoError(t, err)
	require.NotNil(t, untouched.Note)
	assert.Equal(t, otherText, *untouched.Note)

	rows, err := st.ListSessions(ctx)
	require.NoError(t, err)
	notes := map[int64]*string{}
	for _, r := range rows {
		notes[r.ID] = r.Note
	}
	assert.Nil(t, notes[row.ID])
	assert.Equal(t, &otherText, notes[other.ID], "ListSessions scans the note too")
}

// TestInsertSession_ReaderFieldsDefaultNilAndFalse covers plan markdown-viewing's Schema
// Changes note: InsertSession is untouched by the new columns — transcript_file/plan_path
// default NULL and plan_exists defaults 0, until a scan or hook sets them.
func TestInsertSession_ReaderFieldsDefaultNilAndFalse(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)

	assert.Nil(t, row.TranscriptPath)
	assert.Nil(t, row.PlanPath)
	assert.False(t, row.PlanExists)
}

// TestUpdateSession_ReaderFieldsRoundTrip covers D14: transcript_file, plan_path and
// plan_exists survive UpdateSession -> GetSession (a restart keeps the plan), in both
// directions — setting them, and clearing plan_path back to nil (session.Manager's wire
// "plan: null").
func TestUpdateSession_ReaderFieldsRoundTrip(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)

	transcript := "/Users/d/.claude/projects/x/transcript.jsonl"
	planPath := "/Users/d/.claude/plans/happy-otter.md"
	row.TranscriptPath = &transcript
	row.PlanPath = &planPath
	row.PlanExists = true
	require.NoError(t, st.UpdateSession(ctx, row))

	got, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	require.NotNil(t, got.TranscriptPath)
	assert.Equal(t, transcript, *got.TranscriptPath)
	require.NotNil(t, got.PlanPath)
	assert.Equal(t, planPath, *got.PlanPath)
	assert.True(t, got.PlanExists)

	got.PlanPath = nil
	got.PlanExists = false
	require.NoError(t, st.UpdateSession(ctx, got))

	cleared, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.Nil(t, cleared.PlanPath, "clearing plan_path must persist a NULL, not survive as a stale value")
	assert.False(t, cleared.PlanExists)
	require.NotNil(t, cleared.TranscriptPath, "clearing the plan must not touch the unrelated transcript column")
	assert.Equal(t, transcript, *cleared.TranscriptPath)
}

// TestSession_TurnStateColumnsDefaultAndRoundTrip covers D12: background_tasks and
// attention_agent default to 0 / NULL on a fresh row, round-trip a set value, and a
// non-nil owner cleared back to nil (main agent / no wait) persists as NULL.
func TestSession_TurnStateColumnsDefaultAndRoundTrip(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)
	got, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.Zero(t, got.BackgroundTasks, "fresh row: no background work")
	assert.Nil(t, got.AttentionAgent, "fresh row: no wait owner")

	agent := "agent-a7f3"
	row.BackgroundTasks = 3
	row.AttentionAgent = &agent
	require.NoError(t, st.UpdateSession(ctx, row))

	got, err = st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.Equal(t, 3, got.BackgroundTasks)
	require.NotNil(t, got.AttentionAgent)
	assert.Equal(t, agent, *got.AttentionAgent)

	listed, err := st.ListSessions(ctx)
	require.NoError(t, err)
	require.Len(t, listed, 1)
	assert.Equal(t, 3, listed[0].BackgroundTasks, "the list path scans the same columns")
	require.NotNil(t, listed[0].AttentionAgent)

	row.BackgroundTasks = 0
	row.AttentionAgent = nil
	require.NoError(t, st.UpdateSession(ctx, row))
	got, err = st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.Zero(t, got.BackgroundTasks)
	assert.Nil(t, got.AttentionAgent)
}

// TestSession_CacheColumnsRoundTripBothOrNeither covers D7's storage half and INV-1's
// twin: a fresh row reads both cache columns unknown, a filled pair survives Update and
// Get and the list path, and the pair travels back to unknown together.
func TestSession_CacheColumnsRoundTripBothOrNeither(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)

	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)
	assert.Nil(t, row.CacheExpiresAt, "a fresh row has no cache")
	assert.Nil(t, row.CacheTTLSeconds)

	expires := time.Unix(1790840879, 0).UTC()
	ttl := int64(3600)
	row.CacheExpiresAt, row.CacheTTLSeconds = &expires, &ttl
	require.NoError(t, st.UpdateSession(ctx, row))

	got, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	require.NotNil(t, got.CacheExpiresAt)
	require.NotNil(t, got.CacheTTLSeconds)
	assert.True(t, expires.Equal(*got.CacheExpiresAt), "expiry read back as written: %s", got.CacheExpiresAt)
	assert.Equal(t, int64(3600), *got.CacheTTLSeconds)

	listed, err := st.ListSessions(ctx)
	require.NoError(t, err)
	require.Len(t, listed, 1)
	require.NotNil(t, listed[0].CacheExpiresAt, "the list path scans the same columns")
	require.NotNil(t, listed[0].CacheTTLSeconds)

	row.CacheExpiresAt, row.CacheTTLSeconds = nil, nil
	require.NoError(t, st.UpdateSession(ctx, row))
	cleared, err := st.GetSession(ctx, row.ID)
	require.NoError(t, err)
	assert.Nil(t, cleared.CacheExpiresAt)
	assert.Nil(t, cleared.CacheTTLSeconds)
}

// TestScanSession_CorruptCacheReadsUnknownNotHalf covers INV-1 against a stored row the
// code did not write: a corrupt expiry, or a lifetime with no expiry, reads back with
// both fields nil, never half a cache, and never fails the row or a sibling.
func TestScanSession_CorruptCacheReadsUnknownNotHalf(t *testing.T) {
	tests := []struct {
		name    string
		expires any
		ttl     any
	}{
		{"corrupt expiry with a lifetime", "not-a-time", 3600},
		{"lifetime with no expiry", nil, 3600},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := openTestStore(t)
			ctx := context.Background()
			repoID := seedTestRepo(t, st)
			bad, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/bad", PermissionMode: "default", FirstLaunchHere: true})
			require.NoError(t, err)
			good, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/good", PermissionMode: "default", FirstLaunchHere: true})
			require.NoError(t, err)
			expires := time.Unix(1790840879, 0).UTC()
			ttl := int64(300)
			good.CacheExpiresAt, good.CacheTTLSeconds = &expires, &ttl
			require.NoError(t, st.UpdateSession(ctx, good))
			_, err = st.db.ExecContext(ctx, `UPDATE session SET cache_expires_at = ?, cache_ttl_seconds = ? WHERE id = ?`, tt.expires, tt.ttl, bad.ID)
			require.NoError(t, err)

			got, err := st.GetSession(ctx, bad.ID)
			require.NoError(t, err, "a corrupt cache column must not fail the row")
			assert.Nil(t, got.CacheExpiresAt, "INV-1: never half a cache")
			assert.Nil(t, got.CacheTTLSeconds, "INV-1: never half a cache")

			rows, err := st.ListSessions(ctx)
			require.NoError(t, err, "a corrupt row must not fail the whole list")
			byID := map[int64]SessionRow{}
			for _, r := range rows {
				byID[r.ID] = r
			}
			require.Contains(t, byID, bad.ID)
			require.Contains(t, byID, good.ID)
			assert.Nil(t, byID[bad.ID].CacheTTLSeconds)
			require.NotNil(t, byID[good.ID].CacheExpiresAt, "the sibling's cache is unaffected")
			assert.Equal(t, int64(300), *byID[good.ID].CacheTTLSeconds)
		})
	}
}

// TestSession_CacheKeepAliveColumnsRoundTrip: the last adopted request count and the last
// reported expiry (migration 0015) start unknown, survive Update, Get and the list path next to
// the cache pair, are independent of each other, and go back to unknown when cleared.
func TestSession_CacheKeepAliveColumnsRoundTrip(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)
	row, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/proj", PermissionMode: "default"})
	require.NoError(t, err)
	assert.Nil(t, row.CacheRequests, "a fresh row holds no request count")
	assert.Nil(t, row.CacheReportedExpiresAt, "a fresh row holds no reported expiry")

	expires := time.Unix(1790840879+3900, 0).UTC()
	reported := time.Unix(1790840879+330, 0).UTC()
	ttl, requests := int64(3900), int64(3)
	tests := []struct {
		name         string
		requests     *int64
		reported     *time.Time
		wantRequests *int64
		wantReported *time.Time
	}{
		{"both", &requests, &reported, &requests, &reported},
		{"count only", &requests, nil, &requests, nil},
		{"reported expiry only", nil, &reported, nil, &reported},
		{"neither", nil, nil, nil, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			row.CacheExpiresAt, row.CacheTTLSeconds = &expires, &ttl
			row.CacheRequests, row.CacheReportedExpiresAt = tt.requests, tt.reported
			require.NoError(t, st.UpdateSession(ctx, row))

			got, err := st.GetSession(ctx, row.ID)
			require.NoError(t, err)
			listed, err := st.ListSessions(ctx)
			require.NoError(t, err)
			require.Len(t, listed, 1)

			for path, r := range map[string]SessionRow{"get": got, "list": listed[0]} {
				assert.Equal(t, tt.wantRequests, r.CacheRequests, path)
				if tt.wantReported == nil {
					assert.Nil(t, r.CacheReportedExpiresAt, path)
				} else {
					require.NotNil(t, r.CacheReportedExpiresAt, path)
					assert.True(t, tt.wantReported.Equal(*r.CacheReportedExpiresAt), "%s: reported expiry read back as written: %s", path, r.CacheReportedExpiresAt)
				}
				require.NotNil(t, r.CacheExpiresAt, path+": the cache pair is unaffected")
				assert.True(t, expires.Equal(*r.CacheExpiresAt), path)
			}
		})
	}
}

// TestScanSession_CorruptReportedExpiryReadsUnsetAndKeepsTheRow: a stored reported expiry the code
// did not write reads back unset, without failing the row or the list, and without taking the
// cache pair or the request count with it.
func TestScanSession_CorruptReportedExpiryReadsUnsetAndKeepsTheRow(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()
	repoID := seedTestRepo(t, st)
	bad, err := st.InsertSession(ctx, InsertSessionParams{RepoID: repoID, Directory: "/tmp/bad", PermissionMode: "default", FirstLaunchHere: true})
	require.NoError(t, err)
	expires := time.Unix(1790840879+3900, 0).UTC()
	ttl, requests := int64(3900), int64(3)
	bad.CacheExpiresAt, bad.CacheTTLSeconds, bad.CacheRequests = &expires, &ttl, &requests
	require.NoError(t, st.UpdateSession(ctx, bad))
	_, err = st.db.ExecContext(ctx, `UPDATE session SET cache_reported_expires_at = 'not-a-time' WHERE id = ?`, bad.ID)
	require.NoError(t, err)

	got, err := st.GetSession(ctx, bad.ID)

	require.NoError(t, err, "a corrupt reported expiry must not fail the row")
	assert.Nil(t, got.CacheReportedExpiresAt)
	require.NotNil(t, got.CacheExpiresAt)
	assert.True(t, expires.Equal(*got.CacheExpiresAt))
	require.NotNil(t, got.CacheRequests)
	assert.Equal(t, int64(3), *got.CacheRequests)
	rows, err := st.ListSessions(ctx)
	require.NoError(t, err)
	assert.Len(t, rows, 1)
}
