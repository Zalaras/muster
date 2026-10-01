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
// optional field null rather than an empty object/string — kb:adr/usage-unknown-renders-word-not-track's honesty rule
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
	assert.Nil(t, w.Plan, "plan is null when the session's latest known transcript names none")
}

// TestToWireSessionPlan covers kb:anchor/ws.session's plan field (plan
// markdown-viewing REQ-17): null when unresolved (PlanPath == ""), otherwise the path
// and exists flag verbatim.
func TestToWireSessionPlan(t *testing.T) {
	s := minimalSession()
	assert.Nil(t, toWireSessionPlan(s), "no plan resolved yet")

	s.PlanPath = "/Users/d/.claude/plans/happy-otter.md"
	s.PlanExists = true
	got := toWireSessionPlan(s)
	require.NotNil(t, got)
	assert.Equal(t, "/Users/d/.claude/plans/happy-otter.md", got.Path)
	assert.True(t, got.Exists)

	s.PlanExists = false
	got = toWireSessionPlan(s)
	require.NotNil(t, got)
	assert.False(t, got.Exists, "a resolved path with nothing written yet is exists:false, not null")
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

// TestToWireSession_ContextGaugesAreAlwaysNullExceptCompactions covers the unknown gauge:
// with no Session.Context (no routed status post has carried a used-percentage),
// usedPct/totalInputTokens/windowSize render null while compactions stays live.
func TestToWireSession_ContextGaugesAreAlwaysNullExceptCompactions(t *testing.T) {
	s := minimalSession()
	s.Compactions = 3

	w := toWireSession(s)

	assert.Equal(t, 3, w.Context.Compactions)
	assert.Nil(t, w.Context.UsedPct)
	assert.Nil(t, w.Context.TotalInputTokens)
	assert.Nil(t, w.Context.WindowSize)
}

// TestToWireSession_ContextGaugesPopulateAllThreeFieldsTogetherWhenPresent covers
// m3-gauges REQ-4/INV-2: once a routed status post has filled Session.Context, all
// three numeric fields render together (never a partial gauge), alongside compactions.
func TestToWireSession_ContextGaugesPopulateAllThreeFieldsTogetherWhenPresent(t *testing.T) {
	s := minimalSession()
	s.Compactions = 2
	s.Context = &session.Context{UsedPct: 42, TotalInputTokens: 84000, WindowSize: 200000}

	w := toWireSession(s)

	assert.Equal(t, 2, w.Context.Compactions)
	require.NotNil(t, w.Context.UsedPct)
	assert.Equal(t, 42.0, *w.Context.UsedPct)
	require.NotNil(t, w.Context.TotalInputTokens)
	assert.Equal(t, int64(84000), *w.Context.TotalInputTokens)
	require.NotNil(t, w.Context.WindowSize)
	assert.Equal(t, int64(200000), *w.Context.WindowSize)
}

// TestToWireSession_PinnedAndRailPosAreNeverNull covers plan order-sidebar's Protocol
// Contract delta (kb:anchor/ws.session): pinned/railPos are plain, never-null fields on every Session
// object — carried through verbatim from the domain type, with no nil-check branch
// (unlike Attention/Failure/Model etc., which are pointer fields precisely because they
// *can* be absent).
func TestToWireSession_PinnedAndRailPosAreNeverNull(t *testing.T) {
	s := minimalSession()
	s.Pinned = true
	s.RailPos = 12

	w := toWireSession(s)

	assert.True(t, w.Pinned)
	assert.Equal(t, int64(12), w.RailPos)

	s2 := minimalSession()
	w2 := toWireSession(s2)
	assert.False(t, w2.Pinned, "the zero value (false) must render, not be mistaken for absent")
	assert.Equal(t, int64(0), w2.RailPos)
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
		"claudeSessionId", "tmuxTarget", "firstLaunchHere", "createdAt", "pinned", "railPos",
		"claudeLocation",
	} {
		assert.Contains(t, got, field)
	}

	permMode, ok := got["permissionMode"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "default", permMode["value"])
	assert.Equal(t, "seed", permMode["source"])
}

// TestSessionWire_BackgroundTasksIsAlwaysPresentAndAttentionAgentNeverOnTheWire covers D15:
// every serialized Session carries backgroundTasks as an integer — 0 included, never
// omitted or null — and the wait owner (AttentionAgent) stays daemon-internal.
func TestSessionWire_BackgroundTasksIsAlwaysPresentAndAttentionAgentNeverOnTheWire(t *testing.T) {
	tests := []struct {
		name string
		n    int
		dead bool
	}{
		{"zero at launch", 0, false},
		{"one running", 1, false},
		{"several running", 3, false},
		{"dead session keeps the count (the UI hides it)", 2, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := minimalSession()
			s.BackgroundTasks = tt.n
			s.Alive = !tt.dead
			s.AttentionAgent = "agent-a7f3"

			b, err := json.Marshal(toWireSession(s))
			require.NoError(t, err)
			var got map[string]any
			require.NoError(t, json.Unmarshal(b, &got))

			require.Contains(t, got, "backgroundTasks")
			assert.Equal(t, float64(tt.n), got["backgroundTasks"])
			assert.NotContains(t, got, "attentionAgent")
			assert.NotContains(t, string(b), "agent-a7f3", "the wait owner's id must not leak onto the wire")
		})
	}
}

// wireJSON is the marshalled form of a session's wire object, decoded generically.
func wireJSON(t *testing.T, s *session.Session) map[string]any {
	t.Helper()
	b, err := json.Marshal(toWireSession(s))
	require.NoError(t, err)
	var got map[string]any
	require.NoError(t, json.Unmarshal(b, &got))
	return got
}

// TestToWireSession_ClaudeLocationKeyIsAlwaysPresent is D10: the key is on every Session
// object, JSON null when there is no location, so the dashboard can tell "not moved" from a
// daemon that predates the field.
func TestToWireSession_ClaudeLocationKeyIsAlwaysPresent(t *testing.T) {
	branch := "main"
	cases := []struct {
		name   string
		mutate func(s *session.Session)
	}{
		{"fresh session", func(*session.Session) {}},
		{"with a repo", func(s *session.Session) { s.Branch = &branch }},
		{"dead", func(s *session.Session) { s.Alive = false }},
		{"directory recorded but no derived location", func(s *session.Session) { s.ClaudeDir = "/elsewhere" }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := minimalSession()
			tc.mutate(s)

			got := wireJSON(t, s)

			require.Contains(t, got, "claudeLocation")
			assert.Nil(t, got["claudeLocation"])
		})
	}
}

// TestToWireSession_ClaudeLocationShape pins the object and the rule that the launch
// directory stays the wire's `directory` (the shell, reader, drop and resume all read it).
func TestToWireSession_ClaudeLocationShape(t *testing.T) {
	cases := []struct {
		name string
		loc  *session.Location
		want map[string]any
	}{
		{
			name: "a worktree with its repo",
			loc:  &session.Location{Directory: "/proj/.claude/worktrees/probewt", Repo: &session.LocationRepo{Name: "probewt", Branch: "worktree-probewt", IsWorktree: true}},
			want: map[string]any{
				"directory": "/proj/.claude/worktrees/probewt",
				"repo":      map[string]any{"name": "probewt", "branch": "worktree-probewt", "isWorktree": true},
			},
		},
		{
			name: "a plain directory outside any checkout has a null repo",
			loc:  &session.Location{Directory: "/private/tmp"},
			want: map[string]any{"directory": "/private/tmp", "repo": nil},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := minimalSession()
			s.ClaudeDir = tc.loc.Directory
			s.ClaudeLocation = tc.loc

			got := wireJSON(t, s)

			assert.Equal(t, tc.want, got["claudeLocation"])
			assert.Equal(t, "/tmp/proj", got["directory"], "directory is always the launch directory")
			assert.NotContains(t, got, "claudeDir", "INV-2: the raw recorded directory never reaches the wire")
		})
	}
}

// TestToWireSession_RepoFollowsTheRefreshedBranch: repo.branch/isWorktree come from
// the session's current fields, so a poll's change is what the next upsert carries; a
// detached HEAD (nil branch) is repo null.
func TestToWireSession_RepoFollowsTheRefreshedBranch(t *testing.T) {
	s := minimalSession()
	first, second := "main", "fix"
	s.Branch = &first
	require.Equal(t, "main", *toWireSession(s).Repo.Branch)

	s.Branch, s.IsWorktree = &second, true
	w := toWireSession(s)
	require.NotNil(t, w.Repo)
	assert.Equal(t, "fix", *w.Repo.Branch)
	assert.True(t, w.Repo.IsWorktree)

	s.Branch = nil
	assert.Nil(t, toWireSession(s).Repo, "a detached HEAD reads as repo null")
}
