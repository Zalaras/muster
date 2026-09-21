package triage

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// TripwirePhrases are strings that essentially never appear in an honest bug report but
// are the opening move of a careless injection.
//
// Precision is excellent and recall is terrible: paraphrase, translation or encoding
// walks straight past this list. It is a tripwire, not a filter, and nothing in this
// package depends on it — a hit routes an issue to a human, and a miss still lands in
// the facts-only path if anything else about the body was irregular.
var TripwirePhrases = []string{
	"ignore previous instructions",
	"ignore all previous",
	"ignore prior instructions",
	"disregard the above",
	"disregard previous",
	"disregard all prior",
	"forget everything above",
	"new instructions",
	"system prompt",
	"you are now",
	"act as though",
	"override your instructions",
}

// reSeparators collapses the runs an author can use to break a phrase up without
// changing how it reads: "ignore-previous-instructions" and "ignore   previous\ninstructions"
// both normalise to the listed form.
var reSeparators = regexp.MustCompile(`[\s\-_.]+`)

// Tripwire reports the first listed phrase present in already-sanitised text.
//
// Matching normalises a copy; the stored text is never altered. Note the deliberate gap:
// a phrase split by a zero-width character survives normalisation intact and does NOT
// hit here — but the zero width itself is a flag, so the issue still leaves the normal
// path. TestRouteZeroWidthCoversTripwireGap pins that interaction.
func Tripwire(clean string) (string, bool) {
	norm := reSeparators.ReplaceAllString(strings.ToLower(clean), " ")
	for _, p := range TripwirePhrases {
		if strings.Contains(norm, p) {
			return p, true
		}
	}
	return "", false
}

// Path is where an issue goes after sanitising.
type Path int

const (
	// PathFactsOnly renders from enums and one quoted substring, with no model-authored
	// prose reaching TODO.md.
	//
	// It is the zero value deliberately. An Artifact whose Route was never set — a test
	// fixture, a struct decoded from an index written by another build — must render the
	// strict form, because the lax one is the only one that can leak. Before 2026-09-21
	// PathNormal held this slot and every Artifact literal in the tests meant "normal"
	// by accident.
	PathFactsOnly Path = iota
	// PathNormal additionally carries the sanitised issue title. The program supplies that
	// title and no model writes any part of the entry. Reached only by a clean body from a
	// trusted association — in practice, an issue the developer filed from their own dashboard.
	PathNormal
	// PathHeld never reaches a model at all and is reported for review.
	PathHeld
)

func (p Path) String() string {
	switch p {
	case PathNormal:
		return "normal"
	case PathHeld:
		return "held"
	default:
		return "facts-only"
	}
}

// Flags is everything mechanically observed about one body. Every field is derived by a
// program; none is a judgement.
type Flags struct {
	Counts
	SnapshotUnknownFields int
	SnapshotAmbiguous     bool
	Tripwire              string
	Bidi                  bool
}

// Any reports whether anything at all was irregular.
func (f Flags) Any() bool {
	return !f.Clean() || f.SnapshotUnknownFields > 0 || f.SnapshotAmbiguous ||
		f.Tripwire != "" || f.Bidi
}

// Strings renders the flags for the run report. Only counts, fixed names and the
// constant tripwire phrase — never a slice of the body, because this output lands in the
// main session's context, which is the place all of this exists to keep clean.
func (f Flags) Strings() []string {
	var out []string
	add := func(name string, n int) {
		if n > 0 {
			out = append(out, fmt.Sprintf("%s:%d", name, n))
		}
	}
	add("html_escaped", f.HTMLEscaped)
	add("links_stripped", f.LinksStripped)
	add("urls_defanged", f.URLsDefanged)
	add("zero_width", f.ZeroWidth)
	add("non_ascii", f.NonASCII)
	add("snapshot_unknown_fields", f.SnapshotUnknownFields)
	if f.Truncated {
		out = append(out, "body_truncated")
	}
	if f.SnapshotAmbiguous {
		out = append(out, "snapshot_ambiguous")
	}
	if f.Bidi {
		out = append(out, "bidi_override")
	}
	if f.Tripwire != "" {
		out = append(out, "tripwire:"+f.Tripwire)
	}
	sort.Strings(out)
	return out
}

// TrustedAssociations is the set that may take the normal path.
//
// On this repo OWNER and MEMBER mean "filed from the developer's own dashboard button", so the
// normal path is effectively self-filed-only. Nothing may fall back to comparing the
// login against a name: the login is not the check, and an account can be renamed.
var TrustedAssociations = map[string]bool{"OWNER": true, "MEMBER": true}

// OwnerAssociation is the single association that means the repository owner filed this
// themselves.
//
// TrustedAssociations is deliberately wider — MEMBER earns the richer render path too — but
// only OWNER earns an in-session read. The member set grows the moment a collaborator is
// added, and a grant keyed on it would widen with it, silently and without anyone revisiting
// this decision (kb:adr/triage-owner-filed-artifacts-readable-in-session).
const OwnerAssociation = "OWNER"

// Readable reports whether the main session may open this issue's sanitised artifact.
//
// Both halves are required. PathNormal means Sanitize raised no flag on the title or the
// body; OwnerAssociation means the text is the developer's own. Neither alone is enough: a
// flagged owner issue is facts-only, and a clean MEMBER issue is somebody else's prose.
func Readable(association string, route Path) bool {
	return route == PathNormal && association == OwnerAssociation
}

// Route decides where an issue goes. Flags dominate association: a trusted author whose
// body needed intervention still takes the facts-only path, because the question is what
// the text does, not who sent it.
func Route(association string, f Flags) Path {
	switch {
	case f.Bidi || f.Tripwire != "":
		return PathHeld
	case !f.Any() && TrustedAssociations[association]:
		return PathNormal
	default:
		return PathFactsOnly
	}
}
