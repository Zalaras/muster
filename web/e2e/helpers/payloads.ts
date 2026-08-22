// Synthesized Claude Code hook / status-line payloads for M0's E2E suite.
//
// Shapes are copied from the plan's Implementation Notes (which cite
// spikes/canary-fields.md's measured captures against 2.1.233/2.1.237) — never invented.
// No real `claude` is ever launched here (CLAUDE.md hard rule); this is the whole of
// how these tests fake Claude Code.
//
// Deliberately deterministic: fixed session ids, fixed pane/envelope values, no
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

/**
 * Enveloped `SessionStart` — the one hook that is silently never delivered over plain
 * HTTP (canary-fields.md "Transport"), so the real wrapper always posts it enveloped.
 */
export function envelopedSessionStart(sessionId: string): Record<string, unknown> {
  return envelope(
    {
      hook_event_name: "SessionStart",
      session_id: sessionId,
      transcript_path: "/tmp/t.jsonl",
      cwd: "/tmp",
      source: "startup",
      model: { id: "claude-haiku-4-5-20251001", display_name: "Haiku 4.5" },
    },
    { musterSession: 1, tmuxPane: "%12" },
  );
}

/** Raw (non-enveloped) `Stop` — the common shape for ordinary plain-HTTP hooks. */
export function rawStop(sessionId: string): Record<string, unknown> {
  return {
    hook_event_name: "Stop",
    session_id: sessionId,
    transcript_path: "/tmp/t.jsonl",
    cwd: "/tmp",
    prompt_id: "p1",
    permission_mode: "default",
    last_assistant_message: "hi",
    stop_hook_active: false,
  };
}

/**
 * Enveloped status-line body, pre-first-API-response shape: `context_window`'s
 * percentages/current_usage are null and `rate_limits` is entirely absent — the exact
 * "the whole rate_limits key is absent (not empty, not null) until a session's first API
 * response" state from canary-fields.md.
 */
export function envelopedStatusLinePreFirstResponse(sessionId: string): Record<string, unknown> {
  return envelope(
    {
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
    },
    { musterSession: 1, tmuxPane: "%12" },
  );
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
