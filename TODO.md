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

- [ ] **Claude Code pin — deferred to post-v1** (decided 2026-08-22): the drift stands
      (pin 2.1.233, installed 2.1.240, measurements against three versions) until v1
      ships. Then **rethink the pin strategy itself**, not just bump it: Claude Code
      releases most weekdays, so a static pin + manual canary ritual churns constantly.
      Candidates: a scheduled canary run that auto-bumps the pin on green; pinning a
      *floor* + canary-on-drift instead of an exact version; or accepting drift and
      making the canary the nightly authority.
- [x] Browse E2E off the real `$HOME` — done 2026-08-22 (review cycle-1 Minor 13, second
      half): `musterd -browse-root` (empty = home) is now `GET /api/browse`'s no-param
      default and the Up ceiling (protocol §3.6 updated); the E2E harness passes a
      per-run root inside its scratch data dir and `browseScratchDirectory()` replaced
      the home-dir helper — no test touches the real home directory anymore.
- [x] Cosmetic (cycle-3 minor): ⌘N with the modal open fell through to the browser's
      new-window shortcut. Fixed 2026-08-22 — `preventDefault()` now precedes the
      `dialog.open` guard in `web/src/render/launch.ts`.
- [x] One-off sweep of the dead tmux socket files in `/private/tmp/tmux-501/` — done
      2026-08-22 (258 `muster*` files removed, zero tmux processes running). The
      structural fix (sockets in the per-run scratch dir) is queued in M2 below.

## M2 — Terminal panes ✅ done 2026-08-23 (plan `m2-terminal`, via `/orchestrate`; approved review cycle 2)

- [x] PTY ↔ WebSocket bridge to tmux; xterm.js panes; click-to-focus; typing.
      Done 2026-08-23 — `internal/termbridge` (creack/pty) + `/ws/terminal/{id}`
      (`internal/server/terminal.go`); one-live-client takeover (4000), pane-ended (4001)
      + liveness nudge. Topology change: one tmux session per Muster session
      (`muster-<id>`), which forced a REQ-4 amendment — `detach-on-destroy on`, because
      `off` made a dead session's attach client hop to another session and misroute
      keystrokes (review cycle-1 Critical 3, measured).
- [x] **Tiles view** — done 2026-08-23: live grid + snapshot strip, sticky membership
      (top-N at entry/density change only; promotion by click), density 2×2/3×2,
      "ended" placeholder in place on death
- [x] View switcher in the masthead + **⌘\\** toggle (+ ⌘1–9 focus/promote); view AND
      density persist via `PUT /api/prefs` → kv → `prefs` broadcast, survive reload and
      daemon restart. Geometry moves, never duplicates (INV-3, tmux-oracle-tested)
- [x] Sizing: `pty.Setsize` then `tmux resize-window`, in that order; `resize-pane`
      banned by check D5
- [x] One geometry per session — rail/strip cards are static metadata cards, never a
      second live client (INV-2 asserted browser-side and via `#{session_attached}`)
- [x] tmux owns scrollback: xterm `scrollback: 0` (check W3)
- [x] `TERM`/`LANG` set explicitly on the attach PTY (REQ-6); launch env unchanged from M1
- [x] `⟳n` compaction counter E2E (M1 follow-up) — done 2026-08-23: plan table row +
      E14 test (PreCompact → `⟳1`, second → `⟳2`)
- [x] tmux socket litter (M1 follow-up) — done 2026-08-23: `-tmux-socket` accepts a path
      (`-S` iff it contains `/`); E2E harness, Go tests (`t.TempDir()`) and `test/rig`
      all use per-run scratch-dir sockets (check D12); leftover shared-dir sockets swept

## M3 — Gauges (plan `m3-gauges` approved 2026-08-23; run via `/orchestrate m3-gauges`)

- [x] Status-line POST ingestion, de-duplicated (posts arrive in close pairs ~435 ms apart).
      Done 2026-08-23 (m3-gauges, review-approved cycle 2): value-level dedup in
      `internal/usage.Aggregator`; `event.received_at` stamped RFC3339Nano (the M0 review
      minor), though `seq` remains the only ordering authority
- [x] Per-session context gauge — done 2026-08-23: card `.r3` + tile `.ctxinfo` render
      track + rounded % + compact absolute tokens alongside the existing `⟳n` counter;
      `hot` at ≥ 60%
- [x] Account usage bars — done 2026-08-23: masthead design-system gauges for both buckets
      + model readout; epoch `resets_at` converted in `internal/claudecode`, `warn` ≥ 60%
- [x] Render **"unknown", not an empty gauge** — done 2026-08-23: null bucket/context
      renders the word "unknown" with zero track markup, asserted on all three surfaces
      (INV-3), null-is-not-0% asserted end-to-end (E2)
- [x] Persist `usage_sample` history — done 2026-08-23: migration `0003_gauges.sql`,
      rows written only on value change; no history UI in v1 (per plan)

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

- Scaling note (m2 review cycle-2 Minor 3): `terminalRegistry.takeover` holds one global
  mutex across the PTY spawn — deliberate and correct for REQ-2's evict-before-attach
  ordering, imperceptible at 6 tiles, but it serializes attaches across *all* sessions.
  If tile counts ever grow past 3×2, move to a per-session lock (same ordering guarantee,
  no cross-session serialization). The rejected-alternative reasoning is in
  `internal/server/terminal.go`'s `takeover` doc comment.
- Layering note (m3 review cycle-1 Minor 3, ruled follow-up not fix): `internal/claudecode`
  transitively depends on `internal/store`, because `InterpretStatus` returns the neutral
  `usage.Sample` value type and that type shares a package with `Aggregator` (which holds
  a `*store.Store`). No rule broken (D6 clean); when next touching `internal/usage`, split
  the value types into their own package (or have `InterpretStatus` return its own bucket
  triple that `internal/server` maps into a `Sample`) to keep the adapter boundary free of
  the storage layer.
- Staleness follow-up (m3 review Minor, honesty rule 8 "stale is labelled, not hidden"):
  `usage.sampledAt` is on the wire but rendered nowhere, and an idle session emits no
  status posts (measured — `refreshInterval` doesn't tick while idle), so the masthead
  bars can be minutes stale with no cue. Deliberately scoped out of M3 (reference render
  shows no sample age either); if it ever matters, render a sample-age cue from
  `sampledAt` client-side.
- Durability nit (m3 review cycle-2 Minor 4): `usage.Aggregator.Record` commits the new
  sample to memory before persisting; a failed `InsertUsageSample` leaves snapshots
  reporting values that have no row and dedups away the retry. Logged + returned error,
  tiny local-SQLite window — persist before the in-memory commit (or roll back
  `a.current` on error) next time the file is touched.

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
- [x] **Usage-source interface shape** (SPEC §9.6) — settled 2026-08-23 (m3-gauges
      planning): a neutral `Sample` type + one aggregator in `internal/usage`; no Go
      interface type until a second source exists. Protocol-side seam was already
      settled 2026-08-20 (`usage.source` field, `docs/protocol.md` §5.4).
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
