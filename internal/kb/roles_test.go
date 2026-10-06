package kb

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The role list was once seeded from pipeline step names, and a lesson tagged with a step
// nobody packs as ("plan-work", "e2e-validate") reached no agent. This test ties Roles to what
// is actually spawned: the agent files, plus the roles the main session plays.
func TestRoles_MatchTheAgentFiles(t *testing.T) {
	// Roles the main session packs as; no agent file exists for them.
	sessionRoles := []string{"orchestrator", "planner", "retro"}
	// Agents that pack under a different name.
	aliases := map[string]string{"review": "review-work"}
	// Agents spawned outside the build pipeline; they read no pack and have no role.
	noRole := []string{"debater", "judge", "triage-proposer"}

	entries, err := os.ReadDir(filepath.Join("..", "..", ".claude", "agents"))
	require.NoError(t, err)
	agents := map[string]bool{}
	for _, e := range entries {
		if name, ok := strings.CutSuffix(e.Name(), ".md"); ok {
			agents[name] = true
		}
	}
	require.NotEmpty(t, agents)

	for _, role := range Roles {
		if contains(sessionRoles, role) {
			continue
		}
		name := role
		if a, ok := aliases[role]; ok {
			name = a
		}
		assert.True(t, agents[name], "role %q packs for no agent file under .claude/agents", role)
	}
	for agent := range agents {
		if contains(noRole, agent) {
			continue
		}
		role := agent
		for r, a := range aliases {
			if a == agent {
				role = r
			}
		}
		assert.True(t, contains(Roles, role), "agent %q has no role, so no lesson can reach it", agent)
	}
}
