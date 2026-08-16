# Canary field inventory — Claude Code 2.1.233

Derived from real captured payloads during the step-1 spikes (2026-08-16). This is the
assertion list for the canary E2E described in `SPEC.md` §8: run it before adopting any new
Claude Code version, and treat any missing field as a blocker.

**Validated against:** Claude Code `2.1.233` (native install), macOS Darwin 25.6.
No auto-update drift occurred during the spike run.

Raw evidence: `ccc-spike/captures/capture-1.jsonl`, `capture-3.jsonl`; H2 probe additions
(2026-08-16) in `test/rig/captures/capture-1.jsonl` (gitignored, regenerable via
`/interface-probe`).

---

## Transport — assert this first

| Event | `type:"http"` works? |
|---|---|
| `SessionStart` | **NO — silently never delivered.** Must use `type:"command"` |
| `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `StopFailure`, `SessionEnd`, `Notification`, `SubagentStop`, `PermissionRequest` | Yes |

The `SessionStart`-over-HTTP failure produces **no warning anywhere** — not in the TUI, not
in logs. A canary that only checks "did fields arrive" would pass while the event never
fires. Assert delivery of `SessionStart` explicitly.

---

## Hook payloads

Common to every hook: `cwd`, `hook_event_name`, `session_id`, `transcript_path`.
`prompt_id` is on all except `SessionStart`.

| Event | Fields beyond the common set | `permission_mode`? |
|---|---|---|
| `SessionStart` | `model`, `source`, `session_title`¹ | **absent** |
| `UserPromptSubmit` | `prompt` | present |
| `PreToolUse` | `tool_name`, `tool_input`, `tool_use_id` | present |
| `PostToolUse` | `tool_name`, `tool_input`, `tool_use_id`, `tool_response`, `duration_ms` | present |
| `Stop` | `last_assistant_message`, `stop_hook_active`, `background_tasks`, `session_crons` | present |
| `StopFailure` | `error`, `last_assistant_message` | **absent** |
| `SubagentStop` | `agent_id`, `agent_type`, `agent_transcript_path`, `stop_hook_active`, `background_tasks`, `session_crons` | present |
| `SessionEnd` | `reason` | **absent** |
| `Notification` | `notification_type`, `message` | **absent** |
| `PermissionRequest` | `tool_name`, `tool_input`, `permission_suggestions` | present |

¹ `session_title` is present **only when the session was launched with `--name`**; absent
otherwise.

**`permission_mode` is NOT universal.** Documentation describes it as a common field on all
hook inputs. Measured across 134 payloads, the split is clean — every event is either always
or never:

- **Always present:** `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`,
  `SubagentStop`, `PermissionRequest`.
- **Never present:** `SessionStart`, `SessionEnd`, `Notification`, `StopFailure`, `PreCompact`.

Observed values: `"default"`, `"plan"`, `"acceptEdits"`. Latch the last known mode; note that
`StopFailure` carries none, so a session failing in plan mode must not be reset to default.

### Values worth asserting

- `SessionStart.source`: `"startup"` and `"resume"` both observed. On `--resume`, the
  `session_id` and `transcript_path` are **the same as the original session's** —
  load-bearing for SPEC §2.5 reconcile (re-bind by session id).
- `permission_mode` observed values: `"default"`, `"plan"`, `"acceptEdits"`.
- **`StopFailure` replaces `Stop`** — never both for the same turn. Assert this: a canary
  that expects `Stop` on every turn end would break the `Failed` state. (H2 probe: verified
  for startup, first-API-call and mid-turn failures; successes emit `Stop` only.)
- **Plan-mode sequence to assert** (SPEC §4.1 depends on it):
  `PreToolUse{tool_name:"ExitPlanMode", permission_mode:"plan"}` →
  `PermissionRequest{tool_name:"ExitPlanMode"}` →
  `PostToolUse{tool_name:"ExitPlanMode", permission_mode:"acceptEdits"}`.
- `StopFailure.error`: `"authentication_failed"`, `"server_error"` and `"unknown"` observed.
  Full taxonomy present in the binary: `rate_limit`, `overloaded`, `authentication_failed`,
  `oauth_org_not_allowed`, `billing_error`, `invalid_request`, `model_not_found`,
  `server_error`, `max_output_tokens`, `unknown`. The mapping is **not pass-through**: an
  injected HTTP 400 with an Anthropic-shaped `invalid_request_error` body surfaced as
  `"unknown"`, not `"invalid_request"`.
- `Notification.notification_type`: `"idle_prompt"` (message `"Claude is waiting for your
  input"`) and `"permission_prompt"` (message `"Claude needs your permission"`) both
  observed. Others in the binary: `auth_success`, `agent_needs_input`, `agent_completed`,
  `elicitation_dialog`.
- `SessionEnd.reason`: `"other"` observed.
- `PermissionRequest.permission_suggestions`: array of
  `{type:"setMode", mode:"acceptEdits", destination:"session"}`. Directly useful for
  SPEC §4.1's plan-mode flow.

---

## Status-line payload

Top-level keys: `context_window`, `cost`, `cwd`, `exceeds_200k_tokens`, `fast_mode`,
`model`, `output_style`, `prompt_id`, `rate_limits`, `session_id`, `session_name`,
`thinking`, `transcript_path`, `version`, `workspace`.

**`permission_mode` is NOT in the status line** — confirmed absent across every capture.
Read it from hooks instead.

### `rate_limits` — SPEC §2.3's only data source

```json
"rate_limits": {
  "five_hour": { "used_percentage": 13,                  "resets_at": 1786897200 },
  "seven_day": { "used_percentage": 28.000000000000004,  "resets_at": 1787061600 }
}
```

Three corrections to SPEC:
1. The weekly bucket is keyed **`seven_day`**, not `weekly` (§2.3, §7 `usage_sample`).
2. `resets_at` is a **Unix epoch integer**, not an RFC3339 string — the adapter must convert.
3. `used_percentage` is a **float**, not an int. Round for display; don't model as integer.

**The whole `rate_limits` key is absent** (not empty, not null) until a session's first API
response, then present on every subsequent post for the life of that session (verified to 17
consecutive posts). Assert both states. When analysing status-line captures, **group by
`session_id`** — pooling posts across sessions makes the absent/present ratio meaningless.

### `context_window` — SPEC §2.2's gauge

```json
"context_window": {
  "context_window_size": 200000,
  "used_percentage": 19,          // 0-100 scale
  "remaining_percentage": 81,
  "total_input_tokens": 38886,
  "total_output_tokens": 49,
  "current_usage": {
    "input_tokens": 10, "output_tokens": 49,
    "cache_creation_input_tokens": 15558, "cache_read_input_tokens": 23318
  }
}
```

Before the first API response: `used_percentage`, `remaining_percentage` and
`current_usage` are all **`null`**, with `total_input_tokens: 0`. A null is **not** "0%
used" — SPEC §2.2 and §2.3 must render "unknown" for a fresh session (this is §9 risk 9,
now characterised precisely).

### Invocation cadence

Event-driven, **not** interval-driven: posts follow tool activity and assistant turns
(typically within ~50 ms of a `PostToolUse`), and arrive in **close pairs** median 435 ms
apart. De-duplicate near-simultaneous posts before persisting a `usage_sample`.

**`refreshInterval` is in seconds, not milliseconds.** With `refreshInterval: 1000`, idle
gaps of 127 s / 83 s / 58 s produced no posts at all — `1000` meant ~16.7 minutes. An idle
session emits nothing, so usage figures go stale between turns.

### `session_name` — the title source

Present in the status line. Two distinct behaviours observed:
- With `--name "Spike Title Probe"`, it carries that name.
- Without `--name`, Claude Code **auto-generates** one from session content (observed:
  `"Run echo hello bash command"`).

So Muster gets a usable title for free, from the status line, with no `sessionTitle` hook
needed. It is absent from the earliest posts, before a title has been derived.

### Other fields

- `model`: `{id, display_name}` — e.g. `{"claude-haiku-4-5-20251001", "Haiku 4.5"}`.
- `cost`: `total_cost_usd`, `total_duration_ms`, `total_api_duration_ms`,
  `total_lines_added`, `total_lines_removed`. (Out of scope per SPEC §3, but present.)
- `workspace`: `{current_dir, project_dir, added_dirs[]}` — useful for SPEC §2.1's repo column.
- `version`: `"2.1.233"` — **the canary should assert this matches the pinned version.**
- Undocumented extras: `exceeds_200k_tokens`, `fast_mode`, `output_style{name}`,
  `thinking{enabled}`, `context_window.context_window_size`.

---

## Delivery semantics the canary should not assume away

- Hooks are **best-effort, at-most-once**: no retry, no replay, permanent drop on a dead
  receiver, and `PreToolUse` fails open. A canary must not assume a complete event stream.
- **No timestamps or sequence numbers exist on any hook payload.** Ordering must come from a
  daemon-assigned `seq`; `prompt_id` and `tool_use_id` are the only correlation keys.
- `SessionEnd` does not fire on `kill -9`, and its `reason` is `other` for both a killed pane
  and an ordinary termination.
- A SIGTERM'd session (killed while retrying a failed API call) emits `SessionEnd` but
  **neither `Stop` nor `StopFailure`** — turn closure by a Stop-family event is not
  guaranteed. Related: HTTP 500s are retried with backoff (~4 attempts / 90 s observed)
  before any Stop-family event fires; induce test failures with a non-retryable 400.
- Headless `claude -p` fires the full hook sequence, including command-wrapped
  `SessionStart` — probes and E2E cases that don't need the TUI need no tmux.
- `/clear` starts a **new `session_id`** in the same pane — assert that session identity is
  keyed on the tmux target, not the Claude session id.

### E2E caveat, learned the hard way

The spike deliberately does **not** isolate `~/.claude/settings.json`, so the user's personal
permission allowlist applies to spike sessions — a `Bash(echo hello)` was auto-approved and
produced no permission prompt. **Any E2E that depends on a permission prompt firing must pick
a tool the user's allowlist does not cover** (the `Write` tool worked).

Related: don't manage spike processes with a PID file written via `echo $!` after a
backgrounded `cd && … && nohup` chain — it captures the subshell, and a later `kill` can hit a
recycled PID. Use `pgrep -f` on the exact command line.

## Configuration that must keep working

- Project-scoped `<repo>/.claude/settings.json` honors `hooks`, `statusLine`, **and**
  `allowedHttpHookUrls` — `allowedHttpHookUrls` defined only at project scope successfully
  authorized the hook URLs. This is what lets Muster scope config per repo.
- `CLAUDE_CONFIG_DIR` isolates settings, hooks and transcripts but **breaks subscription
  OAuth** ("Not logged in · Please run /login"). Not usable for managed sessions.
- `statusLine.refreshInterval` is accepted at project scope.
