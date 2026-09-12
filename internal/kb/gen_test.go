package kb

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func outputsOf(t *testing.T, root string) map[string]string {
	t.Helper()
	ix, findings := loadFixture(t, root)
	require.Empty(t, findings)
	outs, fragFindings, err := Outputs(ix)
	require.NoError(t, err)
	require.Empty(t, fragFindings)
	m := map[string]string{}
	for _, o := range outs {
		m[o.Path] = o.Content
	}
	return m
}

func TestOutputs_IsByteIdenticalAcrossTwoRunsOnTheSameTree(t *testing.T) {
	root := newKBRoot(t)
	first := outputsOf(t, root)
	second := outputsOf(t, root)
	assert.Equal(t, first, second)
	assert.ElementsMatch(t, []string{
		"docs/INDEX.md", "docs/features/sessions/INDEX.md", "docs/features/sessions/contract.md",
		".claude/rules/sessions.md", "CLAUDE.md", "internal/sess/CLAUDE.md",
	}, keys(first))
}

func keys(m map[string]string) []string {
	var out []string
	for k := range m {
		out = append(out, k)
	}
	return out
}

func TestOutputs_RendersContractSlicesInSpecOrderWithBreadcrumbs(t *testing.T) {
	root := newKBRoot(t)
	edit(t, root, "docs/features/sessions/spec.md", "protocol: [sessions.pin, sessions.order]", "protocol: [sessions.order, sessions.pin]")
	contract := outputsOf(t, root)["docs/features/sessions/contract.md"]
	_, body, ok := SplitGenerated(contract)
	require.True(t, ok)
	assert.True(t, strings.HasPrefix(body, "# sessions — protocol contract\n\nSlices of `docs/protocol.md` named by the protocol list in `docs/features/sessions/spec.md`.\n"), body)
	assert.Less(t, strings.Index(body, "### 3.11 Order"), strings.Index(body, "### 3.10"), "spec order wins over source order")
	assert.Equal(t, 2, strings.Count(body, "_docs/protocol.md § 3. HTTP endpoints — UI_"))
	assert.NotContains(t, body, "kb:anchor")
	assert.NotContains(t, body, "## 4. WebSocket")
}

func TestOutputs_RendersAnEmptyContractForAFeatureWithNoProtocolSurface(t *testing.T) {
	root := newKBRoot(t)
	edit(t, root, "docs/features/sessions/spec.md", "protocol: [sessions.pin, sessions.order]\n", "")
	outs := outputsOf(t, root)
	_, body, ok := SplitGenerated(outs["docs/features/sessions/contract.md"])
	require.True(t, ok)
	assert.Contains(t, body, "\nNo protocol surface.\n")
	assert.NotContains(t, outs["docs/features/sessions/INDEX.md"], "## Protocol")
}

func TestOutputs_ListsRetiredAndRejectedRecordsOnlyInTheTrailingSection(t *testing.T) {
	root := newKBRoot(t)
	mustWriteFile(t, root, "docs/adr/rejected-idea.md", "---\nid: rejected-idea\ntype: decision\nstatus: rejected\ndate: 2026-08-02\nsummary: Never do this.\nfeatures: [sessions]\n---\n")
	mustWriteFile(t, root, "docs/facts/old-fact.md", "---\nid: old-fact\ntype: fact\nstatus: retired\ndate: 2026-08-02\nsummary: Was true once.\nverified: 2.1.246..2.1.246\n---\n")
	index := outputsOf(t, root)["docs/INDEX.md"]
	cut := strings.Index(index, "## Retired, rejected and superseded")
	require.NotEqual(t, -1, cut)
	live, trailer := index[:cut], index[cut:]
	for _, id := range []string{"kb:adr/rejected-idea", "kb:fact/old-fact", "kb:adr/old-pin"} {
		assert.Contains(t, trailer, id)
		assert.NotContains(t, live, id)
	}
	assert.Contains(t, live, "kb:adr/pin-order")
	assert.Contains(t, live, "verified 2.1.246..2.1.267")
	assert.Contains(t, live, "| sessions | Session list, pinning and ordering. | `docs/features/sessions/spec.md` | `docs/features/sessions/contract.md` |")
}

func TestOutputs_RulesFileCarriesTheUnionOfFeatureGlobsAsPaths(t *testing.T) {
	root := newKBRoot(t)
	edit(t, root, "docs/features/sessions/spec.md", "e2e: [web/e2e/sess.spec.ts]", "web: [web/src/sess/**]\ne2e: [web/e2e/sess.spec.ts]")
	mustWriteFile(t, root, "web/src/sess/a.ts", "export {}\n")
	rules := outputsOf(t, root)[".claude/rules/sessions.md"]
	assert.True(t, strings.HasPrefix(rules, "---\npaths:\n  - \"internal/sess/**\"\n  - \"web/src/sess/**\"\n  - \"web/e2e/sess.spec.ts\"\n---\n<!-- kb:generated "), rules)
	assert.Contains(t, rules, "# sessions\n\nSession list, pinning and ordering.\n\nRead first: `docs/features/sessions/spec.md`, `docs/features/sessions/contract.md`\n")
	assert.Contains(t, rules, "- `kb:adr/pin-order` —")
	assert.NotContains(t, rules, "kb:adr/old-pin", "only live records")
	assert.NotContains(t, rules, "kb:spec/sessions", "the spec is named by the read-first line, not listed as a record")
}

func TestOutputs_SkipsTheRulesFileForAFeatureWithNoGlobs(t *testing.T) {
	root := newKBRoot(t)
	mustWriteFile(t, root, "docs/features/globless/spec.md", "---\nid: globless\ntype: spec\nstatus: draft\ndate: 2026-08-30\nsummary: Not wired to code yet.\nfeatures: [globless]\n---\n")
	outs := outputsOf(t, root)
	assert.NotContains(t, keys(outs), ".claude/rules/globless.md", "a rules file with no paths would load on every file")
	assert.Contains(t, keys(outs), "docs/features/globless/INDEX.md")
	assert.Contains(t, outs["docs/features/globless/INDEX.md"], "```\n(none)\n```")
}

func TestOutputs_TruncatesAnOverBudgetRulesFileAndPointsAtTheFeatureIndex(t *testing.T) {
	root := newKBRoot(t)
	for i := 0; i < 70; i++ {
		id := "rule-" + string(rune('a'+i/10)) + string(rune('a'+i%10))
		mustWriteFile(t, root, "docs/rules/"+id+".md", "---\nid: "+id+"\ntype: rule\nstatus: active\ndate: 2026-08-30\nsummary: s\nfeatures: [sessions]\n---\n")
	}
	rules := outputsOf(t, root)[".claude/rules/sessions.md"]
	lines := strings.Split(strings.TrimRight(rules, "\n"), "\n")
	assert.LessOrEqual(t, len(lines), RuleFileLines)
	last := lines[len(lines)-1]
	assert.Regexp(t, regexp.MustCompile("^… [0-9]+ more: see `docs/features/sessions/INDEX.md`$"), last)
	m := regexp.MustCompile(`… (\d+) more`).FindStringSubmatch(last)
	kept := strings.Count(rules, "- `kb:")
	assert.Equal(t, 72-kept, atoi(t, m[1]))
}

func atoi(t *testing.T, s string) int {
	t.Helper()
	n := 0
	for _, c := range s {
		n = n*10 + int(c-'0')
	}
	return n
}

func TestOutputs_RendersOnlyCLAUDEmdFilesThatCarryAKBFragment(t *testing.T) {
	root := newKBRoot(t)
	mustWriteFile(t, root, "web/CLAUDE.md", "# web\n\nNo fragments here.\n")
	mustWriteFile(t, root, "cmd/CLAUDE.md", "# cmd\n\n<!-- kb:trailer -->\n<!-- /kb:trailer -->\n")
	outs := outputsOf(t, root)
	assert.NotContains(t, keys(outs), "web/CLAUDE.md")
	assert.Contains(t, outs["cmd/CLAUDE.md"], "_No feature or record covers this directory yet._")
	assert.Contains(t, outs["CLAUDE.md"], "| sessions | Session list, pinning and ordering. | `docs/features/sessions/INDEX.md` |")
	sess := outs["internal/sess/CLAUDE.md"]
	assert.Contains(t, sess, "- **sessions** — Session list, pinning and ordering. → `docs/features/sessions/INDEX.md`")
	assert.Regexp(t, "- [0-9]+ records name files in this directory: `go run ./tools/kb for <path>` lists them for one file\\.", sess)
	assert.NotContains(t, sess, "- `kb:fact/statusline-cadence` —", "records are counted, not listed — the rules files already carry them")
	assert.NotContains(t, sess, "kb:lesson/resize-twice")
	assert.Regexp(t, `<!-- kb:trailer -->\n<!-- kb:hash [0-9a-f]{16} -->\n- `, sess)
}

func TestOutputs_CitesOnlyPathsThatExistOnDisk(t *testing.T) {
	root := newKBRoot(t)
	runGen(t, root)
	outs := outputsOf(t, root)
	pathRE := regexp.MustCompile("`((?:docs|internal|web|\\.claude)/[A-Za-z0-9_./-]+)`")
	n := 0
	for out, content := range outs {
		for _, m := range pathRE.FindAllStringSubmatch(content, -1) {
			n++
			_, err := os.Stat(filepath.Join(root, filepath.FromSlash(m[1])))
			assert.NoError(t, err, "%s cites %s", out, m[1])
		}
	}
	assert.Greater(t, n, 5)
}

func TestApply_WritesOnlyChangedFilesAndReportsThem(t *testing.T) {
	root := newKBRoot(t)
	written := runGen(t, root)
	assert.ElementsMatch(t, []string{
		".claude/rules/sessions.md", "CLAUDE.md", "docs/INDEX.md",
		"docs/features/sessions/INDEX.md", "docs/features/sessions/contract.md", "internal/sess/CLAUDE.md",
	}, written)
	assert.Empty(t, runGen(t, root), "a second gen on the same tree writes nothing")

	edit(t, root, "docs/lessons/resize-twice.md", "summary: Resize the pty", "summary: Always resize the pty")
	assert.Equal(t, []string{"docs/INDEX.md"}, runGen(t, root), "a global lesson touches only the store index")
}
