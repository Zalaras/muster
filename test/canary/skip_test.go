//go:build canary

package canary

import (
	"strings"
	"testing"
)

// TestSkipDecision is D17: skipDecision's pure decision table. The harness/live tiers
// skip iff installed equals the verified ceiling with both force and offline unset —
// offline always wins over force (INV-4), and any version difference never skips
// regardless of the flags.
func TestSkipDecision(t *testing.T) {
	tests := []struct {
		name              string
		installed         string
		verified          string
		force, offline    bool
		wantSkip          bool
		wantReasonNonZero bool
	}{
		{
			name: "equal, force and offline both unset: skip", installed: "2.1.267", verified: "2.1.267",
			force: false, offline: false, wantSkip: true, wantReasonNonZero: true,
		},
		{
			name: "equal, force set: runs (does not skip)", installed: "2.1.267", verified: "2.1.267",
			force: true, offline: false, wantSkip: false,
		},
		{
			name: "equal, offline set: runs (offline always wins, INV-4)", installed: "2.1.267", verified: "2.1.267",
			force: false, offline: true, wantSkip: false,
		},
		{
			name: "equal, both force and offline set: runs", installed: "2.1.267", verified: "2.1.267",
			force: true, offline: true, wantSkip: false,
		},
		{
			name: "installed below verified: never skips", installed: "2.1.246", verified: "2.1.267",
			force: false, offline: false, wantSkip: false,
		},
		{
			name: "installed above verified: never skips", installed: "2.1.270", verified: "2.1.267",
			force: false, offline: false, wantSkip: false,
		},
		{
			name: "installed above verified, force set: still never skips", installed: "2.1.270", verified: "2.1.267",
			force: true, offline: false, wantSkip: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			skip, reason := skipDecision(tt.installed, tt.verified, tt.force, tt.offline)
			if skip != tt.wantSkip {
				t.Fatalf("skipDecision(%q, %q, force=%t, offline=%t) skip = %t, want %t",
					tt.installed, tt.verified, tt.force, tt.offline, skip, tt.wantSkip)
			}
			if tt.wantReasonNonZero && reason == "" {
				t.Fatal("expected a non-empty skip reason naming the remedy")
			}
			if !tt.wantSkip && reason != "" {
				t.Fatalf("expected an empty reason when not skipping, got %q", reason)
			}
		})
	}
}

// TestSkipDecision_ReasonNamesTheForceEnvVar covers the doc's own convention: the printed
// reason must name MUSTER_CANARY_FORCE=1 as the remedy, not a vaguer instruction.
func TestSkipDecision_ReasonNamesTheForceEnvVar(t *testing.T) {
	_, reason := skipDecision("2.1.267", "2.1.267", false, false)
	if !strings.Contains(reason, forceEnv) {
		t.Fatalf("reason %q must name %s", reason, forceEnv)
	}
}
