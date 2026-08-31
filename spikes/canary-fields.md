# Canary field inventory — Claude Code 2.1.233 → 2.1.246

Derived from real captured payloads during the step-1 spikes (2026-08-16). This is the
assertion list for the canary E2E described in `SPEC.md` §8: run it before adopting any new
Claude Code version, and treat any missing field as a blocker.

**Validated against:** Claude Code `2.1.233` (native install), macOS Darwin 25.6.
No auto-update drift occurred during the spike run. **Re-validated by the automated canary
(`make canary`, `test/canary/harness_test.go`) against `2.1.246` on 2026-08-29** — every
row below marked binding in `test/canary/canary_test.go` held; deltas are noted inline as
"(2.1.246 canary)". Pin bumped to 2.1.246 the same day.

Raw evidence: `ccc-spike/captures/capture-1.jsonl`, `capture-3.jsonl`; H2 probe additions
(2026-08-16) in `test/rig/captures/capture-1.jsonl` (gitignored, regenerable via
`/interface-probe`). Protocol-binding probe additions (2026-08-20) in
`test/rig/captures/capture-3.jsonl` — **captured against 2.1.237**: the installed binary
had auto-updated past the 2.1.233 pin by then (the designed, accepted drift; facts below
that cite 2.1.237 have not been re-verified on 2.1.233 and don't need to be).

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

- `SessionStart.model`: a **plain model-ID string** when present (e.g.
  `"claude-haiku-4-5-20251001"`), never an object — the `{id, display_name}` object shape
  belongs to the **status line only**. It is optional: present on 2 of 5 captured
  SessionStarts (both `source:"startup"`, 2026-08-20 probe against 2.1.237), absent on
  one startup (2.1.237), absent on `source:"clear"` (2.1.237), and absent on a fresh
  headless startup (2026-08-22 probe against 2.1.240). Replace a launch-seeded model only
  when the field is present, and expect a bare string.
- `SessionStart.source`: `"startup"`, `"resume"` and `"clear"` all observed. On `--resume`,
  the `session_id` and `transcript_path` are **the same as the original session's** —
  load-bearing for SPEC §2.5 reconcile (re-bind by session id). **Caveat (2026-08-27):**
  that same-id fact was measured headless on 2.1.233; m4-reconcile's Resume is interactive
  (`claude --resume <id>` in a fresh tmux session) and the pipeline did not re-measure it on
  the pinned binary (R2, burns subscription — TODO M4). A divergence would land the resumed
  session in `started` instead of `idle` (clear-rebind path), not break it. **Closed
  2026-08-30:** R2 run manually by Damian on the pinned 2.1.246 — interactive dashboard
  End → Resume carried the same `session_id` and the badge read `idle`. On `/clear` (2.1.237,
  2026-08-20 probe): the old session_id gets `SessionEnd` with `reason: "clear"`, then
  `SessionStart` fires with `source: "clear"` and a **new** session_id in the same pane —
  so `/clear` is directly detectable, and a `SessionEnd` with `reason: "clear"` must NOT
  be read as the pane dying.
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
- `SessionEnd.reason`: `"other"` and `"clear"` observed (`"clear"` on 2.1.237). `"other"`
  covers both a killed pane and ordinary termination; only `"clear"` is distinguishable.
- **Hooks are not awaited on the authentication-failure exit** (2.1.246 canary, 2026-08-29):
  headless `-p` with an unauthenticated `CLAUDE_CONFIG_DIR` fires `SessionStart`,
  `UserPromptSubmit`, `StopFailure`, `SessionEnd` — a `cat >>` command hook records all
  four, but the same hook behind `sleep 0.05` records only the first two, and Muster's
  ~48 ms curl wrapper delivered `StopFailure` 2/2 runs and `SessionEnd` 0/2. The process
  exits ~100 ms after the failure (`duration_ms: 107`) without waiting for hook children.
  The success path (run A) delivers `SessionEnd` through the same wrapper every time. Do
  not assert `SessionEnd` on a failure path; treat `StopFailure` there as at-risk.
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

**No per-model (Fable/Opus) bucket in the status line — settled 2026-08-30 against 2.1.251
(installed; pin is 2.1.246), by reading the binary, not by capture.** The `/usage` dialog's
third bar ("Current week (Fable)") does **not** come from the status-line JSON and cannot,
on this version: the status-line builder copies only `five_hour`, `seven_day` and (gateway
accounts only) `spend_limit` out of the unified rate-limit windows and discards the
per-model window `seven_day_overage_included`, even though the client parses it from the
API response headers (`anthropic-ratelimit-unified-7d_oi-{utilization,reset}`). The
`/usage` dialog gets its per-model rows from a separate authenticated call,
`GET https://api.anthropic.com/api/oauth/usage` → `limits[]` entries with
`kind:"weekly_scoped"`, `scope.model.display_name` (e.g. `"Fable"`), `percent`,
`resets_at`, filtered by a server-side model allowlist (Statsig
`tengu_usage_overage_included_models`); the same response also carries `seven_day_opus`,
`seven_day_sonnet`, `seven_day_oauth_apps`, `extra_usage`. The embedded status-line schema
doc in the binary lists only `five_hour` / `seven_day` / `spend_limit`. All earlier
captures (2.1.245, `capture-4/5.jsonl`, 27 posts) show exactly `["five_hour","seven_day"]`,
consistent with this. Re-check the `jt={...}` status-line builder on each pin bump — the
internal `unifiedWindows` telemetry schema already carries the third window, so it may
appear in a later release.

**`GET /api/oauth/usage` measured live 2026-08-30 (HTTP 200, one call, Damian's token):**
headers `Authorization: Bearer <claudeAiOauth.accessToken>` (Keychain item
`Claude Code-credentials`, read via `security find-generic-password -a "$USER" -w -s …`),
`anthropic-beta: oauth-2025-04-20`. Response: `five_hour`/`seven_day` as
`{utilization: 7.0, resets_at: "2026-08-30T13:39:59.522275+00:00", …}` (percent scale,
**RFC3339 string with micros and `+00:00` offset — not epoch**); `seven_day_opus`/`_sonnet`/
`_oauth_apps` null on this account; and `limits[]` = `{kind:"session"|"weekly_all"|
"weekly_scoped", group, percent (int), severity:"normal", resets_at (same string form),
scope: null | {model:{id:null, display_name:"Fable"}, surface:null}, is_active}`. The
Fable row was `weekly_scoped`/61%. Many other top-level keys are feature-flag noise
(`amber_ladder`, `cinder_cove`, …) — ignore unknown keys. Undocumented endpoint: re-check on
every pin bump alongside the status-line builder.

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

**`refreshInterval` is in seconds, not milliseconds — and it does tick while idle.**
With `refreshInterval: 1000` (2.1.233), idle gaps of 127 s / 83 s / 58 s produced no posts
at all — `1000` meant ~16.7 minutes. With `refreshInterval: 5` (2.1.245, 2026-08-25
quoting probe, `test/rig/captures/capture-4.jsonl`), an interactive session posted every
**5.00 s ± 0.02** for a 60 s idle stretch (12 consecutive idle ticks, 2 of 2 interactive
sessions), interleaved with the usual event-driven posts. Without `refreshInterval`, an
idle session emits nothing and usage figures go stale between turns.

### `session_name` — the title source

Present in the status line. Two distinct behaviours observed:
- With `--name "Spike Title Probe"`, it carries that name.
- Without `--name`, Claude Code **auto-generates** one from session content (observed:
  `"Run echo hello bash command"`).

So Muster gets a usable title for free, from the status line, with no `sessionTitle` hook
needed. It is absent from the earliest posts, before a title has been derived — and a
one-turn "say hi" session may never derive one (2.1.246 canary: absent on every post of
the interactive run, 2/2 runs), so the canary treats it as optional.

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
  (2.1.246 canary: `SessionStart.model` absent on headless startup, 2/2; the pre-response
  status-line post with `rate_limits` absent and null `used_percentage` was captured 1/1
  per interactive run, 2/2 runs, so the unknown-vs-zero shape is still live.)
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
- **`.claude/settings.local.json` alone honors all three too** (2.1.237, 2026-08-20 probe:
  settings.json removed entirely; command-wrapped `SessionStart`, http `UserPromptSubmit`/
  `Stop`, and the status line all delivered). Since Claude Code gitignores the local file,
  this is where Muster writes per-directory config — the ingest token never lands in a
  committable file.
- **Hook command wrappers and the status-line script inherit the pane environment**
  (2.1.237, 2026-08-20 probe): both `$TMUX_PANE` and a variable injected via
  `tmux new-window -e MUSTER_SESSION=…` were visible to the `SessionStart` wrapper and the
  status-line script, headless (`-p`) and interactive alike. This is what makes
  `docs/protocol.md` §4.2's envelope binding work.
- `CLAUDE_CONFIG_DIR` isolates settings, hooks and transcripts but **breaks subscription
  OAuth** ("Not logged in · Please run /login"). Not usable for managed sessions.
- `statusLine.refreshInterval` is accepted at project scope (and honoured — see cadence).
- **`type:"command"` hook `command` and `statusLine.command` are shell command lines,
  run via `/bin/sh -c` — NOT argv paths** (2.1.245, 2026-08-25 probe, captures 4 and 5).
  A bare script path containing a space is word-split: the `SessionStart` command hook
  surfaces `Failed with non-blocking status code: /bin/sh: /tmp/muster: No such file or
  directory` in the TUI (headless `-p`: no output at all), and the status line **fails
  silently** — no render, no post, no error line. Both `'…'` and `"…"` quoting deliver on
  a space-bearing path (3 headless + 2 interactive sessions), and quoting a space-free
  path is harmless (control: bare/`'…'`/`"…"` all delivered, 3 headless + 1 interactive).
  Muster must single-quote the paths it writes into these fields (`docs/protocol.md` §4.2
  rule; TODO M4). Canary: assert `SessionStart` delivery *and* a status-line post from a
  data dir whose path contains a space.
- **Command hooks see the pane env on every event, at ~50 ms/event** (2.1.246, 2026-08-27
  probe, capture 3): `UserPromptSubmit`/`PreToolUse`/`PostToolUse`/`Stop`/`SessionEnd`
  wrapped in a sh+curl command hook all delivered the envelope with `$MUSTER_SESSION`
  (15/15 events, 3 sessions). Local overhead vs http hooks ≈ +25 ms/event; the
  `$MUSTER_SESSION`-unset early exit costs ~6 ms. Basis for m4-hook-lifetime's
  all-command-hooks design (`spikes/FINDINGS.md` 2026-08-27 addendum).
- **`fable` is a valid `--model` alias** (2.1.251, 2026-08-30 — static inspection of the
  installed `~/.local/share/claude/versions/2.1.251` bundle, not a canary run): the
  model-alias switch contains `case"fable":case"mythos"` alongside haiku/sonnet/opus, and
  the resolver has a `case"fable"` branch. Muster passes the literal string `fable` to
  `--model` verbatim (§3.1) — nothing leaks into `internal/claudecode`. Not asserted by
  `make canary` (subscription rule: the canary launches haiku only); re-verify by static
  inspection on any pin bump.
