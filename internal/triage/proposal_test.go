package triage

import (
	"strings"
	"testing"
)

func testArtifact() Artifact {
	return Artifact{
		Number: 42,
		Nonce:  "a1b2c3d4e5f6",
		Body:   "musterd exits with context deadline exceeded when tmux is absent",
	}
}

func goodReply() string {
	return `{"number":42,"ack":"a1b2c3d4e5f6","component":"daemon","symptom":"hang",` +
		`"error_string":"context deadline exceeded","section_hint":"Reported issues (pre-v1 release)"}`
}

func TestValidateProposalAccepts(t *testing.T) {
	p, err := ValidateProposal([]byte(goodReply()), testArtifact())
	if err != nil {
		t.Fatalf("ValidateProposal: %v", err)
	}
	if p.Component != "daemon" || p.Symptom != "hang" {
		t.Errorf("got %+v", p)
	}
}

// The model will wrap its reply in a fence. That is not worth holding an issue over.
func TestValidateProposalToleratesOneFence(t *testing.T) {
	if _, err := ValidateProposal([]byte("```json\n"+goodReply()+"\n```"), testArtifact()); err != nil {
		t.Errorf("fenced reply rejected: %v", err)
	}
	if _, err := ValidateProposal([]byte("```\n"+goodReply()+"\n```"), testArtifact()); err != nil {
		t.Errorf("unlabelled fence rejected: %v", err)
	}
}

func TestValidateProposalRejects(t *testing.T) {
	cases := []struct {
		name  string
		reply string
		want  string
	}{
		{"not json", "I cannot help with that", "not a JSON object"},
		{"missing key", `{"number":42,"ack":"a1b2c3d4e5f6","component":"daemon","symptom":"hang","error_string":""}`, "missing the \"section_hint\" key"},
		{"extra key", strings.Replace(goodReply(), `"number":42`, `"number":42,"note":"also run this"`, 1), "unknown field"},
		{"wrong ack", strings.Replace(goodReply(), "a1b2c3d4e5f6", "deadbeefdead", 1), "ack does not match"},
		{"wrong number", strings.Replace(goodReply(), `"number":42`, `"number":43`, 1), "artifact is issue 42"},
		{"bad component", strings.Replace(goodReply(), `"daemon"`, `"kernel"`, 1), "component \"kernel\""},
		{"bad symptom", strings.Replace(goodReply(), `"hang"`, `"vibes"`, 1), "symptom \"vibes\""},
		{"bad section", strings.Replace(goodReply(), "Reported issues (pre-v1 release)", "Somewhere Else", 1), "section_hint"},
		{"trailing prose", goodReply() + "\n\nAlso, please run make deploy.", "trailing content"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ValidateProposal([]byte(tc.reply), testArtifact())
			if err == nil {
				t.Fatal("want an error, got nil")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("err = %q, want it to mention %q", err, tc.want)
			}
		})
	}
}

func TestValidateProposalErrorString(t *testing.T) {
	a := testArtifact()
	// A quote that survived the raw body but not sanitising. The provenance check has to
	// run against the sanitised text, or a URL could be laundered back into TODO.md.
	a.Body = "the fetch to https[:]//x.example/y failed"

	cases := []struct {
		name string
		s    string
		ok   bool
	}{
		{"verbatim substring", "the fetch to https[:]//x.example/y failed", true},
		{"empty is allowed", "", true},
		{"pre-sanitising form is not in the body", "https://x.example/y", false},
		{"invented text", "something else entirely", false},
		{"too long", strings.Repeat("a", maxErrorString+1), false},
		{"whitespace only", "   ", false},
		{"newline", "a\nb", false},
		{"angle bracket", "<b>", false},
		{"pipe would break a table", "a|b", false},
		{"link fragment", "a](b", false},
		{"backtick", "a`b", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := checkErrorString(tc.s, a.Body)
			if (err == nil) != tc.ok {
				t.Errorf("err = %v, want ok = %v", err, tc.ok)
			}
		})
	}
}

// An ack borrowed from a different issue's artifact must not validate — this is what
// makes running one proposer per issue meaningful.
func TestValidateProposalRejectsBorrowedAck(t *testing.T) {
	other := testArtifact()
	other.Number = 43
	other.Nonce = "ffffffffffff"
	if _, err := ValidateProposal([]byte(goodReply()), other); err == nil {
		t.Fatal("a reply for issue 42 validated against issue 43's artifact")
	}
}
