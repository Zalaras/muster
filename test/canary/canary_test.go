//go:build canary

// Package canary asserts that the installed Claude Code still emits every field Muster
// depends on. Run it before adopting any new Claude Code version:
//
//	make canary
//
// It is behind a build tag because it drives a real `claude` install and is therefore
// neither hermetic nor fast. The full harness (a scratch repo, a capture server, a real
// session driven to completion) lands in M4 per SPEC.md §10; until then the field
// assertions below are skipped, but the inventory is kept here in executable form so the
// list cannot silently drift from spikes/canary-fields.md.
package canary

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// needsHarness marks assertions that require the M4 capture harness.
const needsHarness = "needs the M4 canary harness (scratch repo + capture server); " +
	"inventory kept executable so it cannot drift from spikes/canary-fields.md"

// TestInstalledVersionMatchesPin runs for real today: it is the one canary assertion that
// needs nothing but the binary on PATH.
func TestInstalledVersionMatchesPin(t *testing.T) {
	installed, err := claudecode.InstalledVersion(t.Context())
	require.NoError(t, err, "claude must be on PATH to run the canary")
	assert.Equal(t, claudecode.PinnedVersion, installed,
		"installed Claude Code differs from the pin; see docs/claude-code-pin.md")
}

// TestHookTransport guards the single most dangerous finding: SessionStart over an HTTP
// hook is silently never delivered, with no warning in the TUI or logs. A canary that only
// checked "did fields arrive" would pass while the event never fired.
func TestHookTransport(t *testing.T) {
	t.Skip(needsHarness)

	httpDelivers := map[string]bool{
		"SessionStart":      false, // must use type:"command"
		"UserPromptSubmit":  true,
		"PreToolUse":        true,
		"PostToolUse":       true,
		"Stop":              true,
		"StopFailure":       true,
		"SessionEnd":        true,
		"Notification":      true,
		"SubagentStop":      true,
		"PermissionRequest": true,
	}
	_ = httpDelivers
}

// TestHookFields asserts the per-event field inventory from spikes/canary-fields.md.
// Every hook additionally carries cwd, hook_event_name, session_id and transcript_path;
// prompt_id is on all but SessionStart.
func TestHookFields(t *testing.T) {
	t.Skip(needsHarness)

	tests := []struct {
		event  string
		fields []string
		// permissionMode is not universal: the split is clean, every event either always
		// or never carries it. Documentation claims it is a common field; it is not.
		permissionMode bool
	}{
		{"SessionStart", []string{"model", "source", "session_title"}, false},
		{"UserPromptSubmit", []string{"prompt"}, true},
		{"PreToolUse", []string{"tool_name", "tool_input", "tool_use_id"}, true},
		{"PostToolUse", []string{"tool_name", "tool_input", "tool_use_id", "tool_response", "duration_ms"}, true},
		{"Stop", []string{"last_assistant_message", "stop_hook_active", "background_tasks", "session_crons"}, true},
		{"StopFailure", []string{"error", "last_assistant_message"}, false},
		{"SubagentStop", []string{"agent_id", "agent_type", "agent_transcript_path", "stop_hook_active"}, true},
		{"SessionEnd", []string{"reason"}, false},
		{"Notification", []string{"notification_type", "message"}, false},
		{"PermissionRequest", []string{"tool_name", "tool_input", "permission_suggestions"}, true},
	}
	_ = tests
}

// TestStopFailureReplacesStop guards the Failed state. StopFailure fires *instead of* Stop,
// never alongside it — a canary expecting Stop on every turn end would break the state
// machine.
//
// Caveat: this is exactly the sub-question SPEC §9.3 still lists as open. Confirm the
// behaviour when building the M1 state machine, then make this assertion binding.
func TestStopFailureReplacesStop(t *testing.T) {
	t.Skip(needsHarness + "; and SPEC §9.3 has not settled Stop-alongside-StopFailure")
}

// TestPlanModeSequence guards SPEC §4.1's plan flow, which depends on this exact ordering.
func TestPlanModeSequence(t *testing.T) {
	t.Skip(needsHarness)

	want := []string{
		`PreToolUse{tool_name:"ExitPlanMode", permission_mode:"plan"}`,
		`PermissionRequest{tool_name:"ExitPlanMode"}`,
		`PostToolUse{tool_name:"ExitPlanMode", permission_mode:"acceptEdits"}`,
	}
	_ = want
}

// TestStatusLineFields asserts the status-line payload Muster's gauges read.
//
// Three wire-format facts are load-bearing and were all wrong in the original spec: the
// weekly bucket is keyed seven_day (not weekly), resets_at is a Unix epoch integer (not
// RFC3339), and used_percentage is a float (not an int).
func TestStatusLineFields(t *testing.T) {
	t.Skip(needsHarness)

	topLevel := []string{
		"context_window", "cost", "cwd", "exceeds_200k_tokens", "fast_mode", "model",
		"output_style", "prompt_id", "rate_limits", "session_id", "session_name",
		"thinking", "transcript_path", "version", "workspace",
	}
	rateLimitBuckets := []string{"five_hour", "seven_day"}
	contextWindow := []string{
		"context_window_size", "used_percentage", "remaining_percentage",
		"total_input_tokens", "total_output_tokens", "current_usage",
	}
	_, _, _ = topLevel, rateLimitBuckets, contextWindow

	// permission_mode is NOT in the status line — confirmed absent across every capture.
	// Read it from hooks instead.
}

// TestUnknownVersusZero guards SPEC §9's risk 9. Before a session's first API response the
// whole rate_limits key is absent (not empty, not null), and the context percentages are
// null with total_input_tokens 0. A null is not "0% used": the UI must render "unknown".
func TestUnknownVersusZero(t *testing.T) {
	t.Skip(needsHarness)
}
