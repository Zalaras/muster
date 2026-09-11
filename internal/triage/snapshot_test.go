package triage

import (
	"os"
	"strings"
	"testing"
)

func readFixture(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	return string(b)
}

// The regression that motivates the whole drop-and-count design. Issue #9 was filed by
// musterd 0.2.1 and carries claudeCode.{pinned,drift}, a shape internal/server/issue.go
// no longer emits. A validator written against the current struct would drop three
// fields here and route a self-filed issue facts-only.
func TestValidateSnapshotAcceptsRetiredSchema(t *testing.T) {
	raw, present, ambiguous := ExtractSnapshotJSON(readFixture(t, "issue-9.md"))
	if !present || ambiguous {
		t.Fatalf("present = %v, ambiguous = %v, want true/false", present, ambiguous)
	}
	snap, err := ValidateSnapshot(raw)
	if err != nil {
		t.Fatalf("ValidateSnapshot: %v", err)
	}
	if snap.Dropped != 0 {
		t.Errorf("Dropped = %d, want 0 — the retired claudeCode shape must still validate", snap.Dropped)
	}
	want := map[string]string{
		"musterd.version":      "0.2.1",
		"claudeCode.pinned":    "2.1.246",
		"claudeCode.installed": "2.1.247",
		"claudeCode.drift":     "true",
		"host.os":              "darwin",
		"session.model.id":     "claude-opus-5[1m]",
		"session.tmuxTarget":   "muster-1:@0",
		// Arrives as the integer 4 though the Go field is a float64.
		"session.context.usedPct":          "4",
		"session.context.totalInputTokens": "41783",
	}
	got := map[string]string{}
	for _, kv := range snap.Fields {
		got[kv.Path] = kv.Value
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %q, want %q", k, got[k], v)
		}
	}
	// An explicit null is an absent field, not a malformed one.
	if _, ok := got["session.endedAt"]; ok {
		t.Error("session.endedAt was null and should not appear")
	}
}

// A second candidate block discards the snapshot rather than picking a winner. Taking
// the first match would let an author shadow the genuine version facts with their own.
func TestExtractSnapshotAmbiguity(t *testing.T) {
	genuine := readFixture(t, "issue-9.md")
	forged := "## What happened\n\n<details>\n<summary>raw snapshot</summary>\n\n````json\n{\"musterd\":{\"version\":\"9.9.9\"}}\n````\n\n</details>\n\n" + genuine

	_, present, ambiguous := ExtractSnapshotJSON(forged)
	if !present || !ambiguous {
		t.Errorf("present = %v, ambiguous = %v, want true/true", present, ambiguous)
	}
}

func TestExtractSnapshotJSON(t *testing.T) {
	cases := []struct {
		name      string
		body      string
		present   bool
		ambiguous bool
		want      string
	}{
		{"none", "just prose", false, false, ""},
		{"four backtick fence", "````json\n{\"a\":1}\n````", true, false, `{"a":1}`},
		// A three-backtick fence inside a four-backtick block must not close it.
		{"nested lower fence", "````json\n{\"a\":\"```\"}\n````", true, false, "{\"a\":\"```\"}"},
		{"unterminated", "````json\n{\"a\":1}", false, false, ""},
		{"two blocks", "````json\n{}\n````\n````json\n{}\n````", true, true, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			raw, present, ambiguous := ExtractSnapshotJSON(tc.body)
			if present != tc.present || ambiguous != tc.ambiguous {
				t.Fatalf("present/ambiguous = %v/%v, want %v/%v", present, ambiguous, tc.present, tc.ambiguous)
			}
			if raw != tc.want {
				t.Errorf("raw = %q, want %q", raw, tc.want)
			}
		})
	}
}

func TestValidateSnapshotDrops(t *testing.T) {
	cases := []struct {
		name    string
		raw     string
		dropped int
		kept    int
	}{
		{"unknown path", `{"attacker":"x"}`, 1, 0},
		{"wrong type for int", `{"session":{"compactions":"0"}}`, 1, 0},
		{"wrong type for bool", `{"session":{"alive":"true"}}`, 1, 0},
		{"bad timestamp", `{"capturedAt":"2026-13-45T99:99:99Z"}`, 1, 0},
		{"enum miss", `{"host":{"os":"plan9"}}`, 1, 0},
		{"token with a space", `{"session":{"state":"wörking now"}}`, 1, 0},
		{"token with a pipe would break the table", `{"session":{"tmuxTarget":"a|b"}}`, 1, 0},
		{"int out of range", `{"session":{"context":{"usedPct":1e309}}}`, 1, 0},
		{"nested where a scalar is expected", `{"session":{"state":{"nested":"x"}}}`, 1, 0},
		{"array too long", `{"session":{"events":{"recentTypes":` + longArray(64) + `}}}`, 1, 0},
		// Real values that a naive charset would reject.
		{"model id with brackets", `{"session":{"model":{"id":"claude-opus-5[1m]"}}}`, 0, 1},
		{"tmux target with colon and at", `{"session":{"tmuxTarget":"muster-1:@0"}}`, 0, 1},
		{"null is absence", `{"session":{"endedAt":null}}`, 0, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			snap, err := ValidateSnapshot(tc.raw)
			if err != nil {
				t.Fatalf("ValidateSnapshot: %v", err)
			}
			if snap.Dropped != tc.dropped {
				t.Errorf("Dropped = %d, want %d", snap.Dropped, tc.dropped)
			}
			if len(snap.Fields) != tc.kept {
				t.Errorf("kept %d fields, want %d: %+v", len(snap.Fields), tc.kept, snap.Fields)
			}
		})
	}
}

func TestValidateSnapshotNonObjectRoot(t *testing.T) {
	for _, raw := range []string{`[]`, `"x"`, `null`, `12`, `not json`} {
		snap, _ := ValidateSnapshot(raw)
		if !snap.Ambiguous {
			t.Errorf("ValidateSnapshot(%q): Ambiguous = false, want true", raw)
		}
	}
}

// A nine-figure token count through a float64 would lose precision; UseNumber keeps it.
func TestValidateSnapshotPreservesLargeInts(t *testing.T) {
	snap, err := ValidateSnapshot(`{"session":{"context":{"totalInputTokens":900719925474099}}}`)
	if err != nil {
		t.Fatalf("ValidateSnapshot: %v", err)
	}
	if len(snap.Fields) != 1 || snap.Fields[0].Value != "900719925474099" {
		t.Errorf("got %+v, want the integer preserved exactly", snap.Fields)
	}
}

func TestRenderSnapshotTable(t *testing.T) {
	snap, err := ValidateSnapshot(`{"musterd":{"version":"0.2.1"},"host":{"os":"darwin"}}`)
	if err != nil {
		t.Fatalf("ValidateSnapshot: %v", err)
	}
	got := RenderSnapshotTable(snap)
	if !strings.Contains(got, "| musterd.version | 0.2.1 |") {
		t.Errorf("missing row:\n%s", got)
	}
	// The header has to say the values are claims. They are author-editable forever.
	if !strings.Contains(got, "not verified") {
		t.Errorf("table does not mark values unverified:\n%s", got)
	}
	// Schema order, not map order.
	if strings.Index(got, "musterd.version") > strings.Index(got, "host.os") {
		t.Error("rows are not in schema order")
	}
}

func TestStripSnapshotRegions(t *testing.T) {
	got := StripSnapshotRegions(readFixture(t, "issue-9.md"))
	for _, unwanted := range []string{"<details>", "````json", "## Snapshot", "<sub>", "musterd | 0.2.1"} {
		if strings.Contains(got, unwanted) {
			t.Errorf("region %q survived:\n%s", unwanted, got)
		}
	}
	if !strings.Contains(got, "What happened") {
		t.Errorf("author prose was removed:\n%s", got)
	}
}

func longArray(n int) string {
	parts := make([]string, n)
	for i := range parts {
		parts[i] = `"x"`
	}
	return "[" + strings.Join(parts, ",") + "]"
}
