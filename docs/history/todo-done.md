# Muster backlog — done items

Ticked `TODO.md` entries, moved here when they are finished so the backlog agents read stays the
size of the open work. Same milestone headings, same order, entries verbatim (each carries its own
✅ date and plan). An issue counts as triaged iff its `issues/N` link appears in `TODO.md` **or**
here — the triage program reads both, writes only `TODO.md`. Moved out of `TODO.md` on 2026-09-11.

## Setup ✅ done 2026-08-16
<!-- kb: adr/canary-exact-pin-bumped-after-green-runs, adr/canary-claude-auto-updater-left-on -->

- [x] Name settled (**Muster**); repo, module `github.com/Zalaras/muster`, binary `musterd`

- [x] Go toolchain: module, golangci-lint v2 config, testify

- [x] Frontend stack settled: Vite + TypeScript, no framework; `.nvmrc` pins Node 24.19.0

- [x] Playwright scaffold + smoke test

- [x] Canary skeleton, executable inventory from `spikes/canary-fields.md`

- [x] Version pin documented (`docs/claude-code-pin.md`); drift detection in `musterd`

- [x] Backlog (this file)

## Before M0
<!-- kb: adr/process-web-unit-tests-vitest, adr/process-e2e-per-run-ports-and-sockets-no-reuse, adr/process-doc-upkeep-backstop-in-orchestrator, adr/process-interface-probe-rig-in-repo, adr/theme-instrument-visual-direction, adr/stack-system-font-stacks-only, adr/nongoal-attention-ribbon-post-v1, adr/launch-hybrid-mru-directory-memory -->

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
      and `--resume` verified while the rig was warm. See `docs/history/spec-changelog.md` (H2 entry).

- [x] **UX flows** (next-steps.md item 4, first half; done 2026-08-16): new-session flow
      and the launch/worktree data layer settled — SPEC §9 Q2 resolved. Written up in
      `docs/design/ux-flows.md`; `docs/history/spec-changelog.md` has the entry.

- [x] **Visual design** (item 4, second half; done 2026-08-16): **direction A "instrument"**
      chosen; `docs/design/design-system.md` written and wired into `review-work`'s
      checklist (the placeholder is gone). System font stacks only — nothing vendored,
      nothing fetched. Attention ribbon deferred post-v1. Tiled view designed
      (`docs/design/mockups/d-tiled.html`) as an **M2+** surface.

## M0 — Skeleton
<!-- kb: adr/lifecycle-migrations-add-tables-when-written, adr/ingest-wire-shaped-fixtures-via-claudecodetest, adr/theme-banner-tokens-not-rose, adr/process-e2e-per-run-ports-and-sockets-no-reuse, adr/connection-commands-http-ws-push-only -->

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

## M1 — Sessions exist ✅ done 2026-08-22 (plan `m1-sessions`, via `/orchestrate`)
<!-- kb: adr/launch-browse-via-daemon-not-native-chooser, adr/launch-form-seeds-model-and-permission-mode, adr/canary-exact-pin-bumped-after-green-runs, adr/canary-verified-range-observed-not-pinned, adr/process-e2e-per-run-ports-and-sockets-no-reuse, adr/rail-attention-sort-order, fact/stopfailure-replaces-stop -->

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

- [x] **Claude Code pin — deferred to post-v1** (decided 2026-08-22): the drift stands
      (pin 2.1.233, installed 2.1.240, measurements against three versions) until v1
      ships. *Update 2026-08-29:* pin bumped to 2.1.246 on the first green full canary
      (the ritual, not a strategy change); the rethink below still stands. Then **rethink the pin strategy itself**, not just bump it: Claude Code
      releases most weekdays, so a static pin + manual canary ritual churns constantly.
      Candidates: a scheduled canary run that auto-bumps the pin on green; pinning a
      *floor* + canary-on-drift instead of an exact version; or accepting drift and
      making the canary the nightly authority.
      *Update 2026-09-07:* folded into the pre-v1 **"Version the Claude Code interface"**
      item (Pre-v1 Cleanup) — a declared supported range decides the pin's role, so settle
      that first rather than picking a pin strategy on its own.
      **Done 2026-09-10 (plan `version-claude-interface`)**: the pin is gone; the range is an
      observed record extended automatically by a green `make canary` (SPEC §8; spec-changelog 2026-09-10).

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
<!-- kb: adr/surfaces-one-tmux-session-per-session, adr/surfaces-detach-on-destroy-on, adr/surfaces-shared-attach-single-pty, adr/surfaces-one-live-client-per-session, adr/tiles-sticky-live-membership, adr/tiles-live-top-n-snapshot-rest, adr/process-e2e-per-run-ports-and-sockets-no-reuse -->

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
<!-- kb: adr/usage-sample-dedup-by-value, adr/usage-context-gauge-shows-tokens-and-compactions, adr/usage-unknown-renders-word-not-track, adr/usage-history-persisted-not-rendered, adr/usage-masthead-model-from-freshest-sample -->

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
<!-- kb: adr/lifecycle-reconcile-before-first-snapshot, adr/lifecycle-liveness-from-pane-existence, adr/lifecycle-shutdown-leaves-sessions-running, adr/lifecycle-resume-rebinds-existing-session, adr/canary-drives-installed-claude-through-production-chain, adr/canary-interactive-dialog-rows-accepted-residual, adr/ingest-all-hooks-command-wrappers, adr/ingest-hook-entries-permanent, adr/ingest-shell-quote-at-write-boundary, adr/actions-remove-allowed-on-live-session, adr/process-tests-run-space-bearing-data-dir -->

- [x] Reconcile on daemon start; tmux pane existence is the authority on liveness
      (`SessionEnd` never fires on `kill -9`) — shipped 2026-08-27 (plan `m4-reconcile`):
      synchronous `Reconcile` before serving; `alive=0` rows swept, `alive=1`-no-pane rows
      marked ended and kept for one resume chance; unknown `muster-*` panes logged, never adopted.

- [x] **Stopping the daemon does not stop the sessions it launched** — settled 2026-08-27 (plan
      `m4-reconcile`): option (b). Sessions survive by policy; `-on-exit` flag `ask` (TTY prompt,
      10 s → leave) | `leave` | `kill`. Original observation 2026-08-25
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

- [x] `--resume` for dead sessions — shipped 2026-08-27 (plan `m4-reconcile`): `POST
      /api/sessions/{id}/resume`, `KindResumeBind` lands in `idle`. Mechanics verified by the H2 probe (`source: "resume"`,
      same `session_id`); the M4 work is building reconcile on top of it

- [x] Full canary E2E — shipped 2026-08-29 (plan `m4-canary`, main-session build, not
      `/orchestrate`): `test/canary/harness_test.go` drives the real binary through the
      production settings→sh→wrapper→POST chain from a space-bearing data dir; 3 haiku
      turns + 1 zero-token run, ~40 s. Green twice on 2.1.246 → pin bumped 2.1.233 →
      2.1.246 (`docs/claude-code-pin.md`). Accepted residual: plan-mode sequence,
      `PermissionRequest`, `Notification`, `SubagentStop` stay skipped
      (`needsInteractiveDialog`). New wire fact recorded: on the auth-failure exit claude
      does not await hooks — Muster's curl wrapper loses `SessionEnd` there (`spikes/canary-fields.md`).

- [x] Surface "daemon down" prominently — while it is down, every managed pane fills with
      hook-error lines. **Scope correction (2026-08-23):** this item assumed *managed*
      panes. Measured otherwise — the hook entries live in the directory's
      `.claude/settings.local.json`, so with musterd stopped every Claude Code session in
      that directory prints `PreToolUse:Bash hook error connect ECONNREFUSED
      127.0.0.1:8765` per tool call, Muster-launched or not (observed in Damian's own
      editing session in the muster repo, with no daemon running and no Muster session
      live). The banner only covers the dashboard; the noise in unmanaged sessions has no
      surface at all. See the per-directory-hooks and hook-entry-lifetime entries below —
      same file, same root. **Resolved 2026-08-27 (plan `m4-hook-lifetime`)**: the noise
      itself is gone rather than merely surfaced. Every hook Muster registers, including
      `SessionStart` and the status line, is now a `type:"command"` wrapper that exits 0
      silently when the daemon is unreachable — Claude Code sees a clean exit, never an
      inline `hook error`. The dashboard banner (`web/src/render/banner.ts`, unchanged) is
      therefore now the *only* daemon-down surface, and it is honest: no managed pane
      fills with error lines anymore.

- [x] **End / remove a session** — shipped 2026-08-27 (plan `m4-reconcile`): End/Remove/Resume
      with confirm dialogs on mainhead, cards and tile footers; Remove allowed on a live session
      (ends first); ended cards sort to the bottom with the last captured pane as the dead
      surface. Originally found missing during manual testing 2026-08-23: there is
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

- [x] **Per-directory hooks instrument every Claude Code session in that directory** —
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
      **Resolved 2026-08-27 (plan `m4-hook-lifetime`)**: chose the "gate ingest on the
      envelope" option in spirit, but reached it by making every hook a command wrapper
      that exits before posting anything when `$MUSTER_SESSION` is unset — an unmanaged
      session in an instrumented directory now posts **zero** requests (measured ~6 ms
      early-exit cost per event, vs. ~48 ms for a real post) rather than posting and being
      dropped unrouted. `event` rows from unmanaged sessions stop accumulating entirely;
      the existing unrouted-persistence path (D9) is unchanged for the raw/legacy case.

- [x] **Muster never removes its own hook entries** — found 2026-08-23, the flip side of
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
      **Resolved 2026-08-27 (plan `m4-hook-lifetime`), decided with Damian**: entries are
      **permanent by design** — no reference-counting, no strip-on-shutdown. The
      "route through a wrapper so failure can be silent" option is what was built (every
      event, not just SessionStart/status-line, is now `type:"command"`), which changes
      the cost of a stale entry from "a line of noise per tool call" to a silent 6–32
      ms/event `sh` exit (measured, `spikes/FINDINGS.md` "command-hook latency probe"),
      dissolving the lifetime question rather than answering it. The one residual: a
      moved/deleted data dir leaves entries pointing at missing scripts, and they are
      **not** self-healing: `isMusterEntry` matches command paths exactly (deliberately,
      so a foreign script sharing a basename is never deleted), so a later launch with a
      different `-data-dir` cannot recognise the old entries and adds its own beside
      them — the directory accumulates one dead entry per event per abandoned data dir,
      and Claude Code prints a "no such file" error per event, forever (measured in the
      m4-hook-lifetime review rig, 2026-08-28). Workaround: delete the stale entries or
      the file (Muster's launch rewrites it). Accepted residual, not solved here.

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

- [x] **D5 regression guard (m4 review Major, non-blocking)** — shipped 2026-08-27 (plan
      `m4-reconcile`, `TestMergeSettings_ForeignCommandHookOnSessionStartSurvives`). Was: no committed test puts a
      *foreign* `type:"command"` hook on `SessionStart` alongside Muster's quoted entry (the
      existing foreign-hook test uses `PostToolUse`, an HTTP-owned event). Behaviour hand-probed
      correct; add the unit test in `internal/claudecode/settings_test.go`. See
      `plans/m4-hook-quoting/review.md`.

- [x] **Tiles grid loses focus on reorder** — shipped 2026-08-27: shared `web/src/render/focus.ts` capture/restore used by both `reconcileCards` and `reconcileTilesGrid`; Tiles re-sort E2E added (proven red without the fix: `Received: inactive`); the `FakeDomNode` shim now blurs on detach so the two formerly-vacuous unit tests exercise the restore branch (plus a stub-focus proof test). Was (m4-reconcile review cycle 4, Minor 2 — measured):
      `reconcileTilesGrid` in `web/src/main.ts` still `insertBefore`s without re-focusing, so a
      focused tile-footer End/Remove button falls to `<body>` on a real priority change. The rail
      got the fix (`reconcileCards`); port the same logical-identity re-focus, then add the Tiles
      half of the keyboard-survives-reorder E2E (Minor 3). Two of the nine `reconcileCards`
      focus unit tests are vacuous under the `FakeDomNode` shim (Minor 1) — the E2E case is the
      real guard; tighten or drop them.

- [x] **R2 real-haiku End → Resume check** — done 2026-08-30 (run manually by Damian). (m4-reconcile Reviewer-Verified R2, not run by the
      pipeline — it burns subscription): `claude --model claude-haiku-4-5-20251001` "say hi",
      End from the dashboard, Resume, confirm the enveloped `SessionStart(source:"resume")`
      carries the same `session_id` interactively on the pinned binary and the badge reads
      `idle`; record in `spikes/canary-fields.md` (placeholder note added there). Kill it after.

## Pre-v1 Cleanup
<!-- kb: adr/process-composition-roots-registration-only, adr/process-one-name-per-feature, adr/rail-user-owned-manual-order-default, adr/tiles-slot-stable-grid-never-self-sorts, adr/theme-no-traffic-light-state-palette, adr/usage-model-window-polled-from-oauth-api, adr/launch-picker-recent-sidebar-plus-browse-list, adr/tiles-new-session-button-in-toolbar, adr/connection-dashboard-embedded-in-binary, adr/release-builds-cross-compiled-on-linux, adr/release-distribution-github-release-not-brew, adr/release-no-ci-test-job-yet, adr/issue-payload-allowlist-never-dump, adr/process-e2e-explicit-fixtures, adr/process-faked-subprocess-boundary, adr/process-exec-waitdelay-on-pipe-owning-commands, adr/canary-plan-mode-step-three-sole-residual, adr/canary-verified-range-observed-not-pinned, adr/process-repo-public, adr/release-install-front-door-curl-sh, adr/update-check-pref-governs-checking-only, adr/process-transient-displays-not-oracles, adr/triage-program-not-model-between-github-and-todo -->

- [x] **Make the project knowledge searchable as it grows** ✅ done 2026-09-12 (Track 3, direct on `main`, 32 commits b0545e7..HEAD) (Track 3; planned 2026-09-11, executing
  directly on `main` in ~13 sessions; plan and appendices in `~/.claude/plans/alright-i-ve-put-in-wild-sifakis*.md`).
  Knowledge becomes typed records with strict frontmatter — decisions as ADRs (one per question,
  slug ids, `accepted|proposed|superseded|rejected`), measured Claude Code facts bound to the canary
  test that guards them and the version range they hold on, lessons tagged by pipeline role,
  runbooks, references, and one `spec.md` per feature whose frontmatter is the feature registry
  (the 17 `code-breakup` names + lifecycle, canary, triage, release). `tools/kb` (Go, in
  `internal/kb`) generates the indexes, per-feature protocol slices and `.claude/rules/<feature>.md`
  path-scoped rules, checks every invariant (`make check-kb`, in `make check` and the gates
  baseline), and answers `kb pack --plan --role` / `kb for <path>` / `kb show <id>` so agents read
  what their job needs instead of the whole estate. Citations are `kb:<type>/<slug>` tokens;
  `docs/protocol.md` stays the single contract source with stable `kb:anchor` ids per heading.
  Hand-written nested CLAUDE.md in 17 directories (no rationale, tokens only). Settled: slugs not
  sequence numbers; one ADR per decision (~145 from the history files); no search index, no
  embeddings, no LLM at query time. Phases: tool + wiring → registry stubs + anchors + citation
  rewrite → facts → ADR batches ×5 → specs (SPEC.md shrinks to ~1.5k words) → lessons/runbooks +
  skill rewiring → nested CLAUDE.md ×2 → freeze history. ☑ tool (2026-09-11: `internal/kb` +
  `tools/kb`, 63 tests; `make check-kb` in `make check` and the gates baseline; empty store green)
  ☑ anchors (2026-09-11: 22 feature registry stubs own every file under `internal/`, `web/src/`,
  `web/e2e/`; 42 `kb:anchor` ids in `docs/protocol.md`, numbers stripped, `sessionUpsert`/`prefs`/
  `sessionRemoved` split; 525 `kb:anchor/` citations replace every numbered protocol reference;
  generated `.claude/rules/`, per-feature `INDEX.md` + `contract.md`, `docs/INDEX.md`)
  ☑ facts (2026-09-12: 43 records in `docs/facts/`, 23 guarded by a named canary test with
  `verified: <lo>..canary`, 20 `guard: none`; the canary field inventory frozen from `spikes/` to
  `docs/history/spikes/canary-fields.md` with a marker per row, `scripts/kb-conserve.py` 0 failures)
  ☑ ADRs (2026-09-12: 212 records in `docs/adr/` from all 44 spec-changelog entries, 29
  protocol-changelog bullets, 11 done-item headings, 5 plan decisions, the 20 interview rows and
  SPEC's former non-goals, stack and open-questions sections — one per question; 15 superseded, 24 rejected, 3 proposed; every history unit
  carries a marker, `scripts/kb-conserve.py` 0 failures on all four files; `interview-notes.md`
  frozen to `docs/history/`) ☑ specs (2026-09-12: 22 feature `spec.md` bodies, `SPEC.md` 1,324 words, `docs/references/data-model.md`, build order frozen)
  ☑ lessons+rewiring (2026-09-12: 41 lessons, `release-signing` runbook, design narratives frozen to `docs/history/design/`; every
  agent reads `kb pack --plan --role`, plan-work writes proposed ADRs, orchestrate flips them at Completion, land refuses a
  leftover proposed ADR, review-work carries the KB row and the deviation Major, retro writes lesson records)
  ☑ nested CLAUDE.md (2026-09-12: 17 directories, 150–250 hand-written words each, generated trailer names the covering features)
  ☑ freeze (2026-09-12: spec and protocol changelogs, interview notes, canary inventory and design narratives frozen;
  `scripts/kb-conserve.py` 0 failures on every history file; 323 records; `make check` green). Follow-ups worth knowing:
  a two-feature `daemon-impl` pack is ~17k words (single features 4.7–8.4k; the 8,000 WARN is informational), the ADR count
  came out at 213 not ~145 (one per question), and `orchestrate/SKILL.md` remains over its 5,000-word warn threshold.

- [x] **Dismantle the two composition-root hotspots so plans can run in parallel** — one plan,
  `full-stack`, via `/orchestrate` (Damian, 2026-09-11: single plan for both sides, files not
  sub-packages for now). Scaling check 2026-09-11: `web/src/main.ts` is 1,425 lines and has been
  edited by 21 commits (40 element lookups, ~20 module-level `let` state variables, every
  feature's event wiring); `internal/server` is already 45 files but every feature adds a field
  to the 25-field `Server` struct, a twin field in `Config`, and a line in `routes()`, so any two
  plans collide on the same three files. The cause is structural: plans list "`main.ts` — wire X"
  under Affected Files, agents comply, and review judges against the plan, so nothing pushed back.
  Scope: (1) `main.ts` and `server.go` become composition roots only — build dependencies, call
  each feature's init/mount, a couple of hundred lines each. (2) Web: one controller module per
  feature with an `init(deps)` entry, following the shape `render/launch.ts` (`initLaunchModal`),
  `render/settings.ts` and `render/issue.ts` already use; the loose features (usage block, rail
  sort/count, views + density, theme, update banner, connection status, shortcuts) move into
  controllers, and their module-level state moves with them or into `SessionStore`. (3) Go: each
  feature owns a small handler type with its own dependencies and a `Mount(mux, …)` (or
  equivalent); `Server` keeps mux, auth, hub, lifecycle. Feature files stay inside
  `internal/server` — the coupling to remove is the struct, not the directory. (4) E2E: one spec
  file per feature named for the same seam as its web controller, helpers in
  `web/e2e/helpers/<feature>.ts`; split the grab-bags `actions.spec.ts` (1,653 lines, 23 tests)
  and `views.spec.ts` when the plan touches them. (5) Rules so it does not regrow:
  `docs/conventions.md` names the two composition roots and the exemplar files ("a new feature
  is a new module with an init, registered in one line in `main.ts`"); `plan-work` may list a
  composition root under Affected Files only for a one-line registration; `review-work` flags
  logic landing in a composition root. Behaviour is unchanged throughout — the full E2E suite is
  the oracle, no new specs beyond the split.
  ✅ done 2026-09-11 (plan `code-breakup`, via `/orchestrate`; approved review cycle 2): `web/src/main.ts` 1,425 → 127 lines, `internal/server/server.go` 564 → 300; 15 web controllers under `web/src/features/`, 12 Go feature types with `mount`; `actions.spec.ts`/`views.spec.ts` split into `tiles.spec.ts`/`rail-cards.spec.ts` (299 `test(` calls unchanged, 302/302 green); rule in `docs/conventions.md` § Composition roots.

- [x] Change how the left sidebar works. Sessions should be pinned in the order they are opened but allow the user to update the order by dragging and also allow "pinnng" (using pin icon) sessions (automatically go to the top in order of pinned). — **Done 2026-08-30 (plan `order-sidebar`)**: daemon-owned `pinned`/`railPos`, whole-card drag (insert-and-shift), pin control, rail-head Manual/Attention toggle (`prefs.railSort`, default manual), strip follows the rail order. Follow-ups from the review (`plans/order-sidebar/review.md`): (1) decision `cmd-n-ordering` dissent — ⌘1–9 now follows the rail, so there is no keyboard path to "jump to the neediest session"; consider a dedicated shortcut. **Done 2026-09-04 (plan `shortcut-fixes`): ⌥⌘0 jumps to the neediest session, ignoring the rail's sort mode and the pinned block; decision `cmd-n-ordering` Option A stands unchanged. Dissent discharged.** (2) ~~Minor `[daemon-impl]`: `maxRailPosLocked`'s doc comment says "returns 1 + the largest" but the function returns the largest or `-1`.~~ **Fixed 2026-09-06 (plan `v1-cleanup`, REQ-10).** (3) ~~Minor `[daemon-impl]`: `handlePinSession`/`handleSetOrder` put `err.Error()` in the 500 body where every other handler in the package sends a fixed string.~~ **Fixed 2026-09-06 (plan `v1-cleanup`, REQ-8).** (4) ~~Minor `[web-impl]` (review cycle 2): `focusNth`'s doc comment says "the same order the rail/strip currently display" but the strip renders that order minus live tiles, so in Tiles ⌘3 is not the strip's third card — comment accuracy only.~~ **Fixed 2026-09-04 in passing by plan `shortcut-fixes`** (`web/src/main.ts:414-419`). (5) ~~`[note]`: the pinned-block separator (`.pinned-last`, `#343a4a` 1px) reads weakly against ordinary dividers — as REQ-9 specified, but worth a look.~~ **Addressed 2026-09-06 (plan `v1-cleanup`, REQ-15)**: `.card.pinned-last` moves from `--line-control` to `--edge`, the token whose documented role is boundaries at ≥ 3:1. Thickness stays 1px.

- [x] User should be able to move the grids around in the grid view so they can order them as they please. This would be done by dragging the title bar. I'm also wondering if we want status icons (dot - green, orange/yellow and red) in the title to quickly show if running, idle or error. — **Done 2026-08-29 (plan `move-tiles`)**: header drag, insert-and-shift, grid never auto-sorts. The status dot was already shipped (state-coloured per design-system §3); the green/orange/red palette was deliberately not adopted (§3 forbids reusing state colours), a hover `title` with the state word was added instead. Deferred: keyboard reorder, persisting order across reloads.

- [x] Look to see if we can also put in Fable as a model in the options (create new session) and update the usage indicator to include the weekly Fable limit. — **Third bar shipped 2026-08-30 (plan `usage-model-bar`, decision (b))**: musterd polls `GET /api/oauth/usage` with the read-only Keychain OAuth token (5-min poll + ↻ refresh), `#usage-model-week` readout with a model `<select>` persisted as `prefs.usageModel`. The "add Fable to the launch model select" half shipped 2026-08-30 with plan `new-session-dialog` (segmented Model control gains a `fable` preset). This might need to be dynamic for new models in the future? Might be worth investigating that 3rd bar (specific model not the 5h or weekly usage). This is also displayed in the `/usage` command that Claude Code has
  - **Probed 2026-08-30 (static, against installed 2.1.251):** the third bar is **not in the
    status line** — the builder explicitly emits only `five_hour`/`seven_day`/`spend_limit`
    and drops the per-model window `seven_day_overage_included` ("Fable 5 limit"). `/usage`
    gets it from `GET /api/oauth/usage` `limits[]` (`kind:"weekly_scoped"`,
    `scope.model.display_name`, `percent`, `resets_at`) with the OAuth token. Details:
    `spikes/FINDINGS.md` 2026-08-30 addendum. **Decision (resolved 2026-08-30 → (b), shipped as `usage-model-bar`; kept as history):** (a) wait for the status
    line to grow it (re-check on each pin bump — default), or (b) musterd calls
    `/api/oauth/usage` with the Keychain OAuth token (SPEC §2.3 change + credential
    handling). The "add Fable to the model select" half is independent and can proceed.

- [x] Improve the Create new session dialog, especially the file explorer and selecting a directory. The dialog is messy, even the model select is "squashed". File explorder should be in a view that shows the parents and should auto use whatever directory is currently select rather than having to "apply" the selection. Similar to the Mac Finder interface. — **Done 2026-08-30 (plan `new-session-dialog`)**: Finder-style picker — persistent Recent sidebar + clickable breadcrumb + single child listing where the listed directory *is* the selection (no Browse…/Up/"Use this folder"), segmented Model (gains `fable`) and Start-in controls, stacked full-width form, `Launch in <path>` footer readout, 720px fixed-height dialog (picker panes scroll internally).

- [x] Create new session from tile view — **Done 2026-08-30 (main-session build)**: a `New session` button in the Tiles density toolbar (`#tiles-new-session-button`) drives the same `#launch-dialog` as the rail button and ⌘N; a launch made from Tiles is promoted into the grid (demoting the lowest-priority tile when full) instead of landing in the strip. E2E: `web/e2e/tiles-launch.spec.ts` (private daemon per test). No protocol change.

- [x] Embed the dashboard into the `musterd` binary so it ships as a single self-contained
  executable (precondition for the CI/GoReleaser follow-up; entry added retroactively — the
  review found no pre-existing TODO item to tick, `plans/embed-dashboard/review.md` Major 2) —
  **Done 2026-08-31 (plan `embed-dashboard`)**: `internal/webui` embeds `internal/webui/assets/`
  via `//go:embed all:assets`, Vite builds straight into it (`.gitkeep`-restoring `closeBundle`
  plugin keeps the tree clean), `-web-dist` default flips to `""` (embedded) and becomes a dev
  override, an assetless binary fails fast at startup naming both remedies, `make e2e` orders
  `web-build build`. Follow-ups from the review (`plans/embed-dashboard/review.md`, both Minor
  `[daemon-impl]`): (1) ~~"`Makefile:66` — `clean`'s `rm -rf bin web/dist` is the last live
  mention of the retired path, and unlike `.gitignore:11-12` it carries no `# Historic:`
  comment saying why" — add the same one-line historic comment.~~ (2) ~~REQ-3's fatal branch has no
  automated regression guard (only the cycle-1 hands-on D5 check): add the reviewer's one-line
  seam — `checkWebDist(webDist string, embedded fs.FS, log zerolog.Logger)` with `run()` still
  passing the real `webui.FS()` — so daemon-tests can assert the fatal error and its two-remedy
  wording deterministically.~~ **Both fixed 2026-09-06 (plan `v1-cleanup`, REQ-11 and REQ-9).**

- [x] Add CI that builds and publishes a shippable binary, with automatic semantic versioning
  — **Done 2026-08-31**: `.github/workflows/release.yml` runs on push to `main` (plus
  `workflow_dispatch`), computes the next version with `svu` from the conventional commits,
  tags it, and publishes darwin `amd64`/`arm64` archives via GoReleaser (`.goreleaser.yaml`).
  Builds run on `ubuntu-latest` — every Go dep is pure Go, so `CGO_ENABLED=0` cross-compiles
  darwin, and the repo being private makes macOS runners cost 10x. Tag and release are one
  job deliberately (a `GITHUB_TOKEN` tag push cannot trigger another workflow). Release
  builds set `MUSTER_RELEASE=1` so Vite drops the 955 kB sourcemap the `embed-dashboard`
  review flagged; every other build path keeps it. Distribution is the GitHub Release
  (`make install` / `gh release download`) — **Homebrew deliberately deferred** to any
  open-sourcing, since a private tap needs
  `GitHubPrivateRepositoryReleaseDownloadStrategy` plus a permanent
  `HOMEBREW_GITHUB_API_TOKEN`. **No test/lint job yet** — Damian's call pending possible
  open-sourcing; the release build is the de facto compile gate, and adding `make check` as
  a step is a one-liner when wanted. Trigger table lives in `docs/conventions.md` § Commits.
  *2026-09-10:* open-sourcing moved into this section (see the flip item below), so all three
  parked calls here — Homebrew tap, test/lint job, macOS-runner cost — become live there.

- [x] File a GitHub issue from the dashboard (dogfooding capture) — entry added
  retroactively; the review found no pre-existing TODO item to tick
  (`plans/issue-capture/review.md` cycle 3, orchestrator Major) — **Done 2026-08-31 (plan
  `issue-capture`, via `/orchestrate`; approved review cycle 3)**: masthead `Issue` button →
  `#issue-dialog` with session scope select, server-held strict-allowlist snapshot
  (`POST /api/issue/captures` → `POST /api/issues`), full-body preview asserted byte-identical
  to the posted GitHub body (INV-2, SHA-256-verified in review), auth via `gh auth token` at
  time of use, `internal/ghissue` isolated from all muster-internal packages. Hard exclusions:
  prompt text, hook payloads, status-line JSON, pane captures, assistant text (title,
  lastActivity, failure.message), directory/branch/repo/worktree, Claude session id value,
  account usage. Follow-up already filed separately: app-wide `.btn:disabled` sweep (M5+).

- [x] **tmux-installation review cycle 1 Minors** — all six resolved 2026-09-01 in one `fix(preflight)`
  commit: the two fatal paths now print the spec's trailing blank line (measured `\n \n m u s t e r d :`
  with `od -c`, and pinned by three new assertions — proven red without the fix), `tmuxUpgradeRemedy`
  joins `tmuxInstallRemedy` as a const the README test asserts against, `:33` is `errors.New`, and the
  README prose plus the two stale comments are corrected. Was
  (`plans/tmux-installation/review.md`, all six left open at an approved review — no agent was
  respawned, per the pipeline's Minors-only rule):
  - `[daemon-impl]` The plan's UI spec illustrates a **blank line** between the report block and
    the `musterd:` verdict line for both fatal cases; the implementation prints none. Measured
    with `od -c`. `cmd/musterd/preflight.go:33,42` — add a trailing `fmt.Fprintln(stderr)` on the
    two fatal paths (not the warning path, which has no verdict line following it).
  - `[daemon-impl]` `brew upgrade tmux` is an inline literal in `fmt.Errorf`
    (`cmd/musterd/preflight.go:33`) while the install remedy is the `tmuxInstallRemedy` const.
    Both are quoted by README, so both deserve one source — promote a `tmuxUpgradeRemedy` const
    and have `TestReadmeTmuxRemedyMatchesPreflight` assert against it rather than a re-typed
    literal (`preflight_test.go:150`).
  - `[daemon-impl]` `cmd/musterd/preflight.go:33` calls `fmt.Errorf` with a constant string and
    no format verbs — `errors.New` is the right call (the sibling at `:42` genuinely formats).
  - `[daemon-impl]` Two README prose inaccuracies. `README.md:92-93` says the preflight "only
    runs once musterd actually starts serving" — it runs *before* the data dir is created and
    the port is bound, which is the whole point of D4; say "only runs when musterd actually
    starts". `README.md:53`'s "— same as the note below:" dangles; what follows is the remedy
    fence itself, not a note.
  - `[daemon-impl]` `internal/tmux/preflight.go:17` — "NewSession **above** uses ..."; both
    `NewSession` and `applyServerOptions` live in `tmux.go`, not above that declaration.
  - `[e2e-specs]` `web/e2e/helpers/daemon.ts:420` still asserts stdin `"ignore"` (=`/dev/null`)
    "is never a character device" — precisely the falsehood REQ-9 exists to correct: `/dev/null`
    **is** a character device, it simply is not a terminal. Reword to "is never a *terminal*".

- [x] **Re-evaluate how tests are run across the codebase** — settled 2026-09-06 directly on
  `main` (not via `/orchestrate`; the pipeline's own rules were among the files). The standing
  rule is `docs/conventions.md` §Testing; measurements and reasoning in
  `docs/design/test-strategy.md` (§Decision). In brief: E2E daemons come only from
  `web/e2e/helpers/fixtures.ts` (`daemon` fresh per test by default, `startDaemon` for
  runtime-computed options, `fileDaemon()` only for title-scoped files — the audit found most
  per-test files legitimately need isolation, so "one daemon per file" is a per-file call
  recorded in a plan's new **Fixture plan** header); `playwright.config.ts` carries the load
  policy (`workers: 4`, `expect.timeout` 15 s, `timeout` 60 s); `web/scripts/e2e-lint.sh`
  (run by `npm run e2e` and `gates.sh`) forbids `startScratchDaemon` in specs, `@playwright/test`
  imports in specs, and fixed sleeps (`settleFor()` is the one sanctioned hold); Go tests cross
  subprocess boundaries through an injectable run func (`internal/tmux` preflighter, the
  `-claude-bin` pass-through for `claude --version`, a walk-only Locator in `internal/server`).
  Verified: `go test -count=1 ./...` 5/5 green at 26–28 s (was intermittently red);
  `make e2e` 3/3 green, 281/281, 76 s at 4 workers vs a 72–78 s baseline at 6 (baseline 1 red
  in 2 runs on a non-retrying `expect` after `page.goto`). Also found and fixed: the harness
  wrote a fresh stub `claude` per daemon and macOS charges ~270 ms (serialised) for the first
  exec of a new script — one shared stub per run now (`ensureSharedStubClaude`). The history
  that triggered it (three measured load flakes, 2026-09-03) is in the design note.

- [x] **`internal/server` handler tests still build a real tmux server per test** (~35 of the
  `terminal_test.go`/`plainshell_test.go`/`shells_test.go`/`sessions_test.go` tests exercise
  404/409/cookie/JSON plumbing that only needs a session row to look dead or alive). Audit
  2026-09-06: `internal/session` already has consumer-side `PaneChecker`/`PaneSnapshotter`/`Killer`
  interfaces with fakes; what is missing is a session-*creation* seam (`NewSession`/`NewNamedSession`)
  and an attach seam over `termbridge.Attach` in `internal/server`. Keep real tmux for the PTY
  stream, geometry, takeover/misroute and kill-scoping tests (docs/conventions.md §Testing). A
  daemon plan through `/plan-work`: it changes production seams. `internal/server` is 25 s of the
  27 s `make test` wall time today. — **Done 2026-09-06 (plan `v1-cleanup`)**: `internal/server` declares
  consumer-side `paneSpawner` and `paneConn`/`attachFunc` interfaces (REQ-1, REQ-2) with
  nil-defaulting `Config.TmuxClient`/`Config.Attach` overrides, and the 20 tests named on the
  plan's keep-real list's complement now run against fakes. The 25 tests whose assertions are
  genuinely tmux-observable keep a real server, by the plan's list rather than agent judgement.
  Measurement recorded in `docs/design/test-strategy.md`.

- [x] **Deduplicate the per-test tmux socket helper** — the same ~10-line `os.MkdirTemp` +
  `t.Cleanup(kill-server)` idiom (with its 104-byte `sun_path` comment) is copy-pasted in
  `internal/tmux/tmux_test.go:29`, `internal/termbridge/termbridge_test.go:29,44`,
  `internal/server/{sessions,terminal,shells}_test.go`, `cmd/musterd/{open,onexit}_test.go`. One
  `internal/testutil` (or `internal/tmux/tmuxtest`) helper; pair with the item above. — **Done 2026-09-06 (plan `v1-cleanup`)**
  (REQ-4): `internal/tmux/tmuxtest` — a separate package, not a `_test.go` file, because
  `internal/server`, `internal/termbridge` and `cmd/musterd` all need it and Go test files are
  not importable. The ~104-byte `sun_path` rationale lives on the helper.

- [x] **Startup can hang forever on `claude --version`** (found 2026-09-07 by the worktree
  spikes' history census, branch `spike/worktree-conflicts`, `spikes/worktree/S5-census.md`
  finding 4): `internal/claudecode/version.go:31` is `exec.CommandContext(ctx, bin,
  "--version").Output()` with no `cmd.WaitDelay`, so the 5 s `versionCheckTimeout` kills the
  binary but `Output()` still waits for stdout EOF — any child the binary leaves holding the
  pipe hangs `musterd` before its first log line. Reproduced against `e0319f8` with the e2e
  stub of the time (a sleep loop): 244/244 e2e red, and a leaked scratch daemon still answered
  nothing on `/healthz` 23 min later; `feec502`'s stub answering `--version` masked it rather
  than fixing it. Fix: set `WaitDelay` (≈1 s) on the command; add a unit test with a stub that
  spawns `sleep` and exits. Note `e0319f8` went straight to `main` with the suite red — the
  land queue's verify gate (post-v1, `docs/design/worktree-conflicts.md`) is the process fix.
  Fixed by REQ-1/REQ-2/REQ-3: `cmd.WaitDelay` on all seven pipe-owning `exec.CommandContext`
  sites, with discriminating tests in `internal/claudecode` and `internal/tmux` (a stub that exits
  while a backgrounded `sleep` still holds stdout). `docs/conventions.md` now carries the rule. — **Done 2026-09-07 (plan `post-worktree-spike-issues`, via `/orchestrate`, approved review cycle 2)**

- [x] **Three load-flaky tests, measured across 25 × (check + e2e) census runs 2026-09-07**
  (same census; details and per-run logs in `S5-census.md` findings 1–3): (1)
  `TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce` failed 11 times, always at
  ~5.2 s with an empty capture, on trees where identical code passes; 1.4 s green alone at
  HEAD — fails even under `nice -n 5` with nothing else running. (2) `TestPreflight_TooOld`
  failed twice at exactly 2.00 s — a timeout-shaped assertion. (3) `actions.spec.ts:640`
  "Tiles: End from a tile footer keeps the tile in its slot…" was red on 33 trees in the
  pair-0…17 stretch and still flaked on later green trees. 16 of 25 merges had a spurious red
  from these three alone; together with the `views.spec.ts` E7 entry under M5+ they make any
  automated gate (queue or CI) cry wolf on roughly one land in three until fixed or retried.
  **Corrected 2026-09-07** (plan `post-worktree-spike-issues`; measured against `main` @ `2aea5ee`
  in `plans/post-worktree-spike-issues/validation.md`): findings (2) and (3) were **already fixed
  before this plan** and are not open work — the census only saw them because its pair index
  increases with recency and every tree at index ≤ 25 predates both fixes. (2)
  `TestPreflight_TooOld` was fixed by `e0319f8`: the census failures ran a real `tmux -V`
  subprocess out to `preflightTimeout` (2.00 s), while HEAD's test is `fakePreflighter(...)` with
  no subprocess at all. (3) `actions.spec.ts:640` was fixed by `feec502`, which replaced the
  one-shot `expect(neighbourWidthAfter).toBe(...)` with `expect.poll(neighbourGeometry)` plus
  `expectAllTileGeometrySettled`; all 15 failures are on trees ≤ 17 and every tree containing
  `feec502` ran 281/281, so the census's "still flaked on pairs 21, 24, 27, 28" is a grep artefact
  that matched the test's name in the ✓ *pass* list. The same commit fixed the `theme.spec.ts`
  flake this file's baseline notes. Only (1), the takeover test, is live work. **The headline
  above therefore does not hold for today's tree** — the worktree/land-queue design
  (`docs/design/worktree-conflicts.md`) should not be planned against "one land in three".
  (1) the takeover test now reads tmux's initial repaint before writing its marker (REQ-7);
  (2) and (3) were already fixed before this plan — see the correction above.
  `./cmd/musterd` and `./internal/server` are each 5/5 green (D10/D11). — **Done 2026-09-07 (plan `post-worktree-spike-issues`, via `/orchestrate`, approved review cycle 2)**

- [x] **E2E fixture leaks the scratch daemon when `start()` fails** (same census, finding 5):
  when the daemon never became healthy, the helper's teardown threw `Cannot read properties
  of undefined (reading 'teardown')` and neither the daemon nor its `stub-claude.sh` was
  killed — ~730 hung `musterd` processes and 893 `muster e2e-*` tmpdirs accumulated from two
  runs before they were noticed and killed. Measured against the `e0319f8`-era helper; verify
  the current `web/e2e/helpers/fixtures.ts`/`daemon.ts` pair kills the spawned process and
  removes the tmpdir when `spawnAndWait` throws, and add the guard if not.
  Fixed by REQ-4/REQ-5/REQ-12: a failed `ScratchDaemon.start()` routes through `teardown()` and
  rethrows the original diagnostic; `make e2e-fixture-leak-check` gates it and was proven to
  discriminate (exit 0 with the guard, exit 1 without). — **Done 2026-09-07 (plan `post-worktree-spike-issues`, via `/orchestrate`, approved review cycle 2)**

- [x] **Bring `make canary` up to full interface coverage** (split out 2026-09-09 from the
  versioning item below, which it **blocks**) — ✅ done 2026-09-10 (plan `canary-full-coverage`,
  via `/orchestrate`). Shipped: run C is a four-way `--permission-mode` sweep on the
  zero-token unauth path; run D launches through `BuildArgv` with `--name` + plan mode and
  waits for `Notification{idle_prompt}`; new run E resumes D through the production argv
  (closes the manual R2 check) and drives an unanswered `ExitPlanMode` for `PermissionRequest`
  + `permission_prompt`; a static tier asserts the interface strings in the installed bundle
  (`CLAUDE_CODE_SCROLL_SPEED` from `LaunchEnv()`, theme enum, usage path/header,
  `claudeAiOauth`, `find-generic-password`, `permission-mode`); a live tier runs the production
  Keychain reader, `FetchUsage` + a raw shape check, and `ReadThemeFamily` (fail, never skip).
  Residual rituals named in `docs/claude-code-pin.md`: plan-mode step 3, `agent_id` on
  subagent-originated hooks, the `fable` alias. Two measured facts changed the plan mid-run:
  2.1.267 preselects "No, exit" on the trust prompt (harness now reads the marker), and the
  `ExitPlanMode` `PermissionRequest` carries no `permission_suggestions` (optional now; nothing
  in production reads it). Pin bump 2.1.246 → installed is the step-2 ritual after `/land`.
  Original entry kept below for the record. The canary is the inventory-of-record for what
  Muster depends on, but it asserts roughly two-thirds of the surface — so a declared version
  range could only be honest about the asserted part. Close the gaps first.

  **Asserted today** (`test/canary/canary_test.go`, four real runs A–D, ~40 s, ~3 haiku turns):
  pin == installed, and the status line's own `version` agreeing with `claude --version`; hook
  transport (command wrapper + envelope on every event; an unmanaged session posts nothing); the
  per-event field inventory for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
  `Stop`, `StopFailure`, `SessionEnd`, plus the `permission_mode` always/never split and
  `SessionStart.model` as a bare string; `StopFailure` replacing `Stop` with
  `error: authentication_failed`; status-line `rate_limits`, the `seven_day` key, epoch-int
  `resets_at`, float `used_percentage`; unknown-vs-zero; command-hook path quoting under a
  space-bearing data dir; and `settings.go`'s written hook config implicitly, since the chain is
  production `WriteWrapperScripts` + `MergeSettings`.

  **Not asserted — the work:**
  - `CLAUDE_CODE_SCROLL_SPEED` — already owed as a pre-v1 sub-item under
    [#13](https://github.com/Zalaras/muster/issues/13) above; fold it in here rather than doing it
    twice. Unsupported interface, so an upstream rename degrades silently.
  - launch flags beyond what runs A/D happen to use: `--model`, `--name`, and
    `--permission-mode`'s four values — a rename on an unexercised one fails nothing
  - `--resume`, and the End → Resume same-`session_id` check (still manual, M4)
  - `theme.go`'s `~/.claude.json` top-level `theme` key
  - `credentials.go`'s Keychain item shape
  - `usageapi.go`'s `GET /api/oauth/usage` response — its own comment says "re-checked on every
    Claude Code pin bump", i.e. by hand
  - the four `needsInteractiveDialog` rows: the plan-mode sequence, `PermissionRequest`,
    `Notification`, `SubagentStop`. Deliberately skipped 2026-08-29 (a send-keys-driven permission
    dialog is too fragile for a gate) — decide per row whether that still stands, whether it is now
    automatable, or whether it stays an `/interface-probe` ritual named in `docs/claude-code-pin.md`.
  - **not** a surface: transcript paths. Nothing in the tree reads a transcript — `transcript_path`
    arrives on every hook and is unused — so there is nothing to assert or version there.

  Constraints: every added run burns real subscription (haiku only, trivial prompts, kill the
  session — CLAUDE.md), so prefer folding assertions into the existing four runs over adding runs.
  `MUSTER_CANARY_OFFLINE=1` must stay a zero-token path.

- [x] **Version the Claude Code interface — support a range of versions, not just the pin**
  (asked 2026-09-07): Muster assumes exactly one Claude Code wire format today — the shapes
  measured against the pin (`docs/claude-code-pin.md`, currently 2.1.246). Drift is a startup
  warning and the stated posture is "fix Muster that week" (SPEC §8). That is not enough for a
  shipped v1: the user's `claude` auto-updates and may sit anywhere, so an older or newer binary
  has to keep working. **Every interfacing point with Claude Code must become explicitly
  versioned** — the shape Muster expects, and the version range that shape is known to hold for.

  The surface to version (all of it stays inside `internal/claudecode/` — hard rule unchanged):
  - hook payload shapes and delivery semantics — which events exist and which fields each
    carries (`ingest.go`, `interpret.go`, inventory in `spikes/canary-fields.md`)
  - status-line JSON, both shapes (`status.go`)
  - launch CLI flags and `--resume` behaviour (`launch.go`)
  - the hook config Muster writes into a project `.claude/settings.json` (`settings.go`)
  - transcript paths, theme (`theme.go`), Keychain credentials (`credentials.go`) and the
    `GET /api/oauth/usage` response (`usageapi.go`)

  Shape of the work — for `/spec` to settle, not decided here:
  - a **declared supported range**: a floor version, and what musterd does below it (refuse with
    a named remedy vs. degrade), open-ended above with best-effort + the drift warning
  - **per-field version applicability** recorded in `spikes/canary-fields.md` (each field gains
    a "since"/"until"), so the inventory can answer "does this still hold on 2.1.x?"
  - **version-gated adapters** where shapes actually diverge — resolved once from the detected
    version at startup, never per payload, and never by sniffing terminal output (hard rule)
  - how the supported range is *established* — see the notes below; the canary keeps running
    against one version only (the installed one)
  - user-facing wording: this subsumes
    [#6](https://github.com/Zalaras/muster/issues/6) (drift warning is developer-facing) — a
    declared supported range is what makes that warning sayable in user terms.

  Notes on the intended mechanism (Damian, 2026-09-07 — not yet a design, capture only):
  - The canary still runs against **the currently installed version only**. There is no
    multi-version canary rig; nothing about the "install several `claude` builds" shape is wanted.
  - The supported range accretes from green canary runs: **from wherever we started, up to the
    last version the canary passed on.** A green run changes nothing — it just extends the top of
    the range. So the range is a record of what has been observed, not a claim made in advance.
  - When a run goes **red**, that version is a real interface change: add the new shape behind the
    version gate and **keep the old code** so the older versions stay supported. Update the canary
    (and `spikes/canary-fields.md`) for the new shape at the same time. Each red run becomes a
    known **change point**; the adapters are the intervals between change points.
  - The wrinkle is knowing **where old code stops being useful** — i.e. which side of a change
    point an *unseen* version falls on, since nothing was ever run against the versions in between.
    Candidate answer: a **small in-built canary** — a cheap probe musterd can run at startup on an
    unknown version, enough to tell which of the two adjacent known shapes it matches, and pick
    that adapter. Keep it minimal (it runs on real launches, unlike `make canary`) and it must not
    burn subscription — the `interface-probe` rig (`test/rig/`) is the model for what it asks.

  Interactions: the post-v1 **"rethink the pin strategy itself"** item (M1 follow-ups, above)
  folds into this — with a range, the pin is the *tested* version rather than the only supported
  one. Landing this changes SPEC §8's dependency posture and needs a `docs/history/spec-changelog.md` entry.

  *Spec written 2026-09-10 — `plans/version-claude-interface/spec.md`; next is `/plan-work`.* The
  declaration shape was chosen: observed-versions record as single source of truth (floor/ceiling
  derived), classification `unknown|below|verified|above` with warn + best-effort on both sides,
  protocol 2 hello, masthead icon + hover text (#6), canary skips on the verified version and
  appends the version + regenerates docs on a green run outside the range; version-gated adapters
  and the startup probe are **out** (zero change points). Earlier parking note kept for the record:
  the 2026-09-09 `/spec` run stopped at the goal question; no plan dir was written. What it
  established, so the next run does not re-derive it: there are **zero observed change points**
  today — every shape in `spikes/canary-fields.md` has held from 2.1.233 through 2.1.259, and the
  recorded deltas are *additions* (the subagent fields), not divergences — so the version gates
  have nothing to gate yet and the in-built startup probe has nothing to disambiguate. And a
  declared range can only honestly claim what the canary asserts, which is why the **canary
  coverage** item above was split out to land first. The open goal question is whether this item is
  a truthful *declaration* (a floor, defined behaviour below it, honest wording for
  [#6](https://github.com/Zalaras/muster/issues/6), per-shape applicability in `canary-fields.md`,
  gate structure established but empty) or the full mechanism built against a hypothetical change
  point. Resume with `/spec version-claude-interface` once coverage lands.
  **Done 2026-09-10 (plan `version-claude-interface`, via `/orchestrate`)** as the *declaration*:
  `internal/claudecode/observed_versions.txt` record → `Floor()`/`Verified()`, `Classify`
  `unknown|below|verified|above`, protocol 2 `hello.claudeCode {installed,floor,verified,status}`,
  masthead ⚠ + hover text (#6), `musterd -version` range, canary skip-on-ceiling +
  `tools/versions bump|gen|check`, `docs/claude-code-versions.md`. Version-gated adapters and the
  startup probe are deliberately not built (zero change points) — the red-canary ritual in the
  new doc is where the first gate gets added.

- [x] **Open-source the repo — flip `Zalaras/muster` to public** — **done 2026-09-10**
  (`scripts/go-public.sh --yes`, three runs: gh too old, post-flip lock, then clean; every §2
  setting verified against the printed output and anonymously — `docs/go-public.md`, SPEC
  changelog 2026-09-10). Left for Damian by hand: fork-PR template check, Issue button from a
  running `musterd`. The three unblocked items are the next entries below. Was (moved into
  pre-v1 on 2026-09-10, Damian's call; the two install items below depend on it and came with it).
  Nothing left to decide: the procedure is `docs/go-public.md` (§1 pre-flip is done bar its two
  mechanical last checks), the reasoning is `docs/design/open-sourcing.md`, licence is MIT
  (`docs/history/spec-changelog.md` 2026-09-04) and the contribution policy is issues yes, PRs no.
  `scripts/go-public.sh` applies the **[script]** steps — dry-run by default, has never been
  run, and **must not be run unasked**. Three things the flip turns into live calls rather than
  hypotheticals, all noted in the release-workflow item above: the **test/lint CI job** held
  "pending possible open-sourcing" (`make check` as a step is a one-liner), the deferred
  **Homebrew tap** (a public repo needs no private-tap token — plan it with the two items
  below), and macOS runners, which stop costing 10x once the repo is public.

- [x] **A real `curl | sh` installer** — the second half of
  [#7](https://github.com/Zalaras/muster/issues/7) (the first half, the broken README command,
  shipped 2026-09-02). ✅ **done 2026-09-10** (`scripts/install.sh`, direct fix, no pipeline —
  shell + Makefile + docs only; #7 was already closed by `c71a759`, so nothing to close).
  Homebrew was **split out** on Damian's call and is its own item below. What it does:
  resolves "latest" through the `/releases/latest` **redirect** rather than the API
  (unauthenticated `api.github.com` is 60 req/hr per IP; the redirect is unmetered),
  downloads the arch archive plus `checksums.txt`, **verifies the SHA-256** — the thing
  starship's much-copied installer does not do, and the standard criticism of this install
  shape — then `tar`-selects the `musterd` member into `~/.local/bin`. POSIX `sh` (macOS
  `/bin/sh` is bash 3.2 in POSIX mode); no sudo, no confirmation prompt (piped, stdin *is*
  the script). `--version`/`--bin-dir`/`--arch`/`--base-url`/`--help`, each with a
  `MUSTER_*` env equivalent; the last two exist so the arm64 and failure paths can be run
  on an Intel Mac. `make install` is now a one-line wrapper around it, so the arch/temp-dir/
  tar/shadow logic exists once and `gh` has left the install path entirely. Two bugs were
  found by running it, per the #7 lesson: piped `--help` printed nothing (self-parsing `$0`,
  which is not the script when piped), and an unwritable `--bin-dir` was only discovered
  *after* a 5 MB download.

- [x] **Post-open-source: revisit the install instructions** (asked 2026-09-09; **moved from
  post-v1 into pre-v1 on 2026-09-10**, Damian) ✅ **done 2026-09-10** — the README was written
  for a private repo (every path through `gh release download`, `make install` carrying the
  same `gh` dependency). Rewritten around the new installer, and on Damian's follow-up
  instruction the review covered the **whole file, not just § Install**: 194 → 115 lines.
  Cut the "Why Muster" naming blockquote, the `claude-session-manager-handoff.md` note, the
  `## Layout` tree (whose closing line still said "M0 adds the HTTP/WS server"), `## Status`'s
  milestone prose, all four `gh` fences with ~30 lines of rationale behind them, and the
  `## Prerequisites`/`## Requirements` duplication. Added a dashboard **screenshot** and a
  licence section; the `Issue`-button detail moved into `CONTRIBUTING.md`, which had been
  pointing *back* at the README for it. The two load-bearing strings survive by test:
  `TestReadmeTmuxRemedyMatchesPreflight`'s two `brew` remedies and the `versions:range`
  fragment. Auto-update, the other half of this item, is split out below.

- [x] **Auto-update for `musterd`** — **Done 2026-09-10 (plan `auto-update`, via `/orchestrate`, review approved cycle 2)**: `updateCheck` pref (default on, check-only), daemon-side daily check via the `/releases/latest` redirect, Settings badge + Updates section, minisign-verified **Update** / **Update and restart** (in-place re-exec, sessions re-adopted) and `musterd -update`; install kinds `dev`/`homebrew`/`unmanaged`/`installer`; GoReleaser `signs:` block and `docs/release-signing.md`. Landing needs the two CI secrets (`MINISIGN_SECRET_KEY`, `MINISIGN_PASSWORD`) or the next release fails at the sign step by design. Originally **split out of the install-instructions item on
  2026-09-10**; the install-instructions half shipped with the installer above. Muster ships
  as a GitHub Release binary with no update path at all — a user who installs once never
  learns a newer version exists. Wants a `/spec` pass, not a decision here; the questions
  are at minimum: check-only (a dashboard "update available" cue reading the releases API)
  vs. self-replacing binary; where the check runs and how often; opt-out; how it interacts
  with a daemon that has live tmux sessions attached (a restart must not orphan them —
  reconcile already exists, M4); and signing/verification of the downloaded archive. Note
  the deliberate contrast with Claude Code's own auto-updater, which Muster leaves on and
  does not manage (`docs/claude-code-pin.md`). The installer now verifies a SHA-256, which
  is a precedent for the "signing/verification" question rather than an answer to it.
  *Spec written 2026-09-10 — `plans/auto-update/spec.md`; plan approved 2026-09-10 — `plans/auto-update/plan.md`; orchestrated 2026-09-10 on `plan/auto-update` — review `plans/auto-update/review.md`.*
  Settled in the interview: one on/off pref (default on) that governs **checking only** — off
  means no network call at all; apply is always explicit via an **Update** button (swap, then
  "restart musterd to finish") or **Update and restart** (swap + in-place re-exec, confirm step
  names the plain-terminal shells that will close) or `musterd -update` (swap only); daemon-side
  check at startup + every 24 h via the `/releases/latest` redirect; **minisign-signed
  `checksums.txt`** with the public key compiled in (key + CI secret are Damian's to create);
  `dev` builds show nothing, Homebrew/unexpected paths badge but disable apply with the remedy.

- [x] **Fix the `terminal.spec.ts` E12 parallelism flake before v1** — `web/e2e/terminal.spec.ts:235`
  ("killing the stub's tmux session shows the ended placeholder") failed the first full `make e2e`
  of `auto-update`'s review cycle 2 and passed the immediate re-run; the reviewer measured roughly
  1 run in 2 that day (`plans/auto-update/review.md` note 1). The spec's own comment at `:243`
  already admits "transient timeouts only under full-suite parallelism" and only widened the
  timeout to 15 s. Find the actual cause in the terminal-attach path under load (or the fixture),
  don't widen the timeout again. Damian, 2026-09-11: must be fixed before v1.
  **Cause found 2026-09-11** (timed probe, 15 kills, 1 reproduced): not the attach path and not
  load. The `4001` overlay E12 asserts on is a ~25 ms transient — the probe measured the overlay
  appearing 5–9 ms after `kill-window` and `#dead-surface` replacing the whole terminal region
  ~30 ms after, every time, because `pumpPTYToSocket` closes the socket with `4001` and then
  immediately `Nudge`s the liveness poll, whose `alive:false` upsert makes `render()` dispose the
  `TerminalSurface` (`pane.ts` then ignores the late `close` event via `disposed`). Whenever the
  browser handles the state-WS upsert before the terminal-WS `close` event, the overlay never
  renders and the region is gone — the assertion cannot pass within 15 s or 15 min. E12 predates
  m4-reconcile's dead surface (m2, 2026-08-23); the REQ-13 test in the same file was repointed at
  `#dead-surface` then, E12 was not. Fix: assert the durable end state (dead surface visible,
  region unmounted, `alive:false`) and leave the `4001` close code to
  `TestHandleTerminal_KillingTheTmuxSessionCloses4001AndNudgesLiveness`, which already covers it.
  **Fixed 2026-09-11** (branch `fix/e12-durable-oracle`, direct, no pipeline): E12 and
  `views.spec.ts`'s tile-kill test (the same oracle, inside a tile) now assert the socket closed
  (`TerminalSocketTracker`), the dead surface's `.endcap`, and the region unmounted;
  `terminalOverlay` no longer matches "session ended"; e2e-lint rule 4 rejects the oracle;
  `make e2e-soak SPEC=<file> N=<n>` added for proving flake fixes. Evidence:
  `make e2e-soak SPEC=terminal.spec.ts N=20` → 400 passed; `SPEC=views.spec.ts N=20` → 340
  passed; full `make e2e` ×3 green (see commit). Rule recorded in `docs/conventions.md` §Testing
  and `docs/design/test-strategy.md` "Transient displays are not oracles".

- [x] **`/triage` hardened against prompt injection from public issues** ✅ done 2026-09-11 (direct on `main`, plan `triage-hardening`)
  — the repo went public 2026-09-10, so an issue body is attacker-controlled text, and the
  skill's `allowed-tools: … Bash …` was *granting* prompt-free Bash for the very turn that
  ingested one (`allowed-tools` grants, it does not restrict). The real target was `TODO.md`,
  which every later `/orchestrate` and `/plan-work` session reads with full tools. Now
  `tools/triage` fetches, sanitises, routes, validates, splices and commits; a
  `triage-proposer` subagent holding only `Read` summarises one artifact each; untrusted
  issues render from enums plus one verbatim-checked quote, so no model-authored prose
  reaches this file. Design and residual risks: `docs/design/triage-hardening.md`.

## Reported issues (pre-v1 release)
<!-- kb: adr/surfaces-tmux-preflight-at-startup, adr/theme-two-layer-tokens-not-white-label, adr/drop-daemon-locates-original-never-stages, adr/focus-rail-click-focuses-terminal, adr/launch-permission-modes-offered-four-tabbed, adr/surfaces-scroll-speed-via-launch-env, adr/surfaces-scrollback-affordance-not-built, adr/shortcuts-option-command-family-off-reserved-chords, adr/rename-muster-owned-title-override-wins, adr/lifecycle-subagent-marked-events-not-stragglers, adr/rail-current-marker-means-shown-in-focus, adr/theme-contrast-floors-above-aa, adr/theme-type-scale-tokens-15px-root, adr/surfaces-shell-is-attach-target-not-session -->

- [x] **tmux dependency is unhandled at first launch** ([#2](https://github.com/Zalaras/muster/issues/2))
  — on a machine without tmux the first launch dies with the raw exec error
  (`spawning tmux session: tmux new-session: exec: "tmux": executable file not found in $PATH`).
  Either bundle tmux or preflight the dependency at startup and name the remedy
  (`brew install tmux`); the failure has to be legible before v1 either way. Same seam as
  #4 — one plan can close both.

- [x] **Install instructions are insufficient** ([#4](https://github.com/Zalaras/muster/issues/4))
  — the GitHub Release is the only distribution path (Homebrew deliberately deferred, see
  the CI item above), so `README.md` has to carry the whole story: separate Intel and Apple
  Silicon archives, where the binary belongs, and how to verify it runs. Pairs with #2.

- [x] **Contrast pass + design tokens** ([#3](https://github.com/Zalaras/muster/issues/3)) ✅ done 2026-09-02 (plan `new-ui-design-colors`, via `/orchestrate`, approved review cycle 1; lands with `/land new-ui-design-colors`, which closes #3)
  — some text fails on contrast, and the fix is structural rather than a one-off colour
  tweak: move `web/src/style.css` onto a token system with a standard light/dark pair and
  room for custom themes. Touches the design system (`docs/design/design-system.md`),
  so it wants a `/spec` pass before planning. Note the M5+ `.btn:disabled` affordance item
  is the same layer — if this lands first, fold that pass into it.
  **Spec written 2026-09-02** → `plans/new-ui-design-colors/spec.md` (three built-in themes:
  Instrument/Dark/Light, AA-everywhere contrast gate, Settings dialog + `theme` pref, daemon
  polls Claude's `~/.claude.json` theme key for the terminal ground; `.btn:disabled` pass
  folded in). Planned and built 2026-09-02.

- [x] **Dropping a file on a terminal pane navigates the browser** ([#8](https://github.com/Zalaras/muster/issues/8))
  — in a real terminal a dragged file inserts its path; in the dashboard Safari (and likely
  every other browser) opens the file, losing the dashboard. Nothing in `web/src/` handles
  `dragover`/`drop` outside the tile and rail reorder, so the browser default wins. The cheap
  half is worth doing alone: preventing the default on the pane stops the navigation. Matching
  terminal behaviour is the hard half — a drop yields a `File` blob and never a filesystem
  path (deliberately, for security), so the path must come from elsewhere: the `/api/browse`
  picker already in the tree, or a daemon-side staging write. Decide which before planning.
  **Done 2026-09-03** (plan `file-drop-fix`, approved review cycle 2, on `plan/file-drop-fix` —
  lands with `/land file-drop-fix`, which closes #8). Neither of the two options above: the daemon
  *locates the original file* — the page uploads the dropped bytes to `POST /api/sessions/{id}/locate`,
  the daemon asks Spotlight (`mdfind`, exact name + size) then walks the session directory, byte-compares
  candidates and returns the single identical path (`404 not_located` / `409 ambiguous` otherwise; never
  writes a copy). The page pastes it Terminal.app-escaped with a trailing space via xterm's paste and
  focuses the pane; a document-level guard swallows every foreign drag so nothing navigates; text-only
  drops paste verbatim; per-surface `role="status"` notices for every outcome. Follow-ups from the
  approved review (`plans/file-drop-fix/review.md`, cycle 2 Minors, none routed — agents tagged only
  with Minors are not spawned):
  - ~~`[web-impl]` The in-flight `Locating <name>…` notice auto-hides after 5 s while the request is
    still running — `showNotice` in `web/src/terminal/pane.ts` arms the 5 s timer for every non-null
    text; REQ-6 ties the hide to the failure text only. Arm the timer only for the failure branch.~~
    **Fixed 2026-09-06 (plan `v1-cleanup`, REQ-12/REQ-13)**: the show/clear/auto-hide logic is now one
    module (`web/src/terminal/notice.ts`) that both `terminal/pane.ts` and `render/dead.ts` delegate
    to, and only outcome notices arm the 5 s timer.
  - ~~`[daemon-impl]` `Locator.walkCap` and `Locator.spotlightTimeout` (`internal/locate/locate.go`) are
    set by `New()` and never read — the acting values are baked into `SpotlightFinder`/`WalkFinder`.
    Drop the fields, or have `Locate` use them.~~ **Fixed 2026-09-06 (plan `v1-cleanup`, REQ-7)**: the
    two fields are deleted; `DefaultWalkCap`/`DefaultSpotlightTimeout` stay where the finders consume
    them.
  - `[daemon-impl]` A nil `Locator` panics the handler (`internal/server/locate.go` dereferences
    `s.locator` unguarded while `Config.Locator`'s comment invites tests to leave it nil). A two-line
    guard returning `500 internal_error` turns the panic into a diagnosable error.

- [x] **Sidebar click doesn't move focus into the terminal** ([#11](https://github.com/Zalaras/muster/issues/11))
  — clicking a rail card should leave you able to type immediately; it used to select the
  session but leave keyboard focus on the card, so the pane needed a second click.
  **Done 2026-09-02** (plan `terminal-focus`, approved review cycle 1, on
  `plan/terminal-focus` — lands with `/land terminal-focus`, which closes #11). Web-only, no
  protocol or schema delta: `TerminalSurface` gained `focus()`, called once from the rail
  card's pointer-click callback after `render()`. Scope settled at planning: the rail
  pointer click only — ⌘1–9, Enter/Space on a card and the Tiles strip deliberately keep
  their behaviour, and a dead session's card leaves focus in place. Shares the `main.ts`
  seam with `shortcut-fixes` (#5 below) but touched neither `focusNth` nor the keydown
  listener; `shortcut-fixes` may now run.

- [x] **The launcher's "auto-accept" isn't auto mode** ([#12](https://github.com/Zalaras/muster/issues/12)) ✅ done 2026-09-03 (plan `fix-auto-mode-select`, via `/orchestrate`, approved review cycle 2; lands with `/land fix-auto-mode-select`, which closes #12). Shipped the second option: the "Start in" control is now `manual │ accept edits │ plan │ auto`, `auto` is requestable end-to-end, `bypassPermissions`/`dontAsk` stay unoffered pending §4.4.
  — picking it on a new session gives edit access, not auto. The wire is self-consistent
  (`web/index.html:130` sends `acceptEdits`; `BuildArgv` emits `--permission-mode
  acceptEdits`), but Claude Code separately reports a mode literally named `auto` — which is
  what the reporter's own snapshot shows once the session is running — and muster cannot
  request it: `bypassPermissions` appears nowhere in the tree. Decide the fix: rename the
  radio so it can't be read as Claude's `auto`, or add a fourth option that really asks for
  it. The second wants the guardrails the §4.4 permissions UI (M5+) implies.
  - [x] Follow-up (review Minor, `plans/fix-auto-mode-select/review.md` cycle 2 Minor 1, `[web-impl]`) — **Done 2026-09-06 (plan `v1-cleanup`)** (REQ-14):
    "Two comments on the new REQ-6 code describe a world the fix removed — `web/src/api.ts:52-57`
    and `web/src/render/launch.ts:99-103`. `api.ts` says '`setPermissionMode` is the only caller',
    but `selectedPermissionMode` is a second caller … `launch.ts` says the fallback handles
    '`null` coerced to the empty string by callers', but the same fix dropped both `?? "default"`
    coercions … Reword both to name both callers and to say the function takes `null` directly."

- [x] **No scrollback affordance on the terminal pane, and scrolling is slow** ([#13](https://github.com/Zalaras/muster/issues/13))
  ✅ done 2026-09-03 (direct fix, no pipeline — one const + two call sites + unit tests).
  Investigated in `spikes/S6-scroll-bandwidth.md`, which disproved **both** of the causes this
  entry previously asserted. Scrolling is now **5 lines per wheel notch** instead of ~1, via
  `CLAUDE_CODE_SCROLL_SPEED` (`internal/claudecode/launch.go`, merged into the launch *and*
  resume env by `LaunchEnv()`), measured 4.9 lines/notch end to end through a Muster-launched
  session. **The scrollbar half is won't-fix, not deferred**: Claude Code emits `ESC[?1049h`
  itself on a bare PTY with no tmux in the loop (S6 §1), so the alternate screen — and the
  absence of any buffer to scroll — is Claude Code's doing, not tmux's and not
  `pane.ts`'s `scrollback: 0`, which merely documents it. Raising `scrollback` changes
  nothing; neither would dropping tmux.
  Two claims in the old entry are now disproved and must not be reintroduced:
  **(a)** "a wheel gesture reaches tmux copy-mode instead" — it does not; with `mouse off`
  the wheel goes to Claude Code, which requests mouse tracking itself (S6 §1/§5).
  **(b)** "what's needed is a design pass on surfacing copy-mode from the browser" — copy-mode
  would open onto an **empty buffer**: with Claude Code in the alt screen, `capture-pane -S
  -2000` returns exactly the visible screen (30 of 30 lines, against 76 with the alt screen
  disabled — controlled A/B, S6 §2). That design pass would have shipped nothing.
  Two follow-ups are owed and are **not** covered by this fix. One is pre-v1:
  - [x] `make canary` must assert `CLAUDE_CODE_SCROLL_SPEED`. ✅ done 2026-09-10 in plan
    `canary-full-coverage`: the static tier asserts every `LaunchEnv()` key as a byte string in
    the installed bundle (rename/removal detection only; the effect stays measured in S6). Was:
    It is an unsupported interface
    (absent from `claude --help`, found by reading strings out of the binary), so an upstream
    rename degrades silently back to ~1 line/notch rather than failing. Measured on **2.1.259**
    while the pin is **2.1.246** — re-confirm against the pinned build (`docs/claude-code-pin.md`).
    *2026-09-09:* folded into the pre-v1 **canary coverage** item (Pre-v1 Cleanup) — do it there
    with the rest of the uncovered surface, not on its own.

  The other, **terminal bandwidth (`tmux -CC`)**, was moved to post-v1 on 2026-09-09 (Damian) —
  it is a separate plan of its own, not a loose end of this fix. See the M5+ entry.

- [x] **README's install command doesn't work on Apple Silicon** ([#7](https://github.com/Zalaras/muster/issues/7))
  ✅ done 2026-09-02 (direct fix, no pipeline — doc + Makefile only). The README's by-hand
  block is now **two full per-arch fences** (arm64 and amd64), each downloading into a fresh
  `mktemp -d` and extracting with `-C ~/.local/bin` — which kills the `--clobber` and the
  glob-plus-member failures by construction rather than by patching the symptoms — plus a
  prose note saying *why* the temp dir is load-bearing so a later edit can't undo it, and a
  latest-vs-pinned note (no tag = latest, which is *why* `--pattern` is mandatory there; a tag
  as first argument pins — both verified, `v0.3.0` fetched and ran as `musterd 0.3.0`) closing
  a gap in the old lead-in, which offered "a specific version" and then showed no way to ask
  for one. The
  shadowing half is answered with verification rather than a location change: "Confirm it
  worked" now runs `command -v musterd` **before** `-version` and explains that a mismatch
  means a stale copy earlier in `$PATH` is what `-version` just reported. Both commands were
  run end to end before being written down (arm64 and amd64, twice each, rc=0 — re-runnable
  without `--clobber`); `chmod +x` is *not* needed, the archived binary is already
  `-rwxr-xr-x`. Two extras found while verifying: `make install` had no shadow warning (added,
  same wording as the README), and — pre-existing, worse — its recipe chained with `;` and no
  `set -e`, so a failed `gh release download` still printed `installed …` and **exited 0**
  (measured: rc=0 on a broken-auth run; now `make: *** [install] Error 4`, rc=2).
  **Deliberately not done: the `curl | sh` installer the issue also asks for** — it waits on
  open-sourcing, which moved into Pre-v1 Cleanup on 2026-09-10; see the entry there (it was
  post-v1/M5+ until then). Was: the block at `README.md:76-79` failed three
  separate ways, all reproduced by the reporter:
  `tar -xzf musterd_*.tar.gz musterd` passes the glob *and* a member name, so tar sees five
  arguments (`tar: accepts at most 1 arg(s), received 5`); a second `gh release download`
  aborts (`musterd_0.2.1_darwin_arm64.tar.gz already exists (use --clobber to overwrite
  file...)`); and `~/.local/bin/musterd` loses to an existing `/usr/local/bin/musterd`
  earlier in `$PATH`, so an upgrade silently keeps running the old binary. The reporter's
  working four-line version is in the issue. Beyond patching those lines the issue asks for a
  real install path — the `curl | sh` script most non-brew tools ship — since Homebrew stays
  deferred. This is the ground #4 was ticked for: the text written to close #4 is the text
  that's broken.

- [x] **⌘N collides with the browser** ([#5](https://github.com/Zalaras/muster/issues/5))
  ✅ done 2026-09-04 (plan `shortcut-fixes`, via `/orchestrate`, approved review cycle 2;
  lands with `/land shortcut-fixes`, which closes #5).
  — the new-session shortcut is swallowed by Safari's own new-window binding. Muster
  shouldn't override browser defaults; rebind to something unclaimed and re-check the
  ⌘1–9 focus shortcuts for the same problem while in there.
  **Shipped**: ⌘N → **⌥⌘N**, ⌘1–9 → **⌥⌘1–9**, new **⌥⌘0** jump-to-neediest; bare ⌘N is no
  longer intercepted at all. Matching moved off `event.key` onto `event.code` in one pure
  module (`web/src/shortcuts.ts`) — `event.key` cannot express an ⌥-chord (⌥N is `"˜"`).
  Web-only, no protocol or schema delta. Chords settled by measurement — `spikes/S5-key-probe.md`, re-runnable probe
  at `spikes/key-probe.html`:
  - **⇧⌘N (the suggestion originally in this item and in #5) is reserved in *both* Safari
    and Chrome** — private/incognito window. It was never a fix; that is why the plan
    exists rather than a one-line rebind.
  - Settled table: ⌘N → **⌥⌘N**, ⌘1–9 → **⌥⌘1–9**, plus **⌥⌘0** jump-to-neediest, which
    also discharges the `cmd-n-ordering` dissent (order-sidebar follow-up 1 above). ⌘\ and
    ⌘↑ measured safe in both browsers and stay put.
  - Caveat to carry forward: Chrome does *not* reserve ⌘-digits, and Safari's ⌘1–9 rows
    went unmeasured — so there is no evidence ⌘1–9 was ever broken here. The rebind rests
    on ⌥⌘ being provably clear in both browsers, not on an observed failure.
  - The E2E suite cannot verify any of this: Playwright injects below the browser chrome
    (`web/e2e/views.spec.ts:110` pressed `Meta+1` green the whole time ⌘N was broken).

- [x] **No way to rename a session after it starts** ([#10](https://github.com/Zalaras/muster/issues/10)) ✅ done 2026-09-03 (plan `ui-text-and-focus`, via `/orchestrate`, approved review cycle 2; lands with `/land ui-text-and-focus`, which closes #10, #16, #18 and #19).
  — the reporter wants to click the title and edit it. Today `title` is set once from the
  launch form via `claude --name` and thereafter refreshed from the status line's session name
  whenever present (`docs/protocol.md` §5.3, M3 semantics); there is no rename route, and
  `POST /api/sessions` is the only place a title is accepted. So this is a protocol delta (a
  new endpoint) *plus* a precedence rule that delta must settle — a manually chosen name has to
  survive the next status-line post, which means a "manual title wins" flag on the session row,
  not just a write. Wants a `/spec` pass before planning.

- [x] **Clicking the already-active view segment discards an open rename** ✅ done 2026-09-03 (plan `claude-status-fixes`, via `/orchestrate`, approved review cycle 1; lands with `/land claude-status-fixes`, which closes #14, #15 and #20). Follow-up from
  `ui-text-and-focus` (review cycle 2 Minor 1, `plans/ui-text-and-focus/review.md`): the
  `mousedown` guard on `viewFocusBtn`/`viewTilesBtn` in `web/src/main.ts` calls
  `cancelOpenRenames()` unconditionally, so clicking **Focus** while already in Focus (or Tiles in
  Tiles) drops the typed text with zero PUTs, where REQ-14's blur-commit should apply — the
  gesture is not a view switch. Fix: guard each listener by the view it would select
  (`if (view !== "focus") cancelOpenRenames()` and the mirror), which also stops a right- or
  middle-click on the switcher from cancelling an edit. Add an E2E pin beside the four
  view-switch cancel tests in `web/e2e/rename.spec.ts`.

- [x] **E7 spec variable misnamed** — follow-up from `claude-status-fixes` (review cycle 1
  Minor 1, `plans/claude-status-fixes/review.md`): in `web/e2e/subagent-status.spec.ts`'s E7
  test "the variable holding `failed.stateSince` is named `lastActivityBefore` … compared
  against `resumed.stateSince` two lines later, and the comment beside it talks about
  `lastActivity`, so a maintainer reads the assertion as being about a field it never
  touches. Rename to `stateSinceBefore`." Cosmetic; fold into the next E2E touch. — **Done 2026-09-06 (plan `v1-cleanup`)** (REQ-16).

- [x] **Six E2E comments still name the pre-plan chords** — follow-up from `shortcut-fixes`
  (review cycle 1 Minor 1, `plans/shortcut-fixes/review.md`): "Six internal comments across
  the suite still name the pre-plan chords, after the same pass renamed comments in the five
  files it did touch. Each is a comment a maintainer reads while deciding what a test covers,
  and each now describes a binding that no longer exists" — `web/e2e/shell.spec.ts:28`
  (quotes the placeholder as `"No sessions yet — ⌘N to launch"`; the string is now `⌥⌘N`),
  `web/e2e/helpers/picker.ts:11`, `web/e2e/views.spec.ts:112`,
  `web/e2e/rail-order.spec.ts:582,584`, `web/e2e/terminal.spec.ts:407`. Wrong-but-inert —
  every assertion beside them is correct, which is why the suite is green. Note for the
  fixer: `rail-order.spec.ts:582-586` describes a *past* decision, so `⌥⌘1–9` is the right
  replacement there rather than a rewording. Cosmetic; fold into the next E2E touch. — **Done 2026-09-06 (plan `v1-cleanup`)**
  (REQ-17). The plan's cited line numbers were stale against the tree; the six sites were matched
  by content.

- [x] **A session reads Idle in the rail while it is still working** ([#14](https://github.com/Zalaras/muster/issues/14)) ✅ done 2026-09-03 (plan `claude-status-fixes`, via `/orchestrate`, approved review cycle 1; lands with `/land claude-status-fixes`, which closes #14, #15 and #20).
  — "Had this session go IDLE in the UI on the sidebar while it's still working and editing
  files". The issue's own snapshot corroborates it rather than just reporting it: `state idle
  since 2026-09-01T16:05:07Z` with events running to `16:07:08Z` and the last ten ending
  `PreToolUse, PostToolUse, status_line` — so tool activity arrived *after* the Idle and did
  not move the state back. Prime suspect is the Edge Case 2 straggler guard
  (`internal/session/machine.go:20`): `KindTurnActivity` returns early with no transition when
  the prompt id it carries has already been closed by a `Stop`, which makes genuine post-`Stop`
  work under that same prompt id indistinguishable from a late straggler. **Probed
  2026-09-03 (2.1.259, `spikes/FINDINGS.md` → "subagent / background-task probe"): root cause
  confirmed.** A background subagent's `PreToolUse`/`PostToolUse` carry the *parent turn's*
  `prompt_id` and arrive after that turn's `Stop`, so the guard drops them; they are
  distinguishable by `agent_id`/`agent_type` (present on every subagent tool hook, absent on
  main-agent ones), and `Stop.background_tasks` is non-empty while the work is outstanding.
  Resumption is already handled: each completion arrives as a `UserPromptSubmit` with a fresh
  `prompt_id` closed by its own `Stop`. Fix direction: let subagent-tagged tool hooks bypass
  the straggler guard (a flag/kind derived in `internal/claudecode`, never a parse elsewhere)
  and use `background_tasks` as the E2E oracle; do not hold "working" on `background_tasks`
  alone, since a backgrounded shell keeps it non-empty indefinitely. Ready to plan; independent
  of #15's attention fix, though one plan can carry both.

- [x] **Attention stays latched on "needs permission" after work resumes** ([#15](https://github.com/Zalaras/muster/issues/15), [#20](https://github.com/Zalaras/muster/issues/20)) ✅ done 2026-09-03 (plan `claude-status-fixes`, via `/orchestrate`, approved review cycle 1; lands with `/land claude-status-fixes`, which closes #14, #15 and #20).
  — "Doesn't need my permission it's currently thinking but UI says needs permissions".
  Confirmed in the tree, not just plausible: `internal/session/machine.go`'s `KindTurnActivity`
  branch latches `permission_mode` and sets the active state but never clears `sess.Attention`
  — only `KindTurnClosed`, `KindTurnFailed` and a re-bind (`machine.go:47,59,109`) do. The
  snapshot shows the consequence: `state working since 2026-09-01T16:28:57Z` alongside
  `attention permission since 2026-09-01T16:17:54Z`, eleven minutes stale, which violates
  §5.3's unconditional "attention iff needs_input" invariant that the same file's comment
  claims to hold. Clear attention on turn activity and add the unit test that would have caught
  it (`internal/session/machine_test.go` has no activity-after-permission case). Same seam
  as #14. Re-filed as #20 against musterd 0.5.0 — "I accepted the plan in auto mode but it now
  says needs your permission but it's running and thinking and no permission prompt is present",
  with `state working since 13:01:42Z` against `attention permission since 12:08:05Z`, a
  53-minute latch. Two things that adds: the cause is unchanged in the current tree
  (`machine.go:18` still returns from the `KindTurnActivity` branch without touching
  `sess.Attention`, while `:47`, `:59` and `:109` are the only clears), and the path in is
  plan-acceptance into auto mode — so the missing unit test should cover activity arriving
  after a permission latch *under a mode change*, not just under a steady mode. One fix closes
  both.

- [x] **The rail never shows which session the Focus pane is displaying** ([#16](https://github.com/Zalaras/muster/issues/16)) ✅ done 2026-09-03 (plan `ui-text-and-focus`, via `/orchestrate`, approved review cycle 2; lands with `/land ui-text-and-focus`, which closes #10, #16, #18 and #19).
  — "it should better show which session you have active in that nav". Measured: `focusedId` is
  `web/src/main.ts`-local (`main.ts:136`) and is never passed to `reconcileCards`
  (`web/src/render/sessions.ts:283`), so a card's only visual cue is CSS `:focus-within`
  (`web/src/style.css:523`) — transient DOM focus that disappears the moment you click into the
  terminal, which is the normal case. Wants a persistent selected-card treatment threaded from
  `focusedId` through the render pass, on the new design tokens; the same card renders in the
  Tiles strip, so decide whether the marker means "focused in Focus view" or "live in the
  current view". A design-system §3 question — state colours are already spoken for.

- [x] **Dark themes still read too dim after the contrast pass** ([#18](https://github.com/Zalaras/muster/issues/18)) ✅ done 2026-09-03 (plan `ui-text-and-focus`, via `/orchestrate`, approved review cycle 2; lands with `/land ui-text-and-focus`, which closes #10, #16, #18 and #19).
  — "in the darker themes (not light) the text needs to be lighter it's still a little hard to
  see". Filed against musterd 0.5.0, i.e. *after* `new-ui-design-colors` shipped its
  AA-everywhere gate, so this is a follow-up on the landed token system and not a re-file of
  #3: the gate passes while the result still reads dim, which points at the muted/secondary
  foreground tokens sitting *at* the AA floor rather than above it. Re-check the Instrument and
  Dark ramps against a target above AA for body text (AAA where it's cheap) and record which
  tokens moved. Pairs with #19 — one pass over `style.css` can close both.

- [x] **No type scale — text is too small on a large screen** ([#19](https://github.com/Zalaras/muster/issues/19)) ✅ done 2026-09-03 (plan `ui-text-and-focus`, via `/orchestrate`, approved review cycle 2; lands with `/land ui-text-and-focus`, which closes #10, #16, #18 and #19).
  — "It's a little small on a large screen. How are we doing text size?" Badly, is the honest
  answer: `web/src/style.css` carries ~40 hardcoded `font-size` literals between 10px and 16px
  (`10.5px`, `11.5px`, `12.5px` among them) and no `--fs-*` tokens at all, so unlike colour
  after #3 there is nothing to turn. The structural fix mirrors that colour work — a named type
  scale in tokens — and then one decision: does the user get a size control (a `prefs` scale
  factor alongside `theme`, which the Settings dialog already has a home for), or do we simply
  move the ramp up. Pairs with #18.

- [x] **Offer a plain shell session, not only a Claude Code one** ([#21](https://github.com/Zalaras/muster/issues/21))
  — "I find myself sometimes swapping to terminal to run git commands or something I don't
  want to use ! with claude. I think we should offer a 'plain' terminal session. So select a
  file and it will start with that as the pwd." A session kind that runs the user's shell in a
  chosen working directory instead of `claude`. Net-new scope, not a defect: SPEC.md has no
  non-Claude session type, and `internal/server/sessions.go:152,222` is the only launch path —
  both calls go through `claudecode.BuildArgv`, so the kind has to branch there. The harder half
  is state: every signal muster has arrives from Claude Code's hooks and status line, so a plain
  session has no state machine, no attention, no context gauge and no model, and the rail card,
  the launcher and the ⌘1–9 shortcut/focus behaviour each need a defined shape for a session
  that is only alive or ended. The tmux/PTY layer and the terminal pane already carry it
  unchanged. Decide the card shape and whether a plain session is addressable by the shortcuts
  before implementing.

  **Specced 2026-09-05** — `plans/plain-terminal-session/spec.md`. The session-kind framing
  above was weighed and **deferred**: the first pass is a shell *tabbed to an existing Claude
  session*, in that session's directory, with no session row, no rail card and nothing in
  SQLite. One toggle control in the tile header and the Focus pane swaps the surface body;
  the shell outlives the Claude session and dies on Remove. The full session kind, a global
  untethered terminal and restore-across-restart moved to the M5+ terminal follow-up below.
  **Shipped 2026-09-05** via `/orchestrate plain-terminal-session` (branch
  `plan/plain-terminal-session`): the tabbed shell as specced, with the tile control in the
  footer rather than the header (measured — see the plan's Implementation Notes) and a
  `--shell-pip` token instead of teal (`plans/plain-terminal-session/decisions/shell-pip-hue/`).
  Footer overflow measured 0 at both 1152px and 1024px in the shipped build, so the plan's
  documented 6px 1024px floor is pessimistic. The richer shape stays in M5+ below.
  Follow-ups from the review (`plans/plain-terminal-session/review.md` cycle 2, both Minor,
  left open at an approved review; **both fixed 2026-09-06 (plan `v1-cleanup`, REQ-5 and REQ-18)**):
  (1) `[daemon-impl]`: `shellRegistry.spawned`
  (`internal/server/shells.go`) is write-only state — written in `Ensure`, deleted in `Kill`,
  read nowhere; `PaneExists` is the source of truth and `mu` makes `Ensure` safe, so the map
  can be deleted with `Ensure`/`Kill` behaving identically. (2) `[e2e-specs]`: the "DEAD tile
  with its directory removed" test in `web/e2e/plain-shell.spec.ts` leaks its scratch
  directory if an assertion throws before its mid-test `dirA.cleanup()`; the Focus variant
  above it uses a `cleaned` guard plus `if (!cleaned) await cleanup()` in `finally` — use
  the same shape.

## M5+ (v1.x, re-rank when reached)
<!-- kb: adr/connection-installed-claude-classified-never-refused, adr/issue-disabled-button-affordance-deferred -->

- [x] **`views.spec.ts` E7 is load-flaky (1 failure in 5 full-suite runs, 2026-09-07)** — observed
  during plan `v1-cleanup`'s final gate sweep: "Cmd+\ toggles the view and Opt+Cmd+1 focuses the
  top-priority session regardless of launch order (E7)" failed with
  `expect(locator('[aria-label="Terminal: prio-a"]')).toBeVisible()` timing out at the full 15 s
  after `page.keyboard.press("Alt+Meta+Digit1")` — element never appeared, so the chord did not
  take effect. **Not caused by that plan**: its only change to the file is one comment character
  (`⌘1`→`⌥⌘1`), and it touches neither `web/src/shortcuts.ts` nor `web/src/main.ts`, so the whole
  ⌥⌘1/`focusNth` path is unchanged. Measured: 8/8 green running `views.spec.ts` alone, 4/5 green
  in full-suite runs — it only misses under cross-file load, the same family as the
  `theme.spec.ts:83` baseline flake in `docs/design/test-strategy.md`.
  **Mechanism found 2026-09-07** (plan `post-worktree-spike-issues`, REQ-6; read from source in
  `plans/post-worktree-spike-issues/validation.md`): the hypothesis first recorded here — "the
  keypress landing before the keydown listener is attached" — is **wrong**, and was not
  implemented against. `focusNth` (`web/src/main.ts:465`) reads `orderRail(store.values(),
  railSort)`, and `requestRailSort` (line 395) changes `railSort` only on the resulting `prefs`
  broadcast (INV-6), never optimistically. The test synchronised on
  `expect(page.locator("#rail-sort")).toHaveValue("attention")` — the `<select>`'s own DOM value,
  which flips on `selectOption` regardless of the round trip — so ⌥⌘1 could index into the still-
  manual order and focus `prio-b`. The fix waits on the rail's own DOM order (`railOrderIds`)
  instead. `main.ts`'s broadcast-only `railSort` is correct and was not made optimistic.
  Fixed by REQ-6: E7 now waits on the rail's own DOM order (`railOrderIds`) before ⌥⌘1, not on
  `#rail-sort`'s `<select>` value. 5/5 green (E2). — **Done 2026-09-07 (plan `post-worktree-spike-issues`, via `/orchestrate`, approved review cycle 2)**

- [x] **`internal/server` test-helper hygiene** — three Minors left open at plan `v1-cleanup`'s
  approved review (`plans/v1-cleanup/review.md` cycle 1, all `[daemon-tests]`; an agent tagged
  only with Minors is not re-spawned). All cosmetic, all in one file pair:
  - "`internal/server/terminal_test.go:32` — `newTerminalTestServer`'s doc comment says
    'Everything else in this file uses `newFakeTerminalTestServer`', but no such constructor
    exists; it is `newFakeTmuxTestServer` (`fakes_test.go`). A maintainer grepping the named
    symbol finds nothing. One-word fix."
  - "`internal/server/terminal_test.go:51-54` — `launchRealSession`'s doc comment still promises
    'a real Muster session row **and a real backing tmux session running argv**'. That is now
    false for its eighteen fakes-server callers in `plainshell_test.go` … This is precisely the
    trap D3 exists to guard against — a helper whose name and comment both say 'real' while doing
    nothing real — so it is worth a sentence saying the realness follows the server it is handed."
  - "`internal/server/fakes_test.go` — `containsExit` hand-rolls a substring scan that
    `bytes.Contains(p, []byte("exit"))` does in one line, with no behavioural difference. Delete
    the helper and inline the stdlib call."

  **Done 2026-09-09** (direct fix, no pipeline — CLAUDE.md's trivial-fix carve-out; all three are
  test-file comments plus one helper deletion, no assertion changed). Two of the three quoted
  findings were understated and the fix went past what they asked for:
  - The first is **not** a one-word fix. Renaming the symbol is right, but the sentence carrying
    it — "Everything else in this file uses …" — is false in the opposite direction: measured,
    `terminal_test.go` uses the real constructor **12** times and the fake **4**. The quantifier
    was dropped for the actual selection criterion (call shape/counts/error propagation → fake),
    so the comment can't go stale again when a test is added.
  - The second's counts are wrong: **not** "eighteen fakes-server callers in `plainshell_test.go`".
    Walking each call site against the constructor above it gives **9 fake / 8 real** in
    `plainshell_test.go` and **2 fake / 14 real** in `terminal_test.go` — eleven package-wide, and
    `plainshell_test.go` is a genuine mix, not a fakes-only file. Don't re-cite the 18. The comment
    now says the realness follows the server and the *name* applies to the session row; the helper
    was deliberately **not** renamed (33 call sites, no behavioural gain).
  - The third was accurate as written; `containsExit` is gone, `bytes.Contains` inlined.

- [x] **Version-pin warning is developer-facing** ([#6](https://github.com/Zalaras/muster/issues/6))
  — "drift from pinned 2.1.246" means nothing to someone who didn't set the pin. It should
  read as a support warning (this Claude Code version isn't verified yet; things past the
  pin may misbehave): a warning icon with a hover explanation and a dismiss. Post-v1 — the
  drift banner is correct today, just written for the person who wrote it.
  *2026-09-07:* the wording depends on the pre-v1 **"Version the Claude Code interface"** item
  (Pre-v1 Cleanup) — a declared supported range is what the warning would state; fix it there or
  right after. **Done 2026-09-10 (plan `version-claude-interface`)**: the readout says
  `claude <installed>` plus a ⚠ glyph whose hover text is "This Claude Code version has not been
  tested with Muster" (`above`) or "… — please update Claude Code" (`below`); no dismiss (dropped
  in the spec interview — the icon + hover text is the whole UI).

- [x] **App-wide `.btn:disabled` affordance pass** ✅ done 2026-09-02 (shipped inside plan `new-ui-design-colors`, REQ-8) — no disabled button anywhere in Muster had
  a visual disabled state (issue-capture review cycle 1, Minor 5: `#issue-submit-button`
  measured pixel-identical enabled vs disabled — `opacity: 1`, full amber, `cursor: pointer`;
  End/Resume/Remove in the masthead, tiles and dead surface share the gap). Settled Option B
  (user decision, `plans/issue-capture/decisions/disabled-button-affordance/decision.md`):
  ship issue-capture as-is, then do one app-wide disabled-state token pass in `style.css`.
  Cite: `plans/issue-capture/review.md`. **Folded into plan `new-ui-design-colors`
  (spec 2026-09-02, #3 above)** — do not plan separately.

## Open questions carried forward
<!-- kb: adr/usage-no-source-interface, adr/launch-settings-local-json-not-settings-json, fact/resume-keeps-session-identity, fact/stopfailure-replaces-stop, fact/refresh-interval-seconds, fact/command-hooks-inherit-pane-env, fact/clear-mints-new-session-id, fact/local-settings-honoured -->

- [x] **`--resume` never exercised** — settled (H2 probe 2026-08-16): `SessionStart` fires
      with `source: "resume"` and the **same** `session_id`/`transcript_path`, so reconcile
      can re-bind deterministically. (Interactive resume / different-cwd not exercised.)

- [x] **`Stop` alongside `StopFailure`?** Settled (H2 probe 2026-08-16): replaced, never both.

- [x] **`refreshInterval` unit** — settled 2026-08-25 (quoting probe, 2.1.245): **seconds,
      and honoured while idle** — `refreshInterval: 5` posted every 5.00 s through 60 s of
      idle. Relevant to the M5+ staleness follow-up: setting it is enough to keep the
      masthead bars ticking; the usage dedup absorbs the repeats.

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
