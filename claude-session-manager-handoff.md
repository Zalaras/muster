# Claude Code Session Manager — Project Handoff

Context summary for starting a fresh session. Covers research findings, decisions made, and open questions.

---

## 1. Goal

- Build a personal session manager for multiple Claude Code sessions on macOS.
- Motivation is a tool the user actually wants plus the challenge/learning — not a commercial product.
- User only uses Claude Code (not Codex/Gemini/Aider), and will build it using Claude Code.

## 2. Original feature spec

- Overview of all sessions with custom titles.
- Alerts/notifications when a session needs input.
- A "top level" Claude session that can be asked about other sessions and can prompt them directly.
- Dashboard view of usage.
- Session view — all terminal sessions in a grid.
- Stretch: worktree and directory manager so multiple agents on one repo don't collide.
- Stretch (added later): MCP/tools permission UI that writes rules to Claude settings at user or project level.

## 3. What Claude Code already provides (don't rebuild)

- **Notification hook** fires with matchers `permission_prompt`, `idle_prompt`, `auth_success`; also `Stop`, `TeammateIdle`, `TaskCompleted`.
- Hooks can return a **`terminalSequence`** field that Claude Code emits through its own terminal write path — race-free, works in tmux; hooks cannot write to `/dev/tty` themselves.
- **OSC 0, 1, 2 are allowlisted** in `terminalSequence`, so hooks can set window/icon titles.
- **Session titles are native**: `claude --name "foo"` at launch, `/rename` mid-session, and a `SessionStart` hook can return `sessionTitle` (with `session_title` in its input so you don't clobber a user-set name). No need for your own ID→title map.
- **Cross-session messaging** (v2.1.224+, macOS/Linux, on by default): the model calls `ListAgents` and `SendMessage` on its own — this *is* the "top level session" feature.
- **`CLAUDE_CODE_MESSAGING_SOCKET`** is exported to hooks and Bash commands, so an external daemon can post into any session's inbox without faking keystrokes.
- Cross-session messaging caveats: plain text only (no history/files), delivery not guaranteed, receiver honours its `crossSessionInbound` setting (accept/hold/refuse).
- **Native worktrees**: `claude --worktree <name>` creates the worktree and opens Claude in it; `WorktreeCreate`/`WorktreeRemove` hooks exist; trees live under `.claude/worktrees/`.
- **Status line** receives a JSON payload on stdin including `rate_limits.five_hour` / `rate_limits.seven_day` (`used_percentage`, `resets_at`), `model`, `context_window.used_percentage`, `cost.total_cost_usd`, `cost.total_duration_ms`, and lines added/removed. This is the single best usage data source.
- `rate_limits` only populates for Pro/Max subscribers and only after the first API response in a session (empty on API-key auth, blank for the first frames).
- **HTTP hooks** (`type: "http"`) POST event JSON directly to a URL — register via `allowedHttpHookUrls`. Removes the need for wrapper scripts entirely.
- **`PermissionRequest` hook** can return `decision.behavior: "allow"` *and* apply a permission rule at the same time, so approving from a dashboard can persist the rule.
- Permission rules live in `permissions.allow` / `ask` / `deny` in `settings.json`, using `mcp__<server>__<tool>` naming (`.*` suffix for whole-server). Plugin servers use `mcp__plugin_<plugin>_<server>__`.
- **Claude Code's file watcher picks up settings.json edits automatically** — no session restart needed.
- Other data sources: `~/.claude/projects/*/<session-id>.jsonl` transcripts, `~/.claude/stats-cache.json` (local daily message/session/tool counts), OTel via `CLAUDE_CODE_ENABLE_TELEMETRY=1`.

## 4. What is NOT possible

- Cannot attach to Claude sessions started outside the manager — macOS gives no access to another process's PTY. **Sessions must be launched by the manager.** (User accepted this.)
- `/usage` is interactive-TUI only: can't be piped, not captured by `--debug`, and scraping its ANSI output is fragile. Don't screenshot it. An open feature request asks for `claude usage --json`.
- claude.ai's analytics dashboard is Team/Enterprise only and shows org-level adoption metrics, not per-session data.
- There is an undocumented `api.anthropic.com/api/oauth/usage` endpoint (auth via `~/.claude/.credentials.json`) that returns a Sonnet-only figure — works, unofficial, may vanish. Fallback only.
- Live context-window % and in-memory session state have no API beyond what the status line exposes.
- Cost figures on subscription plans are estimates, not billing.
- You cannot restyle anything *inside* a pane — Claude Code draws its own TUI. Customisation only applies to surrounding chrome.

## 5. Competitor landscape

| Tool | Runs Claude via | Cost / License | Notable |
|---|---|---|---|
| Conductor | **Agent SDK** | Free, proprietary | Best diff review w/ inline comments; bundles its own Claude Code version |
| Claude Squad | tmux + real CLI | Free, AGPL-3.0 | Diff tab, `gh` push; commit rate slowing (last commit Jun 2026) |
| ccmanager | Real CLI, no tmux | Free, MIT | Cross-branch conversation copy; small, active, easiest contribution target |
| agent-deck | tmux | Free, OSS | tmux status bar alerts |
| Pane (runpane.com, dcouple) | Real PTY, Electron+xterm.js | Free, AGPL-3.0 | Pane Chat orchestrator, `runpane` CLI, resource manager; 359 stars, `curl\|sh` install bypasses Gatekeeper |
| Pane (pane.works, bryantebeek) | tmux over SSH | Free, closed source | Native Swift + Ghostty, iOS app, tile-all-tabs grid, v0.5.0, signed/Homebrew |
| Sculptor | Containers | Free beta, proprietary | Container isolation + Pairing Mode |
| Nimbalyst (ex-Crystal) | "Pluggable harnesses" (unclear) | Free for individuals | Crystal deprecated Feb 2026 |
| Vibe Kanban | Subprocess | Free, Apache-2.0 | Bloop shut down Apr 2026, community-run |
| Superset | Electron + xterm.js | Source-available | Theme marketplace, remote workspaces |
| AgentsRoom | Real CLI | Commercial | E2E-encrypted mobile push |
| ccusage / ccstatusline | n/a | Free | The only tools doing usage properly; complement any manager |

**Features competitors have that weren't in the original spec:**

- **Diff review with inline comments fed back to the agent** — repeatedly cited as the real killer feature, not parallelism. Biggest gap in the spec.
- Ship flow: git status / CI / deployments / todos tab, PR create + merge + archive.
- Per-workspace setup and run scripts, copying untracked `.env` files into new worktrees, per-workspace port allocation.
- Starting a workspace from a branch, PR, GitHub issue, or Linear issue.
- Agent-agnostic support (Codex, Gemini, Aider, Cursor, OpenCode) with named profiles.
- Container isolation as an alternative to worktrees.
- Remote/SSH workspaces, and mobile apps for review/resume.
- Auto-accept ("yolo") mode; session forking; session pause/checkout.
- Multi-repo project registries; resource gauges; agent-operable CLI so agents can drive the manager.
- At least one TUI already advertises MCP management — so that feature is less unique than first assumed.

**Genuinely unclaimed differentiators:** surfacing per-session `rate_limits`, and permission decisions from a dashboard that write durable rules.

## 6. CLI vs Agent SDK — a hard requirement

- User requires driving the **real `claude` CLI binary**, not the Agent SDK.
- Reason it matters: `terminalSequence` is **ignored** in `-p` mode and in the Agent SDK, and the status line is a TUI-only feature — so SDK-based tools silently break both the notification and usage features.
- Conductor is disqualified on this basis (uses Agent SDK, and Anthropic's May 2026 subscription policy change for third-party Agent SDK tools was delayed indefinitely on 15 Jun 2026 — delayed, not cancelled).
- Heuristic: any tool supporting Aider/Goose/Gemini CLI must be spawning real binaries in a PTY.
- Verification test: `ps -ef | grep '[c]laude'` should show the binary as a child process; then confirm `/statusline` renders and a `SessionStart` hook fires.

## 7. Security findings

- Claude Code's macOS Keychain item is **not bound to the CLI binary's code signature** — any process running as your user can read it, and one read yields a long-lived refresh token.
- CVE-2026-27487: OS command injection in the macOS credential-refresh path, fixed in 2026.2.14. Keep Claude Code updated.
- A session manager doesn't meaningfully widen this since it must run `claude` as you anyway.
- Realistic risk is **supply chain**, not malicious maintainers — npm/Electron apps with auto-update and large dep trees (e.g. the TeamPCP campaign that compromised Trivy, Checkmarx, and npm packages).
- MCP servers are usually npm packages that receive credentials at startup — typosquats get real tokens.
- A manager that auto-spawns sessions across repos can paper over Claude Code's workspace-trust prompt, which is where project hooks get authorised. Handle deliberately.
- Mitigations: avoid `curl | bash`; prefer signed releases; keep secrets out of `.mcp.json`; add `Read(./.env*)` to global deny; if a credential leak is suspected, `/logout` and re-login (rotation is the only remedy).

## 8. Decisions made

- ✅ Build own tool (user wants the challenge/learning).
- ✅ Language: **Go**.
- ✅ **GUI**, not TUI.
- ✅ Sessions launched by the manager (constraint accepted).
- ✅ Real CLI only — no Agent SDK.
- ⬜ Open: browser vs desktop shell (recommendation: build for both, see below).
- ⬜ Open: xterm.js vs Go-side emulation for terminal rendering.

## 9. Recommended architecture

- **Split from day one**: `relayd` (Go daemon: hook ingestion, state, SQLite, tmux control, WebSocket fanout) + a frontend that is just a client.
- **Build the frontend as a plain web app talking to the daemon over WebSocket**, then wrap it in Wails (~40 lines) for a desktop window. Same code serves `http://localhost:7777` for phone access. Defers the desktop/browser decision entirely.
- Suggested layout: `relayd/`, `web/`, `cmd/relay-desktop/`.
- **Use tmux rather than owning PTYs in v1** — `list-panes -F` to enumerate, `capture-pane -p -e` to read, `send-keys` to write. Sessions then survive daemon crashes.
- Define a `Pane` interface (`Snapshot() []Cell`, `SendKeys(string)`) backed by tmux first, so a real emulator can be swapped in later without touching UI code.
- Skip OTel initially — the status line POSTing its stdin JSON to the daemon gives rate limits, cost, and context % in ~10 lines.

## 10. Technology notes

- **Wails v3** is in beta as of Aug 2026 (`v3.0.0-beta.0`): desktop API stable, teams shipping production, but not final 3.0. v2 remains the stable release. Uses system WebKit/WebView2 — no bundled Chromium, binaries in MB. v3 adds first-class multi-window.
- **xterm.js** (`@xterm/xterm`) is an *emulator*, not a renderer — the hard part is VT220/xterm compliance (alt screen, scroll regions, SGR, grapheme widths, phantom wrap, mouse reporting, reflow). Gives selection, search, links, WebGL renderer, accessibility for free.
- **tmux is already a terminal emulator** — `capture-pane -p -e` returns the rendered screen with ANSI intact, so a read-only preview grid needs no emulator at all.
- **`charmbracelet/x/vt`** is a real Go virtual terminal: VT220-compatible, alt screen, scroll regions, grapheme-aware widths, plus `SendKey`, `SendMouse`, `Render`, `Resize`, scrollback. This is the answer to "can I do it all in Go" — yes. Supersedes the quieter `hinshun/vt10x` / `chubin/vt10x`.
- **Alternative to xterm.js in the browser**: run `x/vt` in Go, diff the cell grid, push changed cells over WebSocket, paint to `<canvas>` (~250 lines JS). Full control of font/cursor/colour/cell metrics; cost is reimplementing selection, copy, scrollback UI, and canvas perf work.
- **Gio + `x/vt`** = pure Go, maximum control, most work — a month, and a separate project from the session manager.
- **Fyne**: avoid; its widget/text model fights dense terminal grids.
- Other libs: Bubble Tea/Lipgloss/Bubbles (if any TUI), `fsnotify` (tail transcripts + watch settings), `modernc.org/sqlite` (pure Go, no cgo, use WAL), `creack/pty`, `os/exec` for git (matches what Claude Code does; avoids go-git drift).
- Perf reality check: 6 panes × 80×24 = ~11.5k cells; diff server-side, push at 10fps, don't pre-optimise.

## 11. Gotchas

- `PermissionRequest` hooks **block the session** while you decide — set the timeout deliberately; a timed-out HTTP hook renders no decision and the normal prompt proceeds, so the UI must lose gracefully.
- Hooks run **in parallel**, so events arrive out of order — sequence them on arrival.
- The transcript JSONL is written **asynchronously** and lags the live conversation — never treat it as current state.
- Use hooks for state and `capture-pane` only for display; parsing ANSI to infer "is it waiting" is how existing tools ended up with heuristics.
- `capture-pane` returns the pane at *its* dimensions — ~~call `tmux resize-pane -x -y` to match your grid cell~~ **FALSIFIED 2026-08-16:** `resize-pane` exits 0 and silently no-ops on a single-pane window. Call `pty.Setsize` on the attach PTY **and** `tmux resize-window -t <session> -x C -y R`; both are required. See `spikes/FINDINGS.md`.
- Skip `tmux -CC` control mode unless polling proves too slow; `%output` parsing is a headache.
- Don't use an LLM to edit `settings.json` — deterministic JSON merge with atomic write. A cheap model is useful only for *suggesting* a rule (e.g. generalising `Bash(git push origin feature/x)` to `Bash(git push:*)`) with a blast-radius explanation.

## 12. Suggested v1 scope

- Daemon + HTTP hooks + SQLite + a session list sorted by who's been blocked longest, plus macOS notifications.
- Add the status line POST for usage data from day one so history accumulates.
- Grid, permissions UI, and worktree manager come after.
- **Add a diff viewer earlier than planned** — without one this tool gets abandoned after a week in favour of Conductor/Pane.

## 13. Design work already done

- An HTML mockup exists covering five views: Overview (with an "attention ribbon" showing per-session state over the last 60 min), Session grid, Usage, Worktrees, and Permissions.
- Organising principle: **your attention is the scarce resource, not compute** — sessions sort by longest-blocked, and the usage view tracks "you were the bottleneck: 38m" alongside spend.
- Permissions view has three parts: live decision queue with blast-radius framing, MCP server/tool inventory with allow-ask-deny per tool, and a preview of the exact settings.json diff before writing.
