# S3 — Failed state & plan mode

Spike instance 4 · port 8784 · tmux socket `ccc-spike-4` · repo
`ccc-spike/instances/4/repo` · captures in `ccc-spike/captures/s3/`.

`claude --version` at start: **2.1.233 (Claude Code)**
`claude --version` at end: **2.1.233 (Claude Code)**
`~/.claude/settings.json` md5 at start and end: `20a641769314c762f0390de5495a9e31` (unchanged).

Isolation used: project-scoped `.claude/settings.json` inside the scratch repo,
regenerated per test by `instances/4/gen-project-settings.py` (all 15 hook events as
HTTP hooks + statusLine). `CLAUDE_CONFIG_DIR` was only ever set to a spike-owned empty
directory, and only for the Q1 auth-failure run.

Tooling written for this spike:

- `rig/capture-s3/main.go` — the shared capture server plus per-event artificial delay
  (`-sleep`/`-sleep-event`), per-event HTTP status (`-status`/`-status-event`) and a
  per-event canned JSON body (`-decision`/`-decision-event`). Records `replied_at` and
  notes client cancellation, which is what made the timeout measurement possible.
- `rig/failproxy/main.go` — fault-injection stand-in for the Anthropic API. Either fails
  everything with a chosen status and Anthropic-shaped error body, or reverse-proxies to
  the real API and fails only after N `/v1/messages` requests. It never reads, logs or
  stores request headers, because those carry a live OAuth token.

---

## Q1 · Does `Stop` fire alongside `StopFailure`, or instead of it?

**Method.** Registered both `Stop` and `StopFailure` as HTTP hooks and induced a failed
turn two independent ways: (a) headless `claude -p` with `CLAUDE_CONFIG_DIR` pointed at an
empty spike-owned directory (auth failure, zero tokens); (b) an interactive TUI session
with `ANTHROPIC_BASE_URL` pointed at `failproxy` returning HTTP 400. Then checked the
capture file for what arrived and in what order.

**Observed.** Headless run (`captures/s3/capture-4-q1.jsonl`), three records, no `Stop`:

```
13:04:49.505 UserPromptSubmit
13:04:49.571 StopFailure  {"error":"authentication_failed",
                           "last_assistant_message":"Not logged in · Please run /login"}
13:04:49.595 SessionEnd   {"reason":"other"}
```

Interactive run (`captures/s3/capture-4-q1i.jsonl`), two records, no `Stop`, no
`SessionEnd`:

```
15:23:20.427 UserPromptSubmit
15:23:20.554 StopFailure  {"error":"unknown",
                           "last_assistant_message":"API Error: 400 spike-induced failure"}
```

Across every run in this spike the tally was 4 × `Stop`, 3 × `StopFailure`, and the two
never co-occurred for the same `prompt_id`. A normal successful turn produced `Stop` and
no `StopFailure`.

**Verdict. CONFIRMED — they are mutually exclusive.** A turn ends with exactly one of
`Stop` or `StopFailure`, never both. The state machine is unambiguous.

**Two related findings that are not free.**

1. **A user interrupt (Esc) fires neither hook.** In the Q4 session I pressed Esc at a
   permission prompt; the turn ended, the TUI returned to the input line, and no `Stop`,
   no `StopFailure` and no `Notification` arrived. A session interrupted this way would
   sit in `Working` forever under a pure hook-driven machine.
2. **A failed turn does not kill an interactive session.** After the 400 failure I
   flipped `failproxy` to pass-through and re-prompted the *same* session; it answered
   normally and fired `Stop`. Headless `-p` does emit `SessionEnd{reason:"other"}` after
   `StopFailure`, but the TUI does not.

**SPEC impact.** §2.1/§6 are correct that `Stop` → `Idle` and `StopFailure` → `Failed`,
and no disambiguation logic is needed. `Failed` must be a recoverable state, not terminal
— the next `UserPromptSubmit` moves the session back to `Working` and a later `Stop`
to `Idle`. Add the Esc-interrupt gap to the §9 item 8 "hook delivery gaps" risk: the
self-healing reconcile is needed for interrupts, not only for a daemon that was down.

---

## Q2 · Can a mid-turn error be induced, not just a startup one?

**Method.** `ANTHROPIC_BASE_URL=http://127.0.0.1:8794` with `failproxy` returning HTTP 500
and an Anthropic-shaped error body, against the real subscription OAuth credentials
(no `CLAUDE_CONFIG_DIR` override).

**Observed.** `ANTHROPIC_BASE_URL` **is** honored under subscription OAuth — the proxy
logged 24 `POST /v1/messages` attempts. Claude Code retried with backoff for **3 minutes
0 seconds** (15:05:57 → 15:08:57) before giving up. Payload:

```json
{"hook_event_name":"StopFailure","error":"server_error",
 "last_assistant_message":"API Error: 500 spike-induced failure. This is a server-side
   issue, usually temporary — try again in a moment. If it persists, check your
   inference gateway (127.0.0.1:8794).",
 "prompt_id":"312ea37b-…","session_id":"e45769d1-…"}
```

The 400 run in Q1 was not retried at all and failed in 127 ms.

**Verdict. CONFIRMED.** Mid-turn API errors are inducible and observable, and the
mechanism is a local proxy on `ANTHROPIC_BASE_URL`.

**The `error` field is not a reliable taxonomy.** The 500 produced `"server_error"` as
expected, but the 400 produced `"error":"unknown"` rather than `"invalid_request"`. The
binary does contain the documented error-type list, but not every HTTP status maps onto
it. Muster should treat `error` as a display string, not as an enum to switch on — the
signal is the arrival of `StopFailure` itself.

**The retry window is the real design constraint.** A retryable error keeps the session
in `Working` for up to three minutes before `Failed` appears. Nothing observable is
emitted during that window: no hook, no status-line change. A session that is actually
dying looks identical to a session that is thinking hard.

**SPEC impact.** §2.1's "time in current state" is the only thing that will distinguish
a stuck-retrying session from a working one, which makes it load-bearing rather than
cosmetic. Worth a UI treatment: a `Working` session past a few minutes with no PostToolUse
traffic is a candidate for attention.

---

## Q3 · Transcript cross-check

**Method.** Read the `transcript_path` from the `StopFailure` payload after both the 500
and 400 failures and compared errored turns against a successful one in the same file.

**Observed.** The errored turn's `assistant` record:

```json
{"type":"assistant","timestamp":"2026-08-16T13:08:57.921Z",
 "message":{"model":"<synthetic>","role":"assistant","stop_reason":"stop_sequence",
            "content":[{"type":"text","text":"API Error: 500 spike-induced failure…"}],
            "usage":{"input_tokens":0,"output_tokens":0,…}},
 "error":"server_error","isApiErrorMessage":true,"apiErrorStatus":500,
 "uuid":"aa6df5a6-…","parentUuid":"f75d4677-…"}
```

The successful turn in the same transcript has `error: null`, `isApiErrorMessage: null`,
`apiErrorStatus: null` and a real `model` of `claude-haiku-4-5-20251001`.

Also present and useful: the `user` record carries `permissionMode`, `promptId`,
`gitBranch`, `cwd` and `version`; there is a trailing `{"type":"last-prompt", …,
"leafUuid": …}` record pointing at the final message of the turn.

**Verdict. CONFIRMED.** An errored turn is unambiguous on disk. The cleanest discriminator
is `isApiErrorMessage: true` on the last `assistant` record, with
`model: "<synthetic>"` and `apiErrorStatus` as corroboration.

**SPEC impact.** §6's "never use the transcript for live state" stands — it lagged
visibly. But it is a sound *reconcile-time* fallback for §2.5: on daemon start, tailing
the last `assistant` record of each live session's transcript recovers `Failed` vs `Idle`
for any turn whose hook was missed. This is exactly the self-healing that §9 item 8 asks
for, and it also covers the Esc-interrupt gap from Q1 (an interrupted turn leaves no
`isApiErrorMessage` record, so it reconciles to `Idle`, which is the honest answer).

---

## Q4 · Plan-mode observability

**Method.** Launched `claude --permission-mode plan` in tmux, drove a real plan through
question-answering, plan presentation and approval, and watched every hook. Then pressed
Shift+Tab and re-checked.

### (a) Is `permission_mode` visible in hook payloads?

**Observed.** Present on `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
`PermissionRequest`, `Stop` and `SubagentStop`. **Absent** on `Notification`,
`StopFailure`, `SessionEnd`, and **absent from the status-line payload entirely** —
the full status-line JSON (`context_window`, `cost`, `model`, `output_style`, `thinking`,
`workspace`, `version`, `exceeds_200k_tokens`, `fast_mode`) has no permission-mode field
of any kind.

**Verdict. CONFIRMED with a correction.** `permission_mode` is a hook field, not a
status-line field. The earlier observation that it was missing from `StopFailure` was
right, but it is not missing generally — it is on every tool-scoped and turn-scoped hook.

### (b) Is "plan is ready for approval" observable?

**Observed.** Yes, and richly. Presenting a plan is the `ExitPlanMode` tool, so it fires
`PreToolUse` and `PermissionRequest` carrying the entire plan:

```json
{"hook_event_name":"PreToolUse","tool_name":"ExitPlanMode","permission_mode":"plan",
 "tool_input":{"plan":"# Plan: Add --verbose flag to main.go\n\n## Context\n…",
               "planFilePath":"/Users/damian/.claude/plans/plan-how-to-add-purring-gray.md"},
 "tool_use_id":"toolu_01B3Yg8D8gnHuXk1vp395xpP","session_id":"67f82285-…"}
```

The plan is also written to disk just before, as a normal `Write` tool call to
`~/.claude/plans/<slug>.md` — so there are two independent sources for the plan text.

Approval is observable too. `PostToolUse` for `ExitPlanMode` carries the outcome and,
critically, the *new* mode:

```json
{"hook_event_name":"PostToolUse","tool_name":"ExitPlanMode",
 "permission_mode":"acceptEdits",
 "tool_response":{"plan":"…","filePath":"…","hasTaskTool":true,"isAgent":false}}
```

Every subsequent hook in that session reported `permission_mode: "acceptEdits"`.

Full observed timeline of one plan-mode turn:

```
13:10:37.422 UserPromptSubmit    pm=plan
13:10:47.941 PreToolUse          AskUserQuestion   pm=plan
13:10:47.966 PermissionRequest   AskUserQuestion   pm=plan
13:10:53.984 Notification        permission_prompt
13:11:41.320 PostToolUse         AskUserQuestion   pm=plan
13:11:46.080 PreToolUse          Write             pm=plan   (plan written to ~/.claude/plans/)
13:11:46.137 PostToolUse         Write             pm=plan
13:11:48.024 PreToolUse          ExitPlanMode      pm=plan   ← plan is ready
13:11:48.049 PermissionRequest   ExitPlanMode      pm=plan   ← and is decidable
13:11:54.067 Notification        permission_prompt
13:12:44.567 PostToolUse         ExitPlanMode      pm=acceptEdits  ← approved, mode flipped
```

**Verdict. CONFIRMED.** Plan-readiness is observable, the plan text is delivered in the
payload, and the approval transition is observable.

### (c) Does Shift+Tab produce an observable event?

**Observed.** Sending `BTab` to the pane changed the footer from `⏵⏵ accept edits on` to
`⏸ plan mode on`. The capture file stayed at 21 records — **no hook of any kind fired**,
and no status-line refresh carried the change (the status line has no such field anyway).

**Verdict. REFUTED.** Manual mode cycling is invisible to hooks and to the status line.

### SPEC impact

- **§6 needs a correction.** The row "Planning state ← permission mode from hook/status-line
  payload (`plan`)" is half wrong: the status line does not carry it. Change to
  "permission mode from hook payloads (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
  `PermissionRequest`, `Stop`)".
- **`Planning` is derivable but only edge-triggered.** Muster learns the mode when a hook
  happens to fire, not on demand. A session parked in plan mode with no activity emits
  nothing, and a Shift+Tab is never reported. Muster's stored mode is therefore last-known,
  not current, and should be treated the same way as any other last-write-wins field —
  or, since Muster launches the sessions itself, seeded from the `--permission-mode` it
  passed at launch and corrected by hooks thereafter.
- **§4.1 is buildable as specified, and better than hoped.** "Plan approval from the
  dashboard" has a real trigger (`PermissionRequest` on `ExitPlanMode`) that arrives with
  the plan markdown already in it — no transcript scraping, no `capture-pane` parsing.
- **§4.5 (auto-accept toggle per session) has a read-side gap.** The indicator can be
  updated from hooks but cannot be polled, and a user toggling in the terminal will
  silently desync the dashboard until the next hook fires.

---

## Q5 · `PermissionRequest` mechanics

### (d) What response shape actually works?

This one needed the binary. Both documented shapes **failed**:

- `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":"allow"}}` —
  ignored, terminal prompt appeared, tool did not run.
- `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","permissionDecision":"allow",
  "permissionDecisionReason":"…"}}` — also ignored. The embedded docs inside the binary
  explicitly say `permissionDecision` is "PreToolUse only", and they are right.

The real schema is in the 2.1.233 bundle (Zod, near the `hookSpecificOutput` union).
De-minified:

```js
{ hookEventName: "PermissionRequest",
  decision: union([
    { behavior: "allow", updatedInput?: Record<string, unknown>,
                         updatedPermissions?: PermissionUpdate[] },
    { behavior: "deny",  message?: string, interrupt?: boolean },
  ]) }
```

`decision` is an **object with a `behavior` key**, not a string. Verified live:

```json
{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}
```

The TUI printed `⎿ Allowed by PermissionRequest hook`, no prompt was shown, and
`/tmp/ccc-spike-4-marker3.txt` was created. **CONFIRMED.**

Note the `PermissionRequest` payload has **no `tool_use_id`** (its `PreToolUse` twin
does). Correlation must be on `session_id` + `prompt_id` + `tool_name` + `tool_input`.
The payload does carry a `permission_suggestions` array — the same options the terminal
offers as "always allow …" — which is directly usable for a remote-approval UI.

### (a) Does it block the session?

**Method.** Server sleeps on `PermissionRequest` with the hook `timeout` set high enough
not to fire, watching the pane at intervals.

**Observed.** With a 20 s sleep and `timeout: 60`, the in-terminal permission prompt was
**already on screen at t≈5 s**, while the hook was still in flight, and stayed there.
With a 10 s sleep and an `allow` decision, the prompt was on screen at t≈6 s and then
**vanished on its own at t≈10 s**, the command ran, and `PostToolUse` and `Stop` followed
— with no keystroke from me.

**Verdict. REFUTED as stated in SPEC.** The hook does not block the prompt; it races it.
The tool is blocked (it does not run until something decides), but the terminal prompt is
displayed immediately and concurrently. Whoever answers first — the user at the keyboard
or the hook over HTTP — wins, and a late hook decision retracts the on-screen prompt.

### (b) Is the per-hook `timeout` honored, and what is it?

**Observed.** With `"timeout": 3` on the `PermissionRequest` hook and a 15 s server sleep,
the capture server saw the client abort the connection at **exactly 3.000 s**
(request 15:21:49.334, `context canceled` 15:21:52.334). The prompt remained on screen,
the late `allow` was never sent, and the tool did not run.

**Verdict. CONFIRMED.** The per-hook `timeout` field is honored, is in **seconds**, and is
enforced by aborting the HTTP request. The daemon can detect its own timeouts server-side
by watching for request-context cancellation.

### (c) Does it degrade gracefully on timeout or non-2xx?

**Observed.** Three failure modes tested, all benign:

| Failure mode | Result |
|---|---|
| Hook exceeds its `timeout` | Connection aborted, terminal prompt stays live, no error shown |
| Hook returns 500 | Terminal prompt shown normally, no error, no crash |
| Hook returns 200 with empty body | Terminal prompt shown normally |

**Verdict. CONFIRMED — degradation is graceful, and it is graceful by construction.**
Because the prompt is displayed immediately rather than gated on the hook (see (a)), there
is no window in which the user is locked out. A dead Muster daemon degrades Claude Code to
stock behaviour.

### SPEC impact

- **§4.1's architectural note is wrong in its premise and right in its conclusion.**
  "`PermissionRequest` hooks block the session while deciding" is not what happens — the
  session shows the prompt and races. Rewrite it as: *the hook races the in-terminal
  prompt; timeouts must be deliberate because a slow hook can retract a prompt the user is
  already reading, and because a decision that arrives after the timeout is silently
  discarded.*
- **§6's gotcha "a `PermissionRequest` HTTP hook that times out renders no decision — UI
  must lose gracefully" is CONFIRMED**, and the failure is safe.
- **A new hazard worth spec'ing.** Because it is a race, Muster can rip a prompt out from
  under Damian mid-read. Auto-allow decisions should be fast (sub-second) so the prompt
  never appears at all, or deliberately slow enough that the human clearly owns it — the
  middle ground is the bad one. A short `timeout` (2–3 s) is the right default.
- **§4.4's permissions UI gets a bonus**: `updatedPermissions` in the allow branch means a
  hook can write permission rules as part of a decision, and `permission_suggestions` in
  the request payload supplies the candidate rules.

---

## Unplanned finding: `SessionStart` is never delivered over HTTP

Not one of my questions, but it turned up in every capture and it hits SPEC §6 and §2.1
directly, so it is recorded here for whoever owns hook coverage.

**Observed.** Across every session started in this spike — headless and interactive,
plan mode and default — **`SessionStart` never arrived at the HTTP capture server**, while
`SessionEnd`, `Stop`, `StopFailure`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
`PermissionRequest` and `Notification` all did.

**Isolated it.** I registered a `command` hook *alongside* the existing HTTP hook, on the
same `SessionStart` event in the same settings file, and started a session. The command
hook fired; the HTTP hook did not:

```json
{"session_id":"26fea281-7b8d-4a32-a679-7ebb124496c5",
 "hook_event_name":"SessionStart","source":"startup",
 "model":"claude-haiku-4-5-20251001",
 "cwd":"/Users/damian/Documents/code/Projects/ccc-spike/instances/4/repo",
 "transcript_path":"…/26fea281-….jsonl"}
```

**Verdict. CONFIRMED for project-scoped settings** — `SessionStart` fires as a `command`
hook and does not fire as an `http` hook. Untested at user scope (that would mean writing
to `~/.claude/`, which is off limits). Plausible mechanism: at `SessionStart` time the
project settings' `allowedHttpHookUrls` allowlist is not yet in force, so the HTTP
transport is skipped while the command transport is not. Someone with user-scope access
should confirm, because that would make this a project-settings-only problem.

**SPEC impact.** §6 mandates HTTP hooks as the transport for everything and §2.1 derives
`Started` from `SessionStart`. As things stand, M1 cannot get `Started` over HTTP. The
cheap fix is a single `command` hook that curls the daemon (`curl -sS -X POST --data-binary
@- http://…/hook/SessionStart`) — one line, and the "no wrapper scripts" rule survives
everywhere else. Note the payload also carries `source` (`"startup"`, and presumably
`resume`/`clear`/`compact`), which §2.5's reconcile-and-resume work will want.

---

## Verdicts on the SPEC §9 open questions

### §9 item 3 — Failed-state detection: is it reliable, and by what mechanism?

**Yes. `StopFailure` is a reliable primary signal, with the transcript as a sound
reconcile-time fallback.**

- `Stop` and `StopFailure` are mutually exclusive per turn — no disambiguation needed.
- `StopFailure` carries `error` and `last_assistant_message`; use the latter for display
  and the former only as a coarse hint, since a 400 reported `"unknown"`.
- `Failed` must be modelled as recoverable, not terminal: the same session accepts the
  next prompt and reaches `Idle` normally.
- The transcript's last `assistant` record (`isApiErrorMessage: true`,
  `apiErrorStatus`, `model: "<synthetic>"`) reconstructs `Failed` vs `Idle` for any turn
  whose hook was missed. Reconcile-time only — it lags.
- Two gaps to design around, neither fatal: a retryable API error leaves the session
  silently in `Working` for up to 3 minutes before `Failed` appears, and a user
  interrupt (Esc) fires no terminal hook at all.

### §9 item 4 — Plan mode: is it detectable, and is plan-readiness observable?

**Both yes, with one correction to §6 and one caveat.**

- Detectable: `permission_mode: "plan"` is on `UserPromptSubmit`, `PreToolUse`,
  `PostToolUse`, `PermissionRequest` and `Stop`. **Correction: it is *not* in the
  status-line payload**, contrary to §6.
- Plan-readiness is observable and generous: `PreToolUse` + `PermissionRequest` on
  `tool_name: "ExitPlanMode"`, with the complete plan markdown in `tool_input.plan` and a
  copy on disk at `tool_input.planFilePath`.
- Answering remotely works today via the `PermissionRequest` hook returning
  `{"decision":{"behavior":"allow"}}` — no `send-keys` needed. `{"behavior":"deny",
  "message":"…"}` is the reject path and can carry feedback text.
- Approval is observable: `PostToolUse` on `ExitPlanMode` reports the new
  `permission_mode` (`acceptEdits` when approved with auto-accept), which is exactly the
  §4.1 "auto-accept on approval" transition.
- Caveat: mode is **edge-triggered only**. Shift+Tab fires nothing, and an idle session in
  plan mode emits nothing, so Muster's view of the mode is last-known rather than current.

**Still open for §4.1, and out of scope here:** whether "auto-accept while planning" can
distinguish read-only research prompts from riskier ones. The payload gives `tool_name`,
full `tool_input` and `permission_suggestions`, which is enough to write a conservative
allowlist against, but I did not test any classification.
