package triage

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// The closed vocabularies the proposer chooses from on the facts-only path. They exist so
// that no model-authored prose reaches TODO.md: an enum cannot carry an instruction.
var (
	Components = []string{"dashboard", "daemon", "tmux", "installer", "update", "issue-capture", "hooks", "docs", "unknown"}
	Symptoms   = []string{"crash", "hang", "wrong-output", "visual", "missing-feature", "perf", "install", "unknown"}
	Sections   = []string{
		"Pre-v1 Cleanup",
		"Reported issues (pre-v1 release)",
		"M5+ (v1.x, re-rank when reached)",
	}
)

// Proposal is everything the proposer is allowed to say about one issue.
type Proposal struct {
	Number      int    `json:"number"`
	Ack         string `json:"ack"`
	Component   string `json:"component"`
	Symptom     string `json:"symptom"`
	ErrorString string `json:"error_string"`
	SectionHint string `json:"section_hint"`
}

// maxErrorString bounds the only free-ish field. It is a quote, not prose: it has to
// appear verbatim in the sanitised body, which is already stripped of markup and links.
const maxErrorString = 80

// reJSONFence strips one wrapping code fence. The model will add one; that is not an
// error worth holding an issue over. Anything outside the fence is.
var reJSONFence = regexp.MustCompile("(?s)\\A\\s*```(?:json)?\\s*\\n(.*?)\\n\\s*```\\s*\\z")

// requiredKeys must all be present. DisallowUnknownFields catches extra keys but says
// nothing about missing ones, and a missing enum would otherwise decode to "".
var requiredKeys = []string{"number", "ack", "component", "symptom", "error_string", "section_hint"}

// ValidateProposal checks one proposer reply against the artifact it was given.
//
// Every failure is a hold, never a repair. The proposer read attacker-controlled text, so
// its reply is attacker-influenced by construction; what makes that survivable is that
// nothing here is taken on trust — the ack proves which artifact it read, the enums are
// closed sets, and the one quoted field has to be found verbatim in the sanitised body.
func ValidateProposal(raw []byte, a Artifact) (Proposal, error) {
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
	// Trailing prose after a well-formed object is a reply that did more than it was
	// asked to, which is the shape a derailed proposer has.
	if dec.More() {
		return Proposal{}, fmt.Errorf("reply carries trailing content after the JSON object")
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
	if !inSet(p.Component, Components) {
		return Proposal{}, fmt.Errorf("component %q is not in the allowed set", p.Component)
	}
	if !inSet(p.Symptom, Symptoms) {
		return Proposal{}, fmt.Errorf("symptom %q is not in the allowed set", p.Symptom)
	}
	if !inSet(p.SectionHint, Sections) {
		return Proposal{}, fmt.Errorf("section_hint %q is not in the allowed set", p.SectionHint)
	}
	if err := checkErrorString(p.ErrorString, a.Body); err != nil {
		return Proposal{}, err
	}
	return p, nil
}

// checkErrorString is the only place attacker-derived text is allowed through, so it is
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
	// Characters that would let a quote forge structure once spliced into TODO.md.
	for _, bad := range []string{"<", ">", "|", "](", "`"} {
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
