package kb

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestMermaidFences_FindsOnlyMermaidFencesAndSkipsPreambleForTheKeyword(t *testing.T) {
	text := "prose\n\n```go\nfunc x() {}\n```\n\n```mermaid\n%% a comment\n---\ntitle: Sessions\n---\n\nstateDiagram-v2\n  a --> b\n```\n\n~~~mermaid\nsequenceDiagram\n~~~\n\n```mermaid\n%% only a comment\n```\n"
	fences := mermaidFences(text)
	if assert.Len(t, fences, 3) {
		assert.Equal(t, 7, fences[0].Line)
		assert.Equal(t, "stateDiagram-v2", fences[0].Keyword(), "comments and a title frontmatter block are skipped")
		assert.Equal(t, "sequenceDiagram", fences[1].Keyword(), "tilde fences count")
		assert.Empty(t, fences[2].Keyword(), "a fence with nothing but comments has no keyword")
	}
	assert.Empty(t, mermaidFences("````md\n```mermaid\nflowchart\n```\n````\n"), "a mermaid fence nested in a longer fence is not one")
}

func TestCheckFences_ReportsUnknownAndMissingKeywordsWithFileLines(t *testing.T) {
	text := "a\n```mermaid\npie\n```\n```mermaid\nerDiagram\n```\n```mermaid\n\n```\n"
	got := CheckFences("plans/x/plan.md", text, 10)
	if assert.Len(t, got, 2) {
		assert.Equal(t, "plans/x/plan.md:12: mermaid fence opens with \"pie\" (want one of: C4Component, C4Container, C4Context, classDiagram, erDiagram, flowchart, sequenceDiagram, stateDiagram-v2)", got[0].String())
		assert.Equal(t, "plans/x/plan.md:18: mermaid fence has no diagram keyword (want one of: C4Component, C4Container, C4Context, classDiagram, erDiagram, flowchart, sequenceDiagram, stateDiagram-v2)", got[1].String())
	}
}

func TestWordsOutsideMermaid_ExcludesMermaidFencesButCountsOtherFences(t *testing.T) {
	assert.Equal(t, 7, wordsOutsideMermaid("one two\n\n```go\nthree four five\n```\n"))
	assert.Equal(t, 4, wordsOutsideMermaid("one two\n\n```mermaid\nflowchart LR\n  a --> b --> c\n```\n"), "the fence markers count, the diagram source does not")
}
