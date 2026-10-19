package server

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/session"
)

// TestToWireSession_AddedDirsKeyIsAlwaysAnArray: the key is on every Session object and is a
// JSON array, [] when there is nothing, never null, so the dashboard can tell "none" from a
// daemon that predates the field (kb:anchor/ws.session).
func TestToWireSession_AddedDirsKeyIsAlwaysAnArray(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(s *session.Session)
	}{
		{"fresh session", func(*session.Session) {}},
		{"nil list on a session with a repo", func(s *session.Session) { s.Branch = strPtr("main") }},
		{"explicitly empty list", func(s *session.Session) { s.AddedDirs = []session.Location{} }},
		{"dead session", func(s *session.Session) { s.Alive = false }},
		{"claude moved but nothing added", func(s *session.Session) {
			s.ClaudeDir = "/elsewhere"
			s.ClaudeLocation = &session.Location{Directory: "/elsewhere"}
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := minimalSession()
			tc.mutate(s)

			got := wireJSON(t, s)

			require.Contains(t, got, "addedDirs")
			assert.Equal(t, []any{}, got["addedDirs"])
		})
	}
}

// TestToWireSession_AddedDirsShape pins each entry as the claudeLocation shape: directory,
// then repo (name, branch, isWorktree) or null when it has not been read, is not a checkout
// or sits on a detached HEAD; wire order is the session's order; the launch directory stays
// the wire's directory.
func TestToWireSession_AddedDirsShape(t *testing.T) {
	s := minimalSession()
	s.AddedDirs = []session.Location{
		{Directory: "/Users/bob/code/infra", Repo: &session.LocationRepo{Name: "infra", Branch: "main"}},
		{Directory: "/Users/bob/code/infra-wt", Repo: &session.LocationRepo{Name: "infra-wt", Branch: "fix", IsWorktree: true}},
		{Directory: "/Users/bob/notes"},
	}

	got := wireJSON(t, s)

	assert.Equal(t, []any{
		map[string]any{"directory": "/Users/bob/code/infra", "repo": map[string]any{"name": "infra", "branch": "main", "isWorktree": false}},
		map[string]any{"directory": "/Users/bob/code/infra-wt", "repo": map[string]any{"name": "infra-wt", "branch": "fix", "isWorktree": true}},
		map[string]any{"directory": "/Users/bob/notes", "repo": nil},
	}, got["addedDirs"])
	assert.Equal(t, "/tmp/proj", got["directory"])
	assert.Nil(t, got["claudeLocation"], "added directories never stand in for where Claude is")
}

// TestToWireSession_AddedDirsDoNotAliasTheSession: the wire entries are copies, so a later
// repo reading on the session cannot change a frame already built.
func TestToWireSession_AddedDirsDoNotAliasTheSession(t *testing.T) {
	s := minimalSession()
	s.AddedDirs = []session.Location{{Directory: "/a", Repo: &session.LocationRepo{Name: "a", Branch: "main"}}}
	w := toWireSession(s)

	s.AddedDirs[0].Directory = "/changed"

	require.Len(t, w.AddedDirs, 1)
	assert.Equal(t, "/a", w.AddedDirs[0].Directory)
}
