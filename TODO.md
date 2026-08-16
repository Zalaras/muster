# Muster backlog

Derived from `SPEC.md` §10 (build order) and §9 (open questions & risks). `SPEC.md` stays
authoritative — this file tracks execution, not decisions.

Milestone rule from the spec: **each milestone ends with something used day-to-day.**

## Setup — next-steps.md item 2 ✅ done 2026-08-16

- [x] Name settled (**Muster**); repo, module `github.com/Zalaras/muster`, binary `musterd`
- [x] Go toolchain: module, golangci-lint v2 config, testify
- [x] Frontend stack settled: Vite + TypeScript, no framework; `.nvmrc` pins Node 24.19.0
- [x] Playwright scaffold + smoke test
- [x] Canary skeleton, executable inventory from `spikes/canary-fields.md`
- [x] Version pin documented (`docs/claude-code-pin.md`); drift detection in `musterd`
- [x] Backlog (this file)

## Before M0

- [ ] **AI build harness** (next-steps.md item 3): agents, skills, `CLAUDE.md`, project
      `.claude/settings.json`. Explicitly not part of SPEC.
- [ ] **UX design** (next-steps.md item 4): new-session flow and the worktree data layer
      (SPEC §9.2 — the one genuinely unsettled area), then visual design. Must land before
      M1/M2 UI work, not before M0.

## M0 — Skeleton

- [ ] Write down the daemon↔UI protocol before coding it: WS message contract, HTTP
      endpoints, and the state-machine transitions, precisely (next-steps.md item 5)
- [ ] `musterd`: HTTP + WebSocket server, token auth on localhost (SPEC §2.6)
- [ ] SQLite via `modernc.org/sqlite`, WAL; schema per SPEC §7
- [ ] `internal/claudecode` ingest: hook receiver + status-line receiver
- [ ] Web shell that connects and stays connected
- [ ] E2E harness that runs a scratch daemon

Design constraints already settled by the spikes — do not re-derive:

- Hooks carry **no timestamp or sequence number**. Assign a monotonic per-session `seq` at
  ingest; `prompt_id` / `tool_use_id` are the only correlation keys.
- Hook receipt must **return 200 immediately and process asynchronously**. A slow receiver
  taxes every turn by its `timeout`, additively, per hook. Use timeouts of **1–2 s, not 5**.
- `SessionStart` is **silently never delivered over `type:"http"`** — needs a
  `type:"command"` wrapper. Everything else works over HTTP.
- Session identity keys on the **tmux target**, not Claude's `session_id` (`/clear` starts a
  new one in the same pane).

## M1 — Sessions exist

- [ ] Launch `claude` in tmux from the dashboard (directory picker + title)
- [ ] Ingest `SessionStart` / `Stop` / `StopFailure` / `Notification`
- [ ] State machine: Started · Planning · Working · Needs-Input · Failed · Idle
- [ ] Session list UI: title, state, repo/branch, time-in-state, blocked-longest first
- [ ] **Settle first:** does `Stop` also fire alongside `StopFailure`, or is it replaced?
      (SPEC §9.3, `spikes/FINDINGS.md` still-open item 6.) Gates the state machine.
- [ ] Latch `permission_mode` forward — it is absent from `SessionStart`, `SessionEnd`,
      `Notification`, `StopFailure` and `PreCompact`, and from the status line entirely

## M2 — Terminal panes

- [ ] PTY ↔ WebSocket bridge to tmux; xterm.js panes; click-to-focus; typing
- [ ] Sizing: drive **both** `pty.Setsize` *and* `tmux resize-window`, in that order.
      `resize-pane` exits 0 and silently no-ops on a single-pane window.
- [ ] One geometry per session, ≤ the smallest live view. The session list must **not** open
      a second live client at a smaller size — use a static snapshot.
- [ ] tmux owns scrollback: set xterm `scrollback: 0`
- [ ] Set `LANG`/`LC_ALL` on session creation — a process spawned by a Go daemon has none,
      and the failure looks like a totally broken bridge

## M3 — Gauges

- [ ] Status-line POST ingestion, de-duplicated (posts arrive in close pairs ~435 ms apart)
- [ ] Per-session context gauge — show absolute `total_input_tokens` alongside the
      percentage (window size varies by model), plus a compaction counter from `PreCompact`
      (the gauge reads 0% after `/compact`)
- [ ] Account usage bars: `five_hour` and `seven_day`; `resets_at` is a Unix epoch int,
      `used_percentage` a float
- [ ] Render **"unknown", not an empty gauge**, before a session's first API response —
      `rate_limits` is absent and the context fields are null (SPEC §9.9)
- [ ] Persist `usage_sample` history

## M4 — Durability → v1 complete

- [ ] Reconcile on daemon start; tmux pane existence is the authority on liveness
      (`SessionEnd` never fires on `kill -9`)
- [ ] `--resume` for dead sessions — **unverified**, see open questions below
- [ ] Full canary E2E: unskip the assertions in `test/canary/canary_test.go`
- [ ] Surface "daemon down" prominently — while it is down, every managed pane fills with
      hook-error lines

## M5+ (v1.x, re-rank when reached)

Plan-mode flow (§4.1) → worktree manager with setup scripts (§4.2) → start-from-PR/issue
(§4.3) → permissions UI (§4.4) → `code <worktree>` button (trivial, anytime).

## Open questions carried forward

From `spikes/FINDINGS.md` "Still open" and SPEC §9. None block M0.

- [ ] **`--resume` never exercised** — `SessionStart` with `source=resume`, and whether
      titles survive it. Shapes reconcile (M4).
- [ ] **`Stop` alongside `StopFailure`?** Gates the M1 state machine.
- [ ] **`refreshInterval` unit** — proven not milliseconds; seconds-vs-ignored undetermined.
      Matters only if usage must tick while idle.
- [ ] **Hook ordering under heavy concurrency** — no inversion observed at four parallel
      tool calls; low risk given turn-level transitions.
- [ ] **`StopFailure` error taxonomy** — 2 of 9 types induced; 7 unobserved.
- [ ] **Status-line behaviour on failure paths** — does a session that never reaches a first
      API response ever emit usable usage data?
- [ ] **Launch/worktree data-layer design** (SPEC §9.2) — genuinely unsettled; design during
      §2.5, revisit at §4.2.
- [ ] **Usage-source interface shape** (SPEC §9.6) — how much structure to give it now
      without building the API/OTel sources.
