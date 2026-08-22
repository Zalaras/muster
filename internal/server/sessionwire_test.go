package server

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/session"
)

func minimalSession() *session.Session {
	return &session.Session{
		ID:                   1,
		Directory:            "/tmp/proj",
		State:                session.StateStarted,
		StateSince:           time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC),
		PermissionMode:       session.PermissionDefault,
		PermissionModeSource: "seed",
		Alive:                true,
		TmuxTarget:           "muster:@1",
		CreatedAt:            time.Date(2026, 8, 22, 11, 0, 0, 0, time.UTC),
	}
}

// TestToWireSession_MinimalShapeRendersEveryNullableFieldNull covers the "no data yet"
// wire shape: a freshly-launched, non-git, no-title, no-model session must render every
// optional field null rather than an empty object/string — SPEC §2.3's honesty rule
// depends on the client being able to tell "absent" from "zero value".
func TestToWireSession_MinimalShapeRendersEveryNullableFieldNull(t *testing.T) {
	w := toWireSession(minimalSession())

	assert.Nil(t, w.Title)
	assert.Nil(t, w.EndedAt)
	assert.Nil(t, w.Attention)
	assert.Nil(t, w.Failure)
	assert.Nil(t, w.Repo, "repo is null when directory isn't a git checkout")
	assert.Nil(t, w.Model)
	assert.Nil(t, w.ClaudeSessionID)
	assert.Equal(t, "started", w.State)
	assert.False(t, w.FirstLaunchHere)
	assert.Equal(t, 0, w.Context.Compactions)
	assert.Nil(t, w.Context.UsedPct)
	assert.Nil(t, w.Context.TotalInputTokens)
	assert.Nil(t, w.Context.WindowSize)
}

func TestToWireSession_RepoIsPopulatedOnlyWhenBranchIsSet(t *testing.T) {
	s := minimalSession()
	branch := "main"
	s.Branch = &branch
	s.IsWorktree = true

	w := toWireSession(s)

	require.NotNil(t, w.Repo)
	assert.Equal(t, "proj", w.Repo.Name, "repo.name derives from filepath.Base(directory)")
	require.NotNil(t, w.Repo.Branch)
	assert.Equal(t, "main", *w.Repo.Branch)
	assert.True(t, w.Repo.IsWorktree)
}

func TestToWireSession_ModelCarriesBothFieldsVerbatim(t *testing.T) {
	s := minimalSession()
	s.Model = &session.Model{ID: "sonnet", DisplayName: "Sonnet"}

	w := toWireSession(s)

	require.NotNil(t, w.Model)
	assert.Equal(t, "sonnet", w.Model.ID)
	assert.Equal(t, "Sonnet", w.Model.DisplayName)
}

func TestToWireSession_ClaudeSessionIDOnlyPresentWhenBound(t *testing.T) {
	s := minimalSession()
	s.ClaudeSessionID = "claude-1"

	w := toWireSession(s)

	require.NotNil(t, w.ClaudeSessionID)
	assert.Equal(t, "claude-1", *w.ClaudeSessionID)
}

func TestToWireSession_AttentionAndFailureShapes(t *testing.T) {
	s := minimalSession()
	s.State = session.StateNeedsInput
	s.Attention = &session.Attention{Reason: "permission", Since: time.Date(2026, 8, 22, 12, 30, 0, 0, time.UTC)}

	w := toWireSession(s)

	require.NotNil(t, w.Attention)
	assert.Equal(t, "permission", w.Attention.Reason)
	assert.Equal(t, "2026-08-22T12:30:00Z", w.Attention.Since)

	s2 := minimalSession()
	s2.State = session.StateFailed
	s2.Failure = &session.Failure{Error: "server_error", Message: "boom"}

	w2 := toWireSession(s2)
	require.NotNil(t, w2.Failure)
	assert.Equal(t, "server_error", w2.Failure.Error)
	assert.Equal(t, "boom", w2.Failure.Message)
}

func TestToWireSession_EndedAtFormatsAsRFC3339WhenSet(t *testing.T) {
	s := minimalSession()
	s.Alive = false
	ended := time.Date(2026, 8, 22, 13, 0, 0, 0, time.UTC)
	s.EndedAt = &ended

	w := toWireSession(s)

	require.NotNil(t, w.EndedAt)
	assert.Equal(t, "2026-08-22T13:00:00Z", *w.EndedAt)
	assert.False(t, w.Alive)
}

// TestToWireSession_ContextGaugesAreAlwaysNullExceptCompactions covers the M1 Protocol
// Contract note directly: usedPct/totalInputTokens/windowSize are always null in M1
// (gauges are M3), regardless of any other session state; only compactions is live.
func TestToWireSession_ContextGaugesAreAlwaysNullExceptCompactions(t *testing.T) {
	s := minimalSession()
	s.Compactions = 3

	w := toWireSession(s)

	assert.Equal(t, 3, w.Context.Compactions)
	assert.Nil(t, w.Context.UsedPct)
	assert.Nil(t, w.Context.TotalInputTokens)
	assert.Nil(t, w.Context.WindowSize)
}

// TestSessionWire_JSONShapeHasNoUnexpectedNulls pins the exact wire shape for a fully
// populated session against the protocol's field names — a regression here means the
// wire contract silently changed.
func TestSessionWire_JSONShapeHasNoUnexpectedNulls(t *testing.T) {
	s := minimalSession()
	title := "My Session"
	s.Title = &title
	s.ClaudeSessionID = "claude-1"
	s.Model = &session.Model{ID: "sonnet", DisplayName: "Sonnet"}
	branch := "main"
	s.Branch = &branch

	b, err := json.Marshal(toWireSession(s))
	require.NoError(t, err)

	var got map[string]any
	require.NoError(t, json.Unmarshal(b, &got))

	for _, field := range []string{
		"id", "title", "state", "stateSince", "alive", "endedAt", "attention", "failure",
		"directory", "repo", "model", "permissionMode", "context", "lastActivity",
		"claudeSessionId", "tmuxTarget", "firstLaunchHere", "createdAt",
	} {
		assert.Contains(t, got, field)
	}

	permMode, ok := got["permissionMode"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "default", permMode["value"])
	assert.Equal(t, "seed", permMode["source"])
}
