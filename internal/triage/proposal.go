package triage

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// Sections the proposer may hint at. A hint only: apply files by kind (SectionForKind) and
// the developer re-sorts by hand.
var Sections = []string{
	"Features",
	"Enhancements",
	"Bugs",
	"Tweaks",
	"Post v1",
}

// Proposal is everything the proposer is allowed to say about one issue.
//
// Kind, Area and Modifiers are closed sets (labels.go). Symptom and Expected are the two
// bounded free-text fields that reach TODO.md: short, printable ASCII, no link, no markup,
// checked against the tripwire. ErrorString is a verbatim quote from the sanitised body.
type Proposal struct {
	Number      int      `json:"number"`
	Ack         string   `json:"ack"`
	Kind        string   `json:"kind"`
	Area        []string `json:"area"`
	Modifiers   []string `json:"modifiers"`
	Symptom     string   `json:"symptom"`
	Expected    string   `json:"expected"`
	ErrorString string   `json:"error_string"`
	SectionHint string   `json:"section_hint"`
}

// maxErrorString bounds the quote. It is not prose: it has to appear verbatim in the
// sanitised body, which is already stripped of markup and links.
const maxErrorString = 80

// maxFreeText bounds each of the two summary fields, in bytes (they are ASCII, so runes).
// Two sentences, not a paragraph: enough to say what happened and what should have.
const maxFreeText = 240

// maxAreas is how many surfaces one issue may centre on.
const maxAreas = 2

// StructureForging are the sequences that would let author text forge structure once spliced
// into TODO.md: a tag, a table cell, a link, a code span.
//
// Two dispositions. [checkErrorString] and [checkFreeText] reject text containing one,
// because a bad field holds the issue. [HeaderSafe] replaces them instead, because a title is
// not optional — the entry still has to file when the title is hostile.
var StructureForging = []string{"<", ">", "|", "](", "`"}

// freeTextForbidden are sequences a summary may not carry beyond StructureForging: a URL in
// either spelling, and `issues/`, which the pre-commit hook would read as an entry header
// on a continuation line and refuse the commit.
var freeTextForbidden = []string{"://", "www.", "issues/"}

// reJSONFence strips one wrapping code fence. The model will add one; that is not an
// error worth holding an issue over. Anything outside the fence is.
var reJSONFence = regexp.MustCompile("(?s)\\A\\s*```(?:json)?\\s*\\n(.*?)\\n\\s*```\\s*\\z")

// requiredKeys must all be present. DisallowUnknownFields catches extra keys but says
// nothing about missing ones, and a missing enum would otherwise decode to "".
var requiredKeys = []string{"number", "ack", "kind", "area", "modifiers", "symptom", "expected", "error_string", "section_hint"}

// ValidateProposal checks one proposer reply against the artifact it was given.
//
// Every failure is a hold, never a repair. The proposer read attacker-controlled text, so
// its reply is attacker-influenced by construction; what makes that survivable is that
// nothing here is taken on trust — the ack proves which artifact it read, the labels are
// closed sets, the summary fields are bounded and tripwire-checked, and the quote has to be
// found verbatim in the sanitised body.
func ValidateProposal(raw []byte, a Artifact) (Proposal, error) {
	p, err := decodeProposal(raw)
	if err != nil {
		return Proposal{}, err
	}
	if p.Number != a.Number {
		return Proposal{}, fmt.Errorf("reply is for issue %d, artifact is issue %d", p.Number, a.Number)
	}
	// The ack proves the reply came from a proposer that read this artifact, not another
	// issue's. A deliberate injection can echo it back — it catches derailment, not a
	// careful attack, and the checks below are what actually bound the damage.
	if p.Ack != a.Nonce {
		return Proposal{}, fmt.Errorf("ack does not match this artifact's nonce")
	}
	if err := checkLabels(p); err != nil {
		return Proposal{}, err
	}
	// needs-info marks an outside report that cannot be acted on yet (conventions § Issue
	// labels). The developer's own report is always actionable — a question in it is a
	// question for the developer, not missing information — so on the normal route the
	// label is a proposer misreading and the proposal holds.
	if a.Route == PathNormal && inSet("needs-info", p.Modifiers) {
		return Proposal{}, fmt.Errorf("modifier needs-info is only for a restricted report; this artifact routes normal")
	}
	if !inSet(p.SectionHint, Sections) {
		return Proposal{}, fmt.Errorf("section_hint %q is not in the allowed set", p.SectionHint)
	}
	if err := checkFreeText("symptom", p.Symptom); err != nil {
		return Proposal{}, err
	}
	if err := checkFreeText("expected", p.Expected); err != nil {
		return Proposal{}, err
	}
	if err := checkErrorString(p.ErrorString, a.Body); err != nil {
		return Proposal{}, err
	}
	// The summary is model prose that read attacker text; the tripwire runs over it too, so a
	// proposer that was talked into relaying an instruction holds the issue instead.
	if family, hit := Tripwire(p.Symptom + "\n" + p.Expected + "\n" + p.ErrorString); hit {
		return Proposal{}, fmt.Errorf("the summary trips %s", family)
	}
	return p, nil
}

// decodeProposal turns the reply into a Proposal, with every structural failure named.
func decodeProposal(raw []byte) (Proposal, error) {
	s := string(bytes.TrimSpace(raw))
	if m := reJSONFence.FindStringSubmatch(s); m != nil {
		s = m[1]
	}

	// Decoded rather than Unmarshalled so trailing content reports as trailing content
	// instead of as a malformed document — a derailed proposer appends prose, and the
	// error the run report carries should say so.
	keyDec := json.NewDecoder(strings.NewReader(s))
	var keys map[string]json.RawMessage
	if err := keyDec.Decode(&keys); err != nil {
		return Proposal{}, fmt.Errorf("reply is not a JSON object: %w", err)
	}
	if keyDec.More() {
		return Proposal{}, fmt.Errorf("reply carries trailing content after the JSON object")
	}
	for _, k := range requiredKeys {
		if _, ok := keys[k]; !ok {
			return Proposal{}, fmt.Errorf("reply is missing the %q key", k)
		}
	}

	dec := json.NewDecoder(strings.NewReader(s))
	dec.DisallowUnknownFields()
	var p Proposal
	if err := dec.Decode(&p); err != nil {
		return Proposal{}, fmt.Errorf("decoding reply: %w", err)
	}
	if dec.More() {
		return Proposal{}, fmt.Errorf("reply carries trailing content after the JSON object")
	}
	return p, nil
}

// checkLabels holds the kind, areas and modifiers to their closed sets.
func checkLabels(p Proposal) error {
	if !inSet(p.Kind, LabelKinds) {
		return fmt.Errorf("kind %q is not in the allowed set", p.Kind)
	}
	if len(p.Area) == 0 || len(p.Area) > maxAreas {
		return fmt.Errorf("area names %d surfaces, want 1 to %d", len(p.Area), maxAreas)
	}
	if err := checkSubset("area", p.Area, LabelAreas); err != nil {
		return err
	}
	return checkSubset("modifiers", p.Modifiers, LabelModifiers)
}

func checkSubset(name string, got, allowed []string) error {
	seen := map[string]bool{}
	for _, v := range got {
		if !inSet(v, allowed) {
			return fmt.Errorf("%s %q is not in the allowed set", name, v)
		}
		if seen[v] {
			return fmt.Errorf("%s repeats %q", name, v)
		}
		seen[v] = true
	}
	return nil
}

// checkFreeText bounds a summary field. Printable ASCII only — which also rules out line
// breaks, tabs and the zero-width tricks — none of the structure-forging sequences, no URL,
// no `issues/`, and never empty: an entry without a symptom is the enum-only form this
// schema exists to replace.
func checkFreeText(name, s string) error {
	if strings.TrimSpace(s) == "" {
		return fmt.Errorf("%s is empty", name)
	}
	if len(s) > maxFreeText {
		return fmt.Errorf("%s is %d bytes, limit is %d", name, len(s), maxFreeText)
	}
	for _, r := range s {
		if r < 0x20 || r > 0x7E {
			return fmt.Errorf("%s contains a non-printable or non-ASCII character", name)
		}
	}
	for _, bad := range StructureForging {
		if strings.Contains(s, bad) {
			return fmt.Errorf("%s contains %q", name, bad)
		}
	}
	lower := strings.ToLower(s)
	for _, bad := range freeTextForbidden {
		if strings.Contains(lower, bad) {
			return fmt.Errorf("%s contains %q", name, bad)
		}
	}
	return nil
}

// checkErrorString is the one place attacker text itself is allowed through, so it is
// checked on shape and on provenance. Provenance is the important half: the quote has to
// be found in the SANITISED body, so a string containing markup cannot pass by having
// been present in the raw one.
func checkErrorString(s, sanitisedBody string) error {
	if s == "" {
		return nil
	}
	if len(s) > maxErrorString {
		return fmt.Errorf("error_string is %d bytes, limit is %d", len(s), maxErrorString)
	}
	if strings.TrimSpace(s) == "" {
		return fmt.Errorf("error_string is whitespace")
	}
	if strings.ContainsAny(s, "\n\r\t") {
		return fmt.Errorf("error_string contains a line break")
	}
	for _, bad := range StructureForging {
		if strings.Contains(s, bad) {
			return fmt.Errorf("error_string contains %q", bad)
		}
	}
	if !strings.Contains(sanitisedBody, s) {
		return fmt.Errorf("error_string is not a verbatim substring of the sanitised body")
	}
	return nil
}

func inSet(s string, set []string) bool {
	for _, v := range set {
		if v == s {
			return true
		}
	}
	return false
}
