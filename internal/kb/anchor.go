package kb

import (
	"fmt"
	"regexp"
	"strings"
)

// protocolPath is the one file that may carry kb:anchor comments.
const protocolPath = "docs/protocol.md"

var (
	anchorRE  = regexp.MustCompile(`^<!-- kb:anchor ([a-z0-9-]+(?:\.[a-z0-9-]+)*) -->$`)
	headingRE = regexp.MustCompile(`^(#{1,6}) (.*)$`)
)

// Anchor is one anchored section of docs/protocol.md. Start is the heading line, End the
// last line of the section (both 1-based, inclusive); Parent is the nearest preceding
// level-two heading's text, or empty.
type Anchor struct {
	ID      string
	Line    int
	Level   int
	Heading string
	Parent  string
	Start   int
	End     int
}

// heading is one prose heading of docs/protocol.md: its 1-based line, its level and its
// text.
type heading struct {
	line, level int
	text        string
}

// collectHeadings lists the prose headings of lines, in line order.
func collectHeadings(lines []string, prose map[int]bool) []heading {
	var headings []heading
	for i, t := range lines {
		if !prose[i+1] {
			continue
		}
		if m := headingRE.FindStringSubmatch(t); m != nil {
			headings = append(headings, heading{line: i + 1, level: len(m[1]), text: m[2]})
		}
	}
	return headings
}

// findHeadingAt returns the heading sitting on line, or nil.
func findHeadingAt(headings []heading, line int) *heading {
	for k := range headings {
		if headings[k].line == line {
			return &headings[k]
		}
	}
	return nil
}

// computeParentAndEnd finds next's nearest preceding level-two heading and the last line
// before the following heading at or above next's level. end comes in as the document's
// last line and is narrowed. Both depend on headings being in line order.
func computeParentAndEnd(headings []heading, next *heading, end int) (parent string, _ int) {
	for _, h := range headings {
		if next.level == 3 && h.line < next.line && h.level == 2 {
			parent = h.text
		}
		if h.line > next.line && h.level <= next.level && h.line-1 < end {
			end = h.line - 1
		}
	}
	return parent, end
}

// ParseAnchors reads every kb:anchor comment in protocol (design §7): each must sit on
// the line immediately before a level-two or level-three heading outside a code fence,
// and ids must be unique. order lists ids by line.
func ParseAnchors(protocol string) (anchors map[string]Anchor, order []string, findings []Finding) {
	anchors = map[string]Anchor{}
	lines := strings.Split(protocol, "\n")
	prose := map[int]bool{}
	for _, ln := range proseLines(protocol) {
		prose[ln.N] = true
	}
	headings := collectHeadings(lines, prose)
	firstLine := map[string]int{}
	for i, t := range lines {
		if !prose[i+1] {
			continue
		}
		m := anchorRE.FindStringSubmatch(t)
		if m == nil {
			continue
		}
		id, lineNo := m[1], i+1
		next := findHeadingAt(headings, lineNo+1)
		if next == nil || next.level < 2 || next.level > 3 {
			findings = append(findings, Finding{Path: protocolPath, Line: lineNo,
				Msg: fmt.Sprintf("kb:anchor %q is not immediately followed by a ## or ### heading", id)})
			continue
		}
		if first, dup := firstLine[id]; dup {
			findings = append(findings, Finding{Path: protocolPath, Line: lineNo,
				Msg: fmt.Sprintf("duplicate kb:anchor %q (first at line %d)", id, first)})
			continue
		}
		firstLine[id] = lineNo
		a := Anchor{ID: id, Line: lineNo, Level: next.level, Heading: next.text, Start: next.line, End: len(lines)}
		a.Parent, a.End = computeParentAndEnd(headings, next, a.End)
		anchors[id] = a
		order = append(order, id)
	}
	return anchors, order, findings
}

// Slice renders an anchored section: one italic breadcrumb naming the parent section,
// then the source lines from the heading to the section end with every anchor comment
// omitted and trailing blank lines trimmed. Heading levels are kept as in the source.
func Slice(protocol string, a Anchor) string {
	lines := strings.Split(protocol, "\n")
	crumb := "_" + protocolPath + "_"
	if a.Parent != "" {
		crumb = "_" + protocolPath + " § " + a.Parent + "_"
	}
	out := []string{crumb}
	for i := a.Start - 1; i < a.End && i < len(lines); i++ {
		if anchorRE.MatchString(lines[i]) {
			continue
		}
		out = append(out, lines[i])
	}
	for len(out) > 1 && strings.TrimSpace(out[len(out)-1]) == "" {
		out = out[:len(out)-1]
	}
	return strings.Join(out, "\n")
}
