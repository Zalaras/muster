//go:build canary

// Package canary asserts that the installed Claude Code still emits every field and
// behaviour Muster depends on. Run it before adopting any new Claude Code version:
//
//	make canary                          # 4 haiku turns + zero-token unauth/resume/live
//	                                      # checks, then extends the verified range on a
//	                                      # green run outside it (go run ./tools/versions
//	                                      # bump) — unless installed equals the verified
//	                                      # ceiling, which skips the harness and live tiers
//	                                      # (MUSTER_CANARY_FORCE=1 runs them anyway)
//	MUSTER_CANARY_OFFLINE=1 make canary  # compile + classify + static binary check only,
//	                                      # no tokens; always wins over MUSTER_CANARY_FORCE
//
// It is behind a build tag because it drives a real `claude` install — and, in the live
// tier, the real macOS Keychain and usage API — and is therefore neither hermetic nor
// fast. The harness (harness_test.go) runs the production settings→sh→wrapper→POST chain
// against a real binary exactly once per process (runs A-E); the tests in this file are
// views over those captures. static_test.go scans the installed binary for interface
// strings Muster cannot drive through a canary run; live_test.go exercises the real
// Keychain, usage API and theme config. The inventory they all assert is
// docs/history/spikes/canary-fields.md; the range doc is docs/claude-code-versions.md.
//
// Deliberately still NOT automated (decided 2026-09-10 — each needs the dialog answered,
// or costs a subagent turn no assertion here needs): plan-mode step 3
// (PostToolUse{ExitPlanMode, permission_mode:"acceptEdits"}, which needs the
// ExitPlanMode permission dialog actually answered — steps 1-2 are asserted, unanswered,
// by TestPlanModeSequence and TestNotifications), agent_id on subagent-originated hooks
// (a subagent costs >= 2 turns; SubagentStop itself is not a residual — interpret.go
// treats it as KindInert and Muster reads nothing from it), and the `fable` alias
// (verified by static inspection). All three stay /interface-probe rituals.
package canary

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// TestInstalledVersionClassifies needs nothing but the binary on PATH; it always runs,
// independent of the harness/live skip, and never fails on classification alone — it logs
// the installed version against the observed range on every canary invocation, including a
// skipped one, so the run's own output always states what it did (or didn't) check against.
func TestInstalledVersionClassifies(t *testing.T) {
	installed, err := claudecode.InstalledVersion(t.Context(), "claude")
	require.NoError(t, err, "claude must be on PATH to run the canary")
	status := claudecode.Classify(installed)
	t.Logf("installed %s, verified range %s, classified %s",
		installed, claudecode.FormatRange(claudecode.Floor(), claudecode.Verified()), status)
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

// TestHookFields asserts the per-event field inventory from docs/history/spikes/canary-fields.md.
// Every hook additionally carries cwd, hook_event_name, session_id and transcript_path;
// prompt_id is on all but SessionStart. permission_mode is not universal: the split is
// clean, every event either always or never carries it (docs claim it is common; it is
// not).
func TestHookFields(t *testing.T) {
	f := harness(t)

	// SubagentStop is deliberately absent from this table (REQ-6/REQ-9): interpret.go
	// treats it as KindInert and Muster reads nothing from it — its only Muster
	// dependency is agent_id on tool hooks and PermissionRequest, which stays a
	// /interface-probe ritual (a subagent costs >= 2 turns). Notification and
	// PermissionRequest are now both harness-driven: Notification by run D's idle_prompt,
	// PermissionRequest by run E's unanswered ExitPlanMode dialog.
	tests := []struct {
		event          string
		session        int64
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
		{"Notification", sessionInteract, []string{"notification_type", "message"}, false},
		// permission_suggestions is deliberately absent from this row (REQ-5/REQ-9
		// amendment, 2026-09-10): measured absent on the ExitPlanMode PermissionRequest on
		// 2.1.267 (canary-run.log), the shape the plan originally quoted was measured on a
		// Write request in default mode instead, and no production code reads the key. It
		// is optional and shape-checked only when present (TestNotifications).
		{"PermissionRequest", sessionResume, []string{"tool_name", "tool_input"}, true},
	}
	for _, tc := range tests {
		t.Run(tc.event, func(t *testing.T) {
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
// Stop, never alongside it (kb:fact/stopfailure-replaces-stop). A success turn emits
// Stop only; every unauthenticated run (all four permission modes, REQ-1) emits
// StopFailure only, with error "authentication_failed".
func TestStopFailureReplacesStop(t *testing.T) {
	f := harness(t)

	ok := f.hookTypes(sessionManaged)
	assert.Contains(t, ok, "Stop")
	assert.NotContains(t, ok, "StopFailure", "success turn must not emit StopFailure")

	for _, run := range unauthRuns {
		t.Run(fmt.Sprintf("mode=%q", run.mode), func(t *testing.T) {
			failed := f.hookTypes(run.session)
			assert.Contains(t, failed, "StopFailure", "unauthenticated run emitted %v", failed)
			assert.NotContains(t, failed, "Stop", "StopFailure must replace Stop, not accompany it")
			assert.Contains(t, failed, "UserPromptSubmit")
			if c := f.firstHook(run.session, "StopFailure"); c != nil {
				assert.Equal(t, "authentication_failed", c.payload["error"])
			}
			// SessionEnd is NOT asserted on this path. Measured 2026-08-29 (2.1.246): on
			// the auth-failure exit claude does not await its hooks — a `cat >>` hook
			// records SessionEnd, but the same hook behind `sleep 0.05` loses both
			// StopFailure and SessionEnd, and Muster's ~48 ms curl wrapper landed
			// StopFailure 2/2 runs and SessionEnd 0/2. Best-effort delivery (CLAUDE.md);
			// reconcile keys on pane liveness.
			if !contains(failed, "SessionEnd") {
				t.Logf("SessionEnd not delivered on the auth-failure exit (expected: hooks are not awaited there); got %v", failed)
			}
		})
	}
}

// TestPlanModeSequence guards the plan-mode roadmap flow (the roadmap section of SPEC.md; kb:fact/plan-mode-hook-sequence), which depends on this exact
// ordering. Driven by run E (REQ-6): steps 1-2 (PreToolUse then PermissionRequest) are
// asserted for real; step 3 needs the dialog answered and is not — logged as the
// /interface-probe residual, not skipped.
func TestPlanModeSequence(t *testing.T) {
	f := harness(t)

	events := f.hookEvents(sessionResume)
	preIdx, reqIdx := -1, -1
	for i, c := range events {
		tn, _ := c.payload["tool_name"].(string)
		if tn != "ExitPlanMode" {
			continue
		}
		switch c.ev.Type {
		case "PreToolUse":
			if preIdx == -1 {
				preIdx = i
			}
		case "PermissionRequest":
			if reqIdx == -1 {
				reqIdx = i
			}
		}
	}
	require.NotEqualf(t, -1, preIdx, "PreToolUse{ExitPlanMode} never arrived on run E; got %v", f.hookTypes(sessionResume))
	require.NotEqualf(t, -1, reqIdx, "PermissionRequest{ExitPlanMode} never arrived on run E; got %v", f.hookTypes(sessionResume))
	assert.Lessf(t, preIdx, reqIdx, "PreToolUse{ExitPlanMode} (index %d) must arrive before PermissionRequest{ExitPlanMode} (index %d)", preIdx, reqIdx)
	assert.Equal(t, "plan", events[preIdx].payload["permission_mode"], "PreToolUse{ExitPlanMode} must fire in plan mode")

	t.Log("step 3 (PostToolUse{ExitPlanMode, permission_mode:\"acceptEdits\"}) is not asserted here: " +
		"it needs the permission dialog actually answered, which this harness deliberately never does " +
		"(REQ-5). Verify with /interface-probe.")
}

// TestLaunchFlags asserts REQ-1/2/4: the --permission-mode flag reaches
// UserPromptSubmit.permission_mode on both the unauthenticated sweep and the
// authenticated interactive run, --name reaches SessionStart.session_title, and a
// --resume relaunch carries run D's session_id and transcript_path forward.
func TestLaunchFlags(t *testing.T) {
	f := harness(t)

	t.Run("permission_mode reflects --permission-mode", func(t *testing.T) {
		tests := []struct {
			name    string
			session int64
			want    []string // acceptable observed values
		}{
			{"unauth, no flag", sessionUnauth, []string{"default"}},
			{"unauth, plan", sessionUnauthPlan, []string{"plan"}},
			{"unauth, acceptEdits", sessionUnauthAccept, []string{"acceptEdits"}},
			// auto is model-gated to default on haiku (canary-fields "permission-mode
			// probe"); whether the gate applies before auth is unmeasured, so both
			// values are accepted and the observed one is logged (Edge Case 5).
			{"unauth, auto", sessionUnauthAuto, []string{"auto", "default"}},
			// Authenticated cross-check (REQ-2): the flag->wire mapping was measured
			// authenticated only, so this run disambiguates "unauth path unsuitable"
			// from "flag renamed" if the unauth assertions above ever fail.
			{"interactive, plan (authenticated cross-check)", sessionInteract, []string{"plan"}},
		}
		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				c := f.firstHook(tc.session, "UserPromptSubmit")
				require.NotNilf(t, c, "UserPromptSubmit never arrived for %s; session %d saw %v", tc.name, tc.session, f.hookTypes(tc.session))
				got, _ := c.payload["permission_mode"].(string)
				assert.Containsf(t, tc.want, got, "%s: permission_mode = %q, want one of %v", tc.name, got, tc.want)
				if len(tc.want) > 1 {
					t.Logf("%s: observed permission_mode = %q", tc.name, got)
				}
			})
		}
	})

	t.Run("SessionStart.session_title equals --name (REQ-2)", func(t *testing.T) {
		c := f.firstHook(sessionInteract, "SessionStart")
		require.NotNil(t, c, "run D SessionStart missing")
		assert.Equal(t, "Muster Canary", c.payload["session_title"], "SessionStart.session_title must equal the launched --name")
	})

	t.Run("resume carries the same session identity (REQ-4, INV-3)", func(t *testing.T) {
		d := f.firstHook(sessionInteract, "SessionStart")
		e := f.firstHook(sessionResume, "SessionStart")
		require.NotNil(t, d, "run D SessionStart missing")
		require.NotNil(t, e, "run E SessionStart missing")
		assert.Equal(t, "startup", d.payload["source"])
		assert.Equal(t, "resume", e.payload["source"])
		assert.Equal(t, d.ev.SessionID, e.ev.SessionID, "resume must carry the same claude session_id")
		assert.NotEmpty(t, d.ev.SessionID, "run D's session_id must not be empty for this comparison to mean anything")
		assert.Equal(t, d.payload["transcript_path"], e.payload["transcript_path"], "resume must carry the same transcript_path")
	})
}

// TestNotifications asserts REQ-3/REQ-5: the idle_prompt Notification after run D's Stop,
// and the permission_prompt Notification sharing run E's PermissionRequest prompt_id.
// The two events' own field inventories are TestHookFields' job; this test checks the
// values and the cross-references between them.
func TestNotifications(t *testing.T) {
	f := harness(t)

	t.Run("idle_prompt arrives after Stop (REQ-3)", func(t *testing.T) {
		stop := f.firstHook(sessionInteract, "Stop")
		require.NotNil(t, stop, "run D never emitted Stop")
		idle := f.firstNotification(sessionInteract, "idle_prompt")
		require.NotNilf(t, idle, "no idle_prompt Notification on run D; got %v", f.hookTypes(sessionInteract))
		assert.Truef(t, idle.at.After(stop.at), "idle_prompt Notification must arrive after Stop (stop=%s, idle=%s)", stop.at, idle.at)
		// Logged, never asserted (REQ-3, plan Implementation Notes "For the orchestrator"):
		// a timing assertion on a shared machine is a flake generator, but the gap is a
		// fact docs/history/spikes/canary-fields.md wants for the next pin bump.
		t.Logf("idle_prompt arrived %.2fs after Stop", idle.at.Sub(stop.at).Seconds())
	})

	t.Run("permission_prompt shares PermissionRequest's prompt_id (REQ-5)", func(t *testing.T) {
		req := f.firstHook(sessionResume, "PermissionRequest")
		require.NotNilf(t, req, "no PermissionRequest on run E; got %v", f.hookTypes(sessionResume))
		notif := f.firstNotification(sessionResume, "permission_prompt")
		require.NotNilf(t, notif, "no permission_prompt Notification on run E; got %v", f.hookTypes(sessionResume))

		reqPromptID, _ := req.payload["prompt_id"].(string)
		notifPromptID, _ := notif.payload["prompt_id"].(string)
		require.NotEmpty(t, reqPromptID, "PermissionRequest missing prompt_id")
		assert.Equal(t, reqPromptID, notifPromptID, "permission_prompt Notification must share PermissionRequest's prompt_id")

		// permission_suggestions is optional on the ExitPlanMode PermissionRequest (REQ-5
		// amendment, 2026-09-10): measured absent on 2.1.267. Presence is logged, never
		// required; when present its shape is still checked. Only scalars are logged
		// (INV-2) — never the payload map or tool_input.
		toolName, _ := req.payload["tool_name"].(string)
		permMode, _ := req.payload["permission_mode"].(string)
		raw, present := req.payload["permission_suggestions"]
		t.Logf("permission_suggestions present=%v (tool_name=%q, permission_mode=%q)", present, toolName, permMode)
		if present {
			suggestions, ok := raw.([]any)
			require.Truef(t, ok, "permission_suggestions must be an array; got %T", raw)
			require.NotEmpty(t, suggestions, "permission_suggestions must be non-empty")
			first, ok := suggestions[0].(map[string]any)
			require.True(t, ok, "permission_suggestions[0] must be an object")
			for _, k := range []string{"type", "mode", "destination"} {
				assert.Containsf(t, keys(first), k, "permission_suggestions[0] missing %q; has %v", k, keys(first))
			}
		}
	})
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
	// Run D now launches with --name "Muster Canary" (REQ-2), so session_name is no
	// longer the optional, may-never-derive value it was before; assert it directly.
	assert.Equal(t, "Muster Canary", last["session_name"], "status-line session_name must equal the launched --name")
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

	// REQ-15: run E (the resume) was launched without --name, so whether session_name
	// still persists across a resume is a fact the next pin bump should learn — logged,
	// never asserted, and only if the resumed session got a status-line post at all in
	// its short unanswered-dialog lifetime.
	if resumePosts := f.statusPosts(sessionResume); len(resumePosts) > 0 {
		t.Logf("resumed session (run E, launched without --name) last status-line session_name = %v",
			resumePosts[len(resumePosts)-1].payload["session_name"])
	} else {
		t.Log("no status-line post captured on the resumed session (run E) to log session_name from")
	}
}

// TestUnknownVersusZero guards kb:fact/unknown-before-first-response. Before a session's first API response the
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
