package kb

import (
	"bytes"
	"fmt"
	"path/filepath"
	"regexp"
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

func TestPack_OpensWithTheWordCountThenEmitsSectionsInTheFixedOrder(t *testing.T) {
	_, ix := packFixture(t)
	out, n := runPack(t, ix, "daemon-impl", "sessions")
	marker := "<!-- kb:pack plan=this-plan role=daemon-impl features=sessions -->\n"
	assert.True(t, strings.HasPrefix(out, marker), out)
	order := []string{"\nkb: pack ",
		"\n# Rules\n", "Always wrap errors.", "## rule global-rule", "## rule sess-rule",
		"\n# Feature: sessions\n", "The sessions feature keeps the rail ordered.", "# sessions — protocol contract", "### 3.10",
		"\n# Decisions\n", "## decision earlier", "## decision pin-order",
		"\n# Facts\n", "## fact statusline-cadence — ", "verified 2.1.246..2.1.267",
		"\n# Lessons\n", "## lesson resize-twice",
		"\n# Runbooks\n", "## runbook rotate"}
	last := -1
	for _, s := range order {
		idx := strings.Index(out, s)
		require.NotEqual(t, -1, idx, "missing %q", s)
		assert.Greater(t, idx, last, "%q out of order", s)
		last = idx
	}
	assert.Contains(t, out, "_accepted · 2026-08-30 · features: sessions · files: internal/sess/** · cite: kb:adr/pin-order_")

	// The summary sits between the marker and the body, and the count covers the marker and
	// the body only — the block reports on the pack without inflating it.
	summary, body, ok := strings.Cut(strings.TrimPrefix(out, marker), "\n# Rules\n")
	require.True(t, ok, out)
	assert.Regexp(t, `^kb: pack \d+ words \(budget 8000\)\nkb: sections — `, summary)
	assert.Equal(t, len(strings.Fields(marker))+len(strings.Fields("\n# Rules\n"+body)), n)

	assert.NotContains(t, out, "# Decisions (proposed for this plan)", "only review and planner see proposals")
	assert.NotContains(t, out, "kb:generated", "the contract header line is stripped")
}

func TestPack_BreakdownRowsAndTheMarkerSumToTheReportedTotal(t *testing.T) {
	_, ix := packFixture(t)
	for _, role := range []string{"daemon-impl", "review"} {
		out, n := runPack(t, ix, role, "sessions", "other")
		rows := regexp.MustCompile(`(?m)^kb: sections — (.+)$`).FindStringSubmatch(out)
		require.NotNil(t, rows, out)
		sum := 0
		var labels []string
		for _, row := range strings.Split(rows[1], " · ") {
			var label string
			var words int
			_, err := fmt.Sscanf(row, "%s %d", &label, &words)
			require.NoError(t, err, row)
			labels = append(labels, label)
			sum += words
		}
		assert.Equal(t, []string{"rules", "features", "diagrams", "decisions", "proposed", "facts", "lessons", "runbooks"}, labels,
			"one row per section writer, in write order")
		marker, _, ok := strings.Cut(out, "\n")
		require.True(t, ok, out)
		assert.Equal(t, n, sum+len(strings.Fields(marker)), "role %s: rows plus the marker must account for every word", role)
	}
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
	head, _, _ := strings.Cut(out, "\n# Rules\n")
	assert.Contains(t, head, fmt.Sprintf("kb: WARN pack exceeds budget of %d words\n", PackWords),
		"the warning opens the pack, where it can still change what the reader does")
}

func TestPack_UnderBudgetReportsTheCountWithNoWarning(t *testing.T) {
	_, ix := packFixture(t)
	out, n := runPack(t, ix, "daemon-impl", "sessions")
	require.Less(t, n, PackWords)
	assert.Contains(t, out, fmt.Sprintf("kb: pack %d words (budget %d)\n", n, PackWords))
	assert.NotContains(t, out, "WARN")
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
	mustWriteFile(t, root, "docs/conventions.md", "# Code conventions\n\nPreamble.\n\n## Go\n\nGo rule.\n\n## TypeScript / web\n\nTS rule.\n\n## Design\n\nDesign rule.\n\n## Testing (both sides)\n\nTest rule.\n\n## Comments\n\nComment rule.\n")
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
	for _, s := range []string{"Go rule.", "TS rule.", "Design rule.", "Test rule.", "Comment rule."} {
		assert.Contains(t, planner, s)
	}
	maint, _ := runPack(t, ix, "review-maintainability", "sessions")
	assert.Contains(t, maint, "Design rule.")
	assert.Contains(t, maint, "Go rule.")
	assert.NotContains(t, maint, "Test rule.", "the maintainability reviewer judges shape, not test strategy")
	review, _ := runPack(t, ix, "review", "sessions")
	assert.Contains(t, review, "Go rule.")
	assert.Contains(t, review, "Test rule.")
	assert.NotContains(t, review, "Design rule.", "shape is the maintainability reviewer's")
	browser, _ := runPack(t, ix, "review-browser", "sessions")
	assert.Contains(t, browser, "Test rule.")
	assert.NotContains(t, browser, "Go rule.")
	assert.NotContains(t, browser, "Design rule.")
}

func TestPack_CarriesFeatureDiagramsToEveryRoleAndSystemDiagramsToPlanningRolesOnly(t *testing.T) {
	_, ix := packFixture(t)
	impl, _ := runPack(t, ix, "daemon-impl", "sessions")
	assert.Contains(t, impl, "\n# Diagrams\n")
	assert.Contains(t, impl, "## diagram sessions-state — The session state machine.\n_active · 2026-09-15 · kind: state · features: sessions · files: internal/sess/** · cite: kb:diagram/sessions-state_")
	assert.Contains(t, impl, "```mermaid\nstateDiagram-v2\n", "the fence rides along — the diagram is the point")
	assert.NotContains(t, impl, "system-container", "an implementation pack skips the system-wide diagrams")
	assert.Less(t, strings.Index(impl, "# Feature: sessions"), strings.Index(impl, "\n# Diagrams\n"))
	assert.Less(t, strings.Index(impl, "\n# Diagrams\n"), strings.Index(impl, "\n# Decisions\n"))

	for _, role := range []string{"planner", "review", "plan-work", "orchestrator", "review-maintainability"} {
		out, _ := runPack(t, ix, role, "sessions")
		assert.Contains(t, out, "## diagram system-container", role)
	}
	other, _ := runPack(t, ix, "web-impl", "other")
	assert.NotContains(t, other, "# Diagrams", "no diagram, no heading")
}
