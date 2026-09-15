package kb

import (
	"fmt"
	"sort"
	"strings"
)

// Kinds is the closed list of diagram kinds and the mermaid keyword each opens with
// (kb:adr/knowledge-diagrams-are-mermaid-records). A diagram record's kind field and the
// first keyword of its one mermaid fence must agree; a mermaid fence in any record must
// open with one of these keywords.
var Kinds = map[string]string{
	"context":   "C4Context",
	"container": "C4Container",
	"component": "C4Component",
	"domain":    "classDiagram",
	"state":     "stateDiagram-v2",
	"sequence":  "sequenceDiagram",
	"er":        "erDiagram",
	"flow":      "flowchart",
}

// KindNames lists the kinds in a stable order for messages.
func KindNames() []string {
	out := make([]string, 0, len(Kinds))
	for k := range Kinds {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// mermaidKeywords lists the allowed opening keywords, sorted, for messages.
func mermaidKeywords() []string {
	out := make([]string, 0, len(Kinds))
	for _, kw := range Kinds {
		out = append(out, kw)
	}
	sort.Strings(out)
	return out
}

// mermaidFence is one ```mermaid fence in a markdown body: the 1-based line of its opening
// marker relative to the text it was cut from, and its inner lines.
type mermaidFence struct {
	Line  int
	Lines []string
}

// Keyword is the fence's opening mermaid keyword — the first token after blank lines,
// %% comment and directive lines and a --- frontmatter block — or empty when the fence
// has none.
func (f mermaidFence) Keyword() string {
	inFront := false
	for _, t := range f.Lines {
		s := strings.TrimSpace(t)
		switch {
		case s == "---":
			inFront = !inFront
		case inFront, s == "", strings.HasPrefix(s, "%%"):
		default:
			return strings.Fields(s)[0]
		}
	}
	return ""
}

// mermaidFences returns every ```mermaid (or ~~~mermaid) fence in text. Other fences are
// skipped whole, so a mermaid fence nested in a longer fence is not one.
func mermaidFences(text string) []mermaidFence {
	var out []mermaidFence
	fence, mermaid := "", false
	var cur *mermaidFence
	for i, t := range strings.Split(text, "\n") {
		m := fenceRE.FindStringSubmatch(t)
		switch {
		case m != nil && fence == "":
			fence = m[1]
			info := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(t), m[1]))
			mermaid = info == "mermaid" || strings.HasPrefix(info, "mermaid ")
			if mermaid {
				cur = &mermaidFence{Line: i + 1}
			}
		case m != nil && m[1][0] == fence[0] && len(m[1]) >= len(fence):
			fence = ""
			if mermaid && cur != nil {
				out = append(out, *cur)
			}
			cur, mermaid = nil, false
		case cur != nil:
			cur.Lines = append(cur.Lines, t)
		}
	}
	if cur != nil { // unterminated fence: still a fence, still checked
		out = append(out, *cur)
	}
	return out
}

// wordsOutsideMermaid counts the body's words with every mermaid fence's inner lines
// removed: diagram source is checked by keyword, not budgeted as prose. Every other
// fence counts, so a budget cannot be dodged by fencing prose.
func wordsOutsideMermaid(body string) int {
	skip := map[int]bool{}
	for _, f := range mermaidFences(body) {
		for i := range f.Lines {
			skip[f.Line+1+i] = true
		}
	}
	n := 0
	for i, t := range strings.Split(body, "\n") {
		if !skip[i+1] {
			n += len(strings.Fields(t))
		}
	}
	return n
}

// CheckFences reports every mermaid fence in text whose opening keyword is not one of the
// closed list. relpath names the file and lineOffset is added to each fence's line, so a
// record body checked from its BodyLine reports file lines.
func CheckFences(relpath, text string, lineOffset int) []Finding {
	var out []Finding
	for _, f := range mermaidFences(text) {
		kw := f.Keyword()
		if _, ok := kindOfKeyword(kw); ok {
			continue
		}
		msg := fmt.Sprintf("mermaid fence opens with %q (want one of: %s)", kw, strings.Join(mermaidKeywords(), ", "))
		if kw == "" {
			msg = fmt.Sprintf("mermaid fence has no diagram keyword (want one of: %s)", strings.Join(mermaidKeywords(), ", "))
		}
		out = append(out, Finding{Path: relpath, Line: f.Line + lineOffset, Msg: msg})
	}
	return out
}

// kindOfKeyword maps an opening keyword back to its kind.
func kindOfKeyword(kw string) (string, bool) {
	for k, v := range Kinds {
		if v == kw {
			return k, true
		}
	}
	return "", false
}
