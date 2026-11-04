package claudecode

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestLeadingVersion(t *testing.T) {
	cases := []struct {
		name   string
		in     string
		want   string
		wantOK bool
	}{
		{"bare", "2.1.317", "2.1.317", true},
		{"claude --version output", "2.1.317 (Claude Code)", "2.1.317", true},
		{"pre-release suffix dropped", "2.0.0-e2e-stub", "2.0.0", true},
		{"multi-digit minor", "2.10.0", "2.10.0", true},
		{"two components", "2.1", "", false},
		{"empty", "", "", false},
		{"not a version", "command not found", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := LeadingVersion(tc.in)
			assert.Equal(t, tc.wantOK, ok)
			assert.Equal(t, tc.want, got)
		})
	}
}

// TestOlderVersion: strictly older by semver, compared numerically, false when either side
// has no leading triple.
func TestOlderVersion(t *testing.T) {
	cases := []struct {
		name               string
		running, installed string
		want               bool
	}{
		{"patch older", "2.1.317", "2.1.318", true},
		{"minor older", "2.1.999", "2.2.0", true},
		{"major older", "1.99.99", "2.0.0", true},
		{"equal", "2.1.317", "2.1.317", false},
		{"patch newer", "2.1.318", "2.1.317", false},
		{"minor newer", "2.2.0", "2.1.999", false},
		{"major newer", "3.0.0", "2.99.99", false},
		{"numeric not lexical", "2.1.9", "2.1.10", true},
		{"numeric not lexical, reversed", "2.1.10", "2.1.9", false},
		{"suffix ignored: equal", "2.1.317-beta", "2.1.317 (Claude Code)", false},
		{"running unparseable", "unknown", "2.1.317", false},
		{"installed unparseable", "2.1.317", "unknown", false},
		{"both empty", "", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, OlderVersion(tc.running, tc.installed))
		})
	}
}
