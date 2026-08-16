# S2 — Lifecycle hooks: findings

**Instance** 3 · port 8783 · tmux socket `ccc-spike-3` · repo `ccc-spike/instances/3/repo`
**Claude Code version at start** `2.1.233` · **at end** `2.1.233`
**`~/.claude/settings.json` md5 at start** `20a641769314c762f0390de5495a9e31` · **at end** `20a641769314c762f0390de5495a9e31` (unchanged)
**Raw evidence** `ccc-spike/captures/capture-3.jsonl` (77 records), `ccc-spike/instances/3/logs/` (SessionStart command-hook payloads, slow-server request log, capture server stdout)
**Isolation** project-scoped `ccc-spike/instances/3/repo/.claude/settings.json`; `CLAUDE_CONFIG_DIR` never set. Model pinned to `claude-haiku-4-5-20251001` throughout; every prompt trivial.

---

## Headline results

1. **`permission_mode` is real but partial.** Present on six events, absent on five — and absent from the status line entirely. **CONFIRMED.**
2. **HTTP-transport `SessionStart` hooks never fire.** Every other event type works over HTTP; `SessionStart` silently does not, on both `source=startup` and `source=clear`. A `type: "command"` `SessionStart` hook in the same settings file fires reliably. This breaks SPEC §6's "HTTP hooks — no wrapper scripts" ground rule for exactly one event. **CONFIRMED.**
3. **SPEC §2.1 is right about `sessionTitle`, the documentation is wrong.** `SessionStart` input *does* carry `session_title`, and returning a title from the hook *does* rename the session — but only via the nested `hookSpecificOutput.sessionTitle` form. **CONFIRMED.**
4. **Hook payloads carry no timestamp and no sequence number.** SPEC §6's "last-write-wins with timestamps" is not implementable from what is on the wire; arrival order is the only ordering signal there is. **REFUTED as written.**
5. **Hook delivery fails open, silently, with no retry and no replay** — but it costs the session the full hook `timeout` in added latency per failed hook. **CONFIRMED.**

---

## Q1. Full payload inventory

**Method.** All 15 supported events wired to `POST http://127.0.0.1:8783/hook/{event}` with `timeout: 5`, plus the status line to `/statusline`. Drove a real session through: startup, trivial prompt, Bash tool call, Write tool call with a permission prompt, `/clear`, `/exit`, relaunch with `--name` and `--permission-mode plan`, `/rename`, relaunch with `--permission-mode acceptEdits`, `/compact`, a real `Agent` subagent, four parallel `Read` calls, pane kill, and `SIGKILL`.

### Field inventory (event → field → type)

Types are as observed on the wire. `?` marks a field that was present in some payloads of that event and absent in others.

| Event | Fields |
|---|---|
| **SessionStart** *(command transport only)* | `cwd` string · `hook_event_name` string · `model` string? · `session_id` string · `session_title` string? · `source` string · `transcript_path` string |
| **UserPromptSubmit** | `cwd` string · `hook_event_name` string · `permission_mode` string · `prompt` string · `prompt_id` string · `session_id` string · `session_title` string? · `transcript_path` string |
| **PreToolUse** | `cwd` string · `hook_event_name` string · `permission_mode` string · `prompt_id` string · `session_id` string · `tool_input` object · `tool_name` string · `tool_use_id` string · `transcript_path` string |
| **PostToolUse** | `cwd` string · `duration_ms` int · `hook_event_name` string · `permission_mode` string · `prompt_id` string · `session_id` string · `tool_input` object · `tool_name` string · `tool_response` object · `tool_use_id` string · `transcript_path` string |
| **PermissionRequest** | `cwd` string · `hook_event_name` string · `permission_mode` string · `permission_suggestions` array · `prompt_id` string · `session_id` string · `tool_input` object · `tool_name` string · `transcript_path` string |
| **Notification** | `cwd` string · `hook_event_name` string · `message` string · `notification_type` string · `prompt_id` string · `session_id` string · `transcript_path` string |
| **Stop** | `background_tasks` array · `cwd` string · `hook_event_name` string · `last_assistant_message` string · `permission_mode` string · `prompt_id` string · `session_crons` array · `session_id` string · `stop_hook_active` bool · `transcript_path` string |
| **SubagentStop** | `agent_id` string · `agent_transcript_path` string · `agent_type` string · `background_tasks` array · `cwd` string · `hook_event_name` string · `last_assistant_message` string? · `permission_mode` string · `prompt_id` string · `session_crons` array · `session_id` string · `stop_hook_active` bool · `transcript_path` string |
| **PreCompact** | `custom_instructions` null · `cwd` string · `hook_event_name` string · `prompt_id` string · `session_id` string · `transcript_path` string · `trigger` string |
| **SessionEnd** | `cwd` string · `hook_event_name` string · `prompt_id` string · `reason` string · `session_id` string · `transcript_path` string |
| **StopFailure** *(instance-1 baseline, not re-observed here)* | `cwd` · `error` · `hook_event_name` · `last_assistant_message` · `prompt_id` · `session_id` · `transcript_path` |
| **StatusLine** *(`/statusline`, for cross-reference)* | `context_window` object · `cost` object · `cwd` string · `exceeds_200k_tokens` bool · `fast_mode` bool · `model` object · `output_style` object · `prompt_id` string? · `rate_limits` object? · `session_id` string · `session_name` string? · `thinking` object · `transcript_path` string · `version` string · `workspace` object |

**Optional-field rules observed:**

- `SessionStart.model` — present when `source=startup`, absent when `source=clear`.
- `SessionStart.session_title` / `UserPromptSubmit.session_title` — present only when the session actually has a title (from `--name`, `/rename`, or a hook-set title). Absent entirely in untitled sessions.
- `SubagentStop.last_assistant_message` — present for real subagents, absent for the internal ones.
- `StatusLine.prompt_id` — absent until the first prompt. `StatusLine.rate_limits` — absent until the first API response (matches the known limitation in SPEC §2.3). `StatusLine.session_name` — absent until a title exists.

### Events configured but never observed firing

`TaskCompleted`, `TeammateIdle`, `WorktreeCreate`, `WorktreeRemove` — all wired, none fired, including `TaskCompleted` during a real backgrounded `Agent` run that completed successfully. `StopFailure` did not fire in this spike (no auth failure was induced). **UNVERIFIED** whether these are unimplemented or simply need conditions I did not create; do not build state logic on them.

### Enumerated values observed

- `SessionStart.source`: `startup`, `clear`
- `SessionEnd.reason`: `clear` (from `/clear`), `prompt_input_exit` (from `/exit`), `other` (pane/process terminated)
- `PreCompact.trigger`: `manual`
- `Notification.notification_type`: `idle_prompt`, `permission_prompt`
- `permission_mode`: `default`, `plan`, `acceptEdits`
- `SubagentStop.agent_type`: `general-purpose` (real subagent), `""` (internal agent)

**Verdict: CONFIRMED.** **SPEC impact:** this table is the canary E2E assertion set. Assert the required-field subset per event and treat the `?` fields as conditionally-present.

---

## Q2. Is `permission_mode` actually present?

**Method.** Read `permission_mode` off every captured payload across three sessions launched in default mode, `--permission-mode plan`, and `--permission-mode acceptEdits`.

**Observed.**

```json
// UserPromptSubmit, session launched with --permission-mode plan
{"cwd":"…/instances/3/repo","hook_event_name":"UserPromptSubmit","permission_mode":"plan",
 "prompt":"say hi","prompt_id":"…","session_id":"…","session_title":"Spike Title Probe",
 "transcript_path":"…"}
```

| Event | `permission_mode`? |
|---|---|
| UserPromptSubmit | **yes** |
| PreToolUse | **yes** |
| PostToolUse | **yes** |
| PermissionRequest | **yes** |
| Stop | **yes** |
| SubagentStop | **yes** |
| SessionStart | no |
| SessionEnd | no |
| Notification | no |
| PreCompact | no |
| StopFailure | no (instance-1 baseline) |
| **status line** | **no** |

Values `default`, `plan` and `acceptEdits` were all observed, matching the launch flag each time. The documentation's claim that it is a common field on *all* hook inputs is wrong; the team lead's observation that `StopFailure` and `SessionEnd` lack it is correct and generalizes to a specific set of five events.

**Verdict: CONFIRMED (partially present).**

**SPEC impact — §6 correction.** The row "Planning state | permission mode from hook/status-line payload (`plan`)" is half wrong: **the status line carries no `permission_mode` at all.** Muster must track permission mode purely from hook events, and the earliest one available is `UserPromptSubmit` — meaning a session launched with `--permission-mode plan` is **not observably in plan mode until the user submits their first prompt**. `SessionStart` does not carry it either. Two consequences:

1. Muster must remember the `--permission-mode` it passed at launch and use that as the initial value, then let `UserPromptSubmit`/`PreToolUse` correct it.
2. Mid-session mode changes (shift+tab) are only visible at the next hook event that carries the field, not in real time.

---

## Q3. Notification matchers

**Method.** Finished a turn and polled the capture file for the idle notification, timing it against the preceding `Stop`. Separately, triggered a `Write` in default (manual) permission mode to force a permission dialog.

**Observed.**

```json
// idle
{"cwd":"…","hook_event_name":"Notification","message":"Claude is waiting for your input",
 "notification_type":"idle_prompt","prompt_id":"8262ca5b-…","session_id":"d3724e95-…","transcript_path":"…"}

// permission
{"cwd":"…","hook_event_name":"Notification","message":"Claude needs your permission",
 "notification_type":"permission_prompt","prompt_id":"bc7851aa-…","session_id":"d3724e95-…","transcript_path":"…"}
```

**Field names are `notification_type` and `message`** — not `notification_message`.

**Measured delays.**

| Signal | Trigger | Delay |
|---|---|---|
| `idle_prompt` | `Stop` at `13:04:08.429` → Notification at `13:05:08.473` | **60.04 s** — the documented ~60 s is exact |
| `permission_prompt` | `PermissionRequest` at `13:06:25.438` → Notification at `13:06:31.455` | **6.02 s** |

`auth_success`, `agent_needs_input` and `agent_completed` were **not observed**. `agent_completed` notably did *not* fire when a real backgrounded `Agent` subagent completed — instead Claude Code injected a synthetic `UserPromptSubmit` (see Q5). **UNVERIFIED** for all three.

**Verdict: CONFIRMED for `idle_prompt` and `permission_prompt`; UNVERIFIED for the other three.**

**SPEC impact — §2.1 `Needs-Input`.** Do **not** drive `Needs-Input` off `Notification/permission_prompt`: it lags the actual block by ~6 s. Use the **`PermissionRequest` hook**, which fires ~25 ms after `PreToolUse` and is effectively instant. Reserve `Notification` as a corroborating signal.

The 60 s `idle_prompt` is also too slow to be the `Idle` trigger — `Stop` is immediate and is the right source. `idle_prompt` is better read as "this session has been sitting unattended for a minute", which is genuinely useful for the "longest-blocked at the top" sort in §2.1 but is a *second* signal, not the state transition.

One correlation gotcha: `PermissionRequest` has **no `tool_use_id`**, while `PreToolUse` does. To tie a permission request back to its tool call, Muster must match on `prompt_id` + `tool_name` + `tool_input`.

---

## Q4. The `sessionTitle` contradiction

### (a) Does `SessionStart` input contain `session_title`?

**Method.** Launched with `claude --name "Spike Title Probe"` and without, capturing `SessionStart` via a `type: "command"` hook (the HTTP one does not fire — see below).

**Observed.**

```json
// launched with --name "Spike Title Probe"
{"cwd":"…/instances/3/repo","hook_event_name":"SessionStart","model":"claude-haiku-4-5-20251001",
 "session_id":"06ad3759-…","session_title":"Spike Title Probe","source":"startup","transcript_path":"…"}

// launched with no --name
{"cwd":"…/instances/3/repo","hook_event_name":"SessionStart","model":"claude-haiku-4-5-20251001",
 "session_id":"aea3efe6-…","source":"startup","transcript_path":"…"}
```

**Verdict: CONFIRMED — SPEC §2.1 is right, the documentation is wrong.** `session_title` is present when a title exists and omitted when it does not.

### (b) Does returning `sessionTitle` rename the session?

**Method.** Made the `SessionStart` command hook print a JSON body containing *both* forms simultaneously, so whichever one Claude Code honors would be identifiable by value:

```json
{"sessionTitle":"TitleFromHook",
 "hookSpecificOutput":{"hookEventName":"SessionStart","sessionTitle":"TitleFromHookNested"}}
```

**Observed.** The status line reported `"session_name": "TitleFromHookNested"` and the next `UserPromptSubmit` carried `"session_title": "TitleFromHookNested"`. A follow-up run returning **only** the top-level form (`{"sessionTitle":"TopLevelOnly"}`) left the title unchanged at `TitleFromHookNested`.

**Verdict: CONFIRMED, with a correction — only the nested `hookSpecificOutput.sessionTitle` form works. The bare top-level `sessionTitle` key is ignored.**

Two further observations:

- A hook-set title **survives `/clear`** — the post-clear `SessionStart` carried `"session_title":"TitleFromHookNested"` on the new `session_id`.
- A hook-set title does **not** render in the TUI header bar, whereas `--name` and `/rename` titles do (they appear right-aligned on the divider). The machine-readable channels agree; only the visual differs. Not a problem for Muster, but worth knowing when eyeballing a pane.

### (c) The transport gap — the finding that changes Muster's design

**Method.** The HTTP `SessionStart` hook was configured identically to the 14 others that all work. It never fired — not on the first launch (no `matcher`), not after adding an explicit `"matcher": "startup|resume|clear|compact"`, not on `/clear`. A `type: "command"` `SessionStart` hook added to the *same settings file* fired every time, on both `startup` and `clear`.

**Verdict: CONFIRMED — `type: "http"` `SessionStart` hooks silently do not fire in 2.1.233.** The failure is silent: no error in the TUI, no request at the server.

**SPEC impact — §6 ground rule.** "Hook transport | **HTTP hooks** … — no wrapper scripts" holds for every event *except* `SessionStart`. Muster needs a one-line `curl` wrapper script for `SessionStart` specifically. This is unavoidable if Muster wants to set titles from the hook, since the return value is the only way to do that.

### (d) Recommended title source for Muster

Ranked by robustness:

1. **Status line `session_name`** — the single most reliable channel. It tracked `--name`, `/rename` and the hook-set title identically, and it re-posts on every render. It also picks up Claude Code's **auto-generated** title (observed: `"Run echo hello bash command"` appearing a couple of turns into an untitled session), which neither `--name` nor a hook gives you.
2. `UserPromptSubmit.session_title` — correct but only present when a title exists, and only at prompt time.
3. `SessionStart.session_title` — correct, but requires the command-hook wrapper.

**SPEC impact — §2.1.** The bullet "Titles use Claude Code's native session titles (`--name`, `/rename`, `SessionStart` hook's `sessionTitle`)" is accurate as a list of *sources*, but the *read path* should be the status line's `session_name`, which S1 is already consuming. That also means titles arrive on the S1 channel rather than the S2 one — worth coordinating.

---

## Q5. Ordering

**Method.** Compared `received_at` arrival order against payload contents across 77 records, including a deliberately bursty turn (four parallel `Read` calls producing eight tool hooks in 640 ms).

**Observed — the burst:**

```
62  13:20:59.983Z  PreToolUse   toolu_016ap8x6…
63  13:21:00.024Z  PostToolUse  toolu_016ap8x6…   duration_ms=7
64  13:21:00.311Z  PreToolUse   toolu_012C3apZ…
65  13:21:00.376Z  PreToolUse   toolu_016yY6Ci…
66  13:21:00.425Z  PreToolUse   toolu_01QGn7uP…
67  13:21:00.575Z  PostToolUse  toolu_012C3apZ…   duration_ms=47
68  13:21:00.618Z  PostToolUse  toolu_016yY6Ci…   duration_ms=42
69  13:21:00.621Z  PostToolUse  toolu_01QGn7uP…   duration_ms=75
71  13:21:02.629Z  Stop
```

Every `PostToolUse` arrived after its own `PreToolUse`. **No inversion was observed anywhere in the 77 records.**

**The decisive finding is about payload contents, not ordering.** The union of every field name seen across every hook event is:

```
agent_id, agent_transcript_path, agent_type, background_tasks, custom_instructions, cwd,
duration_ms, hook_event_name, last_assistant_message, message, model, notification_type,
permission_mode, permission_suggestions, prompt, prompt_id, reason, session_crons,
session_id, session_title, source, stop_hook_active, tool_input, tool_name, tool_use_id,
transcript_path, trigger
```

There is **no timestamp field, no sequence number, no monotonic counter** — anywhere, on any event. The only time-adjacent field is `PostToolUse.duration_ms`, which measures the tool call, not the event.

**Verdict: SPEC §6's stated mechanism is REFUTED as written; the underlying concern is UNVERIFIED.** Out-of-order arrival did not happen in this spike, but I cannot rule it out under heavier load, and there is nothing on the wire to repair it with if it does.

**SPEC impact — §6.** Rewrite "sequence on arrival, monotonic per-session ordering, last-write-wins with timestamps" as **"sequence on arrival; the daemon's own receive order is the only ordering, so assign a monotonic per-session sequence number at ingest."** The `event` table in §7 already stores `received_at`; add a daemon-assigned `seq` integer alongside it. Concretely:

- Correlate tool calls by **`tool_use_id`** (`PreToolUse` ↔ `PostToolUse`), which is reliable and order-independent.
- Correlate a turn by **`prompt_id`**.
- Make the state machine **idempotent and order-tolerant** rather than trying to reorder — e.g. a late `PreToolUse` arriving after its `PostToolUse` must not push the session back to `Working`.

**Two ordering hazards that are real, and that Muster must handle:**

1. **`SubagentStop` routinely arrives *after* `Stop`** for the same `prompt_id`, by 3.5 s to 15.5 s. Worse, an internal agent with `agent_type: ""` fires a `SubagentStop` after essentially *every* turn. A naive state machine that treats `SubagentStop` as "still working" will bounce a session out of `Idle` seconds after it settles. **Muster should ignore `SubagentStop` with `agent_type: ""` entirely**, and should never let any `SubagentStop` override a `Stop` with the same `prompt_id`.
2. **One user turn can produce multiple `Stop` events.** When a backgrounded `Agent` completed, Claude Code injected a *synthetic* `UserPromptSubmit` whose `prompt` begins `<task-notification>` with a new `prompt_id`, then ran a second turn ending in a second `Stop`:

   ```
   52  13:13:39.013Z  Stop              prompt_id=e5a9556f…  "I've launched a general-purpose subagent…"
   53  13:13:39.064Z  UserPromptSubmit  prompt_id=6ac4b6e3…  "<task-notification>\n<task-id>ace3b7df…"
   55  13:13:41.324Z  Stop              prompt_id=6ac4b6e3…  "The agent completed successfully…"
   ```

   So `Stop` means "this turn ended", not "the session is now idle" — a session can go `Idle` → `Working` → `Idle` with no user input at all. `Idle` must therefore be a *debounced* state, and Muster must not treat every `UserPromptSubmit` as evidence the human is present (`prompt` starting with `<task-notification>` is the tell).

---

## Q6. Delivery gaps

This is the question with no documentation, so I tested three separate failure shapes.

### 6a. Server down at event time

**Method.** Killed the capture server, confirmed the port refused connections, then drove a full turn including a tool call.

**Observed — the TUI, verbatim:**

```
❯ say gap1
  ⎿  UserPromptSubmit hook error
  ⎿  connect ECONNREFUSED 127.0.0.1:8783
⏺ gap1
⏺ Ran 1 stop hook
  ⎿  Stop hook error: connect ECONNREFUSED 127.0.0.1:8783
✻ Cooked for 3s
```

and with a tool call:

```
⏺ Write(gap2.txt)
  ⎿  PreToolUse:Write hook error
  ⎿  connect ECONNREFUSED 127.0.0.1:8783
  ⎿  Wrote 1 line to gap2.txt
      1 cherry
  ⎿  PostToolUse:Write hook error
  ⎿  connect ECONNREFUSED 127.0.0.1:8783
```

A transient banner also appeared above the input box: `Stop hook error occurred · ctrl+o to see`.

**Findings.**

- The session **does not block**. The turn completed in ~3 s, its normal speed.
- **No retry.** One attempt per event; the connection refusal is final.
- **Events are dropped, permanently.**
- `PreToolUse` **fails open** — the `Write` executed and `gap2.txt` was created despite the hook erroring.
- The user sees inline, per-hook error lines in the transcript. Noisy but not blocking. Note this is *visible noise in the user's own session* — if `musterd` is down, every hook prints two error lines per event into every managed pane.

**Verdict: CONFIRMED.**

### 6b. Restart — is anything replayed?

**Method.** Restarted the capture server on the same port and waited.

**Observed.** Zero replayed records — the capture file sat at 58 lines before and after. But the stream **self-heals immediately for future events**: the very next event, an `idle_prompt` `Notification`, was delivered normally with no session restart required.

**Verdict: CONFIRMED — no replay, but the hook stream reattaches transparently.**

The recovery channel is the **status line**, which re-posts on the next render and carries `session_id`, `model`, `context_window`, `rate_limits` and `session_name`. Two important limits: it carries **no `permission_mode`** and **no state**, and it is **render-driven, not timer-driven** — despite `refreshInterval: 1000` it did not post once during ~2 minutes of an idle session. It is not a heartbeat.

### 6c. Slow hook — exceeding `timeout: 5`

**Method.** Replaced the capture server with one that sleeps 12 s before replying (`ccc-spike/instances/3/slowserver.py`), against the configured `timeout: 5`.

**Observed — the TUI:**

```
❯ say slow1
  ⎿  UserPromptSubmit hook timed out after 5s — output discarded. Raise the hook's "timeout" to allow more time.
⏺ slow1
✻ Cooked for 6s
```

The turn completed, but took 6 s instead of its usual ~1–3 s. Server-side timings from `logs/slow.jsonl` show the cost is per-hook and additive:

```
13:19:06.862  /hook/PreToolUse
13:19:11.887  /hook/PermissionRequest    ← exactly 5.03 s later
```

`PreToolUse` **held the tool call for its full 5 s timeout** before the permission flow proceeded. So a hung `musterd` does not merely lose data — it taxes every turn by `timeout` seconds per hook fired. With `UserPromptSubmit` + `PreToolUse` + `PostToolUse` + `Stop` at 5 s each, a single one-tool turn would gain ~20 s.

**The `PermissionRequest` timeout behaves well.** With the hook hung, the interactive permission dialog rendered anyway within ~1–2 s of the hook firing — i.e. concurrently, not gated on it — and the user could answer normally:

```
 Do you want to create gap3.txt?
 ❯ 1. Yes
   2. Yes, allow all edits during this session (shift+tab)
   3. No
```

**Verdict: CONFIRMED.** SPEC §6's "a `PermissionRequest` HTTP hook that times out renders no decision — UI must lose gracefully" is accurate, and the graceful loss is Claude Code's own doing.

### 6d. Process death — what `SessionEnd` does and does not tell you

| How the session ended | `SessionEnd` fired? | `reason` |
|---|---|---|
| `/exit` | yes | `prompt_input_exit` |
| `/clear` (old session id) | yes | `clear` |
| `tmux kill-session` (SIGHUP to the process) | yes | `other` |
| `kill -9` on the `claude` process | **no** | — |

**Verdict: CONFIRMED.**

**SPEC impact — §2.5 reconcile and §9 risk 8.** `SessionEnd` is a hint, never a guarantee: a hard-killed session is indistinguishable from a running one by hooks alone. Muster's reconcile must be liveness-driven — **poll tmux pane existence as the authority on whether a session is alive**, and treat hook events as enrichment. Since `reason` is `other` for both a killed pane and (per the instance-1 baseline) an ordinary daemon-side termination, `reason` cannot distinguish crash from clean shutdown either. Note also that `SessionEnd` fires with a *new* `session_id` following `/clear`, so one tmux pane will emit several `session_id`s over its life — Muster's session identity should be the tmux target, with Claude `session_id` as a changeable attribute.

### 6e. Consolidated guidance for the state machine

- Hooks are **best-effort, at-most-once, fire-and-forget**. Design for loss, never for completeness.
- **Keep the configured `timeout` low** (1–2 s, not 5) so a wedged daemon degrades session latency as little as possible. The tradeoff is losing more events under load; losing events is much cheaper than stalling the user's session.
- **Return `200` immediately and process asynchronously** in `musterd` — never do database work on the hook request path.
- Make every state transition **self-healing**: derive state from the most recent event *plus* pane liveness, and let the status line re-seed `session_id`/model/context/title on reconnect.
- Consider a **`PostToolUse`/`Stop` timeout of 1 s specifically**, since those are pure-observation hooks whose loss costs Muster only freshness.

---

## Verdict: is SPEC's hook-driven state machine implementable?

**Yes, with four corrections.** Every state has a real signal behind it:

| State | Signal | Confidence |
|---|---|---|
| `Started` | `SessionStart` (**command hook only**) `source=startup` | CONFIRMED — but needs a wrapper script |
| `Planning` | `permission_mode == "plan"` on `UserPromptSubmit`/`PreToolUse`/`PostToolUse`/`Stop` | CONFIRMED — **not visible until the first prompt**; seed from the launch flag |
| `Working` | `UserPromptSubmit`, then `PreToolUse`/`PostToolUse` | CONFIRMED |
| `Needs-Input` | **`PermissionRequest`** (instant); `Notification/permission_prompt` (+6 s) as corroboration | CONFIRMED |
| `Failed` | `StopFailure` with an `error` field | Baseline only — **not re-observed in this spike**; still SPEC §9 open question 3 |
| `Idle` | `Stop` — **debounced**, ignoring `agent_type:""` `SubagentStop` and synthetic `<task-notification>` turns | CONFIRMED with caveats |

**The four SPEC corrections, in priority order:**

1. **§6 — `SessionStart` needs a command-type wrapper script.** HTTP transport silently drops it. This is the only exception to the no-wrapper-scripts rule, and it is also the only way to set titles from a hook.
2. **§6 — the status line carries no `permission_mode`.** Delete "status-line payload" from the Planning-state row. Seed permission mode from Muster's own launch flag and correct it on the first `UserPromptSubmit`.
3. **§6 — replace "last-write-wins with timestamps".** There are no timestamps on the wire. Assign a monotonic per-session sequence at ingest and make the state machine order-tolerant rather than reordering.
4. **§2.1 — read titles from the status line's `session_name`.** It is the only channel that also surfaces Claude Code's auto-generated titles, and it needs no wrapper script. `sessionTitle` from the `SessionStart` hook works, but only in the nested `hookSpecificOutput` form.

**Two additions worth folding into §7's `event` table:** store a daemon-assigned `seq`, and record `prompt_id` and `tool_use_id` as first-class columns — they are the only correlation keys available.

---

## Loose ends and caveats

- **`StopFailure` was not reproduced here.** SPEC §9 open question 3 (Failed-state detection) remains open; the instance-1 baseline payload is the only evidence, and whether `StopFailure` covers all turn-ending errors is **UNVERIFIED**.
- **`--permission-mode` was tested at launch only.** Mid-session shift+tab cycling was not tested against hook payloads. **UNVERIFIED.**
- **`--resume` was never exercised**, so `SessionStart` with `source=resume` and how titles survive a resume are **UNVERIFIED** — directly relevant to §2.5 reconcile.
- **`PreCompact` fires even when compaction is refused.** The one capture came from a `/compact` that Claude Code declined with "Not enough messages to compact." `PreCompact` therefore does not imply a compaction happened. Auto-triggered compaction (`trigger` other than `manual`) was not observed.
- **Bash `echo hello` was auto-approved** in default permission mode because this spike deliberately does not isolate `~/.claude/settings.json`, so Damian's personal allowlist applied. The `Write`-tool permission tests were unaffected. Any Muster E2E that depends on a permission prompt must pick a tool the user's allowlist does not cover.
- **Ordering was tested at modest concurrency** — four parallel tool calls. Out-of-order arrival remains plausible under heavier load and is **UNVERIFIED**.
- **Incident, for the record:** partway through, a stale PID file (written by `echo $!` after a backgrounded `cd && … && nohup` chain, which captured the subshell rather than the server) caused a `kill` to hit a recycled PID and take down the instance-3 tmux server, killing that spike session. No data was lost; the session was relaunched. Nothing outside `instances/3` was affected. Any Muster process management should use `pgrep -f` on the exact command line rather than trusting a PID file.
