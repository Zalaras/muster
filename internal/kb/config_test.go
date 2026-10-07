package kb

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// configFrom loads a kb.yaml with the given text from a scratch root.
func configFrom(t *testing.T, text string) (*Config, error) {
	t.Helper()
	root := t.TempDir()
	mustWriteFile(t, root, ConfigPath, text)
	return LoadConfig(root)
}

func TestLoadConfig_FailsWhenTheFileIsAbsent(t *testing.T) {
	_, err := LoadConfig(t.TempDir())
	require.ErrorContains(t, err, "kb.yaml is missing")
}

func TestLoadConfig_RejectsAnUnknownKeyAtAnyDepth(t *testing.T) {
	_, err := configFrom(t, fixtureConfig+"colour: blue\n")
	require.ErrorContains(t, err, "parsing kb.yaml")
	_, err = configFrom(t, fixtureConfig+"pack:\n  nope: [a]\n")
	require.ErrorContains(t, err, "parsing kb.yaml")
	_, err = configFrom(t, fixtureConfig+"budgets:\n  body_words: many\n")
	require.ErrorContains(t, err, "parsing kb.yaml")
}

func TestLoadConfig_RequiresEveryTypeDirAndNonEmptyTagsAndRoles(t *testing.T) {
	_, err := configFrom(t, strings.Replace(fixtureConfig, "  lesson: docs/lessons\n", "", 1))
	require.EqualError(t, err, `kb.yaml: dirs is missing type "lesson"`)
	_, err = configFrom(t, strings.Replace(fixtureConfig, "  lesson: docs/lessons\n", "  lesson: docs/lessons\n  note: docs/notes\n", 1))
	require.ErrorContains(t, err, `dirs names unknown type "note"`)
	_, err = configFrom(t, strings.Replace(fixtureConfig, "tags: [", "tags: [] #", 1))
	require.EqualError(t, err, "kb.yaml: tags must list at least one tag")
	_, err = configFrom(t, strings.Replace(fixtureConfig, "roles: [", "roles: [] #", 1))
	require.EqualError(t, err, "kb.yaml: roles must list at least one role")
}

func TestLoadConfig_DefaultsAbsentKeysAndKeepsExplicitValues(t *testing.T) {
	cfg, err := configFrom(t, fixtureConfig)
	require.NoError(t, err)
	assert.Equal(t, defaultBudgets, cfg.Budgets)
	assert.Equal(t, "docs/protocol.md", cfg.Paths.Protocol)
	assert.Equal(t, ".claude/rules", cfg.Paths.RulesDir)
	assert.Equal(t, "plans", cfg.Paths.PlansDir)
	assert.Equal(t, []string{"daemon-tests", "web-tests", "review-browser", "doc-reconcile"}, cfg.Pack.DecisionlessRoles)
	assert.Equal(t, []string{"review", "planner"}, cfg.Pack.ProposedDecisionRoles)
	assert.Equal(t, []string{"internal", "web/src", "web/e2e"}, cfg.Ownership)
	assert.Empty(t, cfg.Refs.Flags.Binary, "the fixture names no binary, so the flag check is off")
	assert.Equal(t, "docs/features", cfg.SpecDir())
	assert.Equal(t, "plans/x/plan.md", cfg.PlanPath("x"))

	_, err = configFrom(t, fixtureConfig+"budgets:\n  spec_words: 900\nownership: [cmd/]\npaths_x: 1\n")
	require.Error(t, err, "a misspelt section is unknown, not ignored")
	cfg, err = configFrom(t, fixtureConfig+"budgets:\n  spec_words: 900\nownership: [cmd/]\npack:\n  decisionless_roles: []\n")
	require.NoError(t, err)
	assert.Equal(t, 900, cfg.Budgets.SpecWords)
	assert.Equal(t, defaultBudgets.BodyWords, cfg.Budgets.BodyWords, "the other budgets keep their defaults")
	assert.Equal(t, []string{"cmd"}, cfg.Ownership, "a trailing slash is trimmed")
	assert.Empty(t, cfg.Pack.DecisionlessRoles, "an explicit empty list stays empty")
	assert.Equal(t, 900, cfg.bodyBudget(TypeSpec))
	assert.Equal(t, defaultBudgets.RunbookWords, cfg.bodyBudget(TypeRunbook))
	assert.Equal(t, defaultBudgets.BodyWords, cfg.bodyBudget(TypeFact))
}

func TestConfig_ExcludedMatchesTheGlobList(t *testing.T) {
	cfg := testConfig(t)
	for rel, want := range map[string]bool{
		"plans/x/plan.md":             true,
		"docs/history/h.md":           true,
		"docs/research/r.md":          true,
		"web/e2e/a.spec.ts":           true,
		"web/e2e/sub/a.spec.ts":       true,
		"web/node_modules/x/y.js":     true,
		"dist/x":                      true,
		"web/e2e/helpers/fixtures.ts": false,
		"docs/adr/x.md":               false,
		"internal/sess/sess.go":       false,
	} {
		assert.Equal(t, want, cfg.Excluded(rel), rel)
	}
}
