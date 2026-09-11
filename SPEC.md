# Muster — Claude Code session manager · first-pass specification

Name: **Muster** — settled 2026-08-16 (was working title "CCC"; daemon binary `musterd`).
Chosen to be agent-CLI-agnostic: nothing in the name ties it to Claude, so supporting other
agent CLIs later costs no rename.
Produced from the spec interview on 2026-08-16. Companion documents: `interview-notes.md`
(everything discussed that isn't spec material) and `claude-session-manager-handoff.md`
(prior research; treated as input, not decisions — decisions below supersede it).

---

## 1. Overview

### Problem

Damian runs 3–6 concurrent Claude Code sessions in macOS Terminal tabs. The pain, in his
own ranking:

- No way to see at a glance which tab is doing what, in which directory, in what state.
- Forgetting a session's current progress/checkpoint after switching away.
- No visibility of per-session context length (when to restart a session) or account-level
  rate limits (when to back off before hitting 5-hour/weekly caps).
- Multiple sessions on one repo: worktrees are hard to manage, conflicts happen, cleanup
  almost never happens.
- When a PR needs changes: hunting for the right worktree directory, or temporarily
  switching a repo's branch away from current work.

### Target user

Damian, solo. Personal tool, macOS only, single machine, single user, English only.
Motivation is daily utility plus the challenge of building it — not a product.

### Success criteria

A month in, this is true: **"I can keep track of at least 5 sessions: I know overall
account usage (model, hourly, weekly), how much context each session has used, and what
each one is doing. I can easily navigate between them and see where I'm needed."**

The organizing principle: **the user's attention is the scarce resource.** The dashboard
is where work happens — it must show where you're needed, ordered by urgency, and let you
respond without hunting.

### Shape of the tool

A Go daemon plus a web dashboard in its own window (not a browser tab). The dashboard is
the primary workspace: it launches sessions, shows their state, and embeds **interactive
terminal panes** so sessions can be viewed and prompted directly from it. Sessions run
inside tmux, owned by the daemon, so they survive daemon and UI restarts. There are no
notifications by design — the point is to be working *in* the dashboard.

---

## 2. MVP features (must-have)

### 2.1 Session list

- Every session shows: **custom short title**, **state**, **repo + branch/worktree**,
  and **time in current state**.
- States: `Started` (new session, nothing has happened) · `Planning` (plan mode) ·
  `Working` · `Needs-Input` (blocked on a prompt or waiting for the user) · `Failed`
  (error ended the turn) · `Idle` (turn finished). There is deliberately no "Done" —
  Claude Code only knows a turn ended, not that a task is complete; `Idle` plus a
  last-activity line is the honest representation.
- Sorted with Needs-Input first, longest-blocked at the top — this is the rail's *attention*
  mode; the default *manual* mode keeps the user's own order (pinned block + opened order,
  drag-to-reorder). Amended 2026-08-30, plan `order-sidebar`; see §11.
- State is derived from hook events (see §6), never from parsing terminal output.
- Titles use Claude Code's native session titles (`--name`, `/rename`, `SessionStart`
  hook's `sessionTitle`) — Muster does not maintain its own ID→title mapping for the *launch*
  name: the form's `--name` reaches Claude Code unchanged. Amended 2026-09-03, plan
  `ui-text-and-focus` (#10): a **post-launch rename from the dashboard is Muster-owned** —
  a `title_override` on the session row that wins over the status line's `session_name` in
  the wire `title`, cleared by an empty rename to fall back to Claude Code's name; see §11.
  **All three verified working 2026-08-16.** Read the current title from the **status
  line's `session_name`**, which reflects every mechanism live: `--name`
  (`"Spike Title Probe"`), `/rename` (`"Renamed Via Slash"`), and a `SessionStart` hook
  returning `sessionTitle` — nested under `hookSpecificOutput`; the flat form does not work.
  **Caveat:** `/rename` does not itself fire the status line, so a rename is not learned until
  the next status-line-triggering event. Additionally, when no title is set
  Claude Code **auto-generates** one from session content (`"Run echo hello bash command"`),
  so every session has a usable human title with no work from Muster.
  `SessionStart` carries `session_title` in its *input* only when `--name` was passed.

### 2.2 Per-session context gauge

- A context-window-used indicator (percentage) per session, from the status-line
  payload's `context_window.used_percentage`.
- Purpose: know when a session is near the end of its useful life and a fresh one is
  needed. Show clearly (e.g. gauge turns warning-colored past a threshold).
- **Two caveats found 2026-08-16.** (a) `context_window_size` varies by model — a 1M-window
  session at 20% holds five times the tokens of a 200k one at 20%, so a bare percentage is a
  weaker "time to restart" signal than assumed; show absolute `total_input_tokens` alongside
  it. (b) After `/compact` the gauge reads **0%**, which looks like a brand-new session even
  though a summary is still loaded — pair it with a compaction counter, which Muster gets free
  from the `PreCompact` hook.

### 2.3 Account-level usage

- Current model, **5-hour rate-limit bar** and **weekly rate-limit bar** with
  `used_percentage` and `resets_at`, from the status line's `rate_limits` payload.
  Wire format confirmed against 2.1.233: the buckets are keyed `five_hour` and
  **`seven_day`** (not `weekly`), `resets_at` is a **Unix epoch integer** (not an RFC3339
  string), and `used_percentage` is a **float** (not an int).
- v1 implements the **subscription (Pro/Max) source only**, but behind a small usage-source
  interface so API-key/OTel sources can be added later without touching the UI.
- **Second source (2026-08-30, plan `usage-model-bar`):** a third masthead bar shows the
  **per-model weekly limit** (Claude Code's "Fable 5 limit"), which the status line does not
  carry. musterd polls `GET /api/oauth/usage` every 5 min (`-usage-poll`, `0` disables) plus
  an explicit ↻ refresh, using the Claude Code OAuth token read from the Keychain. The model
  shown is user-selectable (`prefs.usageModel`, default `"Fable"`); a failed poll keeps the
  last-good bar and marks it stale (`modelScopedError`). No history is persisted for this
  source beyond the last-good list.
- Samples are persisted (SQLite) so the weekly picture is real history, not just the
  live number.
- Known limitation, accepted: the entire `rate_limits` **key is absent** — not empty —
  until the first API response of a session (measured: first 2 of 12 status-line posts),
  and absent entirely on API-key auth. Over the same window
  `context_window.used_percentage`, `remaining_percentage` and `current_usage` are `null`.
  A null is **not** "0% used": render "unknown", not an empty gauge.

### 2.4 Interactive terminal panes

- Full terminal for each session, embedded in the dashboard: view live output, click,
  type, prompt — not a read-only snapshot. (Decision: skipping the read-only intermediate
  step; going straight to interactive because upgrading later would be an architectural
  rework.)
- Implementation: sessions run in tmux **windows** created by the daemon — one window per
  session, one pane per window. (Precision matters: sizing is a *window*-level operation, and
  pane-level vocabulary is what produced the `resize-pane` error below.) The daemon bridges a
  PTY attached to tmux over WebSocket; the UI renders with xterm.js.
- The dashboard does not restyle anything inside a pane — Claude Code draws its own TUI.
  The pane's *ground and foreground* (the frame, not the contents) follow the theme family
  Claude Code itself is drawing for — read from its `theme` setting, never set — regardless
  of which Muster theme is active (2026-09-02 changelog, plan `new-ui-design-colors`).
- Sizing (all measured 2026-08-16). **`resize-pane` is wrong** — it exits 0 and silently does
  nothing on a single-pane window. Drive **both** `pty.Setsize` *and* `tmux resize-window`,
  in that order: the first sizes the region the tmux client paints into, the second sizes the
  window the application lays out against. Either alone clips or pads. Use
  `window-size manual` (which `resize-window` latches automatically); attach any external
  viewer with `-r` or `-f ignore-size` so it can't resize the session.
- **`window-size` is a per-window option, not global.** `resize-window -x/-y` latches that
  window to `manual`, and a global `set -g window-size <mode>` will **not** override a latched
  window — only `setw -t <window> …` or `resize-window -A` clears it. Reconcile logic that
  assumes the global option is in force will be wrong.
- **Attach model: shared.** One `tmux attach-session` under one daemon-owned PTY, with all
  browser clients fanned out from that single byte stream, so tmux only ever sees one client
  and its "size to the smallest attached client" rule never fires.
- **One geometry per session**, set by the dashboard pane that actually reads it (debounce
  resizes ~100 ms). The session list must **not** render a second *live* client at a smaller
  size — a live narrow thumbnail beside a live wide pane silently loses content. Use a static
  last-known snapshot in the list instead.
- **tmux owns scrollback**, not xterm.js: tmux drives the alt screen and repaints whole
  screens, so xterm accumulates none. Set `scrollback: 0` explicitly; map wheel events into
  tmux copy-mode if scrollback is wanted later.

### 2.5 Session launch & lifecycle

- Sessions are **launched from the dashboard**: pick a directory (from a remembered repo
  registry), optionally a title, and the daemon spawns `claude` in a new tmux window.
  All sessions live in one place — this replaces the Terminal-tabs habit.
- Launching outside Muster is out of scope: macOS gives no access to another process's PTY,
  so Muster can only fully manage sessions it started. (Constraint understood and accepted.)
- **Workspace-trust prompt (confirmed 2026-08-16).** On the first launch in any directory
  Claude Code hasn't seen, a trust prompt appears and **blocks startup**: no hooks fire and
  no status line renders until it is answered, so the session looks merely "slow to start"
  while emitting nothing. Headless `claude -p` runs do **not** record trust, so pre-running
  headless is not a way to pre-trust a directory. Muster must detect this state and either
  surface it or answer it deliberately — auto-answering is a security decision, since the
  prompt is the only gate before Claude Code can read/edit/execute in that folder.
- **Config scope (confirmed 2026-08-16; refined 2026-08-20).** Per-repo config goes in
  project-scoped `<repo>/.claude/settings.local.json` — the gitignored local file honors
  `hooks`, `statusLine` and `allowedHttpHookUrls` on its own (probed 2026-08-20, 2.1.237),
  and using it keeps Muster's ingest token out of committable files. Plain
  `settings.json` works identically (2026-08-16) but risks being committed.
  `CLAUDE_CONFIG_DIR` is **not** usable — it breaks subscription OAuth and forces a fresh
  login.
- **Reconcile on daemon start — must be liveness-driven** (confirmed 2026-08-16): poll
  **tmux pane existence as the authority** on whether a session is alive, treating hook
  events as enrichment only. `SessionEnd` is a hint, never a guarantee — a `kill -9`'d
  session emits nothing at all, and `reason` is `other` for both a killed pane and an
  ordinary termination, so it cannot distinguish crash from clean shutdown. For each known
  session: pane alive → reattach and resume tracking; pane dead but session known →
  offer/perform `claude --resume <session-id>` in a fresh pane. Persistence isn't just state
  display; it's session recovery.

### 2.6 Local security

- Daemon binds `127.0.0.1` only.
- A random token generated at first run; the launcher opens the dashboard via a one-time
  tokenized URL, the daemon sets a cookie, and all HTTP/WS requests without it are
  rejected. Accepted residual risk: same-user malware can read the token file — but that
  attacker can read Claude credentials directly anyway.
- musterd reads the Claude Code OAuth token from the macOS Keychain item
  `Claude Code-credentials` **read-only** (via `security find-generic-password`); it never
  writes, refreshes, logs, persists or forwards the token. Threat model unchanged: the
  same-user attacker above already had that item.

---

## 3. Out of scope for v1 (explicit non-goals)

- **Notifications** (macOS banners etc.) — the dashboard is the alert surface.
- **Cost/spend tracking.**
- **A "lead" orchestrator chat session** in the dashboard (Claude Code's native
  cross-session messaging already exists for this).
- **Real diff review** (inline comments fed back to the agent). Placeholder instead: a
  button that runs `code <worktree>` to review in VSCode. Explicitly a hack.
- **Ship flow** (PR create/merge/archive buttons, CI status).
- **Session forking / pause-checkout**, and **browsable history of dead sessions**
  (future feature).
- **Shared MCP servers across sessions** (e.g. one Grafana-in-Docker MCP instead of one
  per session) — real waste, but an MCP proxy is a project of its own. Captured as future.
- **Containers as isolation** — never: not everything runs cleanly in them, and they eat
  resources.
- **Resource gauges (CPU/RAM)** — never.
- **Second machine / distributed sessions** — never.
- Accessibility, i18n, multi-user, non-macOS platforms. **One bounded exception (2026-09-02,
  plan `new-ui-design-colors`):** the dashboard's own chrome is held to a WCAG AA contrast
  bar (4.5:1 text, 3:1 non-text UI) across every built-in theme, because it fell out of the
  theme-token work for free once a script measured the pairs. Screen-reader, keyboard-audit
  and i18n work stay non-goals.

---

## 4. Stretch goals / roadmap (v1.x, in rough priority order)

### 4.1 Plan-mode flow (nice-to-have, high interest)

Context: Damian works mostly in auto-accept mode, so ordinary permission prompts are
rare. The friction is plan mode: research prompts interrupt before the plan exists, and
after approval the run needs babysitting.

- **Auto-accept while planning**: a per-session toggle; while the session's permission
  mode is `plan`, a `PermissionRequest` hook auto-allows research prompts (web fetches,
  read-only bash) so the plan arrives uninterrupted. This does not exist in Claude Code
  today.
- **Plan approval from the dashboard**: the plan surfaces in Muster; approve/reject there.
  **Mechanism confirmed 2026-08-16:** detect readiness via `PreToolUse` with
  `tool_name: "ExitPlanMode"`, then answer the `PermissionRequest` on that same tool call.
  Note it **races** the terminal prompt rather than blocking it — the prompt appears
  immediately and concurrently, whoever answers first wins, and a late hook decision
  retracts the on-screen prompt. That race is what makes failure graceful.
- ~~**Auto-accept on approval**~~ — **already native.** Approving an `ExitPlanMode` call
  flips the session from `plan` to `acceptEdits` on its own; nothing to build.
- Architectural note, **corrected 2026-08-16**: `PermissionRequest` hooks do **not** block
  the prompt — they race it. The *tool* is held until something decides, but the terminal
  prompt is displayed immediately and concurrently. The per-hook `timeout` is honored, is in
  seconds, and is enforced by aborting the HTTP request; timeout, HTTP 500 and empty-200 all
  degrade benignly to stock behaviour. So graceful degradation is free — but Muster must handle
  losing the race to the user, and should detect its own timeouts via request-context
  cancellation.

### 4.2 Worktree manager (nice-to-have)

- Create/assign/remove worktrees per repo; show which session owns which tree; show
  dirty/clean and ahead/behind; surface abandoned trees for cleanup.
- **Setup scripts are must-have within this feature**: on worktree creation, copy
  untracked `.env` files, run install steps (per-repo configurable). Without this,
  worktrees are technically present but practically unusable.
- Prefer Claude Code's native `--worktree` and `WorktreeCreate`/`WorktreeRemove` hooks
  over reimplementing.

### 4.3 Start from PR / issue (nice-to-have)

- "PR #123 needs changes" → one click → session on that branch in a worktree, with PR
  context. Directly addresses the PR-changes pain from §1.
- Implementation via **`gh` CLI** (preferred over the GitHub MCP server — the MCP
  doesn't cover everything needed).

### 4.4 Basic permissions UI (nice-to-have)

- **User-level scope only**: rules apply to all projects at once, no per-project scoping.
- Deterministic JSON merge into settings with atomic write — never an LLM editing
  `settings.json`. Claude Code's file watcher picks changes up live; no restarts.

### 4.5 Auto-accept toggle per session (cheap, with 4.1)

- Visible switch/indicator for each session's permission mode.
- **Caveat found 2026-08-16:** a user cycling modes manually with Shift+Tab fires **no hook
  and no status-line update** — the change is invisible to Muster. The indicator will be stale
  until the next hook that happens to carry `permission_mode`. Seed it from Muster's own launch
  flag, correct it on the first `UserPromptSubmit`, and don't present it as authoritative.

### 4.6 Futures kept alive by architecture (maybe someday)

- **Phone/remote access** — the reason the frontend is a browser-served web app. Would
  require real auth (or Tailscale) — not built now.
- **Other agent CLIs** (Codex, Gemini, …) — maybe. The `internal/claudecode` adapter
  boundary (§7) is the only concession; no generic plugin layer.
- **Shared MCP proxy**, **browsable dead-session history**, **real diff review** — parked.

---

## 5. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Daemon | **Go** | Damian's primary language; right for a long-running daemon. Rust considered, rejected for speed-of-delivery. |
| Terminal backing | **tmux** | Sessions survive daemon crashes; enumerate/read/write via `list-panes`, `capture-pane`, `send-keys`; already a terminal emulator. **Corrected 2026-08-16:** the "skip `-CC` unless polling proves too slow" premise is stale — the PTY attach is push-based, so there is no polling loop. `capture-pane` remains valuable as a **test oracle** (it made every spike assertion objective), not as the display path. |
| Frontend | **Web app served by the daemon**, WebSocket transport, opened as a standalone app window (e.g. Chrome `--app=`) | Lowest cost; one codebase; keeps phone-maybe alive for free; own-window requirement met. Wails wrapper is a later cosmetic option (~thin shell). Native Go GUI (Gio) and Electron rejected. |
| Terminal rendering | **xterm.js** (`@xterm/xterm`) | Mature emulator; selection, search, scrollback, links for free. Building a canvas renderer over a Go-side VT was considered and rejected for v1. |
| Storage | **SQLite** via `modernc.org/sqlite` (pure Go, no cgo), WAL mode | Widely used, extensible, zero ops. |
| DB access | `database/sql` + hand-written SQL; embedded numbered `.sql` migrations | Decided 2026-08-16. Six small tables don't justify an ORM (GORM familiar but heavy); queries stay visible. |
| HTTP server | **stdlib `net/http`** (Go 1.22+ method/path routing) | Decided 2026-08-16. A handful of endpoints; Echo considered (familiar from MDR) but adds a tree for no need. |
| WebSocket | **`coder/websocket`** | Decided 2026-08-16. Stdlib has none (`x/net/websocket` is deprecated — no pings/continuation frames); Echo just wraps third-party libs. Context-first API and a `net.Conn` adapter suit the PTY bridge; no transitive deps. |
| Logging | **zerolog** | Decided 2026-08-16. Damian's structured logger of habit; `slog` considered, familiarity won. |
| Git ops | `os/exec` + git CLI (and `gh` for GitHub) | Matches Claude Code's own behavior; avoids go-git drift. |
| Misc | `creack/pty`, `fsnotify` | PTY bridge; watch transcripts/settings. |
| Self-update | `aead.dev/minisign` | Decided 2026-09-10 (plan `auto-update`). Offline verification of the release's minisign-signed `checksums.txt` against a compiled-in public key; pure Go, both signature modes. Hand-rolled Ed25519 + BLAKE2b considered — same dependency count, more code. |

Layout (settled 2026-08-16): `cmd/musterd/` (daemon), `web/` (frontend),
`internal/claudecode/` (adapter, §7), later `cmd/muster-desktop/` if Wails happens.
Amended from the original `musterd/`-at-root suggestion so the daemon and the possible
desktop shell sit under one conventional `cmd/` tree.

---

## 6. Data sources & state derivation

Ground rules from research: **hooks for state, `capture-pane`/PTY for display** — never
parse ANSI output to infer state. The transcript JSONL lags the live session — never
treat it as current state.

| Signal | Source |
|---|---|
| Session lifecycle | `SessionStart` hook (→ Started), `Stop` (→ Idle), `Notification` matchers `permission_prompt` / `idle_prompt` (→ Needs-Input), `TeammateIdle`, `TaskCompleted` |
| Planning state | `permission_mode` from **hook payloads only** — it is absent from the status line, and absent from `SessionStart`/`StopFailure`/`SessionEnd`/`Notification`. Carry it forward from the last hook that reported it |
| Failed | **`StopFailure` hook** with a typed `error` field (`rate_limit`, `overloaded`, `authentication_failed`, `server_error`, `max_output_tokens`, …) — confirmed against 2.1.233 |
| Context %, model, rate limits, cost fields | status-line script POSTs its stdin JSON to the daemon (~10 lines of shell) |
| Hook transport | **HTTP hooks** (`type:"http"`, registered via `allowedHttpHookUrls`) — **except `SessionStart`, which is silently never delivered over HTTP and needs a `type:"command"` wrapper** (see `spikes/FINDINGS.md` §1) |
| Terminal content | tmux attach over PTY→WebSocket |
| Historical/forensic only | `~/.claude/projects/*/<session-id>.jsonl`, `~/.claude/stats-cache.json` |

Gotchas to honor, all measured 2026-08-16 (`spikes/FINDINGS.md` §5c–5d):

- Hooks interleave across concurrent tool calls. **There are no timestamps or sequence
  numbers on the wire**, so "last-write-wins with timestamps" is not implementable: assign a
  **monotonic per-session `seq` at ingest** and make the state machine order-tolerant.
  `prompt_id` and `tool_use_id` are the only correlation keys.
- Hook delivery is **best-effort, at-most-once, fire-and-forget**. A dead receiver means the
  event is dropped permanently — no blocking, no retry, and `PreToolUse` fails open. Nothing
  is replayed on restart, though the stream self-heals for subsequent events. **Design for
  loss, never completeness.**
- A *slow* receiver is worse than a dead one: each hook stalls for its full `timeout`,
  additively per hook. **Use a 1–2 s timeout, not 5.** Return `200` immediately and do all
  work asynchronously.
- While the daemon is down, command-wrapped hooks exit 0 silently when the daemon is
  unreachable (m4-hook-lifetime, 2026-08-27), so panes stay clean; the dashboard banner
  is the only daemon-down surface.
- A `PermissionRequest` HTTP hook that times out renders no decision — confirmed that
  Claude Code falls back to its own prompt gracefully.

---

## 7. Data model sketch

SQLite; all times UTC.

- **repo** — `id`, `path`, `name`, `default_branch`, per-repo settings (later: setup
  script, env-copy globs).
- **worktree** — `id`, `repo_id`, `path`, `branch`, `created_at`, `removed_at` (v1.x).
- **session** — **identity is `tmux_target`, not the Claude session id** (corrected
  2026-08-16: `/clear` starts a *new* Claude `session_id` in the same pane, so one pane emits
  several over its life). Columns: `id` (Muster-assigned), `tmux_target`, `claude_session_id`
  (mutable attribute), `title`, `repo_id`/`worktree_id` (nullable), `cwd`, `state`,
  `state_since`, `permission_mode`, `model`, `context_pct`, `created_at`, `ended_at`.
- **event** — append-only hook-event log: `session_id`, `type`, `payload` (JSON),
  `received_at`, plus a daemon-assigned monotonic **`seq`** and first-class `prompt_id` /
  `tool_use_id` columns — hook payloads carry **no timestamp or sequence of their own**, and
  those two ids are the only correlation keys available. Feeds the state machine; is the
  audit trail; enables the future dead-session history without schema change.
- **usage_sample** — `at`, `model`, `five_hour_pct`, `five_hour_resets_at`,
  `seven_day_pct`, `seven_day_resets_at`, `source` (`subscription` now; `api`/`otel` later).
  Naming follows the wire format (`seven_day`, not `weekly`); `resets_at` arrives as a Unix
  epoch integer and percentages as floats. **Write rate:** status-line posts are
  event-driven and arrive in close pairs ~435 ms apart, so de-duplicate before inserting.
  An idle session posts nothing at all unless `statusLine.refreshInterval` is set — and that
  value is in **seconds**, not milliseconds.
- **config/kv** — auth token, settings.

The daemon holds live state in memory and treats SQLite as system of record for
restarts/reconcile; WebSocket fanout pushes deltas to the UI.

---

## 8. Non-functional requirements

- **Scale**: 3–6 concurrent sessions, single user, localhost. No perf engineering —
  ~6 panes at 80×24 is trivial; push terminal deltas, don't pre-optimize.
- **Platform**: macOS only. GUI in its own window; mouse-first.
- **Availability**: daemon survives UI closes; sessions (tmux) survive daemon crashes;
  daemon reconciles and can `--resume` dead sessions on start.
- **Security**: localhost bind + token cookie (§2.6). No auth beyond that in v1. Keep
  secrets out of any config Muster writes; never log hook payloads containing prompts to
  anywhere world-readable.
- **Testing bar**: **functional E2E always** (drive a real daemon + real `claude`
  session in a scratch repo), unit tests for specific logic (state machine, JSON merge,
  reconcile). A **canary E2E** asserts Claude Code's hook/status-line payloads still
  carry the fields Muster needs — run before adopting any new Claude Code version.
- **Dependency posture** (rewritten 2026-09-10, plan `version-claude-interface`; was "pin
  the version, disable auto-update"): detect and classify the installed Claude Code against
  the canary-verified range (`internal/claudecode/observed_versions.txt`, floor = min,
  ceiling = max); warn on both sides (`below` names the remedy, `above` says untested),
  never refuse to start, never disable auto-update; a green `make canary` on a version
  outside the range extends it automatically. Versions strictly inside the range are
  inferred, not individually run. All Claude-Code-format knowledge lives in
  `internal/claudecode/` so breakage is a one-package fix. Accepted: interfaces are
  unstable and undocumented; when they break, the answer is "fix Muster that week" — the
  red-canary ritual in `docs/claude-code-versions.md`.
- **Licensing/repo**: **MIT** (`LICENSE`, decided 2026-09-04). **Repo public since
  2026-09-10** (`docs/go-public.md`); issues accepted, PRs not (`CONTRIBUTING.md`).

---

## 9. Open questions & risks

1. ~~**Naming**~~ — **RESOLVED (2026-08-16): Muster.** Chosen against two constraints: no
   collision with an existing product or trademark, and no "Claude"/"cc" in the name, since
   a possible future state manages other agent CLIs (§4.6). Rejected on those grounds:
   `tower`, `wheelhouse`, `belfry`, `roost`, `pitwall`, `ccmux`. Rationale in
   `interview-notes.md`. Daemon binary is `musterd`; module is `github.com/Zalaras/muster`.
2. ~~**Launch/worktree data-layer design**~~ — **RESOLVED (2026-08-16)** by the design
   session; full flows in `docs/design/ux-flows.md`. **Hybrid MRU + promotion**: every
   launch auto-remembers its directory as a `repo` row, and a row becomes "promoted" only
   when it carries per-repo config (§4.2's setup script / env globs) — no upfront
   registration step. **No worktree creation in v1**: sessions launch into the checkout
   picked, `worktree_id` stays NULL, and the only worktree work v1 does is *recognizing*
   one it was pointed at (`git rev-parse --git-common-dir` ≠ `--git-dir`) so the session
   list shows repo/branch truthfully. §4.2 then adds one field to the launch form and
   repaints no table.
3. ~~**Failed-state detection**~~ — **RESOLVED (2026-08-16).** The `StopFailure` hook fires
   with a typed `error` field. See `spikes/FINDINGS.md` §3. The last sub-question — whether
   `Stop` *also* fires alongside `StopFailure` — was settled by the H2 probe (2026-08-16):
   they are **mutually exclusive per prompt** (`Stop` → `Idle`, `StopFailure` → `Failed`,
   never both), verified across startup, first-API-call and genuinely mid-turn failures.
   Caveat for the state machine: a killed process emits *neither* (only `SessionEnd`), so
   not every prompt is closed by a Stop-family event.
4. **Plan-approval mechanics (v1.x)** — **largely RESOLVED (2026-08-16).** "Plan is ready"
   is `PreToolUse` with `tool_name: "ExitPlanMode"`; the approval decision point is a
   blocking `PermissionRequest` on the same tool, so the dashboard can answer it; and
   approval flips the session to `acceptEdits` **natively**, so §4.1's "auto-accept on
   approval" needs no work. Still open: the `PermissionRequest` timeout value and its
   degrade-to-terminal-prompt path, and whether "auto-accept while planning" can
   distinguish read-only research prompts from anything riskier.
5. ~~**tmux ↔ xterm.js sizing**~~ — **RESOLVED (2026-08-16)** by the full multi-client
   matrix. Answer: **one renderer size per session**, structurally enforced by the shared-PTY
   model. The session's geometry must be **≤ the smallest grid currently rendering it live**,
   because a wider grid degrades gracefully while a narrower one silently loses content.
   Consequence for §2.1: the session list must **not** open a second live client at a smaller
   size — use a static snapshot. See `spikes/FINDINGS.md` §7.
6. **Usage-source interface** — ~~how much shape to give the pluggable usage source now
   without building the API/OTel sources~~ **Resolved 2026-08-23** (m3-gauges planning):
   a neutral `Sample` type + one aggregator (`internal/usage`); no Go interface type
   until a second source exists. A second source landed 2026-08-30 (`usage-model-bar`) as a
   second concrete holder (`ModelScoped`), still no interface — see changelog. Wire seam (`usage.source`) settled 2026-08-20.
7. **Risk: Claude Code interface churn** — mitigated (verified range/canary/one-package
   boundary) but not removable; standing tax on the project.
8. **Risk: hook delivery gaps** — hooks can be missed (daemon down at event time);
   reconcile must tolerate stale state, and `Started`/`Idle` inference needs to be
   self-healing rather than assuming a perfect event stream.
9. **Risk: rate-limit data blind spots** — empty until first response per session;
   absent on API-key auth. UI must render "unknown" honestly.

## 10. Suggested build order

Each milestone ends with something Damian actually uses day-to-day.

1. **M0 — Skeleton.** `musterd` daemon: HTTP+WS server, token auth, SQLite, `internal/claudecode`
   package stub, web shell that connects. E2E harness runs a scratch daemon.
2. **M1 — Sessions exist.** Launch `claude` in tmux from the dashboard (directory picker
   + title); `SessionStart`/`Stop`/`Notification` HTTP hooks ingested; state machine +
   session list UI (title, state, repo/branch, time-in-state, sort by blocked-longest).
   *Usable: replaces "which tab was that" today.*
3. **M2 — Terminal panes.** PTY↔WebSocket bridge to tmux, xterm.js panes, click-to-focus
   from the session list, typing works. *Usable: Terminal tabs retired.*
4. **M3 — Gauges.** Status-line POST ingestion; per-session context gauge; account
   usage bars (5-hour/weekly) + sample history. *Usable: the success criteria (§1) are met.*
5. **M4 — Durability.** Reconcile on daemon start; `--resume` for dead sessions; canary
   E2E; version pinning documented. **← v1 complete.**
6. **M5+ (v1.x, re-rank when reached):** plan-mode flow (§4.1) → worktree manager with
   setup scripts (§4.2) → start-from-PR/issue (§4.3) → permissions UI (§4.4) →
   `code <worktree>` button (anytime, trivial).

Before M0: a separate session sets up the AI build harness (agents, skills) — explicitly
not part of this spec.

---

## 11. Changelog

### 2026-08-16 — design session (next-steps item 4)

UX flows settled before M1/M2 UI work. Authority for interface behaviour is now
`docs/design/ux-flows.md`; three visual directions to choose between are in
`docs/design/mockups/`. Decisions:

- **§9 Q2 resolved** — hybrid MRU + promotion for directory memory; no worktree creation
  in v1, but v1 *recognizes* a worktree it is pointed at. See Q2 above.
- **§2.5 launch form** — directory + optional title + **model** + **starting permission
  mode**. Asking for the mode at launch is the only moment Muster can honestly seed
  `permission_mode`, since manual Shift+Tab changes fire no hook and no status-line update
  (§4.5). The seed is corrected by the first `UserPromptSubmit` that carries the field and
  is always rendered as *last known*, never authoritative.
- **§2.5 trust prompt** — surfaced, never auto-answered (it is the only gate before Claude
  Code can read/edit/execute in a folder). Detected by absence plus Muster's own records —
  a directory with no prior `repo` row is expected to block; otherwise no `SessionStart`
  within ~10 s shows "no signal yet". Never by reading the pane. Open probe candidate:
  whether Claude Code records per-directory trust somewhere readable.
- **§2.1 / §2.4 layout** — **rail + one focused pane**. Exactly one live client per
  session at a time, which is what the measured sizing constraint requires; rail cards are
  static snapshots. Account usage lives in a persistent masthead, not behind a tab. The
  mockup's tabbed views and its lead-session chat panel are dropped.
- **§2.1 sort order** — Needs-Input (longest-blocked first) → Failed (most recent) →
  Planning → Working → Started → Idle (longest-idle first).
- **§2.2 / §2.3 honesty** — an unknown gauge renders as the word *unknown* with **no
  track drawn at all**; a 0%-filled track reads as "0% used" and is forbidden.
- **Visual direction chosen: A, "instrument"** — dark, dense, mono metadata, state as a
  coloured rail stripe. Rules in `docs/design/design-system.md`, now `review-work`'s
  design checklist. **Type: system stacks only** — no web fonts, no CDN, no vendored font
  binaries (localhost app, deliberately small dep tree). **Attention ribbon deferred
  post-v1**; the `event` table already carries what it needs, so it costs no schema change.
- **§2.4 — the dashboard has two peer views**, both part of direction A: **Focus** (rail +
  one live pane, `mockups/a-instrument.html`) and **Tiles** (grid + snapshot strip,
  `mockups/d-tiled.html`). Switched from the masthead or **⌘\\**, and the choice persists
  across reloads and daemon restarts. Masthead, state colours, attention ordering and
  degraded states are identical across both by rule. Only the build order differs: Focus in
  M1, Tiles with the PTY bridge in M2 — and M1 lays the masthead out with the switcher slot
  already present so adding it moves nothing.
  In Tiles, live tiles are the top N by attention and everything else is a snapshot card;
  the density control (2×2 / 3×2) changes every tile's geometry. This applies §9 Q5's
  one-live-client-per-session law rather than excepting itself from it: many sessions may be
  live at once, but no *single* session may be live on two surfaces at two widths, so
  switching views **moves** geometry ownership instead of duplicating it (a real resize —
  debounce it, and touch only sessions whose live surface changed).

### 2026-08-16 — stack pattern decisions (AI-harness session)

Chosen with Damian so the build agents inherit settled patterns rather than inventing them
mid-pipeline (details in `docs/conventions.md`):

- **§5** — HTTP: stdlib `net/http`; WebSocket: `coder/websocket` (stdlib has no real WS,
  `x/net/websocket` deprecated, Echo wraps third-party anyway); logging: **zerolog**;
  DB access: `database/sql` + hand-written SQL with embedded numbered migrations.
- Web unit tests: **Vitest** to be added alongside Playwright (harness session H1).

### 2026-08-16 — step-1 spike corrections (validated against Claude Code 2.1.233)

Applied from `spikes/FINDINGS.md`; raw evidence in `../ccc-spike/captures/`. Overall verdict
was **GO** — every load-bearing assumption held. Confirmed corrections applied to this spec:

- **§6** — `SessionStart` is **silently never delivered** over `type:"http"` and needs a
  `type:"command"` wrapper. All other events work over HTTP. (Material: §6 previously said
  "no wrapper scripts".)
- **§6** — `Failed` state mechanism resolved: the `StopFailure` hook with a typed `error`.
- **§6** — `permission_mode` is on hook payloads **only**, not the status line, and not on
  all hooks.
- **§2.1** — title source corrected to the status line's `session_name`, which Claude Code
  auto-generates when `--name` isn't given.
- **§2.3** — wire format: `seven_day` (not `weekly`), `resets_at` is a Unix epoch int,
  `used_percentage` is a float. `rate_limits` is an *absent key*, and context fields are
  `null`, until the first API response.
- **§2.4** — `resize-pane` was the wrong primitive; use `resize-window` with
  `window-size manual` or `pty.Setsize`. Shared-attach model added.
- **§2.5** — added the workspace-trust prompt behaviour and the project-scope config
  constraint (`CLAUDE_CONFIG_DIR` breaks subscription OAuth).
- **§6** — `StopFailure` **replaces** `Stop` (they never both fire), so the state machine is
  unambiguous.
- **§4.1 / §9 Q4** — plan-readiness is observable (`PreToolUse` on `ExitPlanMode`), remote
  approval is mechanically available (blocking `PermissionRequest` on the same call), and
  auto-accept-on-approval turns out to be native behaviour.
- **§6 / §9 risk 8** — hook delivery measured: best-effort, at-most-once, no retry, no
  replay; slow receivers tax every turn per-hook; no timestamps on the wire, so ordering
  needs a daemon-assigned `seq`.
- **§7** — session identity moved to `tmux_target` (a `/clear` starts a new Claude
  `session_id` in the same pane); `event` gains `seq`, `prompt_id`, `tool_use_id`.
- **§2.5** — reconcile must be liveness-driven via tmux pane existence; `SessionEnd` is a
  hint (absent entirely on `kill -9`).
- **§2.2** — context percentage needs `context_window_size` context and a compaction
  companion signal.
- **§2.4 / §9 Q5** — resolved by the full multi-client matrix: shared PTY, `window-size
  manual`, one geometry per session, and **both** `pty.Setsize` and `resize-window` (never
  `resize-pane`). Session list must not open a second live client at a smaller size.
- **§4.1 / §4.5** — `PermissionRequest` races the terminal prompt rather than blocking it;
  manual Shift+Tab mode changes are invisible to hooks and the status line.
- **§5** — the "skip `-CC` unless polling proves too slow" premise is stale (the PTY attach is
  push-based); `capture-pane` is a test oracle, not the display path. `window-size` is a
  per-window option that `resize-window` latches.
- **§2.4** — "panes" → **windows** (one window per session); sizing is window-level.
- **§2.1** — `sessionTitle` must be returned nested under `hookSpecificOutput`; `/rename` does
  not itself fire the status line.
- **§9** — Q3, Q4, Q5 and risk 8 all resolved. Remaining gaps are listed in
  `spikes/FINDINGS.md`; none block M0. The same `resize-pane` falsification was also marked in
  `claude-session-manager-handoff.md`, which carried the original error.

Items deliberately left open are listed at the end of `spikes/FINDINGS.md`. Two should be
settled before the work they gate: whether `Stop` fires alongside `StopFailure` (before the
state machine), and the multi-client sizing matrix (before M2).

### 2026-08-16 — H2 interface-probe session (validated against Claude Code 2.1.233)

The spike rig was ported into this repo (`test/rig/`: `newprobe.sh`, `capture/`,
`failproxy/`) and encoded as the `/interface-probe` skill; `spikes/RIG.md` is now
historical. Acceptance probe results, evidence in `test/rig/captures/capture-1.jsonl`:

- **§9 Q3 fully closed** — `Stop` and `StopFailure` are **mutually exclusive per prompt**.
  Verified with both hooks registered across 7 failed turns (3× `authentication_failed`
  at startup, 3× injected HTTP 400 on the first API call, 1× genuinely mid-turn after a
  completed tool call) and 3 successful turns: every failure emitted `StopFailure` only,
  every success `Stop` only. Note the earlier docs disagreed with each other (§11 said
  "replaces", §9 Q3 said open) — both now settled on "replaces".
- **State-machine caveat** — a session killed mid-turn (SIGTERM during API retry) emitted
  `SessionEnd` (`reason: "other"`) and **neither** `Stop` nor `StopFailure`. Turn closure
  is not guaranteed; pane liveness stays the fallback authority (§2.5).
- **§2.5 reconcile unblocked** — `--resume` verified: `SessionStart` fires with
  `source: "resume"` and the **same** `session_id` and `transcript_path` as the original
  session, so the daemon can re-bind a resumed session (and its title, which is
  Muster-side state) to the new pane deterministically.
- **`StopFailure.error` mapping is not pass-through** — an injected 400 with an
  Anthropic-shaped `invalid_request_error` body surfaced as `error: "unknown"`, not
  `invalid_request`. Don't build UI that assumes the taxonomy maps 1:1 from API errors.
  Third observed value (after `authentication_failed`, `server_error`).
- **Probe mechanics** — Claude Code retries HTTP 500 with backoff (~4 attempts / 90 s
  observed), so induce failures with a non-retryable 400. Headless `claude -p` fires the
  full hook sequence including command-wrapped `SessionStart`, so most wire-format
  probes need no tmux at all.

### 2026-08-20 — daemon↔UI protocol v1 (M0 kickoff)

`docs/protocol.md` written before any daemon code — it is now the wire contract the build
pipeline holds agents to (CLAUDE.md already names it). Decisions taken there, beyond what
this spec and `ux-flows.md` had fixed:

- **Commands over HTTP; the state WebSocket is push-only** (server→client). The only
  client→server WS traffic in v1 is terminal input/resize on per-session terminal sockets.
- **Two tokens**: the §2.6 UI token (exchanged at `GET /auth` for a `SameSite=Strict`
  cookie) plus a separate **ingest token** embedded in the hook/status-line URL path, so a
  stray local process or webpage can't POST forged events.
- **Event↔session binding via an envelope**: the command-wrapped `SessionStart` and
  status-line posts wrap their stdin payload with `$MUSTER_SESSION` (set on the pane at
  spawn) and `$TMUX_PANE`, establishing the `claude session_id → session` map; raw HTTP
  hooks then route by `session_id` and are **never guessed at by `cwd`**. Needs one cheap
  probe before M1 (wrapper env visibility — expected, unmeasured).
- **Liveness is an orthogonal `alive` flag**, not a seventh state; a resumed session
  re-enters as `Idle`; `/clear` (new `session_id` on a known pane) resets the context
  gauge and compaction counter but not session identity.
- **Ordering guards** for the unordered stream: events apply in ingest-`seq` order,
  Stop-family events close their `prompt_id`, closed prompts never reopen, and an unseen
  `prompt_id` starts a turn even when `UserPromptSubmit` was lost.
- Whole-object session upserts; display sorting is client-side; terminal-socket takeover
  (close code 4000) enforces the one-live-client law server-side.

New open item (TODO "Open questions"): where per-directory config is written — the ingest
token inside a committed `.claude/settings.json` would leak into a repo, and
`allowedHttpHookUrls` at `settings.local.json` scope is unmeasured. Probe before M1.

### 2026-08-20 — protocol-binding probe (against 2.1.237)

`/interface-probe` closed the three questions `docs/protocol.md` v1 raised (evidence
`test/rig/captures/capture-3.jsonl`; note the installed binary has auto-updated to
2.1.237, past the 2.1.233 pin — the designed drift, to be adopted via the pin ritual):

- **Envelope binding measured**: hook command wrappers and the status-line script inherit
  the pane environment (`$TMUX_PANE` and `tmux new-window -e`-injected `MUSTER_SESSION`),
  headless and interactive — protocol §4.2 rests on fact, not expectation.
- **§2.5 config scope refined**: Muster writes `.claude/settings.local.json` (verified
  sufficient alone; gitignored by Claude Code), so the ingest token never lands in a
  committable file.
- **`/clear` fully characterised**: `SessionEnd(reason:"clear")` for the old
  `session_id`, then `SessionStart(source:"clear")` with a new one in the same pane. New
  observed values for both fields; a `reason:"clear"` SessionEnd is not a liveness hint.
  Protocol §7.3 updated accordingly.

### 2026-08-22 — M0 skeleton shipped (plan `m0-skeleton`, via `/orchestrate`)

First vertical slice complete and reviewed (`plans/m0-skeleton/review.md`, approved on
the first cycle). H1's pipeline acceptance is thereby passed. Decisions amended or
settled by the work, beyond routine implementation:

- **Migrations ship only the tables their milestone writes** (approved deviation from a
  literal reading of "schema per §7"): `0001_init.sql` creates `kv` + `event` only;
  `session`/`repo`/`usage_sample` arrive with M1/M3, since migrations are forward-only
  and freezing untouched column sets now just risks churn migrations later.
- **The daemon-down banner appears only after a first successful `hello`** (web-impl
  judgment call, review-endorsed): on a fresh page load the shell shows `connecting…`
  rather than a dishonest "musterd unreachable" flash from a daemon that just served
  the page. §6.7's "loud when down" applies to a connection that was up.
- **Static assets are served from disk** (`-web-dist`), not `go:embed`, so
  `go build ./...` never depends on the web build. Revisit only if a self-contained
  binary ever matters. *(Amended 2026-08-31, plan `embed-dashboard` — see changelog:
  the dashboard is now embedded by default and `-web-dist` is a dev override.)*
- The §2.6 UI token is **reusable** at `/auth` (lives in `kv` for the install's life);
  "one-time" described the launcher flow, not token burning. Cookie Max-Age 30 days.

Both Major review findings were resolved the same day (details in `TODO.md`): tests
outside `internal/claudecode` now get wire-shaped bodies from the new
`internal/claudecode/claudecodetest` helper package — Damian chose this over narrowing
D4, so the check stands unchanged — and the daemon-down banner grounds on dedicated
`--banner-*` tokens added to design-system §1, returning `--rose` to Failed-only. No
new wire-format facts — M0 never touches a real Claude Code.

### 2026-08-23 — M2 terminal panes shipped (plan `m2-terminal`, via `/orchestrate`)

Live terminals land: `/ws/terminal/{id}` (PTY↔WS bridge over `creack/pty`), the Tiles
view, the view switcher with persisted prefs (`view` + `density`), and both queued M1
follow-ups (⟳n compaction E2E, per-run scratch-dir tmux sockets via `-tmux-socket`
path support). Approved on review cycle 2 (`plans/m2-terminal/review.md`; cycle 1
preserved as `review.cycle-1.md`). Decisions amended or settled by the work:

- **tmux topology: one tmux session per Muster session** (`muster-<id>`, settled at
  planning with Damian 2026-08-23): a tmux client attaches to a *session*, and Tiles
  needs up to 6 concurrent live surfaces, so M1's shared-session layout could not
  serve it. Pre-M2 session rows need no migration.
- **`detach-on-destroy on`, not the spike's `off`** (review cycle-1 Critical 3,
  measured): under the new topology `off` hops a destroyed session's attach client to
  another session and misroutes keystrokes into the wrong claude. Plan REQ-4 amended;
  `spikes/FINDINGS.md` §7 carry-over config carries the amendment note.
  `destroy-unattached off` re-examined and kept.
- **`GET /api/sessions/{id}/pane` deferred to M4** (settled at planning): rail/strip
  cards are static metadata cards — the one real consumer of pane snapshots is the
  dead-session case, which belongs with M4's resume flow. Protocol §3.4/§8 updated.
- **Sticky tile membership**: live-grid membership recomputes only at view entry and
  density change; afterwards only user action changes it. A terminal never vanishes
  mid-keystroke.

No new Claude-Code wire-format facts — M2 never touches a real claude (echo stub only);
the new measured facts are tmux-side (FINDINGS §7 amendment).

### 2026-08-23 — m3-gauges planning session (plan approved)

M3's plan (`plans/m3-gauges/plan.md`) approved; protocol delta merged the same day
(protocol §9 changelog). Decisions settled with Damian:

- **§9 Q6 resolved (usage-source Go shape)** — a neutral `Sample` type + one aggregator
  in a new `internal/usage` package; **no Go interface type** until a second source
  exists (revisited 2026-08-30: the second source became a second concrete holder, still
  no interface — see that entry). §2.3's "small usage-source interface" is satisfied by the source-agnostic
  `Sample` shape plus the wire's `usage.source` field — API/OTel sources later mean a
  new producer of `Sample`s, nothing else changes.
- **No usage hydration across daemon restart** — account gauges read unknown until the
  next status post; per-session context, by contrast, persists on the session row.
- **Masthead model readout ships** — the Usage object gains a nullable `model`
  (freshest sample's); flicker under mixed-model sessions accepted.
- **Usage history is persist-only in v1** — `usage_sample` rows are written; no history
  UI (any timeline rendering joins the post-v1 attention-ribbon family).
- **Gauge warning thresholds: ≥ 60%** for both the context track (`hot`) and the usage
  bars (`warn`) — recorded in `docs/design/design-system.md` §5.
- **Dedup is by value, not timestamp** — a sample is recorded/broadcast only when bucket
  values or model changed, which collapses the measured ~435 ms pair posts; the
  `event.received_at` RFC3339Nano switch (M0 review minor) still lands but nothing
  relies on it.

No new wire-format facts; all carried-over status-line measurements re-validated against
M3's design in the plan (no topology or lifecycle change touches them).

### 2026-08-25 — command-path quoting probe (against 2.1.245)

`/interface-probe` for the M4 shell-quoting defect (`spikes/FINDINGS.md` 2026-08-25
addendum). Two facts settled, no decision reopened:

- **`hooks[].command` and `statusLine.command` are `/bin/sh -c` command lines**, not
  paths: a bare path with a space word-splits (TUI shows `/bin/sh: /tmp/muster: No such
  file or directory` for the hook; the status line fails silently). Both `'…'` and `"…"`
  deliver; quoting a space-free path is harmless. Muster will single-quote at the write
  boundary (M4) — the default data dir under `~/Library/Application Support` stays.
- **§7's `refreshInterval` note is now measured**: seconds, and it does drive idle posts
  (`5` → a post every 5.00 s through 60 s of idle). Closes the last open item from the
  step-1 spikes about status-line cadence.

### 2026-08-27 — M4 reconcile / shutdown policy / End · Remove · Resume shipped (plan `m4-reconcile`, via `/orchestrate`)

Settled as implemented (decisions taken with Damian 2026-08-26 in planning, plus two during
the run):

- **Sessions survive daemon shutdown by policy.** `-on-exit` flag: `ask` (default — TTY
  prompt "N live sessions on tmux socket X — kill them? [y/N]", 10 s timeout → No; non-TTY
  behaves as `leave`), `leave`, `kill` (final snapshot, `kill-session`, row ended).
- **Reconcile on start is synchronous, before the first snapshot is served.** `alive=0` rows
  are swept (the user had their resume chance in the previous lifetime); `alive=1` rows whose
  pane is gone are marked ended with `endedAt = startup time` and kept; unknown `muster-*`
  sessions on the socket are logged at warn and never adopted. `alive` is set only from tmux
  pane existence — never from a hook payload (review cycle 1 Major 1 removed the one leak).
- **Last pane snapshot is in** (closes the protocol §3.4 deferral): `capture-pane -p` on every
  liveness tick, display source only, served by `GET /api/sessions/{id}/pane`, rendered dimmed
  under a "session ended" cap for dead sessions.
- **End / Remove / Resume** with confirm dialogs; Remove is allowed on a live session (ends
  first). Placement C — mainhead above the focused terminal *and* action rows on cards / tile
  footers. Action rows on cards are **hover / focus-within revealed** (Damian, 2026-08-27).
- **Resume lands in `idle`** via `KindResumeBind` (protocol §7.3 — the code previously landed
  it in `started`); a resume with a different claude id still escalates to clear-rebind.
- **Design system: `--danger` family** (`--danger`, `--danger-line`, `--danger-fg`) for
  destructive actions — `--rose` stays reserved for Failed (§3 "rose is never delete").
  Option A chosen by Damian 2026-08-27 over amending §3.
- Protocol: `POST …/end`, `DELETE …/{id}` (→ `sessionRemoved`), `POST …/resume` refined,
  `GET …/pane`, all in `docs/protocol.md`. Review (Opus, 4 cycles) approved; R2 (real-haiku
  End → Resume) is still owed — see TODO.

### 2026-08-25 — M4 command-path quoting shipped (plan `m4-hook-quoting`, via `/orchestrate`)

Closes the live bug behind M3's gauges never having rendered real data. Settled as
implemented:

- **`MergeSettings` single-quotes both command-hook paths** (`hooks.SessionStart[].command`,
  `statusLine.command`) at the write boundary — `'`→`'\''` — via unexported `shellQuote` in
  `internal/claudecode`. `SettingsConfig` keeps raw paths; nothing outside the package
  quotes. `isMusterEntry` matches both the quoted and legacy bare forms for both script
  paths, so an already-instrumented directory's stale bare entry is replaced, never
  duplicated. Recorded in `docs/protocol.md` §4.2.
- **The wrapper-script chain is now executed in tests**: `internal/server/settings_shell_test.go`
  takes both `command` strings verbatim from the generated `settings.local.json` and runs
  them through `sh -c` from a space-bearing data dir against a live handler (SessionStart
  binds; status line yields a routed `status_line` event and a `usage_sample` row). The E2E
  harness mints its scratch data dir as `"muster e2e-"` so all 71 specs run on the
  production path shape. `test/canary/canary_test.go` carries `TestCommandHookPathQuoting`
  (skipped, `needsHarness`) as the pin-bump assertion.
- Review (Opus) manually reproduced the bare-path failure (`rc=127`) and the quoted-path fix
  end-to-end on a real daemon at `/tmp/muster manual review/data`. The REQ-9 record against
  the real default data dir with a real haiku session is still to be filled in by Damian.

### 2026-08-27 — M4 hook lifetime shipped (plan `m4-hook-lifetime`, via `/orchestrate`)

Closes the three open M4 items sharing one root (per-directory hooks instrumenting every
Claude Code session, Muster never removing its own hook entries, "daemon down" surfaced
prominently): all resolved by making every hook a command wrapper. Settled as
implemented:

- **Every hook, including `SessionStart` and the status line, is a `type:"command"`
  wrapper** — one `hook.sh` in the data dir, registered on all eleven events, whose first
  line is `[ -z "$MUSTER_SESSION" ] && exit 0`. Muster writes no `type:"http"` entry and
  no `allowedHttpHookUrls` key anywhere; `MergeSettings` strips both from an
  already-instrumented directory (legacy http entries, the legacy `hook-sessionstart.sh`
  command entry, and Muster's own prior `allowedHttpHookUrls` values) rather than
  replacing them with new ones.
- **Binding is monotonic** (decided with Damian 2026-08-28, from the review's Critical:
  a reordered `SessionEnd(reason:"clear")` for the old id — delivery is unordered — was
  read as a forward `/clear` and reset a working session, zeroing its compaction count).
  Options were (A) accept the window as a residual, (B) never rebind backwards onto a
  claude id the session has already left, using the stale-id knowledge `byClaude`
  retains. **B chosen**; protocol §4.2/§7.3 amended.
- **Hook entries are permanent by design** (decided with Damian 2026-08-27): no
  reference-counting, no strip-on-shutdown, no strip-on-remove. A stale entry now costs a
  silent 6–32 ms `sh` exit instead of a line of inline noise per tool call, so the
  lifetime question dissolves rather than needing an answer.
- **Binding is envelope-authoritative** (`Manager.Apply` gains an `enveloped bool`):
  since every event now carries the §4.2 envelope, an enveloped non-status event whose
  `session_id` differs from the session's bound one is treated as a `/clear` rebind
  before the event itself applies; an enveloped event on a never-bound session binds it
  with no transition. Raw (non-enveloped) posts, still accepted for the canary/legacy
  path, keep routing by the existing mapping and never bind (unchanged). Status-line
  posts never bind or rebind (unchanged, M3 INV-1).
- Cost measured at ~50 ms/event vs. ~25 ms for http (`spikes/FINDINGS.md` "command-hook
  latency probe", 2026-08-27 against 2.1.246); accepted. A compiled hook helper (~10
  ms/event) is recorded post-v1, not built here.
- Protocol: §4/§4.1/§4.2/§7.3 updated in `docs/protocol.md`. The manual real-haiku
  migration/silence check (launch against an already-instrumented directory, stop
  musterd, confirm no hook-error lines) is Damian's post-merge acceptance step, recorded
  in `spikes/canary-fields.md` once run.

### 2026-08-29 — Tiles grid slot-stable + drag reorder (plan `move-tiles`, via `/orchestrate`)

- The Tiles grid no longer re-sorts itself by §3.4 attention priority: `promote` lands the
  promoted session in the demoted tile's slot, `applyDensity` keeps survivors' relative
  order (shrink drops lowest-priority wherever they sit, grow/backfill append), and only
  the user reorders. Amends ux-flows §3.7's "in the same order §3.4 defines" (decided
  with Damian 2026-08-29). Order is per-window and ephemeral like `tilesLive` membership —
  no protocol or prefs change.
- Drag-to-reorder: the tile header (`.thead`) is the only drag handle; drop on another tile
  is insert-and-shift (tab-bar semantics, chosen over swap). Feedback uses neutral
  `--line2` only. Reorder is geometry-neutral (INV-6) and works with the daemon down.
- State dot in the tile title was already shipped (design-system §3 tokens); the
  green/orange/red palette floated in TODO was not adopted (§3: a state colour may only
  mean that state). Added: `.sdot` `title` = state word on hover.
- Measured during the run: a `mousedown` on the header blurs any focused control before
  `dragstart`, so focus is now captured on `mousedown` and handed to `reconcileTilesGrid`.

### 2026-08-29 — canary harness real; pin 2.1.233 → 2.1.246 (plan `m4-canary`, main-session build)

- `make canary` now drives the installed `claude` through the production
  settings → `/bin/sh -c` → wrapper → enveloped POST chain (`test/canary/harness_test.go`):
  3 haiku turns + 1 zero-token run, ~40 s. Every previously-skipped field/behaviour test is
  binding except the plan-mode / `PermissionRequest` / `Notification` / `SubagentStop`
  rows (interactive dialog; accepted residual, verify via `/interface-probe`).
- Green twice on 2.1.246 → `PinnedVersion` bumped per `docs/claude-code-pin.md`. The
  post-v1 pin-*strategy* rethink (TODO M1 follow-ups) is unchanged.
- New wire fact (2.1.246): on the authentication-failure exit, Claude Code does **not** await
  its hooks — `SessionEnd` (and, marginally, `StopFailure`) can be lost through Muster's
  ~48 ms curl wrapper. Consistent with §8's best-effort stance; reconcile keys on pane
  liveness, so no design change. Details in `spikes/canary-fields.md`.

### 2026-08-30 — per-model weekly usage bar shipped (plan `usage-model-bar`, via `/orchestrate`)

- TODO decision taken: **(b)** — musterd calls `GET /api/oauth/usage` itself rather than
  waiting for the status line to grow the per-model window (§2.3 amended). Poll every 5 min
  from an immediate fetch on start, `POST /api/usage/refresh` (coalesced) behind a ↻ button,
  `prefs.usageModel` selects the displayed model (default `"Fable"`).
- Credentials: Keychain item `Claude Code-credentials` read **read-only** (§2.6 amended);
  `-usage-token-file` / `-usage-api-url` are the test seams so no Go or E2E test touches the
  real Keychain or api.anthropic.com. Token never logged, stored or put on the wire.
- §9 Q6 revisited: the second source is a second concrete holder (`usage.ModelScoped`) beside
  the `Aggregator`, merged at the wire layer — still **no Go interface**; two concrete types
  is not yet enough to justify one.
- Protocol: `usage.modelScoped/modelScopedAt/modelScopedError/modelScopedSource`,
  `prefs.usageModel`, new `POST /api/usage/refresh` (`docs/protocol.md` §3.3, §3.9, §5.4, §5.5).
- Masthead order is now: 5-hour bar, 7-day bar, model-week (selectable), refresh, model,
  daemon health (`docs/design/design-system.md` §4/§5).

### 2026-08-30 — New session from Tiles (TODO "Create new session from tile view", main-session build)

- Tiles gets its own **New session** button in the density toolbar — the rail's button is
  hidden with the rail, so Tiles previously had only ⌘N. Same `#launch-dialog`, same flow
  (ux-flows §1); `initLaunchModal` now takes `openButtons[]`.
- A session launched **from Tiles is promoted into the grid** (same rule as a strip-card
  click — the lowest-priority live tile is demoted when the grid is full) rather than being
  admitted only if a slot happens to be free. Focus behaviour unchanged.
- No protocol, schema or daemon change. Rejected: a "+" pseudo-tile in the grid (would
  fight the slot-stable reconcile, the drag delegation and the fixed 2×2/3×2 geometry).

### 2026-08-30 — Rail order is user-owned (plan `order-sidebar`)

- §2.1's needs-input-first sort is no longer *the* rail order; it is the rail's **attention**
  mode. The default **manual** mode keeps a daemon-owned, per-session order: `pinned` +
  `railPos` on the Session object (two new columns, migration 0006), opened order = bottom of
  the unpinned block, drag-to-reorder by card (insert-and-shift, drop position decides pin
  state), a pin control that lifts a session into a pinned block at the top. The mode is a
  rail-head toggle persisted as `prefs.railSort` (default `manual`). Tiles strip follows the
  rail order; the Tiles grid (`tilesLive`) is untouched.
- Daemon owns the invariants (unique `railPos`, pinned before unpinned) and never orders for
  display; the client sorts (`orderRail`). Protocol: `PUT /api/sessions/{id}/pin`,
  `PUT /api/sessions/order`, `prefs.railSort`, `session.pinned/railPos` (`docs/protocol.md`
  §3.3, §3.10, §3.11, §5.3).
- Decision `cmd-n-ordering` (review issue, settled by `/decide` consensus): **⌘1–9 follows the
  rail's displayed order** (Option A) rather than staying attention-ranked (Option B). Cost
  accepted: no one-key jump to the most-blocked session — follow-up in TODO.md.
  **Discharged 2026-09-04** (plan `shortcut-fixes`): ⌥⌘0 restores that jump without reopening
  Option A, which stands unchanged. See the 2026-09-04 entry.

### 2026-08-30 — Launch dialog rebuilt as a Finder-style picker (plan `new-session-dialog`)

- ux-flows §1.1–1.2 replaced: the MRU list + `Browse…` unfold + Up/"Use this folder" flow is
  gone. A persistent **Recent** sidebar sits beside a browse pane — clickable breadcrumb over
  a single child listing — and **the listed directory is the selection** (no apply step); ⌘↑
  goes up; clicking a recent restores that directory's last model/mode. Model and Start-in are
  segmented radio controls; Model gains a `fable` preset (a measured alias in the installed
  Claude Code 2.1.251, `spikes/canary-fields.md`), passed to `--model` verbatim. The footer
  always reads `Launch in <path>`; the dialog is fixed at 720px with internally scrolling panes.
- No protocol or schema change (`docs/protocol.md` §3.1's preset comment updated, doc-only).
  Rejected in planning: Finder columns, a path field with completion, and folding the Title
  into existing dialog chrome (plan Overview records the comparison).

### 2026-08-31 — Dashboard embedded in the binary (plan `embed-dashboard`, via `/orchestrate`)

- Amends the 2026-08-22 M0 decision "Static assets are served from disk (`-web-dist`), not
  `go:embed`". That decision's own text ends "Revisit only if a self-contained binary ever
  matters" — and it now does: this is the precondition for the CI/GoReleaser follow-up plan.
- Vite builds into `internal/webui/assets/` and `internal/webui` embeds it
  (`//go:embed all:assets`); a committed `.gitkeep` plus a `.gitignore` carve-out keep
  `go build ./...` working on a fresh clone with no npm build, and a `closeBundle` plugin
  restores `.gitkeep` after `emptyOutDir` so the tree stays clean (`git describe` never
  picks up a spurious `-dirty`).
- Serving precedence: `-web-dist` set → disk exactly as before (dev override; `make run`
  uses it so the frontend loop needs no Go relink); unset (new default `""`) → embedded FS.
  Both branches are `http.FileServer` behind the same `requireCookie`; the only intended
  divergence is the embedded path's zero ModTime (no `Last-Modified`/304s).
- Fail-fast: a binary built with no web build exits non-zero at startup naming both remedies
  (`make web-build` before building, or `-web-dist`), replacing the old silent-404 mode. A
  disk override without `index.html` stays a startup warning (permissive dev path).
- Build ordering is now load-bearing: `make e2e` orders `web-build` before `build` — a Go
  compile before the web build embeds a stale dashboard (the successor of the
  stale-`web/dist` trap; pipeline lore docs updated accordingly).

### 2026-08-31 — Distribution settled: tagged GitHub Releases, automatic versioning

Follows the `embed-dashboard` entry above — a self-contained binary is only useful once
there is a way to get one. Decisions:

- **Distribution is the GitHub Release.** `make install` / `gh release download` pulls the
  latest darwin archive into `~/.local/bin`. **Homebrew is deferred to any open-sourcing**:
  a private tap works, but only via `GitHubPrivateRepositoryReleaseDownloadStrategy` plus a
  permanent `HOMEBREW_GITHUB_API_TOKEN` — not worth the standing setup for a single user.
  Once the repo is public that download-side cost disappears — but not the publish-side one;
  see the 2026-09-10 scoping entry in the changelog (`homebrew_casks:`, and a PAT for the tap).
- **Versioning is automatic and commit-driven.** `svu` reads the conventional commits since
  the last tag on every push to `main`: `feat` → minor, `fix` → patch, `!` → major,
  everything else no release. This makes `docs/conventions.md` § Commits load-bearing rather
  than stylistic. Muster stays on **0.x** until the Pre-v1 Cleanup closes, so `!` is not to
  be used — svu would take `0.x` straight to `1.0.0`.
- **Builds run on Linux, not macOS.** Every Go dependency is pure Go (`modernc.org/sqlite`,
  `creack/pty`, `coder/websocket`), so `CGO_ENABLED=0` cross-compiles darwin from
  `ubuntu-latest`. On a private repo that is a 10x runner-minute saving, and it is a
  standing reason not to introduce a cgo dependency casually.
- **Two arch archives, not a universal binary** (`darwin/amd64` + `darwin/arm64`) — smaller
  downloads, and arch selection is one `uname -m` in `make install`.
- **Release builds drop the JS sourcemap** (`MUSTER_RELEASE=1` → Vite `sourcemap: false`),
  resolving the ~955 kB question the `embed-dashboard` review deferred to this work. Local
  and E2E builds keep maps; the shipped artifact therefore differs from the E2E-tested one
  by the maps alone, which was accepted deliberately.
- **No test or lint job in CI yet** — deliberate, pending possible open-sourcing. The
  release build is the compile gate; adding `make check` is a one-line step when wanted.

### 2026-08-31 — Issue capture shipped (plan `issue-capture`, via `/orchestrate`)

A masthead `Issue` button files a GitHub issue on `Zalaras/muster` carrying a
strict-allowlist snapshot of muster state, previewed in full before it posts. Post-spec,
user-facing; recorded here because it settles standing decisions rather than because §2
lists it (it does not — the feature is additive to the MVP set):

- **The payload is an allowlist, never a dump.** The snapshot is assembled by explicit
  field copy from the pinned list in `plans/issue-capture/plan.md` §"The allowlist";
  hard-excluded forever: prompt text, hook payload bodies, raw status-line JSON, pane
  captures, assistant-generated text (`title`, `lastActivity`, `failure.message`),
  identifying data (directory, branch, worktree flag, repo name, Claude session id value),
  and all account usage. Per-session context percentages are deliberately included.
- **The preview is the leak check**: the dialog renders the daemon's `snapshotMarkdown`
  verbatim and E2E asserts the preview is byte-identical to the POSTed body (INV-2).
- **Capture-then-file**: `POST /api/issue/captures` holds a server-side snapshot
  (8-cap/15-min TTL store); `POST /api/issues` files the held capture — never a
  client-supplied payload. Protocol: `docs/protocol.md` §3.12/§3.13.
- **Auth is `gh auth token` at time of use** — no storage, no OAuth flow. The GitHub host
  lives only in `cmd/musterd/main.go`'s `-issue-api-url` flag default; `internal/ghissue`
  imports no muster-internal package; E2E always stubs GitHub (REQ-17).
- **Scope ends at creation**: no issue reading, no labels, no status sync — triage stays
  in `TODO.md` via commit references.
- Cycle-1 review decision (user): no disabled-button affordance in this plan (Option B);
  the app-wide `.btn:disabled` sweep is a TODO.md M5+ item.

### 2026-08-31 — Issue triage and landing policy (`/triage`, `/land`)

Settles what happens to a filed issue after creation. Extends the entry above rather than
changing it: **the daemon is unchanged** and still only creates issues — both commands are
dev-workflow skills outside musterd, so the "scope ends at creation" boundary holds.

- **An issue closes when the fix lands on `main`, never at triage.** Closing at triage would
  make "closed" mean "we read it", destroying the only status field that survives
  open-sourcing, reading as a brush-off to any future reporter, and removing the duplicate-filing
  guard that matters most given how cheap the Issue button makes re-filing. The close is free at
  the other end: `closes #N` in the squash subject (`docs/conventions.md` § Commits). The one
  exception is a duplicate or invalid issue, closed as such with explicit approval — a real
  resolution, not a filing convention.
- **Triage state is derived, not stored**: an issue is triaged iff its number appears in
  `TODO.md`. No labels, no close-state, no second list to keep in sync — and it self-heals,
  since deleting a TODO item makes its issue correctly reappear as untriaged.
- **`/orchestrate` never closes an issue.** At pipeline completion the fix exists only on a
  branch the user has not accepted, and a review verdict of `approved` is the reviewer's opinion,
  not acceptance. It records `closes_issues` in `orchestration-state.json` and hands off.
- **`/land` is the landing ritual**, previously an undocumented end-of-session request: it
  gates on an approved review, composes the conventional subject with the issue references,
  shows the predicted `svu` bump before pushing (landing chooses the version), and deletes the
  plan branch by content diff (`git branch --merged` is defeated by squash-merging).

### 2026-08-31 - tmux is a preflighted hard dependency; the dashboard auto-opens

Settled while implementing plan `tmux-installation` (issues #2 and #4).

- **tmux is a hard dependency, checked at startup rather than at first launch.** `musterd` runs
  a preflight before it creates the data dir or binds the listener: tmux absent, not executable,
  exiting non-zero, or not answering `tmux -V` within 2 s is fatal, with a report on stderr and
  an error naming the remedy (`brew install tmux` / `brew upgrade tmux`). Previously the failure
  surfaced as a raw exec error inside `POST /api/sessions`, in the launch dialog.
- **The stated minimum is tmux 3.2**, because `internal/tmux` uses `new-session -e` and
  `set-option -as terminal-features`, both 3.2. A `tmux -V` that runs but does not parse
  (`tmux master`) is a *warning*, not fatal — Muster cannot prove an unrecognised build is too
  old. Version knowledge lives in `internal/tmux`; `cmd/musterd` only renders and gates.
  Versions compare as two integers, never as strings, so `3.10` correctly orders above `3.2`.
- **The dashboard auto-opens by default** (`-open`, default true; `-open-cmd`, default `open`),
  and only when stdin is a real terminal. The terminal condition is the guarantee, not the flag:
  it is what makes it impossible for a test run to open a browser, since every daemon spawned
  under test gets a `/dev/null` stdin.
- **`isCharDevice` was never a TTY check.** `/dev/null` **is** a character device - measured
  2026-08-31, `mode=Dcrw-rw-rw- charDevice=true`. Every scratch daemon therefore entered the
  `-on-exit=ask` prompt and was SIGKILLed by the E2E harness 5 s later, never shutting down
  gracefully. Replaced with a real terminal test (`isTerminal`, `github.com/mattn/go-isatty`,
  already in the module graph - `go.sum` unchanged). This is a macOS/POSIX fact, not a Claude
  Code wire-format one, so it is recorded here and not in `spikes/`.

### 2026-09-01 — release policy unified (types, bumps, notes, breaking, guard)

The release policy lived in five places that had drifted (conventions, the goreleaser
filters, `release.yml`, `/land`, the agents' hardcoded types). Settled with Damian after
re-measuring everything against the pinned svu v3.4.1; details and the worked
measurements are in `docs/conventions.md` § Commits.

- **Types are the eleven-strong commitlint standard** (`build chore ci docs feat fix
  perf refactor revert style test`), plus `review(<plan>)` on plan branches only.
  Previously seven; `perf`, `build`, `revert`, `style` were undefined.
- **Bumps: `feat` → minor; `fix`/`perf`/`refactor` → patch; everything else none.** svu
  hardwires only feat/fix and its config has no type→bump mapping (measured), so
  `release.yml` shims perf/refactor to `svu patch` when they are all that is new.
- **Release notes are derived, not maintained**: the goreleaser filter is now
  `include: ^(feat|fix|perf|refactor)` — exactly the types that bump. The old exclude
  list had already let pre-convention subjects into the v0.1.0 notes and would have
  published `perf`/`build`/`revert` bullets that shipped no release.
- **The "a breaking footer would be silently ignored" claim was measured wrong**, and
  dangerously: svu matches the phrase anywhere in a message (mid-sentence, hyphenated),
  it forces major on *any* type, and `!` forces major even on unknown types — while
  `main` carries real bodies (trailers on 47 commits, retro paragraphs on `0b6f446`).
  On 0.x any of these went straight to 1.0.0.
- **Mechanical safety instead of convention**: `release.yml` now runs `svu next --v0`
  (majors clamp to minor while on 0.x — measured `feat!:` on v0.2.0 → v0.3.0), and a
  `commit-msg` hook (`.githooks/`, armed by `make hooks`) enforces the type list, the
  72-char cap on the four published types, bans the footer phrase outright, and gates
  `!` on `MUSTER_BREAKING=1`, which only a human ever sets.
- **`!` is the only breaking marker and is now legal on 0.x when sanctioned** — it bumps
  minor and records the breakage in history; at v1 it resumes meaning major.
- **v1.0.0 is cut by deliberately removing `--v0`** from `release.yml` (with a `feat!:`)
  once the pre-v1 sections in `TODO.md` close. While the flag exists, v1 is impossible.
- The 72-char release-note cap (decision 2026-09-01, commit `112c36c`) now binds `perf`
  and `refactor` too, since they are published. Corrected en route: the longest subject
  on `main` is 1,155 chars (`5d4e1d6`, docs) and the `feat(m3)` bullet is 1,138 — not
  1,900 as `112c36c` recorded.

### 2026-09-02 — theme tokens, light/dark pair, contrast pass (spec, plan `new-ui-design-colors`)

Spec interview for issue #3; settled with Damian, not yet built. Full text in
`plans/new-ui-design-colors/spec.md`.

- **Theming, not white labelling.** Muster stays single-user (§3); the same dashboard gets
  swappable palettes. A two-layer token architecture (semantic tokens referenced by
  components; per-theme palette blocks) replaces design-system §1's single flat palette.
  Custom themes are *architecture only* in v1 — a new source block, not a loadable file.
- **Three built-in themes ship in v1**: **Instrument** (the 2026-08-16 direction-A palette,
  contrast-fixed; the default), a **conventional web-style dark**, and a **standard light**.
  The light theme does not re-litigate rejected direction B — that was a layout direction;
  this is a palette on direction A's structure.
- **AA everywhere** (4.5:1 text, 3:1 non-text UI; decorative hairlines exempt), gated by a
  script under `make check`. Recorded as the one bounded exception to §3's accessibility
  non-goal. Measured 2026-09-02: `--dim` 2.6:1 and the Idle badge 2.8:1 on `--panel` fail
  today.
- **State colours keep fixed hue families in every theme** (amber/rose/violet/teal/grey),
  tuned per theme for lightness only; design-system §3's meaning rules carry over.
- **Theme choice**: a basic **Settings dialog** off the masthead with exactly *Follow Claude
  Code · Instrument · Dark · Light*, persisted as `prefs.theme` via the existing prefs path.
  The pref is **unset until the user picks**; unset follows Claude Code's theme family
  (light → Light, dark/unknown → Instrument) and keeps following. *Follow Claude Code*
  clears the override.
- **Claude Code's theme is read, never set**: musterd polls only the `theme` key of
  `~/.claude.json` (read-only; the file is otherwise account data) and broadcasts a
  `light`/`dark`/`unknown` family. It is not on the wire — no hook or status-line field
  carries it — and `claude config get` no longer exists in the installed CLI. All knowledge
  of that file stays in `internal/claudecode`.
- **The terminal ground always follows Claude's family**, override or not: Muster cannot
  restyle the TUI Claude Code draws (design-system §7.5), so it matches the pane ground to
  the theme Claude is drawing for instead. Each theme supplies a light and a dark terminal
  pair.
- **The M5+ app-wide `.btn:disabled` affordance pass is folded in** (same layer; Option B in
  `plans/issue-capture/decisions/disabled-button-affordance/`).
- **Mockups are re-rendered under all three themes during planning**, so plan approval means
  seeing every palette on both views first — the same mockup-first order the original
  direction was chosen by.

### 2026-09-02 — theme tokens shipped (plan `new-ui-design-colors`, via `/orchestrate`, approved review cycle 1)

Built on branch `plan/new-ui-design-colors`; lands with `/land`. Four decisions the plan
took where the spec above left room, plus one split the spec did not foresee:

- **Control borders split.** `.btn` borders stay on `--line-control` (1.5:1) under WCAG
  1.4.11's allowance for a button whose label meets 4.5:1, and are exempt. Text inputs,
  selects, textareas and the segmented-control track take a new 3:1 token `--edge`.
- **State border tints exempt.** `--amber-line`/`--rose-line`/`--violet-line`/`--teal-line`
  are redundant carriers — design-system §3 already requires the badge word and position to
  carry state — so they sit on the exempt list with that reason.
- **Surface and text tokens renamed to role names** (`--bg`, `--bg-raised`, `--bg-hover`,
  `--well`, `--fg`, `--fg-muted`, `--fg-dim`, `--line-control`, `--edge`); state tokens keep
  their hue names because the hue is the semantic.
- **`prefs.theme` is an enum with a `"follow"` default**, not a nullable — same shape as
  `view`/`density`/`railSort`; the spec's "unset until the user picks" is realised as
  `"follow"`, keeping protocol §1's "null means unknown" rule intact. The daemon treats the
  value as opaque (`^[a-z][a-z0-9-]{0,31}$`); the client owns the theme registry.
- **`--term` splits from `--well`.** The pane ground follows Claude's family; chrome recesses
  (inputs, previews, browse pane, placeholder, dead snapshot) ground on `--well`, which
  follows the Muster theme — so a light Claude never bleaches a dark Muster's inputs.

Shipped: three palettes (Instrument/Dark/Light), `make contrast` under `make check` (43
pairs per theme, 0 failures), Settings dialog, `claudeTheme` poll and broadcast, app-wide
`.btn:disabled` affordance. Measured during review: the daemon never writes Claude's config
file (mtime unchanged over ~480 ticks) and logs nothing per tick.

### 2026-09-02 — rail click puts the cursor in the terminal (plan `terminal-focus`, via `/orchestrate`, approved review cycle 1)

Issue #11. Built on branch `plan/terminal-focus`; lands with `/land`. Web-only, no protocol
or schema delta.

- **A pointer click on a rail card moves keyboard focus into that session's live terminal**,
  so typing lands without a second click. `TerminalSurface` gained `focus()` (a wrapper over
  xterm's `Terminal.focus()`, a no-op for a dead or disposed surface); its single call site
  is the rail callback in `main.ts`, after `render()` returns, guarded on the click source.
- **Deliberately not moved**: keyboard activation (Enter/Space on a card), ⌘1–9 and the
  Tiles strip keep their existing behaviour — they select but leave focus where it is. A
  dead session's card shows the dead surface and leaves focus on the card. Nothing on the
  render tick, reconcile, view-switch or drag-reorder paths touches focus (INV-1).
- Measured during review: after one card click `document.activeElement` is xterm's helper
  textarea inside the clicked session's `Terminal:` container, and typed input reaches that
  pane's stub echo with no click on the pane.

### 2026-09-03 — file drop pastes the original path (plan `file-drop-fix`, via `/orchestrate`, approved review cycle 2)

Issue #8. Built on branch `plan/file-drop-fix`; lands with `/land`. Additive protocol delta
(`POST /api/sessions/{id}/locate`, `docs/protocol.md` §3.14), no schema or WS change.

- **Dropping a file on a live terminal pane types its real path**, Terminal.app-escaped with a
  trailing space, and moves focus into the pane. The browser never learns the path: the page
  uploads the bytes and the daemon locates the original on disk (Spotlight by exact name + size,
  then a walk of the session directory, byte-compared; exactly one identical match or nothing).
  The daemon never writes the upload anywhere — the upload is read straight off the multipart
  wire, never through `ParseMultipartForm`, so INV-2 is structural. Foreign drags anywhere on
  the dashboard are swallowed; text-only drops paste verbatim; every outcome shows a
  `role="status"` notice on the surface.
- **Settled in the run, not the plan.** (1) The internal reorder drag MIME changed from
  `text/plain` to `application/x-muster-drag-id`: with `text/plain` a `dragover` handler cannot
  tell a tile/rail reorder from a dragged text selection, so the plan's edge case 1 was
  unsolvable as worded; nothing reads the value, and the reorder specs drive real HTML5 drags.
  (2) `404 not_located` / `409 ambiguous` bodies use the standard `{"error":{…}}` envelope
  (`paths` sits inside it); the plan's and §3.14's flat illustrative snippets were wrong and
  are corrected. (3) REQ-4's prose was amended to match its own character list (`~` and `=`
  escaped; `:` `@` `+` not). (4) `web/e2e/drop.spec.ts` runs serial: eleven scratch daemons
  fanned across six workers tipped three marginal 5 s assertions in other specs (measured 3/6
  red runs, 0/3 without the file, 0/5 on `main`); serial mode gave eight consecutive green
  full-suite runs.
- Measured during review: a dropped file's original path landed with its space and both
  parentheses escaped, focus moved into the pane, Enter produced the stub echo, and the session
  directory and data dir listed identically before and after. The real `mdfind` query, including
  its apostrophe-escaping form, was run by hand — nothing automated exercises Spotlight query
  syntax (review note), and `make test` is intermittently red on `main` under default
  parallelism (`TODO.md`, Pre-v1 Cleanup).

### 2026-09-03 — focus marker, lifted dim-text floors, 15px type ramp, inline rename (plan `ui-text-and-focus`, via `/orchestrate`, approved review cycle 2)

Four dashboard issues in one pass — #16, #18, #19, #10.

- **§2.1 — the rail marks the session the Focus pane is showing** (#16). `focusedId` now reaches
  `reconcileCards`; the card carries `class="current"` + `aria-current="true"` on a neutral
  treatment (`--bg-hover` ground, 1px inset `--edge` ring, action row revealed) — state colours
  stay reserved for state. The marker means "shown in the Focus pane", never "live in this view",
  so the Tiles strip never renders one.
- **Contrast floors rise above AA on every theme** (#18, option A): `--fg-muted` ≥ 8:1, `--fg-dim`
  ≥ 7:1, `--idle` and the four state hues as text ≥ 6:1, the two note tokens ≥ 7:1 — Light moves
  with the dark themes. `web/scripts/contrast-pairs.json` gates the new minimums; the mockups
  remain the authority and `style.css` transcribes them.
- **A tokenised type scale on a 15px root** (#19): seven `--fs-*` steps in rem on the bare `:root`;
  every `font-size` in `style.css` references one (a negative `rg` check pins it). The whole
  chrome grows ≈7%. The terminal's xterm size is not part of the ramp. **No user-facing text-size
  control yet** — deferred to a `prefs.textSize` item in `TODO.md` (tokens first, control later).
- **§2.1 amended — a post-launch rename is Muster-owned** (#10). New nullable
  `session.title_override` (migration 0007), `PUT /api/sessions/{id}/title` (§3.15: `{"title":
  string|null}`, absent key ≠ null, 1–100 runes after trim, 204, broadcast only on a wire change),
  and the wire `title` becomes the *display* title (override, else Claude's last-known name) with
  a new `titleOverride` field. Status posts still refresh Claude's name and never touch the
  override. The affordance is click-to-edit on the Focus mainhead heading and every Tiles tile
  header, from one shared editor; Enter/blur commit, Escape cancels, clearing reverts to Claude
  Code's name. The UI never writes the title locally — it shows the last broadcast.

### 2026-09-03 — launcher offers Claude Code's four tabbed permission modes (plan `fix-auto-mode-select`, via `/orchestrate`, approved review cycle 2)

- **"auto-accept" in §4.1 / §4.5 means Claude Code's *accept edits* mode (`acceptEdits`).**
  The shorthand was coined when it was the only auto-ish mode. Claude Code has since grown a
  distinct mode literally named `auto` (measured 2026-09-03 against 2.1.259, `spikes/canary-fields.md`
  § Hook payloads, "Permission-mode probe"): `--permission-mode` accepts `acceptEdits | auto |
  bypassPermissions | manual | dontAsk | plan`; `manual`, `default` and no-flag are one mode on the
  wire (hooks report `"default"`); `auto` reports `"auto"` and is model-gated (haiku drops to manual
  and reports `"default"`). Issue #12 — picking "auto-accept" in the launcher produced accept-edits,
  not auto — was a vocabulary bug, not a wire bug.
- **The "Start in" control now offers `manual │ accept edits │ plan │ auto`**, in Shift+Tab cycle
  order, with Claude Code's own labels. Wire values `default` (behind "manual" — it is what hooks
  report, so seed and hook agree with no mapping and existing rows need no migration),
  `acceptEdits` and `plan` are unchanged; `auto` is new end-to-end (request validation, argv, Go
  constant, TypeScript unions, protocol §3.1/§3.2/§5.3/§7.2). `default` still emits no
  `--permission-mode` flag — the only spelling known to work on both the 2.1.246 pin and 2.1.259.
  A stored per-directory mode the dialog has no radio for falls back to `manual`, so the checked
  radio always matches the value the form sends.
- **`bypassPermissions` and `dontAsk` remain deliberately unoffered** pending the §4.4
  permissions UI and its guardrails; `auto`'s guardrail is Claude Code's own classifier. `manual`
  as a fifth accepted request value was rejected — an alias with no behavioural difference.
- No dialog-side model×mode warning: a seeded `auto` on a model that cannot run it is corrected to
  `default / hook` by the first `UserPromptSubmit` — the ordinary honesty-rule path (ux-flows §1.2).

### 2026-09-03 — subagent activity keeps a session working; attention/failure clear on resume; active segment click commits a rename (plan `claude-status-fixes`, via `/orchestrate`, approved review cycle 1)

- **A background subagent's hooks are not stragglers** (#14). Measured on 2.1.259
  (`spikes/FINDINGS.md` "subagent / background-task probe"): a subagent's `PreToolUse`/
  `PostToolUse`/`PermissionRequest` carry the *parent turn's* `prompt_id`, arrive after that
  turn's `Stop`, and carry an agent marker main-agent hooks never do. `internal/claudecode`
  derives a neutral `StateInput.FromSubagent` from the marker (the key name never leaves the
  package — D4 negative grep); a marked event for a closed prompt transitions to `working` /
  `needs_input` without reopening or adopting the prompt (INV-P), so the next Stop-family event
  still lands `idle`/`failed`. Unmarked closed-prompt events keep the §7.4 straggler guard
  bit-for-bit. `Stop.background_tasks` is fixture realism only, never a state input: a `Stop`
  with running background work lands `idle` and the first marked hook returns it to `working`
  (~2 s blip, seen in review — the price of not pinning a session for as long as a backgrounded
  shell lives).
- **§5.3's iff rules are now unconditional in code** (#15, #20). Every transition into ACTIVE
  clears `attention` and `failure`; every transition into `needs_input` (permission or idle
  door) clears `failure`. The idle door was not in the plan's Affected Files — daemon-tests'
  D5 table exposed the permission door, and the idle door is reachable from `failed` via an
  unseen fresh prompt id when its `UserPromptSubmit` was lost; both were closed in one
  pre-review fix and are pinned by unit tests. Protocol §7.3 rows say so explicitly.
- **Clicking the already-pressed view segment commits an open rename** instead of cancelling
  it, and sends no prefs request (REQ-6 as written — the plan's Implementation Note to leave
  the `click` listeners untouched was overruled by its own requirement). Right/middle click on
  either segment never cancels. Switching views still cancels, as before.

### 2026-09-04 — keyboard bindings moved off browser-reserved chords, jump-to-neediest added (plan `shortcut-fixes`, via `/orchestrate`, approved review cycle 2)

- **⌘N → ⌥⌘N, ⌘1–9 → ⌥⌘1–9, plus a new ⌥⌘0 jump-to-neediest** (#5). Safari handles ⌘N above
  the page as New Window, so `preventDefault()` never reaches it; Muster no longer intercepts
  bare ⌘N at all. ⇧⌘N — the rebind #5 and TODO.md originally suggested — was **measured
  equally reserved** in both browsers (New Private Window), so the obvious fix would have
  fixed nothing. Chords settled by probe, not reasoning: `spikes/S5-key-probe.md`.
- **⌘1–9 was never measured broken.** Chrome delivers ⌘-digits to the page and Safari's
  ⌘-digit rows went unmeasured. That family moved on a consistency-and-robustness argument —
  ⌥⌘ is provably clear in both browsers and one modifier for the whole session-shortcut family
  beats a split table — not on an observed failure. Recorded so no later reader cites the probe
  as evidence of a ⌘1–9 bug.
- **⌘\ (view toggle) and ⌘↑ (launch-dialog parent directory) are unchanged** — both measured
  SAFE in both browsers, and deliberately not "tidied" onto ⌥⌘ for symmetry.
- **Matching moved from `event.key` to `event.code`**, in one pure module
  (`web/src/shortcuts.ts`) that holds the whole binding table; `main.ts` and `render/launch.ts`
  dispatch from it and match nothing themselves. `event.key` cannot express an ⌥-chord at all —
  on macOS ⌥N is `"˜"` and ⌥1 is `"¡"` — and Playwright does **not** emulate that dead-key
  transform, so a matcher wrongly written against `event.key` would pass the E2E suite and fail
  on the real keyboard. That gap is held by a Vitest criterion (W16) constructing the event by
  hand, plus a 192-case loop (12 chords × 16 modifier signatures) pinning exact-modifier match.
- **Decision `cmd-n-ordering` Option A is preserved** — ⌥⌘1–9 still follows the rail's
  displayed order; only the chord moved. The dissent recorded against it on 2026-08-30 (no
  keyboard path to the most-blocked session) is **discharged** by ⌥⌘0, which selects on §2.1's
  priority order while ignoring both the rail's sort mode and the pinned block. With no live
  session it is a silent no-op — a user decision taken at approval, not an implementation
  default.
- No protocol, schema or daemon change; the changeset contains no `.go` file. Bindings are
  compiled in, not configurable.
- **INV-1 (no chord is browser-reserved) is structurally unverifiable by the suite** —
  Playwright injects key events below the browser chrome, which is exactly why
  `web/e2e/views.spec.ts:110` pressed `Meta+1` green the whole time ⌘N was broken in Safari. It
  is Reviewer-Verified against the probe file, and a green `make e2e` must never be cited for it.

### 2026-09-04 — licence chosen: MIT (`LICENSE` added; repo still private)

Settles the "license decided later" posture in §8. Recorded arguments are in
`docs/design/open-sourcing.md`; the decision in brief:

- **MIT over Apache-2.0.** The Apache-2.0 advantages recorded in the note do not bite here: a
  copyright licence never grants trademark rights, so MIT withholds the name just as well;
  inbound contributions follow the inbound-equals-outbound norm, and the contribution question
  is deferred to the first real PR regardless; there are no patents to grant on a tmux session
  dashboard. MIT is GPLv2-compatible where Apache-2.0 is not, and it is what all six comparable
  individual-maintainer tools chose (tally MIT 6, AGPL 2, Apache 1, ELv2 1).
- **AGPL-3.0 ruled out** — its network clause never fires for a localhost single-user daemon,
  and many employers forbid engineers from reading AGPL code.
- **Copyright is retained**; MIT is a non-exclusive grant, so relicensing or sale stays open.
  No CLA/DCO pre-emptively — decide when the first PR arrives.
- **The repo remains private.** Adding `LICENSE` is the hard blocker cleared; the visibility
  flip waits on the remaining chores (README build/contributions lines, deleting `a.png` and
  `session-manager-mockup.html`, the `plans/` privacy skim) and on Damian checking the SPAN
  employment IP clause.

### 2026-09-05 — a session may carry an ephemeral plain shell surface (plan `plain-terminal-session`, via `/orchestrate`, approved review cycle 2)

Closes [#21](https://github.com/Zalaras/muster/issues/21) in its smallest useful shape,
settled in `plans/plain-terminal-session/spec.md`. Muster can now show a second surface per
session: the user's `$SHELL`, interactive, in the session's directory, in a sibling tmux
session `muster-<id>-shell` on the `muster` socket. A segmented `claude | shell` control in
the Focus mainhead and in every tile footer swaps the surface body in place.

- **The shell is not a session.** No row, no rail card, no state, no SQLite presence, and
  nothing on the `/ws` state stream — the `Session` object (protocol §5.3) is unchanged.
  It is an ephemeral second attach target hanging off a session that already exists,
  spawned lazily by `POST /api/sessions/{id}/shell` (protocol §3.16) and attached over
  `GET /ws/shell/{id}` (§6.1). The daemon forgets it on restart: reconcile kills every
  `muster-<n>-shell` unconditionally and never adopts one.
- **Isolation is structural.** The shell pane carries no `MUSTER_SESSION` and Muster writes
  no `.claude/settings.local.json` on its behalf, so a `claude` run inside the shell fires
  hooks that persist unrouted (NULL `event.session_id`) and can never drive the parent's
  state machine. The one-live-client law is enforced per attach target, so a session's
  Claude socket and shell socket coexist.
- **Lifetime.** A shell survives switching sessions, switching views and the parent ending
  (it can even be started on a dead session); it dies on `exit`, Remove, or reconcile. End
  leaves it running.
- **Design-system §3 kept intact.** The plan and approved mockup specced a teal pip for
  "a shell is running"; review cycle 1 raised that `--teal` is reserved for Working, and
  Damian chose to give the pip its own `--shell-pip` token per theme rather than record an
  exemption (`plans/plain-terminal-session/decisions/shell-pip-hue/`).
- **Placement.** The tile control lives in `.tfoot .acts`, not the spec's original
  `.thead`: measured against the shipped header, a control in the header truncated every
  title and repo/branch at 3×2, the footer none. Footer overflow measured 0 at 1152px and
  at 1024px in the shipped build (the plan's 6px 1024px floor came from the mockup and is
  pessimistic).
- The richer shape — a real `kind: "shell"` session, a global untethered terminal, restore
  across restarts, several shells per session — stays in `TODO.md` M5+.

### 2026-09-06 — test strategy settled: explicit E2E fixtures, one load policy, faked subprocess boundary (direct on `main`)

Closes the open question raised 2026-09-03 (`docs/design/test-strategy.md`) after three measured
load-sensitivity flakes. Settled in this session with Damian rather than through `/orchestrate`,
since the pipeline's own rules were among the deliverables. The standing rule is
`docs/conventions.md` §Testing; `.claude/agents/{e2e-specs,daemon-tests,review-work,web-impl}.md`,
`/plan-work` and `plan-lint.sh` now carry it.

- **"One daemon per file" is a per-file judgement, not a rule.** The audit of all 25 specs found
  that most per-test files legitimately need a fresh daemon: they assert rail/grid order or
  counts, prefs, usage, theme, recents, auto-focus on the only session, or restart/kill the
  daemon. So the deliverable is an explicit, lintable choice: `web/e2e/helpers/fixtures.ts`
  exports `daemon` (fresh per test, the default), `startDaemon` (spawn options computed in the
  test) and `fileDaemon()` (title-scoped files only); a plan records the choice per spec in a
  new **Fixture plan** header that `plan-lint.sh` requires.
- **One load policy in `playwright.config.ts`**, not per-site timeouts: `workers: 4`,
  `expect.timeout` 15 s, `timeout` 60 s. A spec may shorten a timeout with a comment, never
  lengthen one; the only fixed hold is `settleFor()` for a stays-unchanged check. The config,
  the fixtures module and the lint are web-impl's (gate integrity), never e2e-specs'.
- **Mechanised, not re-worded** (`/retro`'s rule for a rule that was broken): `web/scripts/e2e-lint.sh`
  runs before every `npm run e2e` and in `gates.sh`, failing a spec that calls
  `startScratchDaemon`, imports `@playwright/test`, or sleeps.
- **Go tests cross a process boundary through an injectable run func**, never a `$PATH` shim
  (`internal/tmux`'s preflighter mirrors `internal/locate.SpotlightFinder`). `claude --version`
  now honours `-claude-bin`, so no test daemon forks the real Claude Code; `internal/server`'s
  locate tests use a walk-only Locator instead of `mdfind`. Real tmux stays where the assertion is
  a tmux-observable effect. The larger `internal/server` creation/attach seam is a `TODO.md`
  follow-up for a proper daemon plan.
- **Measured.** `go test -count=1 ./...` 5/5 green at 26–28 s under default parallelism
  (was intermittently red on the eight preflight tests). `make e2e` 3/3 green, 281/281, at
  76 s with 4 workers against a 72–78 s baseline at 6 (1 red in 2 baseline runs: a non-retrying
  `expect` right after `page.goto`, the fourth instance of that class, now converted); the
  suite alone at 6 workers is 61 s against 71 s at HEAD. Two migrations surfaced real hidden
  couplings, both fixed: `shell.spec.ts` asserted on the machine's *real* Claude Code version,
  and INV-5's "never reopens a socket while dead" only holds when the ended session was the
  daemon's only one.
- **Found on the way: macOS taxes the first exec of every freshly written script (~270 ms,
  serialised across processes).** The harness wrote a new stub `claude` per daemon and every
  session launch paid it; routing the version check through the stub made the tax block daemon
  startup too (0.8–2.3 s under load) and the suite ran 112–118 s regardless of worker count.
  `helpers/daemon.ts` now writes one stub per run at a content-hashed path. The bisect and
  measurements are in `docs/design/test-strategy.md` §Decision.
- **Rejected again:** Playwright retries (they hide exactly the load sensitivity the gates exist
  to see; there is also no CI to scope them to) and `go test -p 1` (doubles `make test` and treats
  the load, not the fork).

### 2026-09-10 — `make canary` covers the whole Claude Code surface Muster depends on (plan `canary-full-coverage`, via `/orchestrate`)

`test/canary/` is now the inventory-of-record it was meant to be, so the pre-v1 "version the
Claude Code interface" item can declare a supported range honestly. Decisions settled or
changed on the way:

- **Coverage.** Run C is a four-way `--permission-mode` sweep on the zero-token
  unauthenticated path, cross-checked by the authenticated run D; run D launches through the
  production `BuildArgv` with `--name` and plan mode and waits for `Notification{idle_prompt}`;
  a new run E resumes D through the production argv (the manual R2 resume check is retired) and
  drives one `ExitPlanMode` turn whose dialog is deliberately never answered. A static tier
  asserts the interface strings Muster cannot drive (`CLAUDE_CODE_SCROLL_SPEED` via
  `LaunchEnv()`, theme enum, usage path/header, credential key, Keychain mechanism, flag name)
  in the installed bundle; a live tier runs the production Keychain reader, `FetchUsage` and
  `ReadThemeFamily` against Damian's real machine and **fails** — never skips — when a
  credential is missing, since a skip passes silently on the one machine the gate exists for.
  Cost: 4 haiku turns, 4 zero-token unauth runs, one zero-token resume, one HTTPS GET,
  ~2.3 min wall (was 3 turns / ~40 s). `MUSTER_CANARY_OFFLINE=1` stays zero-token.
- **`SubagentStop` is not a surface.** `interpret.go` treats it as `KindInert` and nothing reads
  it; its inventory row is dropped from the canary. Muster's only subagent dependency is
  `agent_id` on tool hooks / `PermissionRequest`, which stays an `/interface-probe` ritual.
- **One interactive residual.** Plan-mode step 3 (`PostToolUse{ExitPlanMode, acceptEdits}`)
  needs the permission dialog answered and stays a named probe ritual; steps 1–2 are asserted
  without answering it.
- **Measured mid-run, plan amended twice (non-protocol):** 2.1.267 preselects "No, exit" on the
  workspace-trust prompt, so the canary harness reads the selection marker instead of sending a
  blind Enter (Muster itself still never answers the prompt, §2.5); and the `ExitPlanMode`
  `PermissionRequest` carries no `permission_suggestions` — the quoted shape came from a `Write`
  request in default mode — so the key is optional and shape-checked only when present (no
  production code reads it). `spikes/canary-fields.md` records both.
- **Pin unchanged here.** Installed 2.1.267 vs pin 2.1.246 is expected drift;
  `TestInstalledVersionMatchesPin` red is by design and the bump is the pin-doc ritual after
  landing, not part of this plan.

### 2026-09-10 — the Claude Code pin becomes an observed, canary-extended verified range (plan `version-claude-interface`, via `/orchestrate`, closes #6)

- **Declaration, not mechanism.** Zero observed change points (every shape in
  `spikes/canary-fields.md` held 2.1.233 → 2.1.267, every delta an addition), so no
  version-gated adapters, no change-point table, no startup probe. The seam they would hang
  off — a parsed, comparable installed version inside `internal/claudecode` — is built.
- **Single source of truth** is the embedded record `internal/claudecode/observed_versions.txt`
  (one row per green canary version); `Floor()`/`Verified()` are its semver min/max. The pinned
  constant, the drift error and the equality check are gone; no other version literal lives
  outside the record and tests.
- **Classification** `unknown | below | verified | above`; startup logs one line per outcome and
  serves identically in all four (never refuses). `musterd -version` prints the range.
- **Protocol 2** (first bump): `hello.claudeCode` is `{installed, floor, verified, status}`,
  `installed` null iff `status` is `unknown`; the issue-capture snapshot follows. The masthead
  renders four states — a ⚠ glyph with hover text for `above`/`below`, in user terms (#6);
  no dismiss, nothing persisted.
- **Canary closes the loop.** Installed == ceiling and `MUSTER_CANARY_FORCE` unset → harness
  and live tiers skip (zero tokens); `go run ./tools/versions bump` after a green run outside
  the range appends the version and regenerates the doc fragments (`gen`/`check`, `check` in
  `make check`), leaving the tree uncommitted. `MUSTER_CANARY_OFFLINE` always wins.
- `docs/claude-code-pin.md` → `docs/claude-code-versions.md` (green ritual, red ritual, force
  convention, inferred-intermediates note). §8 dependency posture rewritten above; the post-v1
  "rethink the pin strategy" TODO item is folded in and closed.


### 2026-09-10 — repo public (`Zalaras/muster`, via `scripts/go-public.sh --yes`)

Closes the §8 "repo stays private" posture. The flip and the GitHub settings that go with
it were applied by the script and verified anonymously (`docs/go-public.md` §2–§3):
`protect-main` ruleset (block deletion + force-push, nothing else — `/land` still pushes
squashes straight to `main`); Actions restricted to GitHub-owned + verified creators,
read-only default token, first-time-contributor approval for fork runs; private
vulnerability reporting, Dependabot alerts, secret scanning + push protection on
(no Dependabot version PRs — no PRs accepted, pins are deliberate); projects/wiki/
discussions off, delete-branch-on-merge on; six topics. Existing releases became public
with the flip, binaries included (audit found nothing). Consequences now live in
`TODO.md` § Pre-v1 Cleanup: anonymous asset downloads work, so the `curl | sh` installer,
the Homebrew tap and the README install rewrite are unblocked (plan them together);
Actions minutes are free, so `make check` as a CI job and macOS runners are live calls.
Two operational lessons recorded in `docs/go-public.md`: the visibility flag needs
gh ≥ 2.65, and GitHub locks the repo for a few seconds after the flip (a 403 on the next
call — re-run, the script is idempotent).

### 2026-09-10 — The install front door is `curl | sh`, verified; brew and auto-update split

Supersedes the 2026-08-31 "Distribution settled" entry's front door (`make install` /
`gh release download`), which the flip above made obsolete rather than merely inconvenient.

- **`scripts/install.sh` is the install path**, and it needs no `gh` and no GitHub account.
  "Latest" resolves through the `/releases/latest` **redirect**, not the API: unauthenticated
  `api.github.com` allows 60 requests/hour per IP, the redirect is unmetered. The archive's
  **SHA-256 is checked against the release's own `checksums.txt`** before anything is
  installed — GoReleaser already publishes it, so this costs one small download, and an
  unverified `curl | sh` is the standard criticism of the shape. POSIX `sh` throughout,
  because macOS `/bin/sh` is bash 3.2 in POSIX mode.
- **No sudo and no confirmation prompt.** Default bin dir is `~/.local/bin`, always
  writable; an unwritable one fails naming the remedy instead of escalating. Piped to `sh`,
  stdin *is* the script, so a prompt would have to read `/dev/tty` for no benefit.
- **`make install` is a one-line wrapper** around the same script, so arch resolution, the
  fresh temp dir, the `tar` member-select and the shadow warning exist in exactly one place.
- **Homebrew is split out** of this work (Damian, 2026-09-10) and is its own `TODO.md` item.
  It is no longer *blocked* — the public repo removed the private-tap token cost the
  2026-08-31 entry named — only unscheduled.
- **Auto-update is likewise split out**, still wanting a `/spec` pass. The SHA-256 check
  here is a precedent for its verification question, not an answer to it.
- **The README is the front door too, and was cut 194 → 115 lines** on Damian's instruction
  to review the whole file, not just § Install: the naming blockquote, the layout tree, the
  milestone prose and the `gh` fences are gone; a dashboard screenshot and a licence section
  are in; the `Issue`-button detail moved to `CONTRIBUTING.md`, which had been pointing back
  at the README for it. Two README strings stay load-bearing and test-guarded: the preflight's
  two `brew` remedies and the `versions:range` fragment.

### 2026-09-10 — Homebrew tap scoped: `homebrew_casks`, a tap PAT, and Gatekeeper

Corrects two claims carried by the 2026-08-31 "Distribution settled" entry and repeated in
the 2026-09-10 entry below ("no longer *blocked* — the public repo removed the private-tap
token cost … only unscheduled"). Scoped against GoReleaser's own docs and this repo's
`.goreleaser.yaml` / `release.yml`; no work done, the item stays open in `TODO.md`, which
now carries the full shape.

- **`brews:` is fully deprecated as of GoReleaser v2.16**; prebuilt binaries publish through
  **`homebrew_casks:`**. `release.yml` floats on `version: "~> v2"`, so the old spelling would
  break on its own schedule.
- **The public flip removed the download-side token cost, not the publish-side one.** Users no
  longer need `HOMEBREW_GITHUB_API_TOKEN` or the custom download strategy — but
  `secrets.GITHUB_TOKEN` is scoped to `Zalaras/muster`, so committing a cask into a second
  repo still needs a fine-grained PAT (`contents: write`, tap repo only) wired through the
  cask block's `repository.token`. Brew is therefore *cheaper* than 2026-08-31 assumed, not
  free.
- **`musterd` is unsigned and unnotarized, and casks are quarantined** — a post-install
  `xattr -dr com.apple.quarantine` hook is required or the binary dies on first run. Recorded
  as a workaround, not a signing decision; signing stays unaddressed.
- **Two install paths will coexist and can shadow each other** (`~/.local/bin` vs Homebrew's
  prefix). This is a live constraint on the auto-update work: a self-replacing binary must not
  overwrite a brew-managed install.

### 2026-09-10 — auto-update: pref-gated check, explicit minisign-verified apply, in-place restart (plan `auto-update`, via `/orchestrate`)

Resolves the "auto-update wants a `/spec` pass" note in the install-front-door entry above.
Interview in `plans/auto-update/spec.md`; decisions:

- **One boolean pref, `updateCheck`, default on, governs checking only.** Off means no request
  to the release host at all — not at startup, not on a tick, and an in-flight result is
  discarded. Apply is never automatic: an **Update** button (swap the file, then "restart
  musterd to finish"), an **Update and restart** button (swap, confirm, in-place re-exec), or
  `musterd -update` (swap only, never restarts).
- **The check runs in the daemon**, once after listen and then every 24 h (`-update-check-interval`),
  and resolves "latest" through the `/releases/latest` **redirect** exactly as the installer
  does — the API's 60/h unauthenticated limit never applies. `-update-base-url ""` disables
  checking and apply entirely (the `IssueAPIURL` shape); every E2E daemon runs that way, so no
  test reaches github.com. Only a **strictly newer** `MAJOR.MINOR.PATCH` release badges.
- **Trust root is minisign, not the checksum alone.** The release's `checksums.txt` must carry a
  valid `.minisig` against a public key compiled into the binary (`internal/selfupdate/minisign.pub`,
  Damian's; the private key and passphrase are CI secrets he holds), and the archive's SHA-256
  must match that signed file. No unsigned fallback: a release without a `.minisig` is refused,
  and GoReleaser's `signs:` block fails the release rather than publishing one. Verification is
  `aead.dev/minisign` (§5 stack row), both signature modes.
- **A restart is not a shutdown.** `restart:true` stops HTTP/WS/ingest/store gracefully, never
  consults `-on-exit`, never kills a session, then `syscall.Exec`s the new binary in place with
  the same PID, `os.Args` and environment plus `MUSTER_RESTARTED=1` (which suppresses `-open`).
  Reconcile (§M4) re-adopts every Claude session; plain-terminal shells do not survive, so the
  confirm step names them.
- **Install kinds decide who may apply.** Classified once at startup from the resolved
  executable path: a non-release version string is `dev` (never checks, no buttons); a path
  under a Homebrew prefix is `homebrew` (badge, apply refused, remedy `brew upgrade musterd`);
  a directory the installer would not have written — unwritable, or inside a git tree below
  `$HOME` — is `unmanaged` (badge, apply refused, remedy names the installer); everything else
  is `installer`. Applies are serialised in-process (a second POST joins the first) and across
  processes by a non-blocking flock beside the binary.
- **All GitHub-release knowledge lives in `internal/selfupdate`**, the way Claude Code's wire
  format lives in `internal/claudecode`; the server owns the poller and the wire (`update`
  message, `POST /api/update/apply`, `GET /api/update/restart-impact` — protocol §3.17, §3.18,
  §5.7); `cmd/musterd` owns the flag, the classification and the re-exec.

### 2026-09-11 — `/triage` reads public issues through a program, not a model (direct on `main`)

The repo went public 2026-09-10, which made an issue body attacker-controlled text.
`/triage` was reading one straight into the main session — and the skill's
`allowed-tools: … Bash …` *granted* prompt-free Bash for exactly the turn that ingested it,
because `allowed-tools` grants rather than restricts. Design and residual risks:
`docs/design/triage-hardening.md`. Decisions, settled:

- **`TODO.md` is the target, not the triage moment.** Every later `/orchestrate`,
  `/plan-work` and `/triage --audit` session reads it with full tools, so a payload can lie
  dormant and fire in a more capable session weeks later. That is what the facts-only path
  exists to prevent, not the immediate turn.
- **Nothing between GitHub and the `TODO.md` diff is a model with tools.**
  `tools/triage` (new, dev-only — `.goreleaser.yaml` builds only `./cmd/musterd`) fetches,
  sanitises, routes, validates, splices and commits. `triage-proposer` — the first agent in
  this repo with a `tools:` field, which unlike a skill's `allowed-tools` genuinely
  restricts — summarises one artifact per subagent and holds nothing but `Read`.
- **Everything in the body is untrusted, including the snapshot JSON.** An author can edit
  their own issue forever and nothing binds that JSON to anything `musterd` emitted. Owning
  the schema buys a strict parser, never trust; the regenerated fact table is labelled
  *reported, not verified*, and a version field never justifies closing a report.
- **Drop-and-count, never reject.** The snapshot schema had already drifted — issue #9
  carries `claudeCode.{pinned,drift}` against today's `{installed,floor,verified,status}` —
  so `internal/triage/schema.go` is a union of every shape emitted, with retired rows kept
  deliberately. `internal/server/issue_snapshot_drift_test.go` asserts one direction only.
- **Never auto-close.** A tripwire hit *holds* an issue. Auto-closing would be an outward
  write driven by attacker input, it contradicts the close policy settled 2026-08-31, and on
  a public repo a false positive silently dismisses a real report. muster is a Claude Code
  tool, so issues legitimately discuss prompt handling: those false positives are accepted
  and cost a held issue, never a close.
- **Rejected: sandboxing.** Containment is for execution and the proposer has none;
  capability removal beats isolation for a job that only reads. Claude Code's Seatbelt
  sandbox also cannot give a hard network boundary from project settings
  (`sandbox.network.strictAllowlist` is user/managed scope only) and would add permission
  prompts, i.e. involvement.
- **Damian's involvement is unchanged** — pick a section, approve a duplicate-close,
  approve a dirty `TODO.md` — plus a held list that is empty on a normal run.
