package commentpass

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func goBlocks(t *testing.T, src string) []Block {
	t.Helper()
	toks, err := scanGo([]byte(src))
	require.NoError(t, err)
	return blocks([]byte(src), toks)
}

func TestBlocks_GroupsConsecutiveOwnLinesAndSplitsOnDirectives(t *testing.T) {
	src := "package p\n\n// one\n// two\n\n// three\n//go:generate x\n// four\nfunc f() {}\n"
	bs := goBlocks(t, src)
	require.Len(t, bs, 3)
	assert.Equal(t, []string{"// one", "// two"}, bs[0].Lines)
	assert.Equal(t, 3, bs[0].StartLine)
	assert.Equal(t, 4, bs[0].EndLine)
	assert.Equal(t, []string{"// three"}, bs[1].Lines)
	assert.Equal(t, []string{"// four"}, bs[2].Lines)
	assert.Equal(t, "package p\n\n\n//go:generate x\nfunc f() {}\n", string(removeSpans([]byte(src), []Span{bs[0].Span, bs[1].Span, bs[2].Span})))
}

func TestBlocks_SegmentsKeepCodeApart(t *testing.T) {
	src := "package p\n\nvar a = 1 // trailing\nvar b /* mid */ = 2\n"
	bs := goBlocks(t, src)
	require.Len(t, bs, 2)
	assert.Equal(t, KindSegment, bs[0].Kind)
	assert.Equal(t, []string{"// trailing"}, bs[0].Lines)
	assert.Equal(t, " ", bs[1].Span.Replace)
	assert.Equal(t, "package p\n\nvar a = 1\nvar b = 2\n", string(removeSpans([]byte(src), []Span{bs[0].Span, bs[1].Span})))
}

func TestBlocks_DirectivePredicate(t *testing.T) {
	for _, d := range []string{"//go:build canary", "//go:embed x", "//nolint:gosec // reason", "//line a.go:1", "// biome-ignore lint/x: why", "/* biome-ignore lint/x: why */", "// @ts-expect-error", "/// <reference path=\"x\" />"} {
		assert.True(t, isDirective(d), d)
	}
	for _, c := range []string{"// go: not a directive", "// nolint is mentioned", "/** doc */", "// biome is nice"} {
		assert.False(t, isDirective(c), c)
	}
}

func TestNormalise_KeyStableUnderRewrap(t *testing.T) {
	a := []string{"// the wire wants oldest-first,", "// so reverse here"}
	b := []string{"// the wire wants", "// oldest-first, so reverse here"}
	c := []string{"/* the wire wants oldest-first, so reverse here */"}
	assert.Equal(t, KeyOf("p", a), KeyOf("p", b))
	assert.Equal(t, KeyOf("p", a), KeyOf("p", c))
	assert.NotEqual(t, KeyOf("p", a), KeyOf("q", a))
	assert.NotEqual(t, KeyOf("p", a), KeyOf("p", []string{"// something else"}))
}

func TestAnchor_OrdinalForRepeatedLines(t *testing.T) {
	src := "package p\n\nfunc f() {\n\tif a {\n\t}\n\t// why\n\tif b {\n\t}\n}\n"
	bs := goBlocks(t, src)
	require.Len(t, bs, 1)
	a := anchorFor([]byte(src), bs[0])
	assert.Equal(t, Anchor{Kind: "above", Text: "if b {", Line: 7}, a)
	stripped := removeSpans([]byte(src), []Span{bs[0].Span})
	assert.Equal(t, 6, locateAnchor([]byte(src), stripped, a, []Span{bs[0].Span}))

	seg := "package p\n\nvar a = 1\nvar a2 = 1 // c\n"
	sb := goBlocks(t, seg)
	sa := anchorFor([]byte(seg), sb[0])
	assert.Equal(t, Anchor{Kind: "on", Text: "var a2 = 1", Line: 4}, sa)
	assert.Equal(t, 4, locateAnchor([]byte(seg), removeSpans([]byte(seg), []Span{sb[0].Span}), sa, []Span{sb[0].Span}))
}

func TestRemoveSpans_DescendingAndEOF(t *testing.T) {
	src := []byte("ab// c\nde// f")
	out := removeSpans(src, []Span{{Start: 2, End: 7}, {Start: 9, End: 13}})
	assert.Equal(t, "abde", string(out))
	assert.Equal(t, "ab// c\nde// f", string(src), "input untouched")
}

func TestParseDiff_HunksAndRemovedIdents(t *testing.T) {
	diff := "diff --git a/internal/a/a.go b/internal/a/a.go\n--- a/internal/a/a.go\n+++ b/internal/a/a.go\n" +
		"@@ -5,2 +5,0 @@\n-// Helper does x.\n-func Helper() {}\n" +
		"@@ -9 +7,3 @@\n+// one\n+// two\n+func NewFn() {}\n" +
		"@@ -12,0 +13 @@\n+export function f() {}\n\\ No newline at end of file\n" +
		"diff --git a/web/src/old.ts b/web/src/new.ts\nsimilarity index 90%\nrename from web/src/old.ts\nrename to web/src/new.ts\n--- a/web/src/old.ts\n+++ b/web/src/new.ts\n@@ -1 +1 @@\n-export const A = 1;\n+export const B = 1;\n"
	d := parseDiff(diff)
	assert.Equal(t, map[int]bool{7: true, 8: true, 9: true, 13: true}, d.added["internal/a/a.go"])
	assert.Equal(t, map[int]bool{1: true}, d.added["web/src/new.ts"])
	assert.ElementsMatch(t, []string{"Helper", "A"}, d.removedIdents())
	assert.Equal(t, []string{"// Helper does x."}, d.removedComments("internal/a/a.go"))

	moved := parseDiff("--- a/x.go\n+++ b/x.go\n@@ -1 +0,0 @@\n-func Helper() {}\n--- a/y.go\n+++ b/y.go\n@@ -0,0 +1 @@\n+func Helper() {}\n")
	assert.Empty(t, moved.removedIdents(), "a moved declaration is not stale")
}

func TestVerdicts_Validate(t *testing.T) {
	m := &Manifest{Files: []FileEntry{{Candidates: []Candidate{{ID: "a#1"}, {ID: "a#2"}}}}}
	reasons, err := (&Verdicts{Keep: []KeepVerdict{{ID: "a#1", Reason: "why"}}, Drop: []string{"a#2"}}).validate(m)
	require.NoError(t, err)
	assert.Equal(t, map[string]string{"a#1": "why"}, reasons)

	_, err = (&Verdicts{Keep: []KeepVerdict{{ID: "a#1", Reason: "why"}}, Drop: []string{"a#1", "b#1"}}).validate(m)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "id a#1 appears 2 times")
	assert.Contains(t, err.Error(), "unknown id b#1")
	assert.Contains(t, err.Error(), "missing verdict for a#2")
}

func TestLedger_LatestVerdictWins(t *testing.T) {
	l := &Ledger{Cycles: []Cycle{
		{Cycle: 1, Keeps: []Keep{{Key: "k"}}, Drops: []Drop{{Key: "d"}}},
		{Cycle: 2, Drops: []Drop{{Key: "k"}}},
	}}
	assert.Equal(t, map[string]string{"k": "drop", "d": "drop"}, l.latestVerdicts())
	assert.Equal(t, 2, l.droppedIn("k"))
	assert.Equal(t, 1, l.droppedIn("d"))
}

func TestInScope(t *testing.T) {
	assert.True(t, InScope("cmd/musterd/main.go"))
	assert.True(t, InScope("internal/session/manager.go"))
	assert.True(t, InScope("web/src/features/launch.ts"))
	assert.False(t, InScope("internal/session/manager_test.go"))
	assert.False(t, InScope("web/src/features/launch.test.ts"))
	assert.False(t, InScope("web/e2e/launch.spec.ts"))
	assert.False(t, InScope("tools/versions/main.go"))
	assert.False(t, InScope("test/canary/live_test.go"))
}
