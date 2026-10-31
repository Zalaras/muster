// Package claudecodetest builds Claude-Code-wire-format request bodies for tests in
// other packages. Wire field names may not appear outside internal/claudecode (the
// boundary check), yet HTTP-boundary tests still need to POST realistic bodies — this
// package is the sanctioned way to get one. Tests needing shapes beyond these minimal
// builders belong in internal/claudecode's own tests, not here.
package claudecodetest

import "encoding/json"

// Defaults shared by two or more builders below, each declared exactly once
// (review.maintainability.c-adapters Major 4).
const (
	defaultTranscriptPath = "/tmp/t.jsonl"
	defaultCWD            = "/tmp"
	defaultPromptID       = "p1"
	defaultPermissionMode = "default"
	defaultModelID        = "claude-haiku-4-5-20251001"
	defaultModelDisplay   = "Haiku 4.5"
	defaultClaudeVersion  = "2.1.233"
	defaultContextWindow  = 200000
)

// orDefault returns s, or def when s is empty.
func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

// envelope wraps payload in the musterSession/tmuxPane envelope Muster's hook command
// wrapper produces (the one shape every enveloped builder below sends). musterSession
// left at zero defaults to 1, the common single-session fixture; tmuxPane, left empty,
// omits the field entirely (the headless shape, kb:adr/ingest-envelope-pane-must-corroborate)
// rather than sending an empty string.
func envelope(musterSession int, tmuxPane string, payload map[string]any) map[string]any {
	if musterSession == 0 {
		musterSession = 1
	}
	env := map[string]any{
		"musterSession": musterSession,
		"payload":       payload,
	}
	if tmuxPane != "" {
		env["tmuxPane"] = tmuxPane
	}
	return env
}

// RawHookBody returns a minimal raw (non-enveloped) hook POST body for the given
// hook event and session id, as Claude Code itself would send it.
func RawHookBody(event, sessionID string) string {
	return marshal(map[string]any{
		"hook_event_name": event,
		"session_id":      sessionID,
		"cwd":             defaultCWD,
	})
}

// EnvelopedHookBody wraps a minimal hook payload for the given event and session id
// in the musterSession/tmuxPane envelope produced by Muster's hook command wrapper.
func EnvelopedHookBody(musterSession int, tmuxPane, event, sessionID string) string {
	return marshal(envelope(musterSession, tmuxPane, map[string]any{
		"hook_event_name": event,
		"session_id":      sessionID,
	}))
}

// EnvelopedHookInDirectory is EnvelopedHookBody for a main-agent hook that reports dir as
// the directory Claude is working in (kb:fact/cwd-follows-claude-mid-session), so a test
// outside internal/claudecode never spells that payload key itself.
func EnvelopedHookInDirectory(musterSession int, tmuxPane, event, sessionID, dir string) string {
	return marshal(envelope(musterSession, tmuxPane, map[string]any{
		"hook_event_name": event,
		"session_id":      sessionID,
		"cwd":             dir,
	}))
}

// SessionStartOpts customizes EnvelopedSessionStart beyond its defaults (musterSession 1,
// source "startup", a present model). TmuxPane has no default
// (kb:adr/ingest-envelope-pane-must-corroborate): left empty, it omits the envelope's
// tmuxPane field entirely — the headless shape — rather than filling in a pane the caller
// never stated; every enveloped fixture site must state its own pane.
type SessionStartOpts struct {
	MusterSession int
	// TmuxPane, left empty, omits the envelope's tmuxPane field (the headless shape).
	TmuxPane string
	Source   string
	// ModelID, when non-empty, is embedded as the SessionStart payload's optional
	// model field (m1-sessions plan Implementation Notes: sometimes absent). Leave
	// empty and set OmitModel to omit the field entirely.
	ModelID   string
	OmitModel bool
	// Cwd, when non-empty, replaces the payload's default working directory ("/tmp") —
	// the launch directory a real `claude` reports on its first hook.
	Cwd string
}

// sessionStartPayload builds the `SessionStart` hook payload shared by
// EnvelopedSessionStart and EnvelopedSessionStartTranscript, which differ only in
// transcript_path.
func sessionStartPayload(sessionID, transcriptPath string, opts SessionStartOpts) map[string]any {
	payload := map[string]any{
		"hook_event_name": "SessionStart",
		"session_id":      sessionID,
		"transcript_path": transcriptPath,
		"cwd":             orDefault(opts.Cwd, defaultCWD),
		"source":          orDefault(opts.Source, "startup"),
	}
	if !opts.OmitModel {
		// A plain model-id string, never an {id, display_name} object (settled by
		// measurement — interface probe, 2026-08-22, docs/history/spikes/canary-fields.md "Values
		// worth asserting" → SessionStart.model; review Major 11).
		payload["model"] = orDefault(opts.ModelID, defaultModelID)
	}
	return payload
}

// EnvelopedSessionStart returns the enveloped `SessionStart` body — the one hook that
// is silently never delivered over plain HTTP (canary-fields.md "Transport"), so the
// real wrapper always posts it enveloped. A zero-value SessionStartOpts posts the
// headless shape (no tmuxPane) — the caller states a pane explicitly wherever
// routing is expected.
func EnvelopedSessionStart(sessionID string, opts SessionStartOpts) string {
	payload := sessionStartPayload(sessionID, defaultTranscriptPath, opts)
	return marshal(envelope(opts.MusterSession, opts.TmuxPane, payload))
}

// ToolFileOpts customizes RawPostToolUseFile/RawPreToolUseTool beyond their defaults
// (markdown-viewing fixtures).
type ToolFileOpts struct {
	PromptID       string // default "p1"
	PermissionMode string // default "default" (RawPreToolUseTool defaults to "plan" instead)
	// TranscriptPath overrides the hook's transcript_path (default "/tmp/t.jsonl") —
	// the only place a session's plan slug lives (kb:fact/plan-file-path-in-transcript).
	TranscriptPath string
	// AgentID, when non-empty, marks the hook as subagent-fired (kb:fact/subagent-hooks-carry-agent-id):
	// agent_id/agent_type are added to mark it.
	AgentID string
}

func (o ToolFileOpts) promptID() string {
	return orDefault(o.PromptID, defaultPromptID)
}

func (o ToolFileOpts) transcriptPath() string {
	return orDefault(o.TranscriptPath, defaultTranscriptPath)
}

// RawPostToolUseFile returns a raw `PostToolUse` naming toolName/filePath in
// tool_name/tool_input.file_path — the docChanged/plan-scan fixture:
// a chosen tool, transcript path and optional subagent marker, so server tests never
// spell the wire keys themselves.
func RawPostToolUseFile(sessionID, toolName, filePath string, opts ToolFileOpts) string {
	body := map[string]any{
		"hook_event_name": "PostToolUse",
		"session_id":      sessionID,
		"transcript_path": opts.transcriptPath(),
		"cwd":             defaultCWD,
		"prompt_id":       opts.promptID(),
		"permission_mode": orDefault(opts.PermissionMode, defaultPermissionMode),
		"tool_name":       toolName,
		"tool_input":      map[string]any{"file_path": filePath},
		"tool_use_id":     "tu1",
		"tool_response":   map[string]any{"ok": true},
		"duration_ms":     42,
	}
	markSubagent(body, opts.AgentID)
	return marshal(body)
}

// RawPreToolUseTool returns a raw `PreToolUse` for toolName — the `ExitPlanMode`
// scan trigger (kb:fact/plan-mode-hook-sequence: step 1 of leaving plan mode is
// `PreToolUse{tool_name:"ExitPlanMode", permission_mode:"plan"}`), generalized to any
// tool name for the "other PreToolUse tools must not scan" side of the scan-trigger test.
func RawPreToolUseTool(sessionID, toolName string, opts ToolFileOpts) string {
	body := map[string]any{
		"hook_event_name": "PreToolUse",
		"session_id":      sessionID,
		"transcript_path": opts.transcriptPath(),
		"cwd":             defaultCWD,
		"prompt_id":       opts.promptID(),
		"permission_mode": orDefault(opts.PermissionMode, "plan"),
		"tool_name":       toolName,
		"tool_input":      map[string]any{},
		"tool_use_id":     "tu0",
	}
	markSubagent(body, opts.AgentID)
	return marshal(body)
}

// EnvelopedSessionStartTranscript returns an enveloped `SessionStart` naming
// transcriptPath — the first scan trigger, kept separate from EnvelopedSessionStart
// because that builder's own transcript_path is a fixed default: this one lets a caller
// name a transcript file that a later plan-scan test then writes to.
func EnvelopedSessionStartTranscript(sessionID, transcriptPath string, opts SessionStartOpts) string {
	payload := sessionStartPayload(sessionID, transcriptPath, opts)
	return marshal(envelope(opts.MusterSession, opts.TmuxPane, payload))
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
		"transcript_path":   defaultTranscriptPath,
		"cwd":               defaultCWD,
		"prompt_id":         promptID,
		"notification_type": notificationType,
		"message":           message,
	})
}

// markSubagent adds the subagent marker (kb:fact/subagent-hooks-carry-agent-id) to a
// hook body when agentID is non-empty; the one place agent_type's value lives.
func markSubagent(body map[string]any, agentID string) {
	if agentID != "" {
		body["agent_id"] = agentID
		body["agent_type"] = "general-purpose"
	}
}

// RawPermissionRequest returns a raw `PermissionRequest` — corroborates a
// permission-prompt needs_input (kb:anchor/state.transitions).
func RawPermissionRequest(sessionID, promptID string) string {
	return RawSubagentPermissionRequest(sessionID, promptID, "")
}

// RawSubagentPermissionRequest returns a raw `PermissionRequest` fired by the subagent
// agentID (kb:fact/subagent-hooks-carry-agent-id); an empty agentID is the main agent's.
func RawSubagentPermissionRequest(sessionID, promptID, agentID string) string {
	body := map[string]any{
		"hook_event_name":        "PermissionRequest",
		"session_id":             sessionID,
		"transcript_path":        defaultTranscriptPath,
		"cwd":                    defaultCWD,
		"prompt_id":              promptID,
		"permission_mode":        defaultPermissionMode,
		"tool_name":              "Write",
		"tool_input":             map[string]any{"file_path": "/tmp/x.txt"},
		"permission_suggestions": []any{map[string]any{"type": "setMode", "mode": "acceptEdits", "destination": "session"}},
	}
	markSubagent(body, agentID)
	return marshal(body)
}

// RawPostToolBatch returns a raw `PostToolBatch` (kb:fact/plan-feedback-emits-only-post-tool-batch):
// the event a rejected plan leaves as its only post-tool trace. opts.AgentID marks it
// subagent-fired, exactly as on RawPostToolUseFile.
func RawPostToolBatch(sessionID string, opts ToolFileOpts) string {
	body := map[string]any{
		"hook_event_name": "PostToolBatch",
		"session_id":      sessionID,
		"transcript_path": opts.transcriptPath(),
		"cwd":             defaultCWD,
		"prompt_id":       opts.promptID(),
		"permission_mode": orDefault(opts.PermissionMode, defaultPermissionMode),
	}
	markSubagent(body, opts.AgentID)
	return marshal(body)
}

// RawPromptlessIdleNotification returns a raw `Notification` of type idle_prompt with no
// prompt_id key — the shape that follows /clear (kb:fact/clear-idle-prompt-carries-no-prompt-id).
func RawPromptlessIdleNotification(sessionID string) string {
	return marshal(map[string]any{
		"hook_event_name":   "Notification",
		"session_id":        sessionID,
		"transcript_path":   defaultTranscriptPath,
		"cwd":               defaultCWD,
		"notification_type": "idle_prompt",
		"message":           "Claude is waiting for your input",
	})
}

// InterruptLine returns one transcript JSONL line recording an interrupt of promptID
// (kb:fact/interrupt-recorded-in-transcript); forToolUse picks the "for tool use" text.
func InterruptLine(promptID string, forToolUse bool) string {
	text := "[Request interrupted by user]"
	if forToolUse {
		text = "[Request interrupted by user for tool use]"
	}
	return marshal(map[string]any{
		"type":     "user",
		"promptId": promptID,
		"message":  map[string]any{"role": "user", "content": []any{map[string]any{"type": "text", "text": text}}},
	})
}

// PlanRejectionLine returns one transcript JSONL line for a plan rejected with feedback:
// a tool_result block only, never the interrupt text.
func PlanRejectionLine(promptID string) string {
	return marshal(map[string]any{
		"type":     "user",
		"promptId": promptID,
		"message": map[string]any{"role": "user", "content": []any{
			map[string]any{"type": "tool_result", "tool_use_id": "tu1", "content": "The user doesn't want to proceed", "is_error": true},
		}},
	})
}

// PromptSubmitOpts overrides RawUserPromptSubmit's defaults; a zero field keeps its default.
type PromptSubmitOpts struct {
	PromptID       string
	PermissionMode string
	// Prompt is the user's prompt text (kb:fact/background-completion-new-prompt-id names the
	// one synthetic shape that is not a real prompt).
	Prompt string
}

// RawUserPromptSubmit returns a raw (non-enveloped) `UserPromptSubmit` carrying the
// prompt's text and the permission mode, as the real hook sends them.
func RawUserPromptSubmit(sessionID string, opts PromptSubmitOpts) string {
	return marshal(map[string]any{
		"hook_event_name": "UserPromptSubmit",
		"session_id":      sessionID,
		"transcript_path": defaultTranscriptPath,
		"cwd":             defaultCWD,
		"prompt_id":       orDefault(opts.PromptID, defaultPromptID),
		"permission_mode": orDefault(opts.PermissionMode, defaultPermissionMode),
		"prompt":          orDefault(opts.Prompt, "do the thing"),
	})
}

// StopOpts overrides RawStop's defaults; a zero field keeps its default.
type StopOpts struct {
	PromptID             string
	PermissionMode       string
	LastAssistantMessage string
	// RunningShells adds that many backgrounded-shell entries with status "running" to
	// background_tasks (kb:fact/background-tasks-field); CompletedShells adds finished ones.
	RunningShells   int
	CompletedShells int
}

// backgroundTasks builds RawStop's background_tasks list from opts.
func (o StopOpts) backgroundTasks() []any {
	tasks := []any{}
	add := func(n int, status string) {
		for i := range n {
			tasks = append(tasks, map[string]any{"type": "shell", "id": "sh" + status + string(rune('a'+i)), "command": "sleep 600", "description": "sleep", "status": status})
		}
	}
	add(o.RunningShells, "running")
	add(o.CompletedShells, "completed")
	return tasks
}

// RawStop returns a raw (non-enveloped) `Stop` — the common shape for ordinary
// plain-HTTP hooks.
func RawStop(sessionID string, opts StopOpts) string {
	return marshal(map[string]any{
		"hook_event_name":        "Stop",
		"session_id":             sessionID,
		"transcript_path":        defaultTranscriptPath,
		"cwd":                    defaultCWD,
		"prompt_id":              orDefault(opts.PromptID, defaultPromptID),
		"permission_mode":        orDefault(opts.PermissionMode, defaultPermissionMode),
		"last_assistant_message": orDefault(opts.LastAssistantMessage, "hi"),
		"stop_hook_active":       false,
		"background_tasks":       opts.backgroundTasks(),
		"session_crons":          []any{},
	})
}

// StopFailureOpts overrides RawStopFailure's defaults; a zero field keeps its default.
type StopFailureOpts struct {
	PromptID             string
	Error                string
	LastAssistantMessage string
	AgentID              string
}

// RawStopFailure returns a raw `StopFailure` — mutually exclusive with `Stop` for a
// given turn (canary-fields.md: "never both for the same turn"); carries no
// permission_mode (the never-present list).
func RawStopFailure(sessionID string, opts StopFailureOpts) string {
	body := map[string]any{
		"hook_event_name":        "StopFailure",
		"session_id":             sessionID,
		"transcript_path":        defaultTranscriptPath,
		"cwd":                    defaultCWD,
		"prompt_id":              orDefault(opts.PromptID, defaultPromptID),
		"error":                  orDefault(opts.Error, "server_error"),
		"last_assistant_message": orDefault(opts.LastAssistantMessage, "API error ended the turn"),
	}
	markSubagent(body, opts.AgentID)
	return marshal(body)
}

func RawPreCompact(sessionID, promptID string) string {
	return marshal(map[string]any{
		"hook_event_name": "PreCompact",
		"session_id":      sessionID,
		"transcript_path": defaultTranscriptPath,
		"cwd":             defaultCWD,
		"prompt_id":       orDefault(promptID, defaultPromptID),
	})
}

// RawSessionEnd returns a raw `SessionEnd` — reason "clear" is not a death hint
// (kb:anchor/state.transitions); any other reason sets alive:false. Carries no permission_mode.
func RawSessionEnd(sessionID, reason string) string {
	return marshal(map[string]any{
		"hook_event_name": "SessionEnd",
		"session_id":      sessionID,
		"transcript_path": defaultTranscriptPath,
		"cwd":             defaultCWD,
		"reason":          orDefault(reason, "other"),
	})
}

func marshal(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err) // unreachable: inputs are maps of strings and ints
	}
	return string(b)
}
