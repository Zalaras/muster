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

// maxHeaderTitle caps the title inside an entry's bold span, in runes. The header line
// already carries the full markdown link, and TODO.md is read in a terminal.
const maxHeaderTitle = 90

// headerTitleReplacer neutralises everything that must not reach an entry's header line.
//
// The title is author text, and [Sanitize] deliberately leaves markdown intact (doc.go,
// § What survives), so each of these arrives unaltered:
//
//   - "*" breaks the pre-commit hook's [^*] bold-span match, which refuses the commit
//   - the [StructureForging] sequences forge a cell, a link or a code span once spliced
//
// Angle brackets cannot occur here — escapeHTML ran before the title was stored — but they
// are replaced anyway rather than trusted, because the hook rejects any entry line carrying
// one and a silent refusal at commit time is a poor way to find out.
var headerTitleReplacer = newHeaderReplacer()

func newHeaderReplacer() *strings.Replacer {
	pairs := []string{"*", ""}
	for _, bad := range StructureForging {
		switch bad {
		case "|":
			pairs = append(pairs, bad, "/")
		case "`":
			pairs = append(pairs, bad, "'")
		case "](":
			pairs = append(pairs, bad, ") (")
		default:
			pairs = append(pairs, bad, "")
		}
	}
	return strings.NewReplacer(pairs...)
}

// HeaderSafe reduces a sanitised title to something that can sit inside an entry's bold span.
//
// Whitespace collapses to single spaces, which is also what removes the interior newline a
// truncated title carries: [SanitizeTitle] appends TruncationMarker ("\n[truncated]") and the
// trailing TrimSpace does not take it off, because the result ends in "]" rather than in
// whitespace. Left alone that newline would split the header line in two.
//
// An empty result becomes a placeholder rather than an empty bold span, which the hook's
// [^*]\{1,\} would reject.
func HeaderSafe(s string) string {
	s = headerTitleReplacer.Replace(s)
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > maxHeaderTitle {
		s = strings.TrimSpace(string(r[:maxHeaderTitle])) + "…"
	}
	if s == "" {
		return "untitled"
	}
	return s
}

// RenderEntry produces the TODO.md entry for one issue, on the path its route names.
//
// Both paths render from data the program holds: closed-set enums, an integer GitHub
// asserted, one quoted substring already checked verbatim against the sanitised body, and —
// on the normal path — the sanitised title. No model authors any part of an entry
// (kb:adr/triage-program-not-model-between-github-and-todo).
//
// The guarantee that matters is structural, not textual. Markdown survives sanitisation by
// design, so a title or body can still contain a line reading "## Issues"; spliced in raw
// that would forge a section heading and break the next run's scanner. Containing that is
// this function's job: no continuation line it emits begins with a markdown structural
// character at column 0, and every title passes through [HeaderSafe].
// [CheckEntryShape] asserts the first; the pre-commit hook asserts the second.
func RenderEntry(a Artifact, p Proposal, repo string) string {
	if a.Route == PathNormal {
		return renderNormal(a, p, repo)
	}
	return renderFactsOnly(a, p, repo)
}

// renderNormal carries the issue's own title, so a later session can act on the entry without
// opening the ticket — which is the read this package exists to prevent, and which the
// facts-only entry used to prescribe (kb:adr/triage-normal-path-carries-the-sanitised-title).
//
// It says nothing about the reporter being untrusted, because on this path they are not.
func renderNormal(a Artifact, p Proposal, repo string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "- [ ] **%s** ([#%d](%s)) — %s: %s.\n",
		HeaderSafe(a.Title), a.Number, IssueURL(repo, a.Number), p.Component, p.Symptom)
	if p.ErrorString != "" {
		fmt.Fprintf(&b, "  Reported error: %q.\n", p.ErrorString)
	}
	return b.String()
}

// renderFactsOnly is the entry for everything that is not a clean body from a trusted author:
// enums, and one quoted substring found verbatim in the sanitised body.
//
// Its closing line names the safe way to get the detail. It used to name the ticket instead,
// pointing the next session — holding Bash and Edit, with no sanitiser and no Read-only proposer
// between it and the text — straight at the untrusted body.
func renderFactsOnly(a Artifact, p Proposal, repo string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "- [ ] **%s: %s** ([#%d](%s))\n", p.Component, p.Symptom, a.Number, IssueURL(repo, a.Number))
	if p.ErrorString != "" {
		fmt.Fprintf(&b, "  — reported error: %q. Entry generated from validated fields only\n", p.ErrorString)
	} else {
		b.WriteString("  — no error text was quoted. Entry generated from validated fields only\n")
	}
	b.WriteString("  (reporter not trusted; body withheld). For the detail, re-run tools/triage fetch and\n")
	b.WriteString("  have a Read-only proposer summarise it — never open the issue in a session with tools.\n")
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
