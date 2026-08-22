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

- [x] **AI build harness — base** (next-steps.md item 3): `CLAUDE.md`, project
      `.claude/settings.json` allow-list, context7 MCP (`.mcp.json`), stack patterns
      (SPEC §5 + `docs/conventions.md`). Done 2026-08-16.
- [x] **H1 — multi-agent pipeline** (built 2026-08-16): mdrostering's skills + agents
      adapted to Muster — `/spec`, `/plan-work`, `/orchestrate`, `/work-status`; agents
      `daemon-impl`/`daemon-tests`/`web-impl`/`web-tests`/`e2e-specs`/`review-work`
      (Sonnet workers + Opus review); Vitest added (`make web-test`); Playwright now
      uses per-run ports with no server reuse; doc-upkeep backstop replaces MDR's
      changelog check; workflow section added to CLAUDE.md.
      **Acceptance passed 2026-08-22**: the m0-skeleton plan ran through `/plan-work` +
      `/orchestrate` end to end (e2e-specs → impl ∥ impl → tests ∥ tests → e2e-validate →
      review), approved on the first review cycle with zero fix waves.
- [x] **H2 — `interface-probe` skill** (done 2026-08-16): rig ported to `test/rig/`
      (`newprobe.sh`, `capture/`, `failproxy/`; instances stamp into `/tmp/muster-probe`
      to keep parent CLAUDE.md files out of probe sessions), encoded as
      `.claude/skills/interface-probe/SKILL.md`; `spikes/RIG.md` marked historical.
      Acceptance passed: Stop-vs-StopFailure settled (mutually exclusive per prompt),
      and `--resume` verified while the rig was warm. See SPEC §11 changelog (H2 entry).
- [x] **UX flows** (next-steps.md item 4, first half; done 2026-08-16): new-session flow
      and the launch/worktree data layer settled — SPEC §9 Q2 resolved. Written up in
      `docs/design/ux-flows.md`; SPEC §11 has the changelog entry.
- [x] **Visual design** (item 4, second half; done 2026-08-16): **direction A "instrument"**
      chosen; `docs/design/design-system.md` written and wired into `review-work`'s
      checklist (the placeholder is gone). System font stacks only — nothing vendored,
      nothing fetched. Attention ribbon deferred post-v1. Tiled view designed
      (`docs/design/mockups/d-tiled.html`) as an **M2+** surface.

## M0 — Skeleton

- [x] Write down the daemon↔UI protocol before coding it: WS message contract, HTTP
      endpoints, and the state-machine transitions, precisely (next-steps.md item 5).
      Done 2026-08-20 → `docs/protocol.md` (v1; per-milestone map in its §8)
- [x] `musterd`: HTTP + WebSocket server, token auth on localhost (SPEC §2.6).
      Done 2026-08-22 (plan `m0-skeleton`, via `/orchestrate`)
- [x] SQLite via `modernc.org/sqlite`, WAL; schema per SPEC §7 — M0 ships only the
      tables it writes (`kv`, `event`); `session`/`repo`/`usage_sample` land with the
      milestones that first write them. Done 2026-08-22
- [x] `internal/claudecode` ingest: hook receiver + status-line receiver (both shapes,
      per-`claude_session_id` seq, bounded async queue). Done 2026-08-22
- [x] Web shell that connects and stays connected (backoff reconnect, daemon-down
      banner, protocol-version gate). Done 2026-08-22
- [x] E2E harness that runs a scratch daemon (per-run port + data dir, sqlite3 oracle,
      `restart()`). Done 2026-08-22

Follow-ups from the M0 review (`plans/m0-skeleton/review.md`, both Major — fix before M1):

- [x] **D4 check vs test bodies** — resolved 2026-08-22 (Damian chose the helper over
      narrowing the check): `internal/claudecode/claudecodetest` now exports the
      wire-body builders (`RawHookBody`, `EnvelopedHookBody`); the split literal in
      `internal/server/ingest_test.go` is gone and D4 stands unchanged at full strength.
- [x] **Daemon-down banner colour** — resolved 2026-08-22: dedicated `--banner-bg` /
      `--banner-line` / `--banner-fg` tokens added to design-system §1 (values from
      `a-instrument.html`'s `.down`) and `web/src/style.css` repointed; `--rose` again
      means Failed only.
- [x] Minor (same review) — resolved 2026-08-22: the E2E harness now drains and buffers
      the scratch daemon's stdio, dumps the tail on unexpected exit, and appends it to
      the never-became-healthy error.

Design constraints already settled by the spikes — do not re-derive:

- Hooks carry **no timestamp or sequence number**. Assign a monotonic per-session `seq` at
  ingest; `prompt_id` / `tool_use_id` are the only correlation keys.
- Hook receipt must **return 200 immediately and process asynchronously**. A slow receiver
  taxes every turn by its `timeout`, additively, per hook. Use timeouts of **1–2 s, not 5**.
- `SessionStart` is **silently never delivered over `type:"http"`** — needs a
  `type:"command"` wrapper. Everything else works over HTTP.
- Session identity keys on the **tmux target**, not Claude's `session_id` (`/clear` starts a
  new one in the same pane).

## M1 — Sessions exist ✅ done 2026-08-22 (plan `m1-sessions`, via `/orchestrate`)

- [x] Launch `claude` in tmux from the dashboard (directory picker + title).
      Done 2026-08-22 — plus `GET /api/browse` (daemon-backed folder browser; the
      "native chooser" idea was wrong — browsers never reveal absolute paths)
- [x] Ingest `SessionStart` / `Stop` / `StopFailure` / `Notification` — envelope binding
      by `musterSession`, raw routing by Claude session id, unknown ids persist unrouted
- [x] State machine: Started · Planning · Working · Needs-Input · Failed · Idle
      (`internal/session` over neutral `StateInput`; interpreter in `internal/claudecode`)
- [x] Session list UI: title, state, repo/branch, time-in-state, blocked-longest first
- [x] Lay the masthead out with the **view switcher slot present** even though Tiles ships
      in M2 — adding the second view must move nothing
- [x] **Settle first:** does `Stop` also fire alongside `StopFailure`, or is it replaced?
      **Replaced — never both** (H2 probe 2026-08-16, SPEC §9.3). Caveat: a killed session
      emits *neither* (only `SessionEnd`), so the state machine must not assume every
      prompt closes with a Stop-family event.
- [x] Latch `permission_mode` forward — it is absent from `SessionStart`, `SessionEnd`,
      `Notification`, `StopFailure` and `PreCompact`, and from the status line entirely

Follow-ups from the M1 reviews (three cycles; final verdict approved 2026-08-22):

- [ ] **Claude Code pin drift — decision needed**: `docs/claude-code-pin.md` pins
      **2.1.233**, but the installed binary is **2.1.240** and `spikes/canary-fields.md`
      now carries measurements against 2.1.237 and 2.1.240. Either bump the pin (gated by
      `make canary` per the ritual) or reinstall the pinned version — stop the silent drift.
- [ ] **For M2 plan-work** (review cycle-1 Minor 13 / cycle-2 Minor 6): add REQ-21's `⟳n`
      compaction counter to the Testable UI Elements table so it gets an E2E assertion;
      and give the E2E harness a way off the real `$HOME` for browse tests — a
      `-home-dir`-style flag on `GET /api/browse`'s default, or a path input in the modal.
- [ ] Cosmetic (cycle-3 minor): with the launch modal already open, ⌘N now falls through
      to the browser's new-window shortcut — the `dialog.open` early-return sits above
      `preventDefault()` in `web/src/render/launch.ts`; swap the two lines to swallow it.

## M2 — Terminal panes

- [ ] PTY ↔ WebSocket bridge to tmux; xterm.js panes; click-to-focus; typing
- [ ] **Tiles view** — A's second view, a peer of Focus, not an extra
      (`docs/design/mockups/d-tiled.html`). Live tiles = top N by attention, rest are
      snapshot cards in the strip; density control (2×2 / 3×2) changes tile geometry
- [ ] View switcher in the masthead + **⌘\\** toggle; chosen view persists across reloads
      and daemon restarts. Switching **moves** geometry ownership rather than duplicating
      it, so it resizes real tmux windows: debounce ~100 ms and touch only the sessions
      whose live surface actually changed
- [ ] Sizing: drive **both** `pty.Setsize` *and* `tmux resize-window`, in that order.
      `resize-pane` exits 0 and silently no-ops on a single-pane window.
- [ ] One geometry per session, ≤ the smallest live view. The session list must **not** open
      a second live client at a smaller size — use a static snapshot.
- [ ] tmux owns scrollback: set xterm `scrollback: 0`
- [ ] Set `LANG`/`LC_ALL` on session creation — a process spawned by a Go daemon has none,
      and the failure looks like a totally broken bridge

## M3 — Gauges

- [ ] Status-line POST ingestion, de-duplicated (posts arrive in close pairs ~435 ms apart).
      Note: `event.received_at` is second-granularity RFC3339 since M0 — switch the stamp
      to RFC3339Nano before relying on it to separate those pairs (M0 review minor)
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
- [ ] `--resume` for dead sessions — mechanics verified by the H2 probe (`source: "resume"`,
      same `session_id`); the M4 work is building reconcile on top of it
- [ ] Full canary E2E: unskip the assertions in `test/canary/canary_test.go`
- [ ] Surface "daemon down" prominently — while it is down, every managed pane fills with
      hook-error lines

## M5+ (v1.x, re-rank when reached)

Plan-mode flow (§4.1) → worktree manager with setup scripts (§4.2) → start-from-PR/issue
(§4.3) → permissions UI (§4.4) → `code <worktree>` button (trivial, anytime).

## Open questions carried forward

From `spikes/FINDINGS.md` "Still open" and SPEC §9. None block M0.

- [x] **`--resume` never exercised** — settled (H2 probe 2026-08-16): `SessionStart` fires
      with `source: "resume"` and the **same** `session_id`/`transcript_path`, so reconcile
      can re-bind deterministically. (Interactive resume / different-cwd not exercised.)
- [x] **`Stop` alongside `StopFailure`?** Settled (H2 probe 2026-08-16): replaced, never both.
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
      without building the API/OTel sources. Protocol-side seam settled 2026-08-20
      (`usage.source` field, `docs/protocol.md` §5.4); the Go interface shape is still open.
- [x] **Hook command wrappers and the pane environment** — settled (probe 2026-08-20,
      against 2.1.237): the `SessionStart` wrapper and status-line script see both
      `$TMUX_PANE` and `tmux new-window -e`-injected vars, headless and interactive.
      Protocol §4.2's envelope binding is measured, not assumed.
- [x] **`SessionStart.source` on `/clear`** — settled (probe 2026-08-20): it's
      `source: "clear"` with a new `session_id`, preceded by `SessionEnd` with
      `reason: "clear"` for the old id. A `reason:"clear"` SessionEnd is NOT a death hint.
- [x] **Where Muster writes its per-directory Claude Code config** — settled (probe
      2026-08-20): `.claude/settings.local.json` alone honors `hooks`, `statusLine` and
      `allowedHttpHookUrls`, and Claude Code gitignores it — so M1 writes the local file
      and the ingest token never lands in committable config.
