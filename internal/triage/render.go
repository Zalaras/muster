package triage

import (
	"fmt"
	"strings"
)

// IssueURL builds the only URL an entry ever carries, from the integer GitHub asserted.
// Nothing model-authored reaches a URL position.
func IssueURL(repo string, n int) string {
	return fmt.Sprintf("https://github.com/%s/issues/%d", repo, n)
}

// RenderEntry produces the TODO.md entry for an issue on the facts-only path.
//
// Every token is a closed-set enum, an integer GitHub asserted, or one quoted substring
// already checked against the sanitised body. The house style is TODO.md's: the title
// line carries the full markdown link, and continuation lines are indented two spaces.
//
// The guarantee that matters is structural, not textual. Markdown survives sanitisation
// by design, so a body can still contain a line reading "## Reported issues (pre-v1
// release)"; spliced in raw that would forge a section heading and break the next run's
// scanner. Containing that is this function's job: no continuation line it emits begins
// with a markdown structural character at column 0. [CheckEntryShape] asserts it.
func RenderEntry(a Artifact, p Proposal, repo string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "- [ ] **%s: %s** ([#%d](%s))\n", p.Component, p.Symptom, a.Number, IssueURL(repo, a.Number))
	if p.ErrorString != "" {
		fmt.Fprintf(&b, "  — reported error: %q. Entry generated from validated fields only\n", p.ErrorString)
	} else {
		b.WriteString("  — no error text was quoted. Entry generated from validated fields only\n")
	}
	fmt.Fprintf(&b, "  (reporter not trusted; body withheld) — read issue #%d for the detail.\n", a.Number)
	return b.String()
}

// structuralPrefixes are the characters that start a markdown block. One of them at
// column 0 inside an entry would forge structure in the file the entry lands in.
const structuralPrefixes = "#`-|[>*_=+"

// CheckEntryShape verifies a rendered entry cannot forge structure in TODO.md.
//
// The first line is exempt: it is the house-style checkbox, which must start with "- ".
// Every other line has to be indented, which is what makes it part of this entry rather
// than a new block in the document.
func CheckEntryShape(entry string) error {
	lines := strings.Split(strings.TrimRight(entry, "\n"), "\n")
	for i, ln := range lines {
		if i == 0 {
			if !strings.HasPrefix(ln, "- [ ] **") {
				return fmt.Errorf("entry line 1 does not open the house-style checkbox: %q", ln)
			}
			continue
		}
		if ln == "" {
			return fmt.Errorf("entry line %d is blank, which would end the entry", i+1)
		}
		if !strings.HasPrefix(ln, "  ") {
			return fmt.Errorf("entry line %d is not indented: %q", i+1, ln)
		}
		if strings.ContainsAny(ln[:1], structuralPrefixes) {
			return fmt.Errorf("entry line %d starts a markdown block at column 0: %q", i+1, ln)
		}
	}
	return nil
}
