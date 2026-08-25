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

> **Caveat, added 2026-08-23 after manual testing:** every item below is implemented and
> passes its tests, but all of it was validated against *synthesized* status-line posts.
> The real chain never delivered a single one — see M4's unquoted-command-path entry —
> so these surfaces have not yet been seen rendering real data. Re-verify there.

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

**Plan split (decided 2026-08-25, after m4-hook-quoting; don't re-derive):**
- **A `m4-reconcile`** — next. Reconcile on start + daemon-shutdown-vs-running-sessions
  policy (one design question, decide together) + end/remove a session (reconcile needs a
  "dead, confirmed" sink) + `--resume` on top. Also absorbs the D5 regression guard below.
- **B `m4-hook-lifetime`** — after A. Per-directory hooks, never-removed hook entries, and
  the "daemon down" surface: one root (`.claude/settings.local.json`), one protocol-shape
  question (route HTTP hooks through a wrapper so failure can be silent). Depends on A's
  end/remove flow if the reference-counting option is picked.
- **C `m4-canary`** — independent. Unskip `test/canary/canary_test.go` (incl.
  `TestCommandHookPathQuoting`); the pin-bump gate. Burns real subscription per run.

- [ ] Reconcile on daemon start; tmux pane existence is the authority on liveness
      (`SessionEnd` never fires on `kill -9`)
- [ ] **Stopping the daemon does not stop the sessions it launched** — observed 2026-08-25
      during the m4-hook-quoting REQ-9 run: `make run` was SIGTERM'd at 21:39 while haiku
      session 3 was live; the daemon shut down cleanly but `tmux -L muster ls` still showed
      `muster-3` with a real `claude` inside it, burning subscription with nothing tracking
      it (the DB row stayed `alive=1`). Nothing in shutdown touches the tmux server, and
      the muster socket outlives musterd. Decide the policy explicitly as part of reconcile:
      either (a) daemon shutdown kills its tmux server (`tmux -L muster kill-server`) so
      sessions never outlive the process — simple, but a daemon restart under a live
      session (which the hook-entry-lifetime entry says must work) becomes impossible; or
      (b) sessions are meant to survive a restart, in which case reconcile-on-start must
      re-adopt them (pane exists → alive, re-bind on next hook) **and** the dashboard needs a
      "daemon down / sessions still running" cue plus the end/remove flow so an orphan can
      be killed from the UI. Until decided, the manual-testing rule is: kill sessions from
      the dashboard *before* stopping the daemon, and check `tmux -L muster ls` after.
- [ ] `--resume` for dead sessions — mechanics verified by the H2 probe (`source: "resume"`,
      same `session_id`); the M4 work is building reconcile on top of it
- [ ] Full canary E2E: unskip the assertions in `test/canary/canary_test.go`
- [ ] Surface "daemon down" prominently — while it is down, every managed pane fills with
      hook-error lines. **Scope correction (2026-08-23):** this item assumed *managed*
      panes. Measured otherwise — the hook entries live in the directory's
      `.claude/settings.local.json`, so with musterd stopped every Claude Code session in
      that directory prints `PreToolUse:Bash hook error connect ECONNREFUSED
      127.0.0.1:8765` per tool call, Muster-launched or not (observed in Damian's own
      editing session in the muster repo, with no daemon running and no Muster session
      live). The banner only covers the dashboard; the noise in unmanaged sessions has no
      surface at all. See the per-directory-hooks and hook-entry-lifetime entries below —
      same file, same root.
- [ ] **End / remove a session** — found missing during manual testing 2026-08-23: there is
      no delete flow at all (`docs/protocol.md` §5.5 reserves the `sessionRemoved` type but
      nothing sends it; `session.Manager.DeleteSession` exists only as the launch-failure
      rollback path, called from `internal/server/sessions.go`; no `kill-session` in
      production code; the cards/tiles carry no buttons). Sessions therefore accumulate
      forever — a dead session's card stays visible with no way to clear it, and the only
      escape is `tmux -L muster kill-session` by hand, which still leaves the row. Two
      distinct actions to design, not one: **end** (kill the pane on a live session) and
      **remove** (delete the row + broadcast `sessionRemoved`, only sane once dead). Decide
      whether removal is allowed on a live session at all, and how it interacts with M4's
      resume affordance (a removed session can never be resumed — its `claude_session_id`
      goes with the row).
- [ ] **Per-directory hooks instrument every Claude Code session in that directory** —
      investigate; found 2026-08-23. Muster writes its hooks into the *directory's*
      `.claude/settings.local.json` (settled by the 2026-08-20 probe: only the local file
      honors `hooks`/`statusLine`/`allowedHttpHookUrls`), which is per-directory and not
      per-pane — so any Claude Code session Damian runs in that directory outside Muster
      also POSTs to `/ingest`. Measured: one such outside session accounted for 46 of the
      51 rows in the real `event` table (and still climbing while it ran), all correctly
      persisted unrouted (`resolveSessionID` → `persisting unrouted`), which also floods
      the log. Functionally harmless (routing
      already refuses to guess), but it grows the DB with events Muster will never use and
      puts prompt-adjacent metadata from unmanaged sessions into it. Options to weigh:
      drop unrouted events instead of persisting them (loses the M0 debugging affordance
      and the unknown-id audit trail — D9/Edge Case 11 chose to keep them deliberately, so
      this is a spec-level revisit, not a tweak); keep persisting but rate-limit the log
      line; prune unrouted rows on a retention policy; or gate ingest on the envelope so
      only enveloped (Muster-launched) posts are stored. Caveat on the measurement above:
      the unquoted-command-path bug found the same day leaves *every* event unrouted, which
      exaggerates the symptom — re-measure once that is fixed, before choosing an option.
- [ ] **Muster never removes its own hook entries** — found 2026-08-23, the flip side of
      the entry above. `MergeSettings` writes into `.claude/settings.local.json` on launch
      and nothing ever takes those entries back out: not daemon shutdown, not session end,
      not the (unbuilt) remove-a-session flow. So a stopped daemon leaves the directory
      permanently instrumented against a dead port. The entries genuinely must survive a
      daemon *restart* (musterd can be restarted under a live session and the pane's
      Claude Code re-reads nothing), so "strip on shutdown" is wrong as stated — the real
      question is what the entries' lifetime is keyed to. Options: reference-count against
      live sessions in that directory and strip when the last one ends (needs the
      end/remove flow below, and a crash still leaks); strip on clean shutdown only and
      accept the crash case; leave them and make the hook wrapper fail silently when the
      daemon is unreachable, so the cost of a stale file is zero noise instead of a line
      per tool call (cheapest, and arguably the honest one — hook delivery is best-effort
      by design). Note the HTTP hooks are Claude Code's own `type:"http"` entries, so the
      silent-failure option can only be reached by routing them through a wrapper script
      too, which is a protocol-shape change, not a one-liner. Immediate workaround while
      this is open: delete the file (Muster's launch rewrites it).
- [x] **Command-hook paths are not shell-quoted** — shipped 2026-08-25 (plan `m4-hook-quoting`). — the live bug behind M3's gauges never
      having rendered real data (found 2026-08-23, diagnosis in this file's git history).
      `MergeSettings` writes `hooks.SessionStart[].command` and `statusLine.command` as
      bare paths, so the default macOS data dir (`~/Library/Application Support/Muster`,
      `cmd/musterd/main.go`) splits on its space when the shell invokes it and **both
      wrapper scripts silently never run**: zero `SessionStart` and zero `status_line`
      events ever reached the real daemon. Everything downstream follows from that —
      `claude_session_id` never binds (`Manager.Apply` binds only on
      `KindBind`/`KindClearRebind`), so every HTTP hook persists unrouted and every card
      reads "no signal yet" forever; the usage aggregator stays empty (masthead
      permanently "unknown", `usage_sample` at 0 rows); the M3 context gauge, model
      readout and status-line title are all blank. Mechanic proved locally: a 0700 script
      at a space-bearing path runs on direct exec and dies `rc=127` under `sh -c`.
      Decision taken (Damian, 2026-08-23): **fix by shell-quoting the path**, not by
      relocating the data dir — the `command` field is a shell command line, not a path
      field, so a tool writing a path into it must quote it, and `-data-dir` already
      accepts arbitrary paths. Work, in order:
  - [x] **Probe first — done 2026-08-25** (`/interface-probe`, against **2.1.245**;
    `spikes/FINDINGS.md` 2026-08-25 addendum, `test/rig/captures/capture-{4,5}.jsonl`):
    (a) **it is a shell** — the TUI printed `/bin/sh: /tmp/muster: No such file or
    directory` for the bare space-bearing `SessionStart` command, while every http hook
    in the same session arrived; the status line failed *silently* (no render, no post,
    no error). (b) quoting a space-free path is harmless (control: bare/`'…'`/`"…"` all
    delivered). (c) both `'…'` and `"…"` deliver on the space-bearing path. **Quoting is
    the fix**; the relocate-the-scripts fallback is not needed. Bonus: `refreshInterval`
    is seconds and ticks while idle (open question below closed).
  - Single-quote with `'` → `'\''` escaping, not double quotes — `"…"` still
    interpolates `$`, backticks and backslashes.
  - **`isMusterEntry` must match quoted *and* bare.** It recognizes Muster's own
    command entries by exact string equality against the config paths
    (`internal/claudecode/settings.go`); teaching it only the new quoted form makes
    every existing `settings.local.json` unrecognizable, so the stale bare entry
    survives the wholesale-replace and the file accumulates two entries per event, one
    permanently broken. This is the part most likely to be got wrong.
  - Keep `SettingsConfig` holding raw paths — quote at the write boundary only — and
    keep `MergeSettings` byte-identical on a second call with the same config.
  - Audit the other path-into-shell sites in the same pass. Already checked and clean:
    the launch path is argv all the way (`BuildArgv` → `tmux new-session … -- argv…`
    via `exec.Command`, no shell), and `writeEnvelopeScript` already quotes the URL in
    `curl "%s"`; `$MUSTER_SESSION`/`$TMUX_PANE` are interpolated unquoted into the
    envelope JSON (daemon-controlled, but worth a look).
  - Record the quoting rule in `docs/protocol.md` §4.2 so a later refactor can't undo it.
- [x] **Coverage gap that let the above ship green** — shipped 2026-08-25 (plan `m4-hook-quoting`). — pairs with the entry above; the
      milestone isn't done without it. Three holes: (1) no test uses a data dir with a
      space — the H2 rig stamps into `/tmp/muster-probe` and the E2E harness into
      `mkdtemp(…, "muster-e2e-")`, both space-free, so the *default production path* is
      the one path nothing exercises; (2) **nothing anywhere executes the generated
      wrapper scripts the way Claude Code does** — the E2E fake `claude`
      (`web/e2e/helpers/daemon.ts`) is an echo loop that never reads
      `settings.local.json`, and every spec synthesizes ingest POSTs directly, so the
      settings → shell → script → POST → route → gauge chain has never once run in CI;
      (3) the canary asserts nothing about command-hook execution. Fixes: flip the E2E
      `mkdtemp` prefix to contain a space (all 71 specs then exercise it for free); add a
      test that reads the *generated* `settings.local.json`, pulls `statusLine.command`
      verbatim, runs it **through `sh -c`** with `MUSTER_SESSION`/`TMUX_PANE` set and a
      status-line payload on stdin, and asserts a routed `status_line` event plus a
      `usage_sample` row — no real `claude` needed, and it is the single assertion that
      would have failed on day one; add a canary assertion for the real binary per the
      probe's finding. Then **manually re-verify every M3 surface against real data**
      (masthead bars, per-session context row, model readout, status-line title) — none
      of them has ever rendered anything but synthesized input, so M3's "done" is
      unproven, not wrong.

- [ ] **D5 regression guard (m4 review Major, non-blocking)** — no committed test puts a
      *foreign* `type:"command"` hook on `SessionStart` alongside Muster's quoted entry (the
      existing foreign-hook test uses `PostToolUse`, an HTTP-owned event). Behaviour hand-probed
      correct; add the unit test in `internal/claudecode/settings_test.go`. See
      `plans/m4-hook-quoting/review.md`.

## Pre-v1 Cleanup
These are some minor changes and cleanup needed before we can move into post v1.
- Change how the left sidebar works. Sessions should be pinned in the order they are opened but allow the user to update the order by dragging and also allow "pinnng" (using pin icon) sessions (automatically go to the top in order of pinned).
- User should be able to move the grids around in the grid view so they can order them as they please. This would be done by dragging the title bar. I'm also wondering if we want status icons (dot - green, orange/yellow and red) in the title to quickly show if running, idle or error.
- Look to see if we can also put in Fable as a model in the options (create new session) and update the usage indicator to include the weekly Fable limit. This might need to be dynamic for new models in the future? Might be worth investigating that 3rd bar (specific model not the 5h or weekly usage). This is also displayed in the `/usage` command that Claude Code has
- Improve the Create new session dialog, especially the file explorer and selecting a directory. The dialog is messy, even the model select is "squashed". File explorder should be in a view that shows the parents and should auto use whatever directory is currently select rather than having to "apply" the selection. Similar to the Mac Finder interface.

## M5+ (v1.x, re-rank when reached)

Plan-mode flow (§4.1) → worktree manager with setup scripts (§4.2) → start-from-PR/issue
(§4.3) → permissions UI (§4.4) → `code <worktree>` button (trivial, anytime).

- Scaling note (m2 review cycle-2 Minor 3): `terminalRegistry.takeover` holds one global
  mutex across the PTY spawn — deliberate and correct for REQ-2's evict-before-attach
  ordering, imperceptible at 6 tiles, but it serializes attaches across *all* sessions.
  If tile counts ever grow past 3×2, move to a per-session lock (same ordering guarantee,
  no cross-session serialization). The rejected-alternative reasoning is in
  `internal/server/terminal.go`'s `takeover` doc comment.
- ~~Layering note (m3 review cycle-1 Minor 3)~~ — resolved 2026-08-23 (m3 retro chore):
  `InterpretStatus` now returns its own neutral `StatusAccount`/`StatusBucket` types and
  `internal/server`'s `processStatus` maps them into a `usage.Sample` at the §9.6 seam;
  `go list -deps ./internal/claudecode` no longer includes `internal/usage` or
  `internal/store`.
- Staleness follow-up (m3 review Minor, honesty rule 8 "stale is labelled, not hidden"):
  `usage.sampledAt` is on the wire but rendered nowhere, and an idle session emits no
  status posts (measured without `refreshInterval`; the 2026-08-25 probe showed
  `refreshInterval: 5` *does* tick every 5 s while idle), so the masthead
  bars can be minutes stale with no cue. Deliberately scoped out of M3 (reference render
  shows no sample age either); if it ever matters, render a sample-age cue from
  `sampledAt` client-side.
- ~~Durability nit (m3 review cycle-2 Minor 4)~~ — resolved 2026-08-23 (m3 retro chore):
  `Record` now persists the `usage_sample` row *before* committing to memory and
  broadcasting, so a failed write leaves `Current()` on the last persisted sample and the
  retry is never deduped away (regression test
  `TestAggregator_Record_PersistFailureLeavesMemoryUnchanged`; safe to drop the lock
  across the write because Record runs only on the single ingest worker goroutine, R4).

## Open questions carried forward

From `spikes/FINDINGS.md` "Still open" and SPEC §9. None block M0.

- [x] **`--resume` never exercised** — settled (H2 probe 2026-08-16): `SessionStart` fires
      with `source: "resume"` and the **same** `session_id`/`transcript_path`, so reconcile
      can re-bind deterministically. (Interactive resume / different-cwd not exercised.)
- [x] **`Stop` alongside `StopFailure`?** Settled (H2 probe 2026-08-16): replaced, never both.
- [x] **`refreshInterval` unit** — settled 2026-08-25 (quoting probe, 2.1.245): **seconds,
      and honoured while idle** — `refreshInterval: 5` posted every 5.00 s through 60 s of
      idle. Relevant to the M5+ staleness follow-up: setting it is enough to keep the
      masthead bars ticking; the usage dedup absorbs the repeats.
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
