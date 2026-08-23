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
// in the musterSession/tmuxPane envelope produced by Muster's hook command wrapper.
func EnvelopedHookBody(musterSession int, tmuxPane, event, sessionID string) string {
	return marshal(map[string]any{
		"musterSession": musterSession,
		"tmuxPane":      tmuxPane,
		"payload": map[string]any{
			"hook_event_name": event,
			"session_id":      sessionID,
		},
	})
}

// SessionStartOpts customizes EnvelopedSessionStart beyond its M0-compatible defaults
// (musterSession 1, tmuxPane "%12", source "startup", a present model).
type SessionStartOpts struct {
	MusterSession int
	TmuxPane      string
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
// real wrapper always posts it enveloped. Passing a zero-value SessionStartOpts
// reproduces M0's fixture byte-for-byte.
func EnvelopedSessionStart(sessionID string, opts SessionStartOpts) string {
	musterSession := opts.MusterSession
	if musterSession == 0 {
		musterSession = 1
	}
	tmuxPane := opts.TmuxPane
	if tmuxPane == "" {
		tmuxPane = "%12"
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
		// measurement — interface probe, 2026-08-22, spikes/canary-fields.md "Values
		// worth asserting" → SessionStart.model; review Major 11).
		payload["model"] = modelID
	}

	return marshal(map[string]any{
		"musterSession": musterSession,
		"tmuxPane":      tmuxPane,
		"payload":       payload,
	})
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

// RawUserPromptSubmit returns a raw `UserPromptSubmit` — opens a turn (protocol §7.3).
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
// permission-prompt needs_input (protocol §7.3).
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

// StopOpts customizes RawStop beyond its M0-compatible defaults.
type StopOpts struct {
	PromptID             string
	PermissionMode       string
	LastAssistantMessage string
}

// RawStop returns a raw (non-enveloped) `Stop` — the common shape for ordinary
// plain-HTTP hooks. A zero-value StopOpts reproduces M0's fixture.
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

// StopFailureOpts customizes RawStopFailure beyond its M0-compatible defaults.
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
// (protocol §7.3); any other reason sets alive:false. Carries no permission_mode.
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
	if tmuxPane == "" {
		tmuxPane = "%12"
	}
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

// StatusLineFullOpts customizes EnvelopedStatusLineFull beyond its M3-baseline defaults
// (musterSession 1, tmuxPane "%12", model "claude-haiku-4-5-20251001"/"Haiku 4.5", 42%
// context used / 84000 input tokens / 200000 window, 61% five-hour / 23% seven-day
// usage, both resetting at a fixed far-future epoch). Every default is fixed and
// non-wall-clock-dependent so two zero-value calls are byte-identical (REQ-15's
// dedup-testing requirement, m3-gauges INV-5/D9).
type StatusLineFullOpts struct {
	MusterSession int
	TmuxPane      string
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
	musterSession := opts.MusterSession
	if musterSession == 0 {
		musterSession = 1
	}
	tmuxPane := opts.TmuxPane
	if tmuxPane == "" {
		tmuxPane = "%12"
	}
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

	env := map[string]any{"payload": payload}
	if musterSession != 0 {
		env["musterSession"] = musterSession
	}
	if tmuxPane != "" {
		env["tmuxPane"] = tmuxPane
	}
	return marshal(env)
}

func marshal(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err) // unreachable: inputs are maps of strings and ints
	}
	return string(b)
}
