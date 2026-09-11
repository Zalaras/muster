# Muster — interview notes & decision log (2026-08-16)

Everything from the spec interview that didn't belong in `SPEC.md`: rejected options and
why, context behind decisions, and the disposition of the earlier research/mockup. Read
`SPEC.md` first; this file exists so no reasoning from the session is lost.

## Status of the prior material

- `docs/research/claude-session-manager-handoff.md` — research from an earlier session. **Nothing in
  it was a decision**; it's a reference for Claude Code capabilities, competitor
  features, gotchas, and security findings. Its "Decisions made" section is superseded
  by SPEC.md (though most survived re-examination: Go, GUI, real CLI, manager-launched
  sessions).
- `session-manager-mockup.html` (deleted 2026-09-04 ahead of open-sourcing; the notes below
  are the record) — a five-view mockup made under the working name **"Relay"**. That name is dead (Damian never chose it). Mockup disposition:
  - **Overview view** — closest to v1; but the "lead session" chat panel is cut, and the
    attention-ribbon (60-min state timeline) is unrated — nice visual, decide during build.
  - **Session grid** — survives as the interactive panes (must-have).
  - **Usage view** — survives minus cost tracking, tokens-by-day/OTel, tool-call counts,
    and "you were the bottleneck" (all cut with cost/notifications).
  - **Worktrees view** — survives as v1.x nice-to-have.
  - **Permissions view** — heavily simplified: only a basic user-level allow/ask/deny
    editor survives (v1.x); the live decision queue with blast-radius framing and the
    settings-diff preview are cut-for-now.

## How Damian actually works (context behind the requirements)

- 3–6 sessions in macOS Terminal tabs, single window. Deliberately never starts sessions
  in the VSCode terminal/plugin — separate windows get lost. Precedent that "all
  sessions in one place" is a habit he'll keep; launching only via Muster is not a burden.
- Runs mostly in **auto-accept mode**, so routine permission prompts are *not* the pain.
  The pain is **plan mode**: research prompts interrupt before the plan exists, and
  post-approval execution needs babysitting. This reframed the mockup's permission-queue
  feature into the plan-mode flow (SPEC §4.1).
- Reviews agent output today outside any manager; has private ideas for diff review but
  deliberately kept it out of scope despite research calling it "the killer feature".
  The `code <worktree>` button is acknowledged as a placeholder hack.
- Success framing was pure **awareness** (usage, context, state, navigation), not
  parallelism or throughput.

## Rejected options, with rationale

| Option | Verdict | Why |
|---|---|---|
| Dashboard-beside-terminal only (derived state, jump to Terminal tab) | Rejected mid-interview | Originally chosen (option "b"), then upgraded: read-only → interactive panes is an architectural rework, so full terminal went in from the start. The dashboard became the primary workspace. |
| TUI | Rejected | GUI preferred; TUI acceptable only with mouse support, and GUI won anyway. |
| Rust | Rejected | Considered, but no time to learn something new; Go is the daily language. |
| Native Go GUI (Gio + x/vt) | Rejected | A month of terminal-renderer work; a separate project in itself; closes off phone access. |
| Fyne | Rejected | Widget/text model fights dense terminal grids (research finding). |
| Electron | Rejected | Heavy, big dep tree (supply-chain surface), no upside over Wails given a web frontend. |
| Wails now | Deferred | Browser app-window first; Wails is a thin cosmetic wrapper to add later if a dock icon matters. |
| Agent SDK instead of real CLI | Rejected (inherited from research, unchallenged) | `terminalSequence` and the status line die in SDK/`-p` mode — kills notification and usage data sources. |
| Go-side VT emulation + canvas renderer instead of xterm.js | Rejected for v1 | Full control but reimplements selection/scrollback/copy; xterm.js gives them free. Could revisit if xterm.js disappoints. |
| macOS notifications | Cut by design | "The point is to be working in the dashboard." If the dashboard turns out not glanceable enough in practice, revisit. |
| Cost/spend tracking | Cut | Not what he cares about; usage limits are the real constraint on a subscription. |
| Lead orchestrator session in the dashboard | Cut | Native cross-session messaging (ListAgents/SendMessage) already covers it; can run a lead session in a normal pane. |
| Ship flow (PR create/merge, CI status) | Cut-for-now | |
| Session forking / pause-checkout | Cut-for-now | "You can kind of do that anyway" — worth *tracking* in the dashboard someday, not building. |
| Browsable dead-session history | Future | Event log table already accommodates it. |
| Containers as isolation | **Never** | Not everything runs cleanly in containers; resource hungry. |
| Resource gauges (CPU/RAM) | **Never** | |
| Second machine, one dashboard | **Never** | |
| GitHub MCP for PR/issue integration | Rejected in favor of `gh` CLI | Damian would prefer MCP in principle but believes it lacks needed tools; expects `gh` in practice. |
| Per-project permission scoping in the permissions UI | Cut | Basic version is user-level only: one set of rules for all projects. |

## Ideas parked with architectural notes

- **Shared MCP servers across sessions** — today e.g. a Grafana MCP spins up a Docker
  container *per session*. Wanted someday: one server instance shared by all sessions.
  This is an MCP proxy — a separate project. If it ever happens, Muster's daemon is the
  natural host. No v1 accommodation made.
- **Phone/remote access** — the *only* reason the frontend is browser-served. Adding it
  means real auth (or Tailscale) — nothing else was pre-built for it.
- **Other agent CLIs** (maybe) — the only concession is the `internal/claudecode`
  adapter package boundary; explicitly *not* a generic multi-agent abstraction layer
  (dismissed as over-engineering for a personal tool).
- **Auto-accept while planning** (SPEC §4.1) — worth remembering this was Damian's own
  correction of a misread: not "auto-accept toggle in general" (exists natively) but
  auto-accepting *research prompts during plan mode*, which Claude Code doesn't offer.

## Facts worth keeping from the research (not restated in SPEC)

The handoff doc remains the reference; highlights that shaped decisions:

- Session titles, cross-session messaging, `--worktree`, HTTP hooks, and the status-line
  JSON are all **native Claude Code features** — Muster leans on them instead of rebuilding.
- `/usage` is TUI-only (no `claude usage --json` yet); the undocumented
  `api.anthropic.com/api/oauth/usage` endpoint exists but is Sonnet-only and may vanish
  — fallback material for the pluggable usage source, nothing more.
- Genuinely unclaimed competitor gaps at research time: surfacing per-session
  `rate_limits`, and dashboard permission decisions that write durable rules. Muster's v1
  hits the first; the second was simplified to the v1.x basic permissions UI.
- Security posture notes: Claude Code's Keychain item is readable by any same-user
  process (why the token-file residual risk was accepted); CVE-2026-27487 fixed in
  2026.2.14 — keep Claude Code updated even while version-pinning (pin deliberately,
  don't stagnate); realistic threat is supply chain → keep the dep tree small, no
  `curl | bash`, secrets out of `.mcp.json`, `Read(./.env*)` in global deny.
- A manager that auto-spawns sessions across repos can paper over Claude Code's
  workspace-trust prompt (where project hooks get authorized) — handle deliberately
  when building §2.5's launch flow.

## Process agreements

- **Before any build work**: a separate session creates the AI build harness — agents
  and skills for developing Muster. Not part of the spec.
- Testing bar (also in SPEC): functional E2E always; unit tests confirm specific logic.
- Repo private for now; licence **MIT** (decided 2026-09-04, see `docs/history/spec-changelog.md`).
- Naming: **settled on "Muster" 2026-08-16.** Earlier candidates "CCC (Claude Code Control)"
  and "Claude Control Plane" were dropped on two constraints Damian raised: the name must not
  collide with an existing product/trademark, and it must not contain "Claude"/"cc" because a
  potential future state supports other agent CLIs. Checked and rejected on those grounds:
  `tower` (Git client), `wheelhouse` (registered TM, Ridgeline Solutions), `belfry` (active
  company), `roost`/`pitwall` (crowded), `ccmux` (Claude-specific). "Muster" was clear —
  only two dormant Go libraries, no product, no trademark — and it describes the job:
  assemble a group and review it. Runners-up were `reeve` and `drover`.
  "Relay" (mockup) is retired.
