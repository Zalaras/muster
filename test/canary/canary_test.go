//go:build canary

// Package canary asserts that the installed Claude Code still emits every field and
// behaviour Muster depends on. Run it before adopting any new Claude Code version:
//
//	make canary                         # four real runs (3 haiku turns + 1 zero-token)
//	MUSTER_CANARY_OFFLINE=1 make canary # compile + version check only, no tokens
//
// It is behind a build tag because it drives a real `claude` install and is therefore
// neither hermetic nor fast. The harness (harness_test.go) runs the production
// settings→sh→wrapper→POST chain against a real binary exactly once per process; the
// tests below are views over those captures. The inventory they assert is
// spikes/canary-fields.md.
//
// Deliberately NOT automated (need an interactive permission dialog driven by
// send-keys — too fragile for a gate; decided 2026-08-29): the plan-mode sequence,
// PermissionRequest, Notification, SubagentStop. Those stay as skipped inventory rows.
package canary

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// needsInteractiveDialog marks inventory rows the harness does not drive.
const needsInteractiveDialog = "needs an interactive permission dialog driven via tmux send-keys; " +
	"kept as inventory so it cannot drift from spikes/canary-fields.md (verify with /interface-probe)"

// TestInstalledVersionMatchesPin needs nothing but the binary on PATH; it always runs.
func TestInstalledVersionMatchesPin(t *testing.T) {
	installed, err := claudecode.InstalledVersion(t.Context())
	require.NoError(t, err, "claude must be on PATH to run the canary")
	assert.Equal(t, claudecode.PinnedVersion, installed,
		"installed Claude Code differs from the pin; see docs/claude-code-pin.md")
}

// TestStatusLineVersionMatchesInstalled: the status-line payload's own version field must
// agree with `claude --version` — it is what a future drift detector could read live.
func TestStatusLineVersionMatchesInstalled(t *testing.T) {
	f := harness(t)
	posts := f.statusPosts(sessionInteract)
	require.NotEmpty(t, posts, "no status-line post captured from the interactive session")
	last := posts[len(posts)-1].payload
	assert.Equal(t, f.installed, last["version"], "status-line version != claude --version")
	t.Logf("interactive run: trust prompt seen=%t, %d status posts, %d hook posts; headless managed %d hook posts",
		f.interactive.trustPromptSeen, len(posts), len(f.hookEvents(sessionInteract)), len(f.hookEvents(sessionManaged)))
}

// TestHookTransport: every event the headless run produces must arrive as a
// command-wrapped, enveloped POST. History: SessionStart over type:"http" was silently
// never delivered (2.1.233) — since m4-hook-lifetime Muster writes no http hooks at all,
// so the transport assertion is simply "the command wrapper delivered it, with the
// envelope".
func TestHookTransport(t *testing.T) {
	f := harness(t)
	got := f.hookTypes(sessionManaged)
	for _, want := range []string{"SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "SessionEnd"} {
		assert.Containsf(t, got, want, "%s not delivered through the command wrapper; got %v", want, got)
	}
	for _, c := range f.hookEvents(sessionManaged) {
		assert.NotEmpty(t, c.ev.SessionID, "%s arrived without session_id", c.ev.Type)
	}
	assert.Empty(t, f.unexpectedPaths(), "posts reached a path other than the two ingest routes")
}

// TestHookFields asserts the per-event field inventory from spikes/canary-fields.md.
// Every hook additionally carries cwd, hook_event_name, session_id and transcript_path;
// prompt_id is on all but SessionStart. permission_mode is not universal: the split is
// clean, every event either always or never carries it (docs claim it is common; it is
// not).
func TestHookFields(t *testing.T) {
	f := harness(t)

	tests := []struct {
		event          string
		session        int64 // which run produces it; 0 = not driven by the harness
		fields         []string
		permissionMode bool
	}{
		{"SessionStart", sessionManaged, []string{"source"}, false}, // model, session_title are optional (canary-fields)
		{"UserPromptSubmit", sessionManaged, []string{"prompt"}, true},
		{"PreToolUse", sessionManaged, []string{"tool_name", "tool_input", "tool_use_id"}, true},
		{"PostToolUse", sessionManaged, []string{"tool_name", "tool_input", "tool_use_id", "tool_response", "duration_ms"}, true},
		{"Stop", sessionManaged, []string{"last_assistant_message", "stop_hook_active", "background_tasks", "session_crons"}, true},
		{"StopFailure", sessionUnauth, []string{"error", "last_assistant_message"}, false},
		{"SessionEnd", sessionManaged, []string{"reason"}, false},
		{"SubagentStop", 0, []string{"agent_id", "agent_type", "agent_transcript_path", "stop_hook_active"}, true},
		{"Notification", 0, []string{"notification_type", "message"}, false},
		{"PermissionRequest", 0, []string{"tool_name", "tool_input", "permission_suggestions"}, true},
	}
	for _, tc := range tests {
		t.Run(tc.event, func(t *testing.T) {
			if tc.session == 0 {
				t.Skip(needsInteractiveDialog)
			}
			c := f.firstHook(tc.session, tc.event)
			require.NotNilf(t, c, "%s never arrived; session %d saw %v", tc.event, tc.session, f.hookTypes(tc.session))

			common := []string{"cwd", "hook_event_name", "session_id", "transcript_path"}
			if tc.event != "SessionStart" {
				common = append(common, "prompt_id")
			}
			for _, k := range append(common, tc.fields...) {
				assert.Containsf(t, keys(c.payload), k, "%s missing %q; has %v", tc.event, k, keys(c.payload))
			}
			_, hasMode := c.payload["permission_mode"]
			assert.Equalf(t, tc.permissionMode, hasMode, "%s permission_mode presence; keys %v", tc.event, keys(c.payload))
			assert.Equal(t, tc.event, c.payload["hook_event_name"])
		})
	}

	t.Run("SessionStart.model is a bare string when present", func(t *testing.T) {
		c := f.firstHook(sessionManaged, "SessionStart")
		require.NotNil(t, c)
		if m, ok := c.payload["model"]; ok {
			_, isString := m.(string)
			assert.True(t, isString, "SessionStart.model must be a plain model-ID string, not the status line's {id, display_name} object")
		} else {
			t.Log("SessionStart.model absent on this headless startup (optional per canary-fields)")
		}
		assert.Equal(t, "startup", c.payload["source"])
	})
}

// TestStopFailureReplacesStop guards the Failed state: StopFailure fires *instead of*
// Stop, never alongside it (H2 probe 2026-08-16 settled SPEC §9.3). A success turn emits
// Stop only; the unauthenticated run emits StopFailure only, with error
// "authentication_failed".
func TestStopFailureReplacesStop(t *testing.T) {
	f := harness(t)

	ok := f.hookTypes(sessionManaged)
	assert.Contains(t, ok, "Stop")
	assert.NotContains(t, ok, "StopFailure", "success turn must not emit StopFailure")

	failed := f.hookTypes(sessionUnauth)
	assert.Contains(t, failed, "StopFailure", "unauthenticated run emitted %v", failed)
	assert.NotContains(t, failed, "Stop", "StopFailure must replace Stop, not accompany it")
	assert.Contains(t, failed, "UserPromptSubmit")
	if c := f.firstHook(sessionUnauth, "StopFailure"); c != nil {
		assert.Equal(t, "authentication_failed", c.payload["error"])
	}
	// SessionEnd is NOT asserted on this path. Measured 2026-08-29 (2.1.246): on the
	// auth-failure exit claude does not await its hooks — a `cat >>` hook records
	// SessionEnd, but the same hook behind `sleep 0.05` loses both StopFailure and
	// SessionEnd, and Muster's ~48 ms curl wrapper landed StopFailure 2/2 runs and
	// SessionEnd 0/2. Best-effort delivery (CLAUDE.md); reconcile keys on pane liveness.
	if !contains(failed, "SessionEnd") {
		t.Logf("SessionEnd not delivered on the auth-failure exit (expected: hooks are not awaited there); got %v", failed)
	}
}

// TestPlanModeSequence guards SPEC §4.1's plan flow, which depends on this exact
// ordering. Not driven by the harness (needs the ExitPlanMode permission dialog).
func TestPlanModeSequence(t *testing.T) {
	t.Skip(needsInteractiveDialog)

	want := []string{
		`PreToolUse{tool_name:"ExitPlanMode", permission_mode:"plan"}`,
		`PermissionRequest{tool_name:"ExitPlanMode"}`,
		`PostToolUse{tool_name:"ExitPlanMode", permission_mode:"acceptEdits"}`,
	}
	_ = want
}

// TestStatusLineFields asserts the status-line payload Muster's gauges read, on the last
// post of the interactive session (after the first API response).
//
// Three wire-format facts are load-bearing and were all wrong in the original spec: the
// weekly bucket is keyed seven_day (not weekly), resets_at is a Unix epoch integer (not
// RFC3339), and used_percentage is a float (not an int).
func TestStatusLineFields(t *testing.T) {
	f := harness(t)
	posts := f.statusPosts(sessionInteract)
	require.NotEmpty(t, posts, "no status-line post from the interactive session")
	last := posts[len(posts)-1].payload

	topLevel := []string{
		"context_window", "cost", "cwd", "exceeds_200k_tokens", "fast_mode", "model",
		"output_style", "prompt_id", "rate_limits", "session_id",
		"thinking", "transcript_path", "version", "workspace",
	}
	for _, k := range topLevel {
		assert.Containsf(t, keys(last), k, "status line missing %q; has %v", k, keys(last))
	}
	// session_name is the title source but is absent until Claude Code has derived a
	// title (canary-fields "session_name"); a one-turn "say hi" session may never get one
	// (2026-08-29 harness run: absent on all posts). Optional, so log rather than assert.
	if _, ok := last["session_name"]; !ok {
		t.Log("status line has no session_name yet (optional: appears only once a title is derived)")
	}
	if extra := difference(keys(last), append(topLevel, "session_name")); len(extra) > 0 {
		t.Logf("status line carries keys not in the inventory (superset is fine; record in canary-fields): %v", extra)
	}
	// permission_mode is NOT in the status line — read it from hooks instead.
	assert.NotContains(t, keys(last), "permission_mode")

	rl, _ := last["rate_limits"].(map[string]any)
	require.NotNil(t, rl, "rate_limits absent on the post-turn status line (%d posts captured)", len(posts))
	for _, b := range []string{"five_hour", "seven_day"} {
		bucket, _ := rl[b].(map[string]any)
		require.NotNilf(t, bucket, "rate_limits.%s missing; buckets %v", b, keys(rl))
		_, pctIsNumber := bucket["used_percentage"].(float64) // json.Number-free decode: every JSON number is float64
		assert.Truef(t, pctIsNumber, "rate_limits.%s.used_percentage not numeric", b)
		resets, ok := bucket["resets_at"].(float64)
		assert.Truef(t, ok && resets == float64(int64(resets)) && resets > 1e9, "rate_limits.%s.resets_at must be a Unix epoch integer", b)
	}

	cw, _ := last["context_window"].(map[string]any)
	require.NotNil(t, cw)
	for _, k := range []string{"context_window_size", "used_percentage", "remaining_percentage", "total_input_tokens", "total_output_tokens", "current_usage"} {
		assert.Containsf(t, keys(cw), k, "context_window missing %q", k)
	}
	assert.NotNil(t, cw["used_percentage"], "post-turn used_percentage must be a number, not null")

	model, _ := last["model"].(map[string]any)
	require.NotNil(t, model, "status-line model must be an {id, display_name} object")
	assert.Equal(t, haikuModel, model["id"])
	assert.Contains(t, keys(model), "display_name")

	// The adapter must read all of the above the same way.
	upd := claudecode.InterpretStatus(posts[len(posts)-1].ev.Payload)
	assert.Equal(t, haikuModel, upd.Model.ID)
}

// TestUnknownVersusZero guards SPEC §9 risk 9. Before a session's first API response the
// whole rate_limits key is absent (not empty, not null), and the context percentages are
// null with total_input_tokens 0. A null is not "0% used": the UI must render "unknown".
// Only judgeable if the harness captured a pre-response post — otherwise skip honestly.
func TestUnknownVersusZero(t *testing.T) {
	f := harness(t)
	posts := f.statusPosts(sessionInteract)
	var pre []capture
	for _, c := range posts {
		if _, ok := c.payload["rate_limits"]; ok {
			break
		}
		pre = append(pre, c)
	}
	if len(pre) == 0 {
		t.Skipf("no pre-response status-line post captured (%d posts, first already carries rate_limits); the absent-state shape was not observable this run", len(posts))
	}
	for i, c := range pre {
		raw := map[string]json.RawMessage{}
		require.NoError(t, json.Unmarshal(c.ev.Payload, &raw))
		_, present := raw["rate_limits"]
		assert.Falsef(t, present, "pre-response post %d: rate_limits must be absent, not null/empty", i)
		cw, _ := c.payload["context_window"].(map[string]any)
		require.NotNil(t, cw)
		assert.Nil(t, cw["used_percentage"], "pre-response used_percentage must be null")
		assert.EqualValues(t, 0, cw["total_input_tokens"])
	}
	t.Logf("%d pre-response post(s) checked", len(pre))
}

// TestCommandHookPathQuoting guards m4-hook-quoting REQ-8/D9: a command-hook path is a
// `/bin/sh -c` command line, not a path field, so an unquoted space-bearing path silently
// breaks both command hooks Muster depends on (the M3 gauges never rendered real data for
// this reason). The harness's data dir contains a space; the binding cells are: the
// generated settings quote both commands, SessionStart is delivered (run A), and the
// status line posts (run D).
//
// Measured history (2026-08-25 probe, 2.1.245, spikes/FINDINGS.md addendum) — path/form →
// SessionStart delivered / status line posted:
//
//	space, bare  → no  / no (silent)      space, '…' → yes / yes     space, "…" → yes / not run
//	plain, bare  → yes / not run          plain, '…' → yes / yes     plain, "…" → yes / not run
func TestCommandHookPathQuoting(t *testing.T) {
	f := harness(t)
	require.Contains(t, f.dataDir, " ", "harness data dir must contain a space for this test to mean anything")

	var settings struct {
		StatusLine struct{ Command string } `json:"statusLine"`
		Hooks      map[string][]struct {
			Hooks []struct{ Command string }
		} `json:"hooks"`
	}
	require.NoError(t, json.Unmarshal(f.settings, &settings))
	assert.True(t, strings.HasPrefix(settings.StatusLine.Command, "'"), "statusLine.command not single-quoted: %q", settings.StatusLine.Command)
	require.NotEmpty(t, settings.Hooks["SessionStart"])
	assert.True(t, strings.HasPrefix(settings.Hooks["SessionStart"][0].Hooks[0].Command, "'"), "SessionStart command not single-quoted")

	assert.NotNil(t, f.firstHook(sessionManaged, "SessionStart"), "SessionStart command hook did not run from the space-bearing path")
	assert.NotEmpty(t, f.statusPosts(sessionInteract), "status line did not post from the space-bearing path (this failure is silent in the TUI)")
}

// TestCommandHooksCarryEnvelopeOnEveryEvent guards m4-hook-lifetime REQ-14: a
// type:"command" wrapper sees the pane environment on *every* event, not just
// SessionStart and the status line (basis of envelope-authoritative binding, REQ-9), and
// an unmanaged session in an instrumented directory posts nothing at all (REQ-6).
func TestCommandHooksCarryEnvelopeOnEveryEvent(t *testing.T) {
	f := harness(t)

	for _, want := range []string{"UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "SessionEnd"} {
		assert.NotNilf(t, f.firstHook(sessionManaged, want), "%s not enveloped with musterSession=%d; got %v", want, sessionManaged, f.hookTypes(sessionManaged))
	}
	// Interactive run: tmuxPane must be present alongside musterSession.
	if c := f.firstHook(sessionInteract, "SessionStart"); assert.NotNil(t, c) {
		assert.NotNil(t, c.ev.TmuxPane, "interactive SessionStart envelope lacks tmuxPane")
	}

	assert.Equal(t, 0, f.runBPosts, "an unmanaged claude (no $MUSTER_SESSION) in the instrumented directory must post nothing")
}

// ---------------------------------------------------------------------------------------

func keys(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func contains(list []string, want string) bool {
	for _, s := range list {
		if s == want {
			return true
		}
	}
	return false
}

func difference(have, want []string) []string {
	set := map[string]bool{}
	for _, w := range want {
		set[w] = true
	}
	var out []string
	for _, h := range have {
		if !set[h] {
			out = append(out, h)
		}
	}
	return out
}

func (f *fixture) unexpectedPaths() []string {
	var out []string
	for _, c := range f.all() {
		if strings.HasPrefix(string(c.kind), "unexpected:") || c.ev.Type == "unparseable" {
			out = append(out, string(c.kind)+"/"+c.ev.Type)
		}
	}
	return out
}
