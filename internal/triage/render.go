package triage

import (
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

// IssueURL builds the only URL an entry ever carries, from the integer GitHub asserted.
// Nothing model-authored reaches a URL position.
func IssueURL(repo string, n int) string {
	return fmt.Sprintf("https://github.com/%s/issues/%d", repo, n)
}

// maxHeaderTitle caps the title inside an entry's bold span, in runes. The header line
// already carries the full markdown link, and TODO.md is read in a terminal.
const maxHeaderTitle = 90

// wrapWidth is where the summary wraps, matching the hand-written entries around it.
const wrapWidth = 100

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

// unverifiedPrefix opens the summary of every entry that did not take the normal path, so
// a later reader knows the sentences after it describe an outside report nobody checked.
const unverifiedPrefix = "Summary of an unverified report: "

// RenderEntry produces the TODO.md entry for one issue — the same shape on every path:
//
//   - [ ] **title** ([#N](url)) — symptom. Expected: expected.
//     Reported error: "quote".                       (only when one was quoted)
//     Filed <date> from musterd <v> / Claude Code <v>, <view> view, session <state>; k images attached.
//     Labels: kind, area, modifiers.
//
// A restricted entry's summary opens with [unverifiedPrefix]. Everything rendered is data
// the program validated: the sanitised title through [HeaderSafe], an integer GitHub
// asserted, the proposer's bounded summary fields, one quoted substring checked verbatim
// against the sanitised body, snapshot leaves the schema's checks admitted, and label names
// from closed lists.
//
// The guarantee that matters is structural, not textual. Markdown survives sanitisation by
// design, so a title can still read "## Issues"; spliced in raw that would forge a section
// heading and break the next run's scanner. Containing that is this function's job: no
// continuation line it emits begins at column 0, the header stays on one line however long
// the title, and the pre-commit hook asserts the header's shape.
func RenderEntry(a Artifact, p Proposal, repo string) string {
	var b strings.Builder
	summary := sentence(p.Symptom) + " Expected: " + sentence(p.Expected)
	if a.Route != PathNormal {
		summary = unverifiedPrefix + summary
	}
	wrapLines(&b, fmt.Sprintf("- [ ] **%s** ([#%d](%s)) —", HeaderSafe(a.Title), a.Number, IssueURL(repo, a.Number)), summary)
	if p.ErrorString != "" {
		fmt.Fprintf(&b, "  Reported error: %q.\n", p.ErrorString)
	}
	if fl := factLine(a); fl != "" {
		b.WriteString("  " + fl + "\n")
	}
	b.WriteString("  Labels: " + strings.Join(p.Labels(), ", ") + ".\n")
	return b.String()
}

// sentence makes a summary field read as one: trimmed, ending in a full stop.
func sentence(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || strings.HasSuffix(s, ".") || strings.HasSuffix(s, "!") || strings.HasSuffix(s, "?") {
		return s
	}
	return s + "."
}

// wrapLines lays prefix and text out at wrapWidth. The prefix is never broken — it carries
// the header the pre-commit hook matches on one line — and every continuation line is
// indented by two spaces, which is what makes it part of this entry rather than a new block.
func wrapLines(b *strings.Builder, prefix, text string) {
	line := prefix
	for _, w := range strings.Fields(text) {
		if line != prefix && utf8.RuneCountInString(line)+1+utf8.RuneCountInString(w) > wrapWidth {
			b.WriteString(line + "\n")
			line = "  " + w
			continue
		}
		line += " " + w
	}
	b.WriteString(line + "\n")
}

// factLine renders what the program knows about the report from validated data alone: the
// filing date GitHub asserted, the versions and view and state the snapshot schema admitted
// (each a checked token, so no structure can hide in one), and the number of images the
// author attached. Every clause is optional; the line is omitted when nothing validated.
func factLine(a Artifact) string {
	var clauses []string
	head := ""
	if t, err := time.Parse(time.RFC3339, a.CreatedAt); err == nil {
		head = "Filed " + t.UTC().Format("2006-01-02")
	}
	var versions []string
	if v := a.snapshotValue("musterd.version"); v != "" {
		versions = append(versions, "musterd "+v)
	}
	if v := a.snapshotValue("claudeCode.installed"); v != "" {
		versions = append(versions, "Claude Code "+v)
	}
	switch {
	case head != "" && len(versions) > 0:
		head += " from " + strings.Join(versions, " / ")
	case len(versions) > 0:
		head = "From " + strings.Join(versions, " / ")
	}
	if head != "" {
		clauses = append(clauses, head)
	}
	if v := a.snapshotValue("dashboard.view"); v != "" {
		clauses = append(clauses, v+" view")
	}
	if v := a.snapshotValue("session.state"); v != "" {
		clauses = append(clauses, "session "+v)
	}
	line := strings.Join(clauses, ", ")
	if n := a.Flags.Images; n > 0 {
		img := fmt.Sprintf("%d images attached", n)
		if n == 1 {
			img = "1 image attached"
		}
		if line == "" {
			line = strings.ToUpper(img[:1]) + img[1:]
		} else {
			line += "; " + img
		}
	}
	if line == "" {
		return ""
	}
	return line + "."
}

// snapshotValue looks one validated leaf up by path.
func (a Artifact) snapshotValue(path string) string {
	for _, kv := range a.SnapshotFields {
		if kv.Path == path {
			return kv.Value
		}
	}
	return ""
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
