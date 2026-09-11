# Muster — Claude Code session manager · first-pass specification

Name: **Muster** — settled 2026-08-16 (was working title "CCC"; daemon binary `musterd`).
Chosen to be agent-CLI-agnostic: nothing in the name ties it to Claude, so supporting other
agent CLIs later costs no rename.
Produced from the spec interview on 2026-08-16. Companion documents: `interview-notes.md`
(everything discussed that isn't spec material), `docs/history/spec-changelog.md` (how every
decision below was reached or changed, newest last) and `docs/research/claude-session-manager-handoff.md`
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
  of which Muster theme is active (spec-changelog 2026-09-02, plan `new-ui-design-colors`).
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
   second concrete holder (`ModelScoped`), still no interface — see `docs/history/spec-changelog.md`. Wire seam (`usage.source`) settled 2026-08-20.
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

`docs/history/spec-changelog.md` — append-only, newest last. A settled or changed decision gets
an entry there **and** the edit to the section above that it changes; the entry is never the
only place a decision lives.
