package kb

import (
	"bytes"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPlanFeatures_ParsesTheFeaturesHeaderAndFailsWhenAbsent(t *testing.T) {
	root := t.TempDir()
	mustWriteFile(t, root, "plans/a/plan.md", "# Plan\n\n**Status**: open\n**Features**: sessions, terminal\n")
	got, err := PlanFeatures(filepath.Join(root, "plans/a/plan.md"))
	require.NoError(t, err)
	assert.Equal(t, []string{"sessions", "terminal"}, got)

	mustWriteFile(t, root, "plans/b/plan.md", "# Plan\n\nno header\n")
	_, err = PlanFeatures(filepath.Join(root, "plans/b/plan.md"))
	require.EqualError(t, err, "no **Features**: header")

	_, err = PlanFeatures(filepath.Join(root, "plans/c/plan.md"))
	require.Error(t, err)
}

func packFixture(t *testing.T) (string, *Index) {
	t.Helper()
	root := newKBRoot(t)
	mustWriteFile(t, root, "docs/conventions.md", "# Conventions\n\nAlways wrap errors.\n")
	mustWriteFile(t, root, "docs/rules/global-rule.md", "---\nid: global-rule\ntype: rule\nstatus: active\ndate: 2026-08-30\nsummary: Applies everywhere.\n---\nGlobal body.\n")
	mustWriteFile(t, root, "docs/rules/sess-rule.md", "---\nid: sess-rule\ntype: rule\nstatus: active\ndate: 2026-08-30\nsummary: Applies to sessions.\nfeatures: [sessions]\n---\nScoped body.\n")
	mustWriteFile(t, root, "docs/rules/draft-rule.md", "---\nid: draft-rule\ntype: rule\nstatus: draft\ndate: 2026-08-30\nsummary: Not yet.\n---\n")
	mustWriteFile(t, root, "docs/adr/proposed-here.md", "---\nid: proposed-here\ntype: decision\nstatus: proposed\ndate: 2026-09-01\nsummary: Proposed by this plan.\nfeatures: [sessions]\nrefs: [plan:this-plan]\n---\n")
	mustWriteFile(t, root, "docs/adr/earlier.md", "---\nid: earlier\ntype: decision\nstatus: accepted\ndate: 2026-07-01\nsummary: An earlier decision.\nfeatures: [sessions]\n---\n")
	mustWriteFile(t, root, "docs/lessons/web-only.md", "---\nid: web-only\ntype: lesson\nstatus: active\ndate: 2026-08-30\nsummary: For web agents.\nroles: [web-impl]\n---\n")
	mustWriteFile(t, root, "docs/lessons/other-feature.md", "---\nid: other-feature\ntype: lesson\nstatus: active\ndate: 2026-08-30\nsummary: Scoped elsewhere.\nroles: [daemon-impl]\nfeatures: [other]\n---\n")
	mustWriteFile(t, root, "docs/features/other/spec.md", "---\nid: other\ntype: spec\nstatus: active\ndate: 2026-08-30\nsummary: Other feature.\nfeatures: [other]\n---\nOther spec body.\n")
	mustWriteFile(t, root, "docs/runbooks/rotate.md", "---\nid: rotate\ntype: runbook\nstatus: active\ndate: 2026-08-30\nsummary: Rotate the thing.\nfeatures: [sessions]\n---\nStep one.\n")
	mustWriteFile(t, root, "plans/this-plan/plan.md", "# Plan\n\n**Features**: sessions\n")
	ix, findings := loadFixture(t, root)
	require.Empty(t, findings)
	return root, ix
}

func runPack(t *testing.T, ix *Index, role string, features ...string) (string, int) {
	t.Helper()
	var buf bytes.Buffer
	n, err := Pack(ix, PackOptions{Plan: "this-plan", Role: role, Features: features}, &buf)
	require.NoError(t, err)
	return buf.String(), n
}

func TestPack_EmitsSectionsInTheFixedOrderAndEndsWithTheWordCount(t *testing.T) {
	_, ix := packFixture(t)
	out, n := runPack(t, ix, "daemon-impl", "sessions")
	assert.True(t, strings.HasPrefix(out, "<!-- kb:pack plan=this-plan role=daemon-impl features=sessions -->\n"), out)
	order := []string{"\n# Rules\n", "Always wrap errors.", "## rule global-rule", "## rule sess-rule",
		"\n# Feature: sessions\n", "The sessions feature keeps the rail ordered.", "# sessions — protocol contract", "### 3.10",
		"\n# Decisions\n", "## decision earlier", "## decision pin-order",
		"\n# Facts\n", "## fact statusline-cadence — ", "verified 2.1.246..2.1.267",
		"\n# Lessons\n", "## lesson resize-twice",
		"\n# Runbooks\n", "## runbook rotate",
		"\nkb: pack "}
	last := -1
	for _, s := range order {
		idx := strings.Index(out, s)
		require.NotEqual(t, -1, idx, "missing %q", s)
		assert.Greater(t, idx, last, "%q out of order", s)
		last = idx
	}
	assert.Contains(t, out, "_accepted · 2026-08-30 · features: sessions · files: internal/sess/** · cite: kb:adr/pin-order_")
	trailer := out[strings.LastIndex(out, "kb: pack "):]
	assert.Regexp(t, `^kb: pack \d+ words\n$`, trailer)
	assert.Equal(t, len(strings.Fields(out[:strings.LastIndex(out, "kb: pack ")])), n)
	assert.NotContains(t, out, "# Decisions (proposed for this plan)", "only review and planner see proposals")
	assert.NotContains(t, out, "kb:generated", "the contract header line is stripped")
}

func TestPack_IncludesOnlyLessonsMatchingTheRoleAndDecisionsThatAreAccepted(t *testing.T) {
	_, ix := packFixture(t)
	out, _ := runPack(t, ix, "daemon-impl", "sessions")
	assert.Contains(t, out, "## lesson resize-twice")
	assert.NotContains(t, out, "## lesson web-only")
	assert.NotContains(t, out, "## lesson other-feature", "scoped to a feature outside the plan")
	assert.NotContains(t, out, "## decision old-pin", "superseded")
	assert.NotContains(t, out, "## decision proposed-here", "proposed, and not a review pack")

	out, _ = runPack(t, ix, "web-impl", "sessions")
	assert.Contains(t, out, "## lesson web-only")
	assert.NotContains(t, out, "## lesson resize-twice")

	out, _ = runPack(t, ix, "review", "sessions")
	idx := strings.Index(out, "\n# Decisions (proposed for this plan)\n")
	require.NotEqual(t, -1, idx)
	assert.Greater(t, idx, strings.Index(out, "## decision pin-order"))
	assert.Less(t, idx, strings.Index(out, "\n# Facts\n"))
	assert.Contains(t, out[idx:], "## decision proposed-here")

	out, _ = runPack(t, ix, "daemon-impl", "other")
	assert.Contains(t, out, "## lesson other-feature")
	assert.Contains(t, out, "## lesson resize-twice", "a global lesson always applies")
	assert.NotContains(t, out, "## decision pin-order")
	assert.Contains(t, out, "No protocol surface.")
}

func TestPack_IncludesGlobalRulesBeforeFeatureScopedOnes(t *testing.T) {
	_, ix := packFixture(t)
	out, _ := runPack(t, ix, "daemon-impl", "sessions")
	assert.Less(t, strings.Index(out, "## rule global-rule"), strings.Index(out, "## rule sess-rule"))
	assert.NotContains(t, out, "draft-rule")
	out, _ = runPack(t, ix, "daemon-impl", "other")
	assert.Contains(t, out, "## rule global-rule")
	assert.NotContains(t, out, "## rule sess-rule")
}

func TestPack_IsByteIdenticalAcrossRuns(t *testing.T) {
	_, ix := packFixture(t)
	a, _ := runPack(t, ix, "review", "sessions", "other")
	b, _ := runPack(t, ix, "review", "sessions", "other")
	assert.Equal(t, a, b)
	assert.Less(t, strings.Index(a, "# Feature: sessions"), strings.Index(a, "# Feature: other"), "plan order, not alphabetical")
}

func TestPack_WarnsButDoesNotFailOverTheWordBudget(t *testing.T) {
	root, _ := packFixture(t)
	mustWriteFile(t, root, "docs/conventions.md", strings.Repeat("word ", PackWords+1)+"\n")
	ix, _ := loadFixture(t, root)
	out, n := runPack(t, ix, "daemon-impl", "sessions")
	assert.Greater(t, n, PackWords)
	assert.True(t, strings.HasSuffix(out, "kb: WARN pack exceeds budget of 8000 words\n"), out[len(out)-120:])
}

func TestPack_RejectsAnUnknownRoleOrFeature(t *testing.T) {
	_, ix := packFixture(t)
	_, err := Pack(ix, PackOptions{Plan: "p", Role: "ceo", Features: []string{"sessions"}}, &bytes.Buffer{})
	require.EqualError(t, err, `unknown role "ceo" (want one of: `+strings.Join(Roles, ", ")+")")
	_, err = Pack(ix, PackOptions{Plan: "p", Role: "review", Features: []string{"nope"}}, &bytes.Buffer{})
	require.EqualError(t, err, `feature "nope" has no docs/features/nope/spec.md`)
}

func TestPack_RendersAcceptedDecisionsAsDecisionAndConsequencesOnly(t *testing.T) {
	root, _ := packFixture(t)
	mustWriteFile(t, root, "docs/adr/four-paragraphs.md", "---\nid: four-paragraphs\ntype: decision\nstatus: accepted\ndate: 2026-08-31\nsummary: s\nfeatures: [sessions]\n---\n**Context.** The situation.\n\n**Options.** (A) one. (B) two.\n\n**Decision.** B.\n\n**Consequences.** It follows.\n")
	ix, _, err := Load(root)
	require.NoError(t, err)
	out, _ := runPack(t, ix, "daemon-impl", "sessions")
	assert.Contains(t, out, "## decision four-paragraphs — s")
	assert.Contains(t, out, "**Decision.** B.\n\n**Consequences.** It follows.\n_context and options: kb show four-paragraphs_")
	assert.NotContains(t, out, "**Context.** The situation.")
	assert.NotContains(t, out, "**Options.**")
	assert.Contains(t, out, "## decision pin-order", "a body without the bold leads still renders whole")
}

func TestPack_IncludesOnlyTheConventionsSectionsForTheRole(t *testing.T) {
	root, _ := packFixture(t)
	mustWriteFile(t, root, "docs/conventions.md", "# Code conventions\n\nPreamble.\n\n## Go\n\nGo rule.\n\n## TypeScript / web\n\nTS rule.\n\n## Testing (both sides)\n\nTest rule.\n\n## Comments\n\nComment rule.\n")
	ix, _, err := Load(root)
	require.NoError(t, err)
	daemon, _ := runPack(t, ix, "daemon-impl", "sessions")
	assert.Contains(t, daemon, "Preamble.")
	assert.Contains(t, daemon, "Go rule.")
	assert.Contains(t, daemon, "Comment rule.")
	assert.NotContains(t, daemon, "TS rule.")
	assert.NotContains(t, daemon, "Test rule.")
	tests, _ := runPack(t, ix, "web-tests", "sessions")
	assert.Contains(t, tests, "Test rule.")
	assert.NotContains(t, tests, "Go rule.")
	planner, _ := runPack(t, ix, "planner", "sessions")
	for _, s := range []string{"Go rule.", "TS rule.", "Test rule.", "Comment rule."} {
		assert.Contains(t, planner, s)
	}
}
