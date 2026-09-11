package triage

import (
	"fmt"
	"regexp"
	"strings"
)

var reFenceLine = regexp.MustCompile("^(`{3,})")

// HasIssue reports whether TODO.md already owns an entry for issue n.
//
// Matching is on the issues/N URL, never a bare #N. Measured on the real file, a bare
// #N has two false-positive sources: "#343a4a" is a hex colour in a design note, and a
// cross-reference like "same seam as #4" makes #4 look triaged when it has no entry of
// its own. The boundary check stops issues/4 matching inside issues/42.
func HasIssue(todo string, n int) bool {
	re := regexp.MustCompile(fmt.Sprintf(`issues/%d(\D|$)`, n))
	return re.MatchString(todo)
}

// Untriaged returns the issues with no entry in TODO.md.
//
// The triaged set is computed here rather than by a model running grep — one less reason
// for anything holding Edit to open that file.
func Untriaged(todo string, issues []Issue) []Issue {
	var out []Issue
	for _, iss := range issues {
		if !HasIssue(todo, iss.Number) {
			out = append(out, iss)
		}
	}
	return out
}

// SectionNames lists the "## " headings, skipping fenced regions.
//
// Fence awareness is not decoration. TODO.md has no code fences today, but an entry is
// the one thing that can introduce one, and a "## " line inside a fence is text rather
// than a heading — a scanner that cannot tell them apart can be steered into splicing
// into a section an author invented.
func SectionNames(todo string) []string {
	var out []string
	for _, ln := range scanLines(todo) {
		if ln.fenced {
			continue
		}
		if s, ok := strings.CutPrefix(ln.text, "## "); ok {
			out = append(out, strings.TrimSpace(s))
		}
	}
	return out
}

type line struct {
	text   string
	fenced bool
}

func scanLines(s string) []line {
	raw := strings.Split(s, "\n")
	out := make([]line, len(raw))
	fence := 0
	for i, t := range raw {
		if m := reFenceLine.FindStringSubmatch(t); m != nil {
			if fence == 0 {
				fence = len(m[1])
			} else if len(m[1]) >= fence {
				fence = 0
			}
			out[i] = line{text: t, fenced: true}
			continue
		}
		out[i] = line{text: t, fenced: fence > 0}
	}
	return out
}

// Splice inserts an entry at the end of a section, preserving the blank line between
// entries. Appending rather than sorting is deliberate: TODO.md's "Reported issues"
// preamble records that open entries sit in Damian's priority order, and re-sorting
// would silently discard a ranking he set by hand.
//
// A pure insertion — the result is the original with one block added, and nothing else
// touched. TestSpliceIsPureInsertion holds that.
func Splice(todo, section, entry string) (string, error) {
	if err := CheckEntryShape(entry); err != nil {
		return "", err
	}
	lines := scanLines(todo)
	start := -1
	for i, ln := range lines {
		if !ln.fenced && ln.text == "## "+section {
			if start >= 0 {
				return "", fmt.Errorf("section %q appears more than once", section)
			}
			start = i
		}
	}
	if start < 0 {
		return "", fmt.Errorf("section %q not found", section)
	}

	end := len(lines)
	for i := start + 1; i < len(lines); i++ {
		if !lines[i].fenced && strings.HasPrefix(lines[i].text, "## ") {
			end = i
			break
		}
	}
	// Step back over the blank lines that separate the section from the next heading, so
	// the entry lands after the last entry rather than after the gap.
	for end > start+1 && strings.TrimSpace(lines[end-1].text) == "" {
		end--
	}

	body := strings.TrimRight(entry, "\n")
	out := make([]string, 0, len(lines)+3)
	for i := 0; i < end; i++ {
		out = append(out, lines[i].text)
	}
	out = append(out, "", body)
	for i := end; i < len(lines); i++ {
		out = append(out, lines[i].text)
	}
	return strings.Join(out, "\n"), nil
}

var reEntryStart = regexp.MustCompile(`^- \[([ xX])\] `)

// EntryState reads the checkbox of the entry that OWNS issue n.
//
// Entries are split on a "- [ ]" or "- [x]" at column 0 and the owning entry is the one
// whose own block carries the issues/N link. Reading the checkbox off any block that
// merely mentions the issue would attribute another item's state to it — the file is full
// of cross-references, and getting this wrong is how an audit reports a fix that never
// landed.
func EntryState(todo string, n int) (checked, found bool) {
	lines := scanLines(todo)
	start := -1
	for i := 0; i <= len(lines); i++ {
		atBoundary := i == len(lines) || (!lines[i].fenced && reEntryStart.MatchString(lines[i].text))
		if !atBoundary {
			continue
		}
		if start >= 0 {
			var block strings.Builder
			for _, ln := range lines[start:i] {
				block.WriteString(ln.text)
				block.WriteString("\n")
			}
			if HasIssue(block.String(), n) {
				m := reEntryStart.FindStringSubmatch(lines[start].text)
				return m[1] != " ", true
			}
		}
		start = i
	}
	return false, false
}
