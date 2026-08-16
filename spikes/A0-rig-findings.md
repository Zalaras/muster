# A0 — Rig & Isolation · findings

Run date: 2026-08-16. Host: macOS (Darwin 25.6.0), Damian's machine.
`claude --version` at start: **2.1.233 (Claude Code)**.
`claude --version` at end: **2.1.233 (Claude Code)** — no auto-update drift during the run.

All evidence is in `captures/capture-1.jsonl` (20 hook posts, 12 status-line posts).
Rig: `rig/capture/main.go`, `rig/newspike.sh`, `rig/RIG.md`.

`~/.claude/settings.json` md5 before **and** after: `20a641769314c762f0390de5495a9e31`
— byte-identical, never written to. `~/.claude/settings.local.json` likewise untouched.
No `claude update` was ever run.

---

## Q1. Does subscription OAuth survive an isolated `CLAUDE_CONFIG_DIR`?

**Method.** Created `instances/1/claude-config/` with a full settings.json (hooks +
statusLine + allowedHttpHookUrls), then ran headless from the scratch repo:

```
CLAUDE_CONFIG_DIR=…/instances/1/claude-config claude -p "say hi" --model claude-haiku-4-5-20251001
```

**Observed.** stdout was exactly `Not logged in · Please run /login`. The session died
immediately; a `StopFailure` hook fired carrying the reason:

```json
{
  "error": "authentication_failed",
  "hook_event_name": "StopFailure",
  "last_assistant_message": "Not logged in · Please run /login",
  "session_id": "27a396e5-0141-4d10-a796-bbecd31f16b5",
  "transcript_path": "…/instances/1/claude-config/projects/…/27a396e5-….jsonl"
}
```

**Verdict. REFUTED** — macOS Keychain does *not* rescue an isolated config dir.
`CLAUDE_CONFIG_DIR` demands a fresh `/login`. Per instructions I did not attempt one.

Worth recording: the isolated config dir **was** otherwise fully honored — its hooks fired
and its `projects/` transcript directory was used. So the mechanism works for everything
*except* credentials. `CLAUDE_CONFIG_DIR` remains the right tool for a deliberately
unauthenticated session, and nothing else.

**SPEC impact.** Muster cannot isolate a managed session's config via `CLAUDE_CONFIG_DIR`
without re-authenticating that config dir. §2.5's launch flow must either accept the
user's real config dir or own a one-time login step.

---

## Q2. Does project-scoped `.claude/settings.json` isolate cleanly?

**Method.** Wrote `<scratch-repo>/.claude/settings.json` carrying all three keys —
`statusLine`, `hooks`, `allowedHttpHookUrls` — and ran with the **default** config dir so
auth came from Damian's real credentials.

**Observed.** Headless `claude -p "say hi"` returned `Hi! 👋 I'm ready to help…` and posted
`UserPromptSubmit`, `Stop`, `SessionEnd` to the capture server. Interactively in tmux the
TUI rendered `Muster-SPIKE` — the capture server's reply — as its status line, under the
banner `Haiku 4.5 · Claude Team · spandigital`.

All three keys are honored at project scope. `allowedHttpHookUrls` is the notable one:
it is defined **only** in the project settings (Damian's global settings have no such key),
and the HTTP hooks were delivered — so project scope really can authorize its own hook URLs.

**Verdict. CONFIRMED — this is the isolation mechanism that wins.** Auth is untouched,
hooks and status line are scoped to the scratch repo, and Damian's sessions in other
directories are unaffected because project settings only apply under that path.

**Caveat, stated honestly:** this is isolation of *configuration*, not of *state*. The
session uses the real `~/.claude/`, so it writes its own transcript under
`~/.claude/projects/…` and appears in normal session history. Nothing pre-existing is
modified — only new per-session files are added.

**SPEC impact.** Supports §6's HTTP-hook transport decision, with the exception in Q3.

---

## Q3. Does `SessionStart` work over HTTP? — **No, and this contradicts SPEC §6**

This was not on the brief; it surfaced because `SessionStart` never arrived.

**Method.** After `SessionStart` failed to fire across several restarts, I ruled out the
obvious causes in turn: matcher variants (`"startup"`, `"*"`, and no matcher — all silent);
trust-prompt ordering (refuted — a restart in an already-trusted dir, with no prompt at all,
still produced nothing); and user scope vs project scope (silent from a `CLAUDE_CONFIG_DIR`
user-scope settings file too).

The decisive test was an A/B inside a **single hook block**, same session, same run:

```json
"SessionStart": [{"hooks": [
  {"type": "http",    "url": "http://127.0.0.1:8781/hook/SS-http-nomatcher", "timeout": 5},
  {"type": "command", "command": "…/ss-cmd.sh", "timeout": 10}
]}]
```

**Observed.** The command hook fired; the http hook did not. Full command-hook stdin:

```json
{
  "session_id": "d8cd1ec7-73be-4122-9d6a-b07bb9483a5a",
  "transcript_path": "/Users/damian/.claude/projects/…/d8cd1ec7-….jsonl",
  "cwd": "…/instances/1/repo",
  "hook_event_name": "SessionStart",
  "source": "startup",
  "model": "claude-haiku-4-5-20251001"
}
```

Across the whole run, `SessionStart-http` was received **0 times** while `SessionStart`
via the command wrapper arrived reliably. **No warning or error was surfaced anywhere** —
not in the TUI, not on the hook. It fails completely silently.

**Verdict. CONFIRMED** — in 2.1.233, `SessionStart` fires only as `type:"command"`.
Every other event tested (`UserPromptSubmit`, `Stop`, `StopFailure`, `SessionEnd`) works
over `type:"http"`.

**SPEC impact — material.** §6 states "Hook transport: **HTTP hooks** (`type:"http"`) —
no wrapper scripts". That is not achievable for `SessionStart`, which is the event §6
assigns to the `→ Started` transition. Muster must ship a small command-hook wrapper for
`SessionStart` (a few lines of shell that POSTs stdin to the daemon), or derive "started"
from the first status-line post instead. This also belongs in the §8 canary test: a silent
non-delivery is exactly the failure mode the canary exists to catch.

---

## Windfall — a real `StopFailure` payload, and a free way to reproduce it

Captured accidentally while testing Q1, but it answers **SPEC §9 open question 3**
("what reliably signals 'turn ended on an API error' vs normal Stop?"), which was slated
to cost a separate spike a whole session.

The answer: **a distinct hook event.** A failed turn fires `StopFailure` *instead of*
`Stop`, carrying a machine-readable `error` field. No transcript-tailing and no ANSI
parsing needed. Full payload, complete field list, nothing redacted:

```json
{
  "cwd": "/Users/damian/Documents/code/Projects/ccc-spike/instances/1/repo",
  "error": "authentication_failed",
  "hook_event_name": "StopFailure",
  "last_assistant_message": "Not logged in · Please run /login",
  "prompt_id": "2cda4822-87f7-4f7a-b93b-aa1d3dc699b2",
  "session_id": "27a396e5-0141-4d10-a796-bbecd31f16b5",
  "transcript_path": "…/claude-config/projects/…/27a396e5-….jsonl"
}
```

Fields: `cwd, error, hook_event_name, last_assistant_message, prompt_id, session_id,
transcript_path`.

**Reproducible for free.** The auth-failure path is a known, cheap, deterministic way to
induce `StopFailure` **without burning tokens** — it fails before any API call, in about a
second. Recipe is in `rig/RIG.md` §8. Caveat: it only produces the `authentication_failed`
flavour; the full range of `error` values is **UNVERIFIED**, so a later spike shouldn't
assume this is the only one.

**SPEC impact.** §6's "Failed | turn-ended-on-error detection — mechanism TBD" can be
resolved to "`StopFailure` hook, read `error`". §7's `event` table already stores this
without change. Worth noting `Stop` and `StopFailure` are mutually exclusive for a turn, so
the state machine should treat `StopFailure` as a terminal-for-this-turn event in its own
right, not as a `Stop` variant.

### Documented-claim-vs-observed discrepancy: `permission_mode`

The documentation describes `permission_mode` as a common field on hook inputs. **Observed,
it is not.** The split is clean and all-or-nothing per event type — not per payload.

Counts below are from the **pooled captures across all four spike instances (134 payloads)**,
which supersede my `capture-1` view. My sessions only ran trivial "say hi" prompts and never
invoked a tool, so `capture-1` contained none of the tool-use events:

| Event | `permission_mode` | Observed |
|---|---|---|
| `UserPromptSubmit` | present | 25/25 |
| `PreToolUse` | present | 22/22 |
| `PostToolUse` | present | 16/16 |
| `Stop` | present | 16/16 |
| `PermissionRequest` | present | 10/10 |
| `SubagentStop` | present | 9/9 |
| `SessionEnd` | **absent** | 0/15 |
| `Notification` | **absent** | 0/11 |
| `SessionStart` | **absent** | 0/5 |
| `StopFailure` | **absent** | 0/4 |
| `PreCompact` | **absent** | 0/1 |

Verdict: **CONFIRMED discrepancy.** Carried by turn/tool events, by none of the
lifecycle/failure events.

**SPEC impact — affects plan-mode detection.** §6 sources "Planning state" from "permission
mode from hook/status-line payload". Two consequences: Muster can only refresh permission mode
on the six turn/tool events that carry it (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
`Stop`, `SubagentStop`, `PermissionRequest` — see the 134-payload matrix above), so it must
**latch** the last known value rather than expect
it on every event; and a turn that ends in `StopFailure` gives no permission-mode update at
all, so a session that fails while in plan mode must not be silently reset to default.
Note also (Q6) that the **status-line payload carries no `permission_mode` either**, so
despite §6's wording the status line is *not* a fallback source for it — hooks are the only
source.

---

## Q4. Does the workspace-trust prompt appear, and how is it dismissed?

**Method.** Launched `claude` interactively in tmux in the fresh scratch repo.

**Observed.** It appears and **blocks startup** — no hooks fire and no status line renders
until answered:

```
 Accessing workspace:
 /Users/damian/Documents/code/Projects/ccc-spike/instances/1/repo
 Quick safety check: Is this a project you created or one you trust? …
 ❯ 1. Yes, I trust this folder
   2. No, exit
 Enter to confirm · Esc to cancel
```

Dismissed with a single bare `tmux -L <socket> send-keys -t s1 Enter` — option 1 is
preselected, so no arrow keys are needed. Trust then persists for that directory; later
launches went straight to the prompt box.

Sharpest detail: **headless `claude -p` runs do not record trust.** I had already run
headless in that exact directory twice, and the interactive launch still prompted. So
"we ran it headless first" is not a way to pre-trust a directory.

**Verdict. CONFIRMED.**

**SPEC impact — direct input to §2.5.** A dashboard-launched session will hit this prompt
on any directory Claude Code hasn't seen, and the session will sit there looking merely
"slow to start" while producing no hooks at all. Muster must detect the trust prompt and
either surface it to the user or answer it deliberately. Auto-answering it is a security
decision, not a papering-over convenience — the brief's warning is well founded, since the
prompt is the only gate before Claude Code can read/edit/execute in that folder.

---

## Q5. First real `SessionStart` payload (via command wrapper)

Captured through the canonical generated rig, 2026-08-16T13:04:14.349Z. Field list is
complete; nothing redacted (no credential-shaped values present):

```json
{
  "cwd": "/Users/damian/Documents/code/Projects/ccc-spike/instances/1/repo",
  "hook_event_name": "SessionStart",
  "model": "claude-haiku-4-5-20251001",
  "session_id": "dc7cc182-509f-454c-818c-1b5a2fdb1658",
  "source": "startup",
  "transcript_path": "/Users/damian/.claude/projects/-Users-damian-Documents-code-Projects-ccc-spike-instances-1-repo/dc7cc182-509f-454c-818c-1b5a2fdb1658.jsonl"
}
```

`source: "startup"` is how Muster distinguishes a new session from `resume`/`clear`/`compact`.

Other observed hook payload shapes, by key list:

- `UserPromptSubmit` — `cwd, hook_event_name, permission_mode, prompt, prompt_id, session_id, transcript_path`
- `Stop` — `background_tasks, cwd, hook_event_name, last_assistant_message, permission_mode, prompt_id, session_crons, session_id, stop_hook_active, transcript_path`
- `StopFailure` — `cwd, error, hook_event_name, last_assistant_message, prompt_id, session_id, transcript_path`
- `SessionEnd` — `cwd, hook_event_name, prompt_id, reason, session_id, transcript_path`

`permission_mode` is present on `UserPromptSubmit` and `Stop`, which is what §6's planning-state
row needs.

---

## Q6. First real status-line payload

Full field list, pre-first-API-response (2026-08-16T13:00:01.538Z). Nothing redacted:

```json
{
  "context_window": {
    "context_window_size": 200000,
    "current_usage": null,
    "remaining_percentage": null,
    "total_input_tokens": 0,
    "total_output_tokens": 0,
    "used_percentage": null
  },
  "cost": {
    "total_api_duration_ms": 0, "total_cost_usd": 0, "total_duration_ms": 33934,
    "total_lines_added": 0, "total_lines_removed": 0
  },
  "cwd": "…/instances/1/repo",
  "exceeds_200k_tokens": false,
  "fast_mode": false,
  "model": { "display_name": "Haiku 4.5", "id": "claude-haiku-4-5-20251001" },
  "output_style": { "name": "default" },
  "session_id": "31f2ce0e-3a2a-4ca2-b21f-113e76118ebb",
  "thinking": { "enabled": true },
  "transcript_path": "/Users/damian/.claude/projects/…/31f2ce0e-….jsonl",
  "version": "2.1.233",
  "workspace": {
    "added_dirs": [], "current_dir": "…/instances/1/repo", "project_dir": "…/instances/1/repo"
  }
}
```

And after the first API response — this is the shape Muster actually consumes:

```json
{
  "context_window": {
    "context_window_size": 200000,
    "current_usage": {
      "cache_creation_input_tokens": 15558, "cache_read_input_tokens": 23318,
      "input_tokens": 10, "output_tokens": 49
    },
    "remaining_percentage": 81,
    "total_input_tokens": 38886, "total_output_tokens": 49,
    "used_percentage": 19
  },
  "rate_limits": {
    "five_hour":  { "resets_at": 1786897200, "used_percentage": 13 },
    "seven_day":  { "resets_at": 1787061600, "used_percentage": 28.000000000000004 }
  },
  "cost": { "total_cost_usd": 0.0337028, "total_api_duration_ms": 1643, "…": "…" }
}
```

**Three corrections for the SPEC:**

1. The weekly bucket is keyed **`seven_day`**, not `weekly` (§2.3 and §7's `usage_sample`
   naming should follow the wire format).
2. **`resets_at` is a Unix epoch integer**, not an RFC3339 string. §7 says "all times UTC" —
   fine, but the adapter must convert.
3. `used_percentage` is a **float** (`28.000000000000004`), not an int. Don't model it as
   an integer percentage.

### When usage data is actually present — and the pooling trap that fooled me

**Corrected after review against the pooled captures from all four spike instances.** My
original conclusion here was wrong. The method error is worth more than the finding, so it
is recorded rather than quietly fixed.

The actual rule is simple: **`rate_limits` is absent until the session's first completed
turn, and present on every post from then on.** `context_window` tracks it exactly.
Verified across instances to 17 consecutive posts in a single session. **No within-session
latching is required.**

What I saw in `capture-1` alone: `rate_limits` present on only 2 of 12 posts. What I
wrongly concluded: that it "rides only on the payload that follows a completed turn, not on
every post for the rest of the session," and that Muster must latch it within a session.

**That was an artifact of pooling posts across many short-lived sessions.** Grouped by
`session_id`, my own capture shows exactly why I couldn't see the truth:

```
31f2ce0e  n=3   -- -- RL
d8cd1ec7  n=3   -- -- RL
b84e562e  n=2   -- --     (never completed a turn)
f182421b  n=2   -- --     (never completed a turn)
dc7cc182  n=2   -- --     (never completed a turn — the SessionStart test)
```

In **every** session, the `RL` post was the *last* post of that session — I restarted or
exited each one almost immediately after its single cheap prompt. A post occurring after
`rate_limits` appeared simply never existed in my data. The 2-of-12 ratio was measuring my
own teardown habits, not Claude Code's behaviour.

**The lesson, which generalises past this field:** status-line and hook payloads must be
analysed **grouped by `session_id`**. Pooled, a field that switches on partway through a
session and stays on is indistinguishable from one that flickers intermittently. Any canary
or E2E assertion (§8) should group before it aggregates.

Note I *had* flagged persistence as UNVERIFIED and named the exact cause ("my sessions ended
too early"). I stated the stronger conclusion anyway, in the same breath. Flagging a gap is
not a licence to assert the conclusion that the gap forbids — the honest version was to
report the observation and stop.

**Verdict: CONFIRMED** — absent before the first completed turn, continuously present after.

**SPEC impact — smaller than I first wrote, but not nil.** §2.2/§2.3 need no within-session
latching. What stands: a session that has not yet completed a turn has **no** usage data at
all, so the gauge and bars must render "unknown" rather than `0` — a `null` here is
emphatically not "0% used", and an empty bar would actively mislead. Cross-session
persistence into `usage_sample` (§7) is still required for the weekly history, which was
always its stated purpose.

### Fields NOT present in the status-line payload

- **No `session_name`.** A session title must come from Muster itself (§7's `session.title`),
  not from Claude Code.
- **No `permission_mode`.** Despite §6 listing "hook/status-line payload" as the source for
  planning state, the status line does not carry it — hooks are the only source, and only
  some of them (see the `permission_mode` discrepancy above).

### Undocumented fields worth recording

Present on the wire, not in the documented shape, and potentially useful to Muster:
`exceeds_200k_tokens`, `fast_mode`, `output_style{name}`, `thinking{enabled}`,
`workspace{added_dirs,current_dir,project_dir}`, and `context_window.context_window_size`.

`workspace.added_dirs` is the interesting one for §4.2's worktree work — it exposes
additional directories added to a session. `context_window_size` (200000) means Muster can
compute its own percentage rather than trusting `used_percentage`, which matters given how
often that field is `null`.

`version: "2.1.233"` on every payload — a free, per-payload version signal that §8's canary
test can assert against directly, rather than shelling out to `claude --version`.

---

## Exit criteria

**Met.** A `claude` session ran in tmux under project-scope isolation, with a real
`SessionStart` payload and 12 status-line payloads captured to
`captures/capture-1.jsonl`, produced by the committed `newspike.sh` rig rather than by
hand-edited settings. `rig/RIG.md` is the reproduction recipe.

## Corrections made after the first write-up

- **`instances/<n>/env.sh` used to export `CLAUDE_CONFIG_DIR`** — the exact variable that
  breaks auth (Q1). Anyone sourcing it and launching would have hit
  `Not logged in · Please run /login` and likely blamed their own setup. Fixed: `env.sh`
  now `unset`s it and exposes the path as the non-exported
  `SPIKE_CONFIG_DIR_UNAUTHENTICATED`. Verified by sourcing the regenerated file
  (`CLAUDE_CONFIG_DIR` prints `<unset>`). Instances stamped before this fix must re-run
  `./rig/newspike.sh <index>`.
- **`rate_limits` — I corrected an error and introduced a different one.** "Entirely absent
  even after a completed turn" was indeed wrong (it was present on 2 of 12 posts in
  `capture-1`, with `five_hour.used_percentage: 13`, `seven_day: 28.0…`, and
  `context_window.used_percentage: 19`). But my replacement claim — that it rides only on
  the post-turn payload and must be latched within a session — was **also wrong**, and for a
  subtler reason: pooling posts across short-lived sessions. Grouped by `session_id` it is a
  clean latch that persists once set. Corrected in full under Q6, including the
  generalisable analysis lesson. Net: the raw observation in `capture-1` was accurate both
  times; the inference drawn from it was not.

## Teardown

tmux server `ccc-spike-1` killed, capture server stopped, no orphaned `claude` processes
left from this spike, `~/.claude/settings.json` verified byte-identical.
