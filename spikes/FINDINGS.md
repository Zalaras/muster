# Muster — Step 1 spikes: consolidated findings

Run 2026-08-16 against **Claude Code 2.1.233** (native install), macOS Darwin 25.6,
Go 1.26.1, tmux 3.7b, Node 22.22.2. No auto-update drift during the run.

Throwaway spike code and raw evidence live in the sibling directory `../../ccc-spike/`
(`captures/*.jsonl` — ~150 captured payloads, `termbridge/` with screenshots, `rig/`).
That directory is deliberately outside the repo and can be deleted once the canary E2E
exists.

Alongside this file: `canary-fields.md` (the canary E2E assertion list),
`RIG.md` (how to stand up an isolated instance again), and `A0-rig-findings.md`
(the rig/isolation write-up in full).

**`~/.claude/settings.json` md5 before and after: `20a641769314c762f0390de5495a9e31`** —
byte-identical. Damian's live config was never modified.

---

## Verdict: GO. SPEC's architecture survives.

Every load-bearing assumption held. Four corrections are needed, one of them material, and
none of them change the shape of the product.

| Assumption | Verdict |
|---|---|
| Status line carries `rate_limits` (5-hour + weekly) — SPEC §2.3 | **CONFIRMED** |
| Status line carries `context_window.used_percentage` — SPEC §2.2 | **CONFIRMED** |
| An errored turn is distinguishable from a normal `Stop` — §9 Q3 | **CONFIRMED** (`StopFailure` + typed `error`) |
| Permission mode is observable for the `Planning` state — §6 | **CONFIRMED (partial)** — hooks only, and not all hooks |
| `Notification` gives a `Needs-Input` signal — §2.1 | **CONFIRMED** (`permission_prompt`, `idle_prompt`) |
| Claude Code's TUI renders interactively via tmux→PTY→WS→xterm.js — §2.4 | **CONFIRMED** |
| Plan mode and plan-readiness are observable — §9 Q4 | **CONFIRMED** (`ExitPlanMode` tool call) |
| Native session titles (`--name`, `/rename`, hook `sessionTitle`) — §2.1 | **CONFIRMED** (all three) |
| All hooks can use `type:"http"`, no wrapper scripts — §6 | **REFUTED** — `SessionStart` is command-only |
| Weekly bucket keyed `weekly`, `resets_at` a UTC string — §2.3/§7 | **REFUTED** — `seven_day`, Unix epoch int |
| `tmux resize-pane` is the resize primitive — §2.4 | **REFUTED** — wrong primitive for a single-pane window |
| Config isolation via `CLAUDE_CONFIG_DIR` | **REFUTED** — breaks subscription OAuth |

---

## 1. The material correction: `SessionStart` does not work over HTTP

SPEC §6 states "Hook transport: **HTTP hooks** (`type:"http"`) — no wrapper scripts."
That is not achievable in 2.1.233.

Proven with an A/B inside a single hook block — one `type:"http"` hook and one
`type:"command"` hook on the same event, same session, same run. The command hook fired
every time; the HTTP hook fired **zero times** across the entire run. Matcher variants
(`"startup"`, `"*"`, none), trust-prompt ordering, and user-vs-project scope were all ruled
out in turn.

**It fails completely silently** — no error in the TUI, no warning, nothing on the wire.

Every other event tested (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`,
`StopFailure`, `SessionEnd`, `Notification`, `SubagentStop`, `PermissionRequest`) works
fine over HTTP.

**Consequence for Muster:** ship a small `type:"command"` shell wrapper for `SessionStart`
that POSTs stdin to the daemon, or derive "started" from the first status-line post
instead. Either way, `internal/claudecode` owns the workaround. The canary E2E must assert
`SessionStart` *delivery*, not just its fields — a silent non-delivery is exactly the
failure mode the canary exists to catch, and a field-shape-only canary would pass while the
state machine never leaves `Started`.

## 2. Usage data is real, with three wire-format corrections

`rate_limits` populates as SPEC hoped:

```json
"rate_limits": {
  "five_hour": { "used_percentage": 13,                 "resets_at": 1786897200 },
  "seven_day": { "used_percentage": 28.000000000000004, "resets_at": 1787061600 }
}
```

Corrections: the weekly bucket is keyed **`seven_day`** not `weekly`; `resets_at` is a
**Unix epoch integer** not an RFC3339 string; `used_percentage` is a **float** not an int.
SPEC §2.3 and §7's `usage_sample` schema should follow the wire format.

**The "unknown" state is now characterised precisely** (SPEC §9 risk 9): the entire
`rate_limits` key is **absent** — not empty, not null — until a session's first API
response, and `context_window.used_percentage`, `remaining_percentage` and `current_usage`
are `null` over the same window. A null is not "0% used": the UI must render "unknown"
rather than an empty gauge for a fresh session.

**Once present, it stays present for the life of the session.** Verified by grouping every
status-line post by `session_id` across all four instances — the per-session pattern is a
run of absences followed by unbroken presence, with no flapping:

```
session 67f82285  n=18   -- RL RL RL RL RL RL RL RL RL RL RL RL RL RL RL RL RL
session 0ee0f9c1  n= 9   -- -- RL RL RL RL RL RL RL
session d3724e95  n= 6   -- RL RL RL RL RL
session dc7cc182  n= 2   -- --          (never completed a turn)
```

So Muster can read `rate_limits` on demand from the latest payload; it does **not** need to
latch the value to survive within a session. (Persisting samples is still wanted for §2.3's
history, and latching across a *daemon* restart is still sensible — but that is a Muster
durability choice, not a workaround for the wire format.)

> **Measurement trap, recorded because it produced a wrong conclusion once.** Pooling
> status-line posts across sessions makes this look like "present on only 2 of 12 posts",
> inviting the false conclusion that the data rides only on post-turn payloads and must be
> latched within a session. **Always group status-line analysis by `session_id`.**
>
> The mechanism behind the bad reading is worth knowing, because it is easy to reproduce:
> in the sample that produced it, every session was exited immediately after a single cheap
> prompt, so the `rate_limits`-bearing post was always the *last* post of its session. A post
> occurring after `rate_limits` appeared simply never existed in the sample. The ratio was
> measuring teardown habits, not Claude Code's behaviour — which is exactly why the cheap,
> fast spike sessions that are good for capturing payload *shapes* are bad for measuring
> anything *temporal*. Keep a long-lived session in the sample when the question is "when".
>
> A related method note, from the agent that made the call: it had already flagged
> persistence as UNVERIFIED and correctly named the cause ("my sessions ended too early"),
> then asserted the stronger conclusion anyway in the same breath. Flagging a gap is not a
> licence to assert the conclusion the gap forbids.

## 3. Failed-state detection is solved

`StopFailure` is a real, separate hook event carrying a typed `error`:

```json
{"hook_event_name":"StopFailure","error":"authentication_failed",
 "last_assistant_message":"Not logged in · Please run /login", "...": "..."}
```

Full taxonomy in the binary: `rate_limit`, `overloaded`, `authentication_failed`,
`oauth_org_not_allowed`, `billing_error`, `invalid_request`, `model_not_found`,
`server_error`, `max_output_tokens`, `unknown`. SPEC §9 Q3 and §6's "mechanism TBD" are
answered, and the `Failed` state in §2.1 is buildable.

A cheap side-benefit for testing: pointing `CLAUDE_CONFIG_DIR` at an empty directory
induces `StopFailure`/`authentication_failed` deterministically at **zero token cost** —
useful for the E2E suite.

**`StopFailure` replaces `Stop` — they do not both fire. CONFIRMED.** Across 4 induced
failures with both hooks registered, every `StopFailure` had a `prompt_id`/`session_id` with
no matching `Stop`. The state machine is therefore unambiguous: `Stop` → `Idle`,
`StopFailure` → `Failed`, never both.

**Mid-turn API errors are inducible. CONFIRMED.** `ANTHROPIC_BASE_URL` *is* honoured under
subscription OAuth: pointing it at a local proxy returning 500 produced
`StopFailure` with `error: "server_error"`, distinct from the startup-time
`authentication_failed` case. Both a real mid-turn failure and a startup failure are
therefore reproducible in the E2E suite.

## 4. Permission mode is observable — but not everywhere

SPEC §6 says permission mode comes from the "hook/status-line payload". Corrected, and the
split is perfectly clean across 134 captured hook payloads — every event is either 100%
with or 100% without:

| Present (n with / n seen) | Absent |
|---|---|
| `UserPromptSubmit` 25/25 · `PreToolUse` 22/22 · `PostToolUse` 16/16 · `Stop` 16/16 · `PermissionRequest` 10/10 · `SubagentStop` 9/9 | `SessionEnd` 0/15 · `Notification` 0/11 · `SessionStart` 0/5 · `StopFailure` 0/4 · `PreCompact` 0/1 |

**Absent from the status line entirely**, so there is no fallback source — hooks are the
only one. The documentation's "common to all hook inputs" claim is refuted. Observed values:
`"default"`, `"plan"`, `"acceptEdits"`.

Muster must therefore **latch the last known mode** and carry it forward. One consequence worth
designing for explicitly: a turn that ends in `StopFailure` carries no mode, so **a session
that fails while in plan mode must not be silently reset to `default`** — the `Failed` state
has to preserve the mode it failed in.

`PermissionRequest` additionally carries `permission_suggestions`, e.g.
`{type:"setMode", mode:"acceptEdits", destination:"session"}` — directly useful for
SPEC §4.1's plan-mode flow.

### Plan mode is fully observable — SPEC §9 Q4 resolved, and §4.1 is easier than assumed

`permission_mode: "plan"` appears in hook payloads as expected. But the more valuable result
is that **plan-readiness is directly observable**, via this captured sequence:

```
PreToolUse         mode=plan         tool=ExitPlanMode   ← "the plan is ready"
PermissionRequest  mode=plan         tool=ExitPlanMode   ← the approval decision point
Notification       notification_type=permission_prompt
PostToolUse        mode=acceptEdits  tool=ExitPlanMode   ← approved; mode flipped automatically
```

Three consequences for SPEC §4.1, all favourable:

1. **"Plan is ready" has a clean signal**: `PreToolUse` with `tool_name: "ExitPlanMode"`.
   No heuristics, no output parsing.
2. **Remote plan approval is mechanically available**, though not by the mechanism SPEC
   assumed. The decision point is a `PermissionRequest` on `ExitPlanMode`, and that hook
   **races the terminal prompt rather than blocking it**: the tool is held until *something*
   decides, but the in-terminal prompt appears immediately and concurrently. Whoever answers
   first wins — the user at the keyboard or the dashboard over HTTP — and a late hook
   decision *retracts* the on-screen prompt (observed: prompt vanished on its own at t≈10 s
   when the hook returned `allow`, with no keystroke). This race is precisely why
   degradation is graceful: there is never a window where the user is locked out.
3. **"Auto-accept on approval" already happens natively** — the mode is `plan` at
   `PreToolUse` and `acceptEdits` by `PostToolUse` of the same `ExitPlanMode` call. Muster does
   not need to build it.

Also observed: mode transitions `default` → `plan` → `acceptEdits` all appear in payloads, so
the `Planning` state and a per-session mode indicator (§4.5) are both straightforward.

**The per-hook `timeout` is honored, is in seconds, and degradation is graceful — CONFIRMED.**
With `"timeout": 3` against a 15 s server sleep, the client aborted at exactly 3.000 s. All
three failure modes are benign:

| Failure mode | Result |
|---|---|
| Hook exceeds its `timeout` | Connection aborted; terminal prompt stays live; no error shown |
| Hook returns 500 | Terminal prompt shown normally; no error, no crash |
| Hook returns 200, empty body | Terminal prompt shown normally |

A dead Muster daemon simply degrades Claude Code to stock behaviour. Useful implementation
detail: the daemon can detect its *own* timeouts server-side by watching for HTTP
request-context cancellation.

**Manual mode cycling is invisible — REFUTED.** Sending Shift+Tab changed the TUI footer
from `⏵⏵ accept edits on` to `⏸ plan mode on`, but **no hook of any kind fired** and the
status line carries no such field. So Muster cannot observe a user cycling modes by hand; its
mode display will be stale until the next hook that happens to carry `permission_mode`.
Seed the mode from Muster's own launch flag and correct it on the first `UserPromptSubmit`.

## 5. `Needs-Input` is buildable

Both matchers captured with real payloads:
- `notification_type: "idle_prompt"` — `"Claude is waiting for your input"`
- `notification_type: "permission_prompt"` — `"Claude needs your permission"`

Both share a `prompt_id` with the corresponding `PermissionRequest`, so Muster can correlate
a notification to the tool call that caused it.

## 5b. Status-line cadence — and a `refreshInterval` trap

Invocation is **event-driven, not interval-driven**. Reconstructed from receipt timestamps,
posts cluster immediately after tool activity and assistant turns (a `PostToolUse` is
typically followed by a status-line post within ~50 ms), and they arrive in **close pairs**
— 14 observed, median 435 ms apart (range 0.29–0.95 s) — consistent with a render followed
by a debounced re-render. Muster should de-duplicate near-simultaneous posts before writing a
`usage_sample` (SPEC §7), or it will store each sample twice.

**`refreshInterval: 1000` produced no idle polling whatsoever.** Idle gaps of **127 s, 83 s
and 58 s** occurred with no post at all. That **rules out milliseconds** — at ms units the
first gap alone would have yielded ~127 posts. It is consistent with either seconds
(1000 s ≈ 16.7 min, never elapsed in these sessions) *or* the setting being ignored
entirely; this spike cannot distinguish those two. **Unit: UNVERIFIED.** Test with a small
value before relying on it.

Practical consequence either way: an **idle session emits no status-line posts**, so its
usage figures go stale between turns. Whether that is fixable via `refreshInterval` is
exactly the unverified part — do not assume the dashboard can keep §2.3's bars ticking
during idle without confirming it first.

## 5c. Hook ordering: interleaving is real, inversion wasn't observed

SPEC §6 assumes hooks "run in parallel and arrive out of order". Partially borne out —
with an important distinction.

Three concurrent `Read` calls produced clearly **interleaved** events:

```
13:21:00.311  PreToolUse   Read   id…ovaZfV
13:21:00.376  PreToolUse   Read   id…zanmzT
13:21:00.425  PreToolUse   Read   id…iLgFvU
13:21:00.575  PostToolUse  Read   id…ovaZfV
13:21:00.618  PostToolUse  Read   id…zanmzT
13:21:00.621  PostToolUse  Read   id…iLgFvU
```

So Muster must **not** assume a `PreToolUse` is followed by its own `PostToolUse` — three
opened before any closed. But within every `tool_use_id`, `Pre` did arrive before `Post`;
**no true inversion was observed** in this sample.

**There are no timestamps on the wire.** Verified against every captured hook payload: the
full key set contains no time, date or sequence field of any kind. So SPEC §6's
"last-write-wins with timestamps" is **not implementable as written** — the only ordering
information available is the daemon's own arrival order.

What *is* available is correlation: `tool_use_id` pairs a tool's Pre/Post exactly, and
`prompt_id` groups every event belonging to one turn (present on all hook events except
`SessionStart`). The workable strategy is therefore to **assign a monotonic per-session
sequence at ingest** and make the state machine order-tolerant, rather than attempting to
reorder. This is adequate because state transitions key off turn-level events
(`UserPromptSubmit`, `Stop`, `StopFailure`, `Notification`) rather than tool-level ones.

> **Caveat:** this is observational from ordinary sessions, not a stress test. Inversion
> under heavy concurrency remains unproven — absence of evidence here, not evidence of
> absence.

## 5d. Hook delivery gaps — SPEC §9 risk 8, now RESOLVED

The question with no documentation, and the one that most shapes reconcile. Tested in four
failure shapes.

**Receiver down.** The session **does not block** and **does not retry** — one attempt per
event, connection refusal is final, and the event is **permanently dropped**. `PreToolUse`
**fails open**: a `Write` executed normally despite its hook erroring. The turn completed at
normal speed (~3 s).

The cost is *visible noise in the user's own session* — two error lines per event, inline in
the transcript, plus a banner:

```
❯ say gap1
  ⎿  UserPromptSubmit hook error
  ⎿  connect ECONNREFUSED 127.0.0.1:8783
⏺ Ran 1 stop hook
  ⎿  Stop hook error: connect ECONNREFUSED 127.0.0.1:8783
```

If `musterd` is down, **every managed pane fills with hook errors**. That is a real UX
consequence of the HTTP-hook design and argues for the daemon being very reliable, or for
Muster surfacing "daemon down" prominently so the noise is explicable.

**On restart, nothing is replayed** — but the stream **self-heals immediately** for future
events, with no session restart needed.

**A slow receiver is worse than a dead one.** Against `timeout: 5`, a hung server held each
hook for its full timeout — `PreToolUse` delayed the permission flow by exactly 5.03 s. The
tax is *per hook, additive*: a one-tool turn firing `UserPromptSubmit` + `PreToolUse` +
`PostToolUse` + `Stop` would gain ~20 s. **Set the timeout to 1–2 s, not 5** — losing an
observational event is far cheaper than stalling the user's session.

**`PermissionRequest` degrades gracefully, confirming SPEC §6's assumption.** With the hook
hung, the interactive permission dialog rendered anyway within 1–2 s — concurrently, not
gated on the hook — and the user could answer normally.

**`SessionEnd` is a hint, never a guarantee:**

| How the session ended | `SessionEnd`? | `reason` |
|---|---|---|
| `/exit` | yes | `prompt_input_exit` |
| `/clear` | yes | `clear` |
| `tmux kill-session` (SIGHUP) | yes | `other` |
| **`kill -9`** | **no** | — |

A hard-killed session is indistinguishable from a running one by hooks alone, and `reason`
is `other` for both a killed pane and an ordinary termination.

### What this means for the design

- Hooks are **best-effort, at-most-once, fire-and-forget**. Design for loss, never
  completeness — SPEC §9 risk 8's worry is fully justified.
- **Reconcile must be liveness-driven**: poll tmux pane existence as the authority on
  whether a session is alive, and treat hook events as enrichment.
- **Return `200` immediately and process asynchronously** in `musterd`; never do database work
  on the hook request path.
- The **status line is the recovery channel** — it re-seeds `session_id`, model, context,
  `rate_limits` and `session_name` on the next render. But it carries no `permission_mode`
  and no state, and it is render-driven: **it is not a heartbeat.**

## 6. Titles: SPEC §2.1 was right, and there's a bonus

All three mechanisms SPEC claimed are **CONFIRMED working**, each observed as a distinct
`session_name` value in the status line:

| Mechanism | Observed `session_name` |
|---|---|
| `claude --name` | `"Spike Title Probe"` |
| `/rename` mid-session | `"Renamed Via Slash"` |
| `SessionStart` hook returning `sessionTitle` (nested form) | `"TitleFromHookNested"` |
| **Auto-generated** when none of the above is used | `"Run echo hello bash command"`, `"Add verbose flag to main.go"` |

**Read the title from the status line's `session_name`** — it reflects all three mechanisms
live, so Muster needs no ID→title map and no hook of its own. The bonus is the fourth row:
Claude Code auto-titles untitled sessions from their content, so every session in the
dashboard has a meaningful name for free.

`SessionStart` carries `session_title` in its *input* only when `--name` was passed —
absent otherwise, which is why an early capture appeared to contradict the spec.

## 7. The terminal bridge works — SPEC §2.4 is sound

A Go bridge (`creack/pty` → tmux → WebSocket → `@xterm/xterm`) rendered a live Claude Code
session in a browser. Confirmed by screenshot at 151×45 in shared-attach mode:

- Full TUI renders correctly — box-drawing borders, colours, the welcome banner, the
  workspace-trust dialog, the `/help` and slash-command menus, and the thinking spinner.
- **Typing works end to end**, including Escape (interrupt) and Shift+Tab (plan-mode cycle
  — the screenshot shows `plan mode on` reached from the browser).
- **Bracketed paste survives tmux**: a three-line paste arrived as one paste in the input
  box, not three submitted prompts.

**SPEC §2.4's `tmux resize-pane` is the wrong primitive** for a single-pane window — it is
bounded by the window and cannot grow it. Use `resize-window` with `window-size manual`, or
PTY-side `pty.Setsize` (which sends SIGWINCH to the attached client).

**Recommended attach model: shared.** One `tmux attach-session` under one daemon-owned PTY,
with all browser clients fanned out from that single byte stream. tmux then only ever sees
one client, so its "size to the smallest attached client" rule never fires — which is
precisely the hazard behind SPEC §9 Q5.

### The four decisions — SPEC §9 Q5 RESOLVED

The full multi-client matrix was run (`shared` vs `perclient` × `window-size` ∈ {manual,
smallest, largest, latest}).

**(a) Shared PTY.** In every shared cell `tmux list-clients` returned exactly **one** row, so
tmux's size-negotiation never fires and `window-size` becomes inert. All browser buffers were
byte-identical to each other and to `capture-pane`. Per-client attach's best cell
(`smallest`) is strictly worse: it forces a dead zone into the wide client permanently and
lets an external Terminal resize the session.

**(b) `window-size manual`**, chosen entirely for its effect on *external* clients: an
external Terminal attaching at 80×24 left the browser pane untouched, whereas `smallest`
shrank the window and padded the browser with 32 rows of `·`. It is self-enforcing —
`resize-window -x/-y` latches the window into `manual` as a side effect. Defence in depth:
attach external viewers with `-r` or `-f ignore-size`.

**(c) ONE SIZE PER SESSION** — the answer to SPEC §9 Q5. The shared PTY makes this
structural, not a preference: there is one byte stream at one geometry, so a second live view
at a different size is a mis-sized copy, not a rendering choice. Because a *wider* grid
degrades gracefully but a *narrower* one silently loses content (see the clipping screenshot),
the rule is:

> **The session's geometry must be ≤ the smallest grid currently rendering it live.**

**This constrains SPEC §2.1 and §2.4 together:** the session list **must not open a second
live client at a different size**. A live 40-column thumbnail beside a live 200-column pane is
the one configuration guaranteed to lose content. Show a static last-known snapshot instead,
or render the same stream into a grid at least as large. Resize-on-focus is mechanically fine
(all five widths landed with zero diff) but costs a full TUI repaint and breaks any other open
view — prefer one stable size, driven by the dashboard pane that actually reads the session.

**(d) BOTH `pty.Setsize` and `resize-window`** — and SPEC's `resize-pane` is simply wrong:

| Approach | Result |
|---|---|
| `tmux resize-pane -x -y` (what SPEC §2.4 said) | **Exits 0 and silently does nothing** |
| `pty.Setsize` alone (`window-size manual`) | Client resized, **window did not** — clipping or `·` padding |
| `resize-window` alone | **Truncates** — a 130-col window painted into a 100-col PTY loses 24 columns |
| **`pty.Setsize` then `resize-window`** | **Correct at 60/80/100/120/200 cols, zero diff every time** |

They do different jobs: `pty.Setsize` sizes the region the tmux *client* paints into;
`resize-window` sizes the *window* the application lays out against.

**Scrollback belongs to tmux, not xterm.js.** In steady state xterm reports the alternate
buffer with `length === rows` and accumulates **zero** scrollback, because tmux drives the
outer terminal into the alt screen and repaints whole screens. xterm's own scrollbar and
wheel-scroll have nothing to scroll — set `scrollback: 0` explicitly rather than accidentally,
and map wheel events into tmux copy-mode if scrollback is wanted later.

> **Still unmeasured:** keystroke latency and throughput under heavy output. Not blocking —
> the correctness questions that gated the architecture are all answered.

### Carry-over: the tmux config that made it work

```
set -g  default-terminal "tmux-256color"
set -as terminal-features ",xterm-256color:RGB"
set -sg escape-time 0          # default 500ms swallows Escape, Claude's interrupt key
set -g  status off             # status bar otherwise eats a row; breaks 1:1 row mapping
set -g  window-size manual     # required for resize-window to work as the primitive
set -g  history-limit 20000
set -g  mouse off
setw -g aggressive-resize off
set -g  destroy-unattached off
set -g  detach-on-destroy off
```

Plus, from the bridge itself: set `LANG=en_US.UTF-8` and `TERM=xterm-256color` explicitly in
the PTY environment (without them tmux falls back to ASCII line-drawing and Claude's boxes
render as `qqqq` garbage — this looks exactly like a rendering bug); treat a PTY read
returning `EIO` as clean EOF on macOS rather than an error; use **binary** WebSocket frames
both directions so multi-byte UTF-8 split across read boundaries doesn't corrupt; debounce
resize ~100 ms.

## 8. Isolation: project scope, not `CLAUDE_CONFIG_DIR`

- `CLAUDE_CONFIG_DIR` isolates settings, hooks and transcripts correctly, but **breaks
  subscription OAuth** — the session dies with `authentication_failed` / "Not logged in ·
  Please run /login". macOS Keychain does not rescue it. Unusable for managed sessions.
- **Project-scoped `<repo>/.claude/settings.json` works** and honors `hooks`, `statusLine`
  **and** `allowedHttpHookUrls` — the last of these authorized its own hook URLs while
  Damian's global settings had no such key. This is how Muster should scope per-repo config.

**SPEC §2.5 impact:** Muster cannot give a managed session an isolated config dir without
owning a login step. It must either use the user's real config dir or accept that cost.

## 9. The workspace-trust prompt blocks startup — a real §2.5 input

On the first `claude` launch in any directory Claude Code hasn't seen, a trust prompt
appears and **blocks startup**: no hooks fire and no status line renders until it is
answered. A dashboard-launched session will sit there looking merely "slow to start" while
producing no events at all.

Dismissed with a single bare `Enter` (option 1 is preselected). Sharpest detail:
**headless `claude -p` runs do not record trust** — running headless in a directory first is
not a way to pre-trust it.

Muster must detect this state and either surface it or answer it deliberately. Auto-answering
is a security decision, not a convenience: the prompt is the only gate before Claude Code
can read, edit and execute in that folder.

---

## Still open — carry into step 2

> **Editorial note (2026-08-16, setup session).** This list was numbered `1, 3, 4, 6, 6` —
> two entries had been lost in an earlier edit and one number duplicated. Renumbered below;
> no wording changed. The closing sentence used to read "Item 2 gates M2", referring to a
> multi-client sizing item that no longer appears here. That work **was** completed — §7
> records the full `shared`/`perclient` × `window-size` matrix — so the gap is closed, not
> lost. `next-steps.md` still listed it as open and has been corrected.

1. **`--resume` was never exercised.** `SessionStart` with `source=resume`, and whether
   titles survive a resume, are unverified — directly relevant to §2.5's reconcile-and-resume
   flow, which is M4.
2. **`refreshInterval` unit.** Proven not to be milliseconds; seconds-vs-ignored is
   undetermined. Matters only if the dashboard needs usage to tick during idle.
3. **Hook ordering under heavy concurrency** — interleaving confirmed at four parallel tool
   calls, no inversion observed (§5c). Low risk given turn-level transitions.
4. **Whether `StopFailure` covers *all* turn-ending errors.** Two error types were induced;
   the other seven in the taxonomy are unobserved.
5. **Status-line invocation on failure paths** — whether a session that never reaches a
   first API response ever emits usable usage data, which affects what a freshly-launched
   or failed session shows in the dashboard.
6. **Whether `Stop` also fires alongside `StopFailure`, or is replaced by it.** Tracked as
   open in SPEC §9.3 and `next-steps.md` but never listed here. Settle before the state
   machine is written (M1).

None of these block starting M0. Item 1 shapes the reconcile design, and item 6 gates the
M1 state machine — both are worth an hour before M1 is finalised.
