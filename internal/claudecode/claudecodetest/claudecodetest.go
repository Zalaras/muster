// Package claudecodetest builds Claude-Code-wire-format request bodies for tests in
// other packages. Wire field names may not appear outside internal/claudecode (the D4
// boundary check), yet HTTP-boundary tests still need to POST realistic bodies — this
// package is the sanctioned way to get one. Tests needing shapes beyond these minimal
// builders belong in internal/claudecode's own tests, not here.
package claudecodetest

import "encoding/json"

// RawHookBody returns a minimal raw (non-enveloped) hook POST body for the given
// hook event and session id, as Claude Code itself would send it.
func RawHookBody(event, sessionID string) string {
	return marshal(map[string]any{
		"hook_event_name": event,
		"session_id":      sessionID,
		"cwd":             "/tmp",
	})
}

// EnvelopedHookBody wraps a minimal hook payload for the given event and session id
// in the musterSession/tmuxPane envelope produced by Muster's hook command wrapper. An
// empty tmuxPane omits the field entirely (the headless shape, kb:adr/ingest-envelope-pane-must-corroborate)
// rather than sending an empty string.
func EnvelopedHookBody(musterSession int, tmuxPane, event, sessionID string) string {
	env := map[string]any{
		"musterSession": musterSession,
		"payload": map[string]any{
			"hook_event_name": event,
			"session_id":      sessionID,
		},
	}
	if tmuxPane != "" {
		env["tmuxPane"] = tmuxPane
	}
	return marshal(env)
}

// SessionStartOpts customizes EnvelopedSessionStart beyond its defaults (musterSession 1,
// source "startup", a present model). TmuxPane has no default (REQ-12,
// kb:adr/ingest-envelope-pane-must-corroborate): left empty, it omits the envelope's
// tmuxPane field entirely — the headless shape — rather than filling in a pane the caller
// never stated; every enveloped fixture site must state its own pane.
type SessionStartOpts struct {
	MusterSession int
	// TmuxPane, left empty, omits the envelope's tmuxPane field (the headless shape).
	TmuxPane string
	// Source is one of "startup" (default), "resume" or "clear" (canary-fields.md
	// "Values worth asserting" — all three observed).
	Source string
	// ModelID, when non-empty, is embedded as the SessionStart payload's optional
	// model field (m1-sessions plan Implementation Notes: sometimes absent). Leave
	// empty and set OmitModel to omit the field entirely.
	ModelID   string
	OmitModel bool
}

// EnvelopedSessionStart returns the enveloped `SessionStart` body — the one hook that
// is silently never delivered over plain HTTP (canary-fields.md "Transport"), so the
// real wrapper always posts it enveloped. A zero-value SessionStartOpts posts the
// headless shape (no tmuxPane, REQ-12) — the caller states a pane explicitly wherever
// routing is expected.
func EnvelopedSessionStart(sessionID string, opts SessionStartOpts) string {
	musterSession := opts.MusterSession
	if musterSession == 0 {
		musterSession = 1
	}
	source := opts.Source
	if source == "" {
		source = "startup"
	}

	payload := map[string]any{
		"hook_event_name": "SessionStart",
		"session_id":      sessionID,
		"transcript_path": "/tmp/t.jsonl",
		"cwd":             "/tmp",
		"source":          source,
	}
	if !opts.OmitModel {
		modelID := opts.ModelID
		if modelID == "" {
			modelID = "claude-haiku-4-5-20251001"
		}
		// A plain model-id string, never an {id, display_name} object (settled by
		// measurement — interface probe, 2026-08-22, docs/history/spikes/canary-fields.md "Values
		// worth asserting" → SessionStart.model; review Major 11).
		payload["model"] = modelID
	}

	env := map[string]any{
		"musterSession": musterSession,
		"payload":       payload,
	}
	if opts.TmuxPane != "" {
		env["tmuxPane"] = opts.TmuxPane
	}
	return marshal(env)
}

// TurnActivityOpts customizes the turn-activity builders below.
type TurnActivityOpts struct {
	PromptID       string // default "p1"
	PermissionMode string // default "default"
}

func (o TurnActivityOpts) promptID() string {
	if o.PromptID == "" {
		return "p1"
	}
	return o.PromptID
}

func (o TurnActivityOpts) permissionMode() string {
	if o.PermissionMode == "" {
		return "default"
	}
	return o.PermissionMode
}

// RawUserPromptSubmit returns a raw `UserPromptSubmit` — opens a turn (kb:anchor/state.transitions).
func RawUserPromptSubmit(sessionID string, opts TurnActivityOpts) string {
	return marshal(map[string]any{
		"hook_event_name": "UserPromptSubmit",
		"session_id":      sessionID,
		"transcript_path": "/tmp/t.jsonl",
		"cwd":             "/tmp",
		"prompt_id":       opts.promptID(),
		"permission_mode": opts.permissionMode(),
		"prompt":          "do the thing",
	})
}

// RawPostToolUse returns a raw `PostToolUse` — also a turn-activity event; useful for
// straggler-past-Stop cases.
func RawPostToolUse(sessionID string, opts TurnActivityOpts) string {
	return marshal(map[string]any{
		"hook_event_name": "PostToolUse",
		"session_id":      sessionID,
		"transcript_path": "/tmp/t.jsonl",
		"cwd":             "/tmp",
		"prompt_id":       opts.promptID(),
		"permission_mode": opts.permissionMode(),
		"tool_name":       "Write",
		"tool_input":      map[string]any{"file_path": "/tmp/x.txt"},
		"tool_use_id":     "tu1",
		"tool_response":   map[string]any{"ok": true},
		"duration_ms":     42,
	})
}

// ToolFileOpts customizes RawPostToolUseFile/RawPreToolUseTool beyond their defaults
// (plan markdown-viewing: REQ-13/REQ-16/REQ-18/REQ-26 fixtures).
type ToolFileOpts struct {
	PromptID       string // default "p1"
	PermissionMode string // default "default" (RawPreToolUseTool defaults to "plan" instead)
	// TranscriptPath overrides the hook's transcript_path (default "/tmp/t.jsonl") —
	// the only place a session's plan slug lives (kb:fact/plan-file-path-in-transcript).
	TranscriptPath string
	// AgentID, when non-empty, marks the hook as subagent-fired (kb:fact/subagent-hooks-carry-agent-id):
	// agent_id/agent_type are added, matching RawPostToolUse's existing marker shape.
	AgentID string
}

func (o ToolFileOpts) promptID() string {
	if o.PromptID == "" {
		return "p1"
	}
	return o.PromptID
}

func (o ToolFileOpts) transcriptPath() string {
	if o.TranscriptPath == "" {
		return "/tmp/t.jsonl"
	}
	return o.TranscriptPath
}

// RawPostToolUseFile returns a raw `PostToolUse` naming toolName/filePath in
// tool_name/tool_input.file_path — the docChanged/plan-scan fixture (REQ-13, REQ-18):
// a chosen tool, transcript path and optional subagent marker, so server tests never
// spell the wire keys themselves.
func RawPostToolUseFile(sessionID, toolName, filePath string, opts ToolFileOpts) string {
	permissionMode := opts.PermissionMode
	if permissionMode == "" {
		permissionMode = "default"
	}
	body := map[string]any{
		"hook_event_name": "PostToolUse",
		"session_id":      sessionID,
		"transcript_path": opts.transcriptPath(),
		"cwd":             "/tmp",
		"prompt_id":       opts.promptID(),
		"permission_mode": permissionMode,
		"tool_name":       toolName,
		"tool_input":      map[string]any{"file_path": filePath},
		"tool_use_id":     "tu1",
		"tool_response":   map[string]any{"ok": true},
		"duration_ms":     42,
	}
	if opts.AgentID != "" {
		body["agent_id"] = opts.AgentID
		body["agent_type"] = "general-purpose"
	}
	return marshal(body)
}

// RawPreToolUseTool returns a raw `PreToolUse` for toolName — REQ-16's `ExitPlanMode`
// scan trigger (kb:fact/plan-mode-hook-sequence: step 1 of leaving plan mode is
// `PreToolUse{tool_name:"ExitPlanMode", permission_mode:"plan"}`), generalized to any
// tool name for the "other PreToolUse tools must not scan" side of D6.
func RawPreToolUseTool(sessionID, toolName string, opts ToolFileOpts) string {
	permissionMode := opts.PermissionMode
	if permissionMode == "" {
		permissionMode = "plan"
	}
	body := map[string]any{
		"hook_event_name": "PreToolUse",
		"session_id":      sessionID,
		"transcript_path": opts.transcriptPath(),
		"cwd":             "/tmp",
		"prompt_id":       opts.promptID(),
		"permission_mode": permissionMode,
		"tool_name":       toolName,
		"tool_input":      map[string]any{},
		"tool_use_id":     "tu0",
	}
	if opts.AgentID != "" {
		body["agent_id"] = opts.AgentID
		body["agent_type"] = "general-purpose"
	}
	return marshal(body)
}

// EnvelopedSessionStartTranscript returns an enveloped `SessionStart` naming
// transcriptPath — REQ-16's first scan trigger, kept separate from
// EnvelopedSessionStart/SessionStartOpts (m1-sessions territory) so this plan's own
// fixture need is additive, not a reshape of an existing one.
func EnvelopedSessionStartTranscript(sessionID, transcriptPath string, opts SessionStartOpts) string {
	musterSession := opts.MusterSession
	if musterSession == 0 {
		musterSession = 1
	}
	source := opts.Source
	if source == "" {
		source = "startup"
	}
	payload := map[string]any{
		"hook_event_name": "SessionStart",
		"session_id":      sessionID,
		"transcript_path": transcriptPath,
		"cwd":             "/tmp",
		"source":          source,
	}
	if !opts.OmitModel {
		modelID := opts.ModelID
		if modelID == "" {
			modelID = "claude-haiku-4-5-20251001"
		}
		payload["model"] = modelID
	}
	env := map[string]any{
		"musterSession": musterSession,
		"payload":       payload,
	}
	if opts.TmuxPane != "" {
		env["tmuxPane"] = opts.TmuxPane
	}
	return marshal(env)
}

// PlanAttachmentLine returns one transcript JSONL line naming planFilePath via a
// plan_mode*/planFilePath attachment (kb:fact/plan-file-path-in-transcript).
// attachmentType is one of "plan_mode", "plan_mode_exit" or "plan_mode_reentry" — every
// attachment type the fact record says LocatePlanFile must accept.
func PlanAttachmentLine(attachmentType, planFilePath string, planExists bool) string {
	return marshal(map[string]any{
		"type": "attachment",
		"attachment": map[string]any{
			"type":         attachmentType,
			"planFilePath": planFilePath,
			"planExists":   planExists,
		},
	})
}

// SlugLine returns one transcript JSONL line carrying only a top-level slug — the
// fallback shape LocatePlanFile resolves to "<home>/.claude/plans/<slug>.md" when no
// planFilePath-carrying line exists yet.
func SlugLine(slug string) string {
	return marshal(map[string]any{"type": "user", "slug": slug})
}

// RawNotification returns a raw `Notification` — the two observed types that drive
// needs_input (canary-fields.md "Values worth asserting"); permission_mode is never
// present on this event.
func RawNotification(sessionID, promptID, notificationType string) string {
	message := "Claude is waiting for your input"
	if notificationType == "permission_prompt" {
		message = "Claude needs your permission"
	}
	return marshal(map[string]any{
		"hook_event_name":   "Notification",
		"session_id":        sessionID,
		"transcript_path":   "/tmp/t.jsonl",
		"cwd":               "/tmp",
		"prompt_id":         promptID,
		"notification_type": notificationType,
		"message":           message,
	})
}

// RawPermissionRequest returns a raw `PermissionRequest` — corroborates a
// permission-prompt needs_input (kb:anchor/state.transitions).
func RawPermissionRequest(sessionID, promptID string) string {
	return marshal(map[string]any{
		"hook_event_name":        "PermissionRequest",
		"session_id":             sessionID,
		"transcript_path":        "/tmp/t.jsonl",
		"cwd":                    "/tmp",
		"prompt_id":              promptID,
		"permission_mode":        "default",
		"tool_name":              "Write",
		"tool_input":             map[string]any{"file_path": "/tmp/x.txt"},
		"permission_suggestions": []any{map[string]any{"type": "setMode", "mode": "acceptEdits", "destination": "session"}},
	})
}

// StopOpts overrides RawStop's defaults; a zero field keeps its default.
type StopOpts struct {
	PromptID             string
	PermissionMode       string
	LastAssistantMessage string
}

// RawStop returns a raw (non-enveloped) `Stop` — the common shape for ordinary
// plain-HTTP hooks.
func RawStop(sessionID string, opts StopOpts) string {
	promptID := opts.PromptID
	if promptID == "" {
		promptID = "p1"
	}
	permissionMode := opts.PermissionMode
	if permissionMode == "" {
		permissionMode = "default"
	}
	lastAssistantMessage := opts.LastAssistantMessage
	if lastAssistantMessage == "" {
		lastAssistantMessage = "hi"
	}
	return marshal(map[string]any{
		"hook_event_name":        "Stop",
		"session_id":             sessionID,
		"transcript_path":        "/tmp/t.jsonl",
		"cwd":                    "/tmp",
		"prompt_id":              promptID,
		"permission_mode":        permissionMode,
		"last_assistant_message": lastAssistantMessage,
		"stop_hook_active":       false,
		"background_tasks":       []any{},
		"session_crons":          []any{},
	})
}

// StopFailureOpts overrides RawStopFailure's defaults; a zero field keeps its default.
type StopFailureOpts struct {
	PromptID             string
	Error                string
	LastAssistantMessage string
}

// RawStopFailure returns a raw `StopFailure` — mutually exclusive with `Stop` for a
// given turn (canary-fields.md: "never both for the same turn"); carries no
// permission_mode (the never-present list).
func RawStopFailure(sessionID string, opts StopFailureOpts) string {
	promptID := opts.PromptID
	if promptID == "" {
		promptID = "p1"
	}
	errTok := opts.Error
	if errTok == "" {
		errTok = "server_error"
	}
	lastAssistantMessage := opts.LastAssistantMessage
	if lastAssistantMessage == "" {
		lastAssistantMessage = "API error ended the turn"
	}
	return marshal(map[string]any{
		"hook_event_name":        "StopFailure",
		"session_id":             sessionID,
		"transcript_path":        "/tmp/t.jsonl",
		"cwd":                    "/tmp",
		"prompt_id":              promptID,
		"error":                  errTok,
		"last_assistant_message": lastAssistantMessage,
	})
}

// RawPreCompact returns a raw `PreCompact` — increments the compaction counter only,
// no transition.
func RawPreCompact(sessionID, promptID string) string {
	if promptID == "" {
		promptID = "p1"
	}
	return marshal(map[string]any{
		"hook_event_name": "PreCompact",
		"session_id":      sessionID,
		"transcript_path": "/tmp/t.jsonl",
		"cwd":             "/tmp",
		"prompt_id":       promptID,
	})
}

// RawSessionEnd returns a raw `SessionEnd` — reason "clear" is not a death hint
// (kb:anchor/state.transitions); any other reason sets alive:false. Carries no permission_mode.
func RawSessionEnd(sessionID, reason string) string {
	if reason == "" {
		reason = "other"
	}
	return marshal(map[string]any{
		"hook_event_name": "SessionEnd",
		"session_id":      sessionID,
		"transcript_path": "/tmp/t.jsonl",
		"cwd":             "/tmp",
		"reason":          reason,
	})
}

// EnvelopedStatusLinePreFirstResponse returns an enveloped status-line body in the
// pre-first-API-response shape: context_window's percentages/current_usage are null
// and rate_limits is entirely absent (canary-fields.md's measured pre-response state).
// sessionName, when non-empty, adds the status line's session_name field.
func EnvelopedStatusLinePreFirstResponse(sessionID string, musterSession int, tmuxPane, sessionName string) string {
	payload := map[string]any{
		"session_id":          sessionID,
		"transcript_path":     "/tmp/t.jsonl",
		"cwd":                 "/tmp",
		"version":             "2.1.233",
		"model":               map[string]any{"id": "claude-haiku-4-5-20251001", "display_name": "Haiku 4.5"},
		"workspace":           map[string]any{"current_dir": "/tmp", "project_dir": "/tmp", "added_dirs": []any{}},
		"output_style":        map[string]any{"name": "default"},
		"thinking":            map[string]any{"enabled": false},
		"fast_mode":           false,
		"exceeds_200k_tokens": false,
		"context_window": map[string]any{
			"context_window_size":  200000,
			"used_percentage":      nil,
			"remaining_percentage": nil,
			"total_input_tokens":   0,
			"total_output_tokens":  0,
			"current_usage":        nil,
		},
	}
	if sessionName != "" {
		payload["session_name"] = sessionName
	}
	env := map[string]any{"payload": payload}
	if musterSession != 0 {
		env["musterSession"] = musterSession
	}
	if tmuxPane != "" {
		env["tmuxPane"] = tmuxPane
	}
	return marshal(env)
}

// StatusLineFullOpts overrides EnvelopedStatusLineFull's defaults (musterSession 1, model
// "claude-haiku-4-5-20251001"/"Haiku 4.5", 42% context used / 84000 input tokens / 200000
// window, 61% five-hour / 23% seven-day usage, both resetting at a fixed far-future epoch).
// TmuxPane has no default: left empty, it omits the envelope's tmuxPane field (the headless
// shape) rather than filling one in. Every default is fixed and non-wall-clock-dependent so
// two zero-value calls are byte-identical, which dedup tests depend on.
type StatusLineFullOpts struct {
	MusterSession int
	// TmuxPane, left empty, omits the envelope's tmuxPane field (the headless shape).
	TmuxPane string
	// SessionName, when non-empty, adds the status line's session_name field (title
	// refresh, REQ-4).
	SessionName      string
	ModelID          string
	ModelDisplayName string
	// UsedPct/TotalInputTokens/WindowSize are context_window's fields (REQ-2's non-null
	// "post-first-response" shape). UsedPct is a pointer so a genuine 0% reading (REQ-2's
	// converse — a real zero, not the null/absent case) can be expressed; nil means "use
	// the 42% default", not "send zero".
	UsedPct          *float64
	TotalInputTokens int64
	WindowSize       int64
	// FiveHourPct/SevenDayPct/*ResetsAt are rate_limits' two buckets (REQ-3). ResetsAt
	// values are Unix epoch seconds, matching the wire's integer shape (canary-fields.md
	// correction #2).
	FiveHourPct      float64
	FiveHourResetsAt int64
	SevenDayPct      float64
	SevenDayResetsAt int64
}

// farFutureResetsAt is a fixed, non-wall-clock-dependent Unix epoch second
// (2099-01-01T00:00:00Z) used as StatusLineFullOpts' default reset time.
const farFutureResetsAt = 4070908800

// EnvelopedStatusLineFull returns an enveloped status-line body in the
// post-first-API-response shape: real context_window percentages/current_usage and
// both rate_limits buckets present (canary-fields.md's measured post-response state) —
// the counterpart to EnvelopedStatusLinePreFirstResponse. A zero-value
// StatusLineFullOpts reproduces the fixed default fixture byte-for-byte.
func EnvelopedStatusLineFull(sessionID string, opts StatusLineFullOpts) string {
	payload := statusLineFullPayload(sessionID, opts)

	musterSession := opts.MusterSession
	if musterSession == 0 {
		musterSession = 1
	}
	tmuxPane := opts.TmuxPane

	env := map[string]any{"payload": payload}
	if musterSession != 0 {
		env["musterSession"] = musterSession
	}
	if tmuxPane != "" {
		env["tmuxPane"] = tmuxPane
	}
	return marshal(env)
}

// RawStatusLineFull returns the same post-first-API-response status-line shape as
// EnvelopedStatusLineFull, but as Claude Code itself would emit it on stdin to the
// status-line command — no musterSession/tmuxPane envelope (m4-hook-quoting
// Implementation Notes: the real wrapper script adds the envelope itself from the pane
// environment, so a test driving the wrapper script end-to-end via `sh -c` needs the
// bare payload, not the pre-enveloped shape the ingest handler expects directly).
// opts.MusterSession/TmuxPane are ignored here since there is no envelope to carry them.
func RawStatusLineFull(sessionID string, opts StatusLineFullOpts) string {
	return marshal(statusLineFullPayload(sessionID, opts))
}

// statusLineFullPayload builds the inner status-line payload map shared by
// EnvelopedStatusLineFull and RawStatusLineFull, applying StatusLineFullOpts' documented
// defaults.
func statusLineFullPayload(sessionID string, opts StatusLineFullOpts) map[string]any {
	modelID := opts.ModelID
	if modelID == "" {
		modelID = "claude-haiku-4-5-20251001"
	}
	modelDisplayName := opts.ModelDisplayName
	if modelDisplayName == "" {
		modelDisplayName = "Haiku 4.5"
	}
	usedPct := 42.0
	if opts.UsedPct != nil {
		usedPct = *opts.UsedPct
	}
	totalInputTokens := opts.TotalInputTokens
	if totalInputTokens == 0 {
		totalInputTokens = 84000
	}
	windowSize := opts.WindowSize
	if windowSize == 0 {
		windowSize = 200000
	}
	fiveHourPct := opts.FiveHourPct
	if fiveHourPct == 0 {
		fiveHourPct = 61
	}
	fiveHourResetsAt := opts.FiveHourResetsAt
	if fiveHourResetsAt == 0 {
		fiveHourResetsAt = farFutureResetsAt
	}
	sevenDayPct := opts.SevenDayPct
	if sevenDayPct == 0 {
		sevenDayPct = 23
	}
	sevenDayResetsAt := opts.SevenDayResetsAt
	if sevenDayResetsAt == 0 {
		sevenDayResetsAt = farFutureResetsAt
	}

	payload := map[string]any{
		"session_id":          sessionID,
		"transcript_path":     "/tmp/t.jsonl",
		"cwd":                 "/tmp",
		"version":             "2.1.233",
		"model":               map[string]any{"id": modelID, "display_name": modelDisplayName},
		"workspace":           map[string]any{"current_dir": "/tmp", "project_dir": "/tmp", "added_dirs": []any{}},
		"output_style":        map[string]any{"name": "default"},
		"thinking":            map[string]any{"enabled": false},
		"fast_mode":           false,
		"exceeds_200k_tokens": false,
		"context_window": map[string]any{
			"context_window_size":  windowSize,
			"used_percentage":      usedPct,
			"remaining_percentage": 100 - usedPct,
			"total_input_tokens":   totalInputTokens,
			"total_output_tokens":  49,
			"current_usage": map[string]any{
				"input_tokens": 10, "output_tokens": 49,
				"cache_creation_input_tokens": 15558, "cache_read_input_tokens": 23318,
			},
		},
		"rate_limits": map[string]any{
			"five_hour": map[string]any{"used_percentage": fiveHourPct, "resets_at": fiveHourResetsAt},
			"seven_day": map[string]any{"used_percentage": sevenDayPct, "resets_at": sevenDayResetsAt},
		},
	}
	if opts.SessionName != "" {
		payload["session_name"] = opts.SessionName
	}
	return payload
}

// UsageWindowOpt is one weekly-scoped window for UsageAPIBody's fixture. ResetsAt,
// left empty, defaults to farFutureResetsAt encoded as a bare epoch number — exercising
// REQ-4's "RFC3339 or epoch seconds" dual format for free; pass an RFC3339 string
// explicitly to test that branch instead.
type UsageWindowOpt struct {
	DisplayName string
	Percent     float64
	ResetsAt    string
}

// UsageAPIBody returns a GET /api/oauth/usage-shaped response body (measured live
// 2026-08-30, docs/history/spikes/canary-fields.md "GET /api/oauth/usage measured live 2026-08-30")
// carrying the given weekly-scoped windows plus the session/weekly_all noise the real
// endpoint always returns alongside them. Tests outside internal/claudecode must never
// spell out this endpoint's own wire vocabulary (the D3 boundary check on plan
// usage-model-bar) — this is the sanctioned way to get a realistic body, mirroring
// EnvelopedSessionStart's role for hook payloads above.
func UsageAPIBody(windows ...UsageWindowOpt) string {
	limits := []any{
		map[string]any{"kind": "session", "percent": 12, "resets_at": farFutureResetsAt, "scope": nil},
		map[string]any{"kind": "weekly_all", "percent": 30, "resets_at": farFutureResetsAt, "scope": nil},
	}
	for _, w := range windows {
		var resetsAt any = farFutureResetsAt
		if w.ResetsAt != "" {
			resetsAt = w.ResetsAt
		}
		limits = append(limits, map[string]any{
			"kind":      "weekly_scoped",
			"percent":   w.Percent,
			"resets_at": resetsAt,
			"scope":     map[string]any{"model": map[string]any{"id": nil, "display_name": w.DisplayName}},
		})
	}
	return marshal(map[string]any{"limits": limits})
}

// OAuthCredentialsBody returns the Keychain-item/scratch-token-file JSON shape musterd
// reads its OAuth token from — the same D3 sanctioned-fixture reasoning as UsageAPIBody.
func OAuthCredentialsBody(token string) string {
	return marshal(map[string]any{
		"claudeAiOauth": map[string]any{"accessToken": token},
	})
}

func marshal(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err) // unreachable: inputs are maps of strings and ints
	}
	return string(b)
}
