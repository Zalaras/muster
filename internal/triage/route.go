package triage

import (
	"fmt"
	"sort"
)

// Path is where an issue goes after sanitising.
type Path int

const (
	// PathRestricted is every issue that is neither held nor the developer's own clean
	// report: its entry renders from the proposer's bounded, validated summary and is
	// marked as an unverified report.
	//
	// It is the zero value deliberately. An Artifact whose Route was never set — a test
	// fixture, a struct decoded from an index written by another build — must take the
	// strict path, because the lax one is the only one that can leak.
	PathRestricted Path = iota
	// PathNormal is an OWNER-filed issue with no danger signal: the session may read its
	// sanitised artifact, and its entry carries no unverified-report prefix.
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
		return "restricted"
	}
}

// Thresholds for the optional classifier ([Scorer]). A score is a probability that the text
// carries an injection; at ScoreRestrict the issue loses the normal path, at ScoreHold it is
// held like a tripwire hit. The numbers follow the convention the local detectors in the
// field use (0.5 flag, 0.8 block) and are deliberately not tunable per run.
const (
	ScoreRestrict = 0.5
	ScoreHold     = 0.8
)

// Flags is everything mechanically observed about one body. Every field is derived by a
// program; none is a judgement.
//
// Counts are information, not signals: a pasted screenshot, a URL or a '<' in a log line is
// how an honest report looks, and none of them moves an issue off a path. The signals are
// Bidi, Tripwire, ZeroWidth and a classifier score.
type Flags struct {
	Counts
	SnapshotUnknownFields int
	SnapshotAmbiguous     bool
	Tripwire              string // a RuleFamily name, never a phrase or a slice of the body
	Bidi                  bool
	Scored                bool
	Score                 float64
	ScorerFailed          bool
}

// Strings renders the flags for the run report. Only counts, fixed names and a rule family's
// name — never a slice of the body, because this output lands in the main session's context,
// which is the place all of this exists to keep clean.
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
	add("images", f.Images)
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
	if f.Scored {
		out = append(out, fmt.Sprintf("score:%.2f", f.Score))
	}
	if f.ScorerFailed {
		out = append(out, "scorer_failed")
	}
	sort.Strings(out)
	return out
}

// OwnerAssociation is the single association that means the repository owner filed this
// themselves. It is deliberately not a wider "trusted" set: MEMBER grows the moment a
// collaborator is added, and a grant keyed on it would widen silently
// (kb:adr/triage-owner-filed-artifacts-readable-in-session).
const OwnerAssociation = "OWNER"

// Readable reports whether the main session may open this issue's sanitised artifact.
//
// Both halves are required. PathNormal means no danger signal fired; OwnerAssociation means
// the text is the developer's own. Neither alone is enough.
func Readable(association string, route Path) bool {
	return route == PathNormal && association == OwnerAssociation
}

// danger reports whether a signal short of a hold fired: hidden zero-width text, or a
// classifier score at or above ScoreRestrict.
func danger(f Flags) bool {
	return f.ZeroWidth > 0 || (f.Scored && f.Score >= ScoreRestrict)
}

// Route decides where an issue goes. Signals dominate association: the developer's own
// issue with a tripwire hit is held, because the question is what the text does, not who
// sent it. Counts play no part, so the developer's screenshots, links and log lines never
// demote their own report (kb:adr/triage-owner-issues-normal-unless-held).
func Route(association string, f Flags) Path {
	switch {
	case f.Bidi || f.Tripwire != "" || (f.Scored && f.Score >= ScoreHold):
		return PathHeld
	case association == OwnerAssociation && !danger(f):
		return PathNormal
	default:
		return PathRestricted
	}
}
