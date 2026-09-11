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
	// PathNormal keeps today's richer prose entry. Reached only by a clean body from a
	// trusted association — in practice, an issue Damian filed from his own dashboard.
	PathNormal Path = iota
	// PathFactsOnly renders from enums and one quoted substring, with no model-authored
	// prose reaching TODO.md.
	PathFactsOnly
	// PathHeld never reaches a model at all and is reported for review.
	PathHeld
)

func (p Path) String() string {
	switch p {
	case PathNormal:
		return "normal"
	case PathFactsOnly:
		return "facts-only"
	default:
		return "held"
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
// On this repo OWNER and MEMBER mean "filed from Damian's own dashboard button", so the
// normal path is effectively self-filed-only. Nothing may fall back to comparing the
// login against a name: the login is not the check, and an account can be renamed.
var TrustedAssociations = map[string]bool{"OWNER": true, "MEMBER": true}

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
