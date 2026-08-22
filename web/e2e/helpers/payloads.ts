// Synthesized Claude Code hook / status-line payloads for the E2E suite (M0, extended
// by m1-sessions for the §7 state machine's event set).
//
// Shapes are copied from the plan's Implementation Notes and spikes/canary-fields.md's
// measured captures against 2.1.233/2.1.237 — never invented. No real `claude` is ever
// launched here (CLAUDE.md hard rule); this is the whole of how these tests fake Claude
// Code.
//
// Deliberately deterministic: fixed session ids, fixed pane/envelope values (unless a
// caller supplies its own, e.g. a real launched session's `musterSession` id), no
// randomness, no wall-clock reads. Hook payloads carry no timestamp or seq of their own
// (canary-fields.md "Delivery semantics") — none is synthesized here either.

interface EnvelopeOpts {
  musterSession?: number;
  tmuxPane?: string;
}

function envelope(payload: Record<string, unknown>, opts: EnvelopeOpts = {}): Record<string, unknown> {
  const env: Record<string, unknown> = { payload };
  if (opts.musterSession !== undefined) env.musterSession = opts.musterSession;
  if (opts.tmuxPane !== undefined) env.tmuxPane = opts.tmuxPane;
  return env;
}

interface SessionStartOpts extends EnvelopeOpts {
  /** All three observed (canary-fields.md "Values worth asserting"). Default "startup". */
  source?: "startup" | "resume" | "clear";
  /**
   * `SessionStart.model` is optional (measured: present on 2 of 5 startup captures,
   * absent on another startup, on `source:"clear"`, and on a fresh headless startup —
   * 2026-08-22 probe, spikes/canary-fields.md "Values worth asserting"). When present it
   * is always a **plain model-id string** — never the `{id, display_name}` object, which
   * is the status line's shape only. Pass `null` to omit the field entirely; omit this
   * option to get the default present-model shape (M0 behaviour).
   */
  model?: string | null;
}

/**
 * Enveloped `SessionStart` — the one hook that is silently never delivered over plain
 * HTTP (canary-fields.md "Transport"), so the real wrapper always posts it enveloped.
 * Defaults (`musterSession: 1`, `tmuxPane: "%12"`, `source: "startup"`, present model)
 * reproduce M0's fixture exactly; m1-sessions tests pass a real launched session's id.
 */
export function envelopedSessionStart(sessionId: string, opts: SessionStartOpts = {}): Record<string, unknown> {
  const { musterSession = 1, tmuxPane = "%12", source = "startup", model } = opts;
  const payload: Record<string, unknown> = {
    hook_event_name: "SessionStart",
    session_id: sessionId,
    transcript_path: "/tmp/t.jsonl",
    cwd: "/tmp",
    source,
  };
  if (model !== null) {
    payload.model = model ?? "claude-haiku-4-5-20251001";
  }
  return envelope(payload, { musterSession, tmuxPane });
}

interface TurnActivityOpts {
  promptId?: string;
  permissionMode?: "default" | "plan" | "acceptEdits";
}

/** Raw `UserPromptSubmit` — opens a turn (turn-activity event, protocol §7.3). */
export function rawUserPromptSubmit(sessionId: string, opts: TurnActivityOpts = {}): Record<string, unknown> {
  const { promptId = "p1", permissionMode = "default" } = opts;
  return {
    hook_event_name: "UserPromptSubmit",
    session_id: sessionId,
    transcript_path: "/tmp/t.jsonl",
    cwd: "/tmp",
    prompt_id: promptId,
    permission_mode: permissionMode,
    prompt: "do the thing",
  };
}

/** Raw `PostToolUse` — also a turn-activity event; used for straggler-past-Stop cases. */
export function rawPostToolUse(sessionId: string, opts: TurnActivityOpts = {}): Record<string, unknown> {
  const { promptId = "p1", permissionMode = "default" } = opts;
  return {
    hook_event_name: "PostToolUse",
    session_id: sessionId,
    transcript_path: "/tmp/t.jsonl",
    cwd: "/tmp",
    prompt_id: promptId,
    permission_mode: permissionMode,
    tool_name: "Write",
    tool_input: { file_path: "/tmp/x.txt" },
    tool_use_id: "tu1",
    tool_response: { ok: true },
    duration_ms: 42,
  };
}

/**
 * Raw `Notification` — the two observed types that drive `needs_input` (canary-fields.md
 * "Values worth asserting"); `permission_mode` is never present on this event.
 */
export function rawNotification(
  sessionId: string,
  promptId: string,
  notificationType: "permission_prompt" | "idle_prompt",
): Record<string, unknown> {
  return {
    hook_event_name: "Notification",
    session_id: sessionId,
    transcript_path: "/tmp/t.jsonl",
    cwd: "/tmp",
    prompt_id: promptId,
    notification_type: notificationType,
    message:
      notificationType === "permission_prompt"
        ? "Claude needs your permission"
        : "Claude is waiting for your input",
  };
}

/** Raw `PermissionRequest` — corroborates a permission-prompt `needs_input` (protocol §7.3). */
export function rawPermissionRequest(sessionId: string, promptId: string): Record<string, unknown> {
  return {
    hook_event_name: "PermissionRequest",
    session_id: sessionId,
    transcript_path: "/tmp/t.jsonl",
    cwd: "/tmp",
    prompt_id: promptId,
    permission_mode: "default",
    tool_name: "Write",
    tool_input: { file_path: "/tmp/x.txt" },
    permission_suggestions: [{ type: "setMode", mode: "acceptEdits", destination: "session" }],
  };
}

interface StopOpts extends TurnActivityOpts {
  lastAssistantMessage?: string;
}

/**
 * Raw (non-enveloped) `Stop` — the common shape for ordinary plain-HTTP hooks. Defaults
 * (`promptId: "p1"`, `permissionMode: "default"`, message `"hi"`) reproduce M0's fixture.
 */
export function rawStop(sessionId: string, opts: StopOpts = {}): Record<string, unknown> {
  const { promptId = "p1", permissionMode = "default", lastAssistantMessage = "hi" } = opts;
  return {
    hook_event_name: "Stop",
    session_id: sessionId,
    transcript_path: "/tmp/t.jsonl",
    cwd: "/tmp",
    prompt_id: promptId,
    permission_mode: permissionMode,
    last_assistant_message: lastAssistantMessage,
    stop_hook_active: false,
    background_tasks: [],
    session_crons: [],
  };
}

/**
 * Raw `StopFailure` — mutually exclusive with `Stop` for a given turn (canary-fields.md:
 * "never both for the same turn"); carries no `permission_mode` (never-present list).
 */
export function rawStopFailure(
  sessionId: string,
  opts: { promptId?: string; error?: string; lastAssistantMessage?: string } = {},
): Record<string, unknown> {
  const { promptId = "p1", error = "server_error", lastAssistantMessage = "API error ended the turn" } = opts;
  return {
    hook_event_name: "StopFailure",
    session_id: sessionId,
    transcript_path: "/tmp/t.jsonl",
    cwd: "/tmp",
    prompt_id: promptId,
    error,
    last_assistant_message: lastAssistantMessage,
  };
}

/** Raw `PreCompact` — increments the compaction counter only (REQ-21), no transition. */
export function rawPreCompact(sessionId: string, promptId = "p1"): Record<string, unknown> {
  return {
    hook_event_name: "PreCompact",
    session_id: sessionId,
    transcript_path: "/tmp/t.jsonl",
    cwd: "/tmp",
    prompt_id: promptId,
  };
}

/**
 * Raw `SessionEnd` — `reason:"clear"` is not a death hint (protocol §7.3); any other
 * reason sets `alive:false`. Carries no `permission_mode` (never-present list).
 */
export function rawSessionEnd(sessionId: string, reason: "clear" | "other" = "other"): Record<string, unknown> {
  return {
    hook_event_name: "SessionEnd",
    session_id: sessionId,
    transcript_path: "/tmp/t.jsonl",
    cwd: "/tmp",
    reason,
  };
}

/**
 * Enveloped status-line body, pre-first-API-response shape: `context_window`'s
 * percentages/current_usage are null and `rate_limits` is entirely absent — the exact
 * "the whole rate_limits key is absent (not empty, not null) until a session's first API
 * response" state from canary-fields.md. `opts.musterSession` defaults to 1 (M0
 * behaviour); m1-sessions tests pass a real launched session's id. `opts.sessionName`
 * adds the status line's `session_name` field (canary-fields.md "the title source") —
 * used by m1-sessions REQ-13 to prove a status post still mutates no session field in
 * M1 even though it carries a plausible title.
 */
export function envelopedStatusLinePreFirstResponse(
  sessionId: string,
  opts: EnvelopeOpts & { sessionName?: string } = {},
): Record<string, unknown> {
  const { musterSession = 1, tmuxPane = "%12", sessionName } = opts;
  const payload: Record<string, unknown> = {
    session_id: sessionId,
    transcript_path: "/tmp/t.jsonl",
    cwd: "/tmp",
    version: "2.1.233",
    model: { id: "claude-haiku-4-5-20251001", display_name: "Haiku 4.5" },
    workspace: { current_dir: "/tmp", project_dir: "/tmp", added_dirs: [] },
    output_style: { name: "default" },
    thinking: { enabled: false },
    fast_mode: false,
    exceeds_200k_tokens: false,
    context_window: {
      context_window_size: 200000,
      used_percentage: null,
      remaining_percentage: null,
      total_input_tokens: 0,
      total_output_tokens: 0,
      current_usage: null,
    },
    // rate_limits deliberately absent — the measured pre-first-response state.
  };
  if (sessionName !== undefined) payload.session_name = sessionName;
  return envelope(payload, { musterSession, tmuxPane });
}

/** A body that is not valid JSON at all (REQ-13's malformed-body drop path). */
export const malformedJsonBody = "{not valid json";

/**
 * Syntactically valid JSON that nonetheless carries no usable `session_id` — every
 * measured hook and status post carries one (canary-fields.md "common set"), so this is
 * treated the same as malformed per REQ-13 / plan Edge Case 4.
 */
export function rawHookMissingSessionId(): Record<string, unknown> {
  return {
    hook_event_name: "SessionEnd",
    transcript_path: "/tmp/t.jsonl",
    cwd: "/tmp",
    reason: "other",
  };
}
