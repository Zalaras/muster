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
      ships. *Update 2026-08-29:* pin bumped to 2.1.246 on the first green full canary
      (the ritual, not a strategy change); the rethink below still stands. Then **rethink the pin strategy itself**, not just bump it: Claude Code
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
These are some minor changes and cleanup needed before we can move into post v1.
- [x] Change how the left sidebar works. Sessions should be pinned in the order they are opened but allow the user to update the order by dragging and also allow "pinnng" (using pin icon) sessions (automatically go to the top in order of pinned). — **Done 2026-08-30 (plan `order-sidebar`)**: daemon-owned `pinned`/`railPos`, whole-card drag (insert-and-shift), pin control, rail-head Manual/Attention toggle (`prefs.railSort`, default manual), strip follows the rail order. Follow-ups from the review (`plans/order-sidebar/review.md`): (1) decision `cmd-n-ordering` dissent — ⌘1–9 now follows the rail, so there is no keyboard path to "jump to the neediest session"; consider a dedicated shortcut. **Done 2026-09-04 (plan `shortcut-fixes`): ⌥⌘0 jumps to the neediest session, ignoring the rail's sort mode and the pinned block; decision `cmd-n-ordering` Option A stands unchanged. Dissent discharged.** (2) Minor `[daemon-impl]`: `maxRailPosLocked`'s doc comment says "returns 1 + the largest" but the function returns the largest or `-1`. (3) Minor `[daemon-impl]`: `handlePinSession`/`handleSetOrder` put `err.Error()` in the 500 body where every other handler in the package sends a fixed string. (4) ~~Minor `[web-impl]` (review cycle 2): `focusNth`'s doc comment says "the same order the rail/strip currently display" but the strip renders that order minus live tiles, so in Tiles ⌘3 is not the strip's third card — comment accuracy only.~~ **Fixed 2026-09-04 in passing by plan `shortcut-fixes`** (`web/src/main.ts:414-419`). (5) `[note]`: the pinned-block separator (`.pinned-last`, `#343a4a` 1px) reads weakly against ordinary dividers — as REQ-9 specified, but worth a look.
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
  `[daemon-impl]`): (1) "`Makefile:66` — `clean`'s `rm -rf bin web/dist` is the last live
  mention of the retired path, and unlike `.gitignore:11-12` it carries no `# Historic:`
  comment saying why" — add the same one-line historic comment. (2) REQ-3's fatal branch has no
  automated regression guard (only the cycle-1 hands-on D5 check): add the reviewer's one-line
  seam — `checkWebDist(webDist string, embedded fs.FS, log zerolog.Logger)` with `run()` still
  passing the real `webui.FS()` — so daemon-tests can assert the fatal error and its two-remedy
  wording deterministically.

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

- [ ] **Cutting v1.0.0 is the act of removing `--v0`** (settled 2026-09-01, SPEC changelog):
  `release.yml` passes `svu next --v0`, so while the flag exists a 1.0.0 cannot be cut, by
  accident or otherwise. When the pre-v1 sections here close, v1 ships as one deliberate commit
  that deletes the flag and carries `feat!:` (`MUSTER_BREAKING=1`, human-set — the commit-msg
  hook gates it). Until then `!` on 0.x just bumps minor and records the breakage.

- [ ] **Re-evaluate how tests are run across the codebase** (Go unit, Vitest, Playwright) — decide
  the standing strategy for deterministic suites at acceptable runtime: mock the subprocess
  boundary, reduce concurrency, raise marginal timeouts, share fixtures, or a combination.
  Triggered 2026-09-03 by two measured load-sensitivity flakes from the `file-drop-fix` run:
  `make test` intermittently red on `main` (eight tmux-preflight tests hit their 2 s subprocess
  timeout under default `go test` parallelism, always green under `-p 1`) and `make e2e` ~50 % red
  after one new spec file added 11 per-test scratch daemons (three unrelated 5 s waits tipped;
  interim fix: `drop.spec.ts` runs serial). Measurements, options and constraints are in
  `docs/design/test-strategy.md` — start there with `/spec`. Until it lands: a red `make test`
  naming only `TestPreflight_*`/`TestRunTmuxPreflight_*` is load, confirm with
  `go test -count=1 -p 1 ./...`.
  Third measured instance 2026-09-03 (`fix-auto-mode-select` review cycle 1): `terminal.spec.ts`
  REQ-7 and REQ-13 failed one full `make e2e` sweep on the tmux stub's `MUSTER-STUB-READY`
  pane-content assertion; REQ-13 also fails on a clean `main` worktree, both pass 3/3 in isolation,
  and two further full sweeps were 221/221 — the REQ-13 test's own comments name the race (a
  liveness-poll snapshot capture landing empty). Whoever next touches the terminal specs owns it
  (`plans/fix-auto-mode-select/review.md`, Notes 1).

## Reported issues (pre-v1 release)

Issues filed from the dashboard's masthead `Issue` button land on
[`Zalaras/muster`](https://github.com/Zalaras/muster/issues) and are triaged into this file by
**`/triage`**: muster creates issues and does nothing else with them — no reading, no labels, no
status sync (`SPEC.md` 2026-08-31 changelog, `plans/issue-capture/plan.md` §Overview). An issue
counts as triaged iff its `issues/N` link appears in this file, so **every entry below must keep
its full markdown link** — a bare `#N` is a cross-reference and does not mark an issue triaged.
Closing happens when the fix lands: `/land` puts `closes #N` in the squash subject
(`docs/conventions.md` § Commits), and `/triage --audit` reports any issue whose entry is ticked
while the issue is still open.

Open entries below are in **Damian's priority order** (set 2026-09-01), not issue-number or
filing order: #3 → #8 → #11 → #12 → #13, then the rest. Keep new entries appended at the end
unless he re-ranks — don't re-sort this list.

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
  - `[web-impl]` The in-flight `Locating <name>…` notice auto-hides after 5 s while the request is
    still running — `showNotice` in `web/src/terminal/pane.ts` arms the 5 s timer for every non-null
    text; REQ-6 ties the hide to the failure text only. Arm the timer only for the failure branch.
  - `[daemon-impl]` `Locator.walkCap` and `Locator.spotlightTimeout` (`internal/locate/locate.go`) are
    set by `New()` and never read — the acting values are baked into `SpotlightFinder`/`WalkFinder`.
    Drop the fields, or have `Locate` use them.
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
  - [ ] Follow-up (review Minor, `plans/fix-auto-mode-select/review.md` cycle 2 Minor 1, `[web-impl]`):
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
  Two follow-ups are owed and are **not** covered by this fix:
  - [ ] `make canary` must assert `CLAUDE_CODE_SCROLL_SPEED`. It is an unsupported interface
    (absent from `claude --help`, found by reading strings out of the binary), so an upstream
    rename degrades silently back to ~1 line/notch rather than failing. Measured on **2.1.259**
    while the pin is **2.1.246** — re-confirm against the pinned build (`docs/claude-code-pin.md`).
  - [ ] Bandwidth is untouched: today's `tmux attach` path costs **19.4×** the bytes of a bare
    PTY for the same repaint, and 1,759 bytes/sec while idle against zero (S6 §3). `tmux -CC`
    control mode measured **2.1×** and would keep tmux, identity, reconcile and the tests
    intact (S6 §4). Worth planning separately; `SCROLL_SPEED` cuts the *number* of repaints,
    `-CC` would cut the cost of each.

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
  **Deliberately not done: the `curl | sh` installer the issue also asks for** — deferred to
  post-v1 open-sourcing, see the M5+ entry. Was: the block at `README.md:76-79` failed three
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

- [ ] **E7 spec variable misnamed** — follow-up from `claude-status-fixes` (review cycle 1
  Minor 1, `plans/claude-status-fixes/review.md`): in `web/e2e/subagent-status.spec.ts`'s E7
  test "the variable holding `failed.stateSince` is named `lastActivityBefore` … compared
  against `resumed.stateSince` two lines later, and the comment beside it talks about
  `lastActivity`, so a maintainer reads the assertion as being about a field it never
  touches. Rename to `stateSinceBefore`." Cosmetic; fold into the next E2E touch.

- [ ] **Six E2E comments still name the pre-plan chords** — follow-up from `shortcut-fixes`
  (review cycle 1 Minor 1, `plans/shortcut-fixes/review.md`): "Six internal comments across
  the suite still name the pre-plan chords, after the same pass renamed comments in the five
  files it did touch. Each is a comment a maintainer reads while deciding what a test covers,
  and each now describes a binding that no longer exists" — `web/e2e/shell.spec.ts:28`
  (quotes the placeholder as `"No sessions yet — ⌘N to launch"`; the string is now `⌥⌘N`),
  `web/e2e/helpers/picker.ts:11`, `web/e2e/views.spec.ts:112`,
  `web/e2e/rail-order.spec.ts:582,584`, `web/e2e/terminal.spec.ts:407`. Wrong-but-inert —
  every assertion beside them is correct, which is why the suite is green. Note for the
  fixer: `rail-order.spec.ts:582-586` describes a *past* decision, so `⌥⌘1–9` is the right
  replacement there rather than a rewording. Cosmetic; fold into the next E2E touch.

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

- [ ] **Offer a plain shell session, not only a Claude Code one** ([#21](https://github.com/Zalaras/muster/issues/21))
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
  Next: `/plan-work plain-terminal-session` (which must produce a mockup first).

## M5+ (v1.x, re-rank when reached)

Plan-mode flow (§4.1) → worktree manager with setup scripts (§4.2) → start-from-PR/issue
(§4.3) → permissions UI (§4.4) → `code <worktree>` button (trivial, anytime).
Conflict-handling groundwork for §4.2 (option analysis + external survey, 2026-09-01) is in
`docs/design/worktree-conflicts.md` — read it before planning the worktree manager.

- [ ] **Richer terminal functionality** (post-release) — the first pass
  (`plans/plain-terminal-session/spec.md`, [#21](https://github.com/Zalaras/muster/issues/21))
  deliberately ships the smallest useful shell: one per Claude session, tethered to its
  directory, ephemeral. What a second pass could pick up, once there's real usage behind the
  choices rather than guesses — these are examples, not a committed list: a true `kind:
  "shell"` session row (own state, rail card, `⌥⌘1–9` addressability); a global terminal
  untethered from any session, with its own directory picker; VS Code-style shell restore
  across daemon restarts instead of reconcile killing orphans; more than one shell per
  session, and a real tab strip rather than a single toggle; a rail-card marker so a shell
  running in a session you aren't viewing is visible in Focus view.

- [ ] **Text-size setting** — `prefs.textSize` enum (`small | medium | large`), a Settings-dialog
  segmented control beside Theme, `<html data-text-size>` driving `--fs-root`, and the first-paint
  hint extended so a reload doesn't flash. Deferred from `ui-text-and-focus` (Damian, 2026-09-03):
  tokens first, control later — the `--fs-*` ramp shipped there is the thing this control turns.

- [ ] **A real `curl | sh` installer** — the second half of
  [#7](https://github.com/Zalaras/muster/issues/7) (the first half, the broken README command,
  shipped 2026-09-02). **Deferred to post-v1 as part of open-sourcing** (Damian, 2026-09-02),
  and the reason is structural, not priority: the repo is **private**, so neither the script
  fetch nor the asset download can be anonymous — the one-liner every non-brew tool ships
  (`curl -fsSL … | sh`) cannot exist here at all, and any version of it today would still be
  `gh`-gated, i.e. the same dependency `make install` already has. Open-sourcing is what
  unblocks it, and it unblocks the deferred Homebrew tap in the same move (see the CI item
  above), so the two should be planned together rather than separately. Until then `make
  install` is the supported path and the README carries the by-hand fences.

- [ ] **Version-pin warning is developer-facing** ([#6](https://github.com/Zalaras/muster/issues/6))
  — "drift from pinned 2.1.246" means nothing to someone who didn't set the pin. It should
  read as a support warning (this Claude Code version isn't verified yet; things past the
  pin may misbehave): a warning icon with a hover explanation and a dismiss. Post-v1 — the
  drift banner is correct today, just written for the person who wrote it.

- [ ] **Usage gauges are dead on API-key auth** ([#9](https://github.com/Zalaras/muster/issues/9))
  — the ask is "support API usage billing as well". On a subscription the gauges come from the
  status line's `rate_limits`; under API-key auth that key is **absent entirely** (SPEC §2.3,
  measured), so the gauges honestly render "unknown" and never move. The seam is already named
  and deliberately post-v1: `usage.source` is `subscription` today with `api`/`otel` reserved
  (`internal/usage/aggregator.go:14-15`). Scope decision comes first — an `api` source
  reporting *tokens* fits the existing seam, but if what's wanted is spend in dollars it runs
  into SPEC §3's explicit v1 non-goal ("Cost/spend tracking"), which is a SPEC change, not a
  plan.

- [x] **App-wide `.btn:disabled` affordance pass** ✅ done 2026-09-02 (shipped inside plan `new-ui-design-colors`, REQ-8) — no disabled button anywhere in Muster had
  a visual disabled state (issue-capture review cycle 1, Minor 5: `#issue-submit-button`
  measured pixel-identical enabled vs disabled — `opacity: 1`, full amber, `cursor: pointer`;
  End/Resume/Remove in the masthead, tiles and dead surface share the gap). Settled Option B
  (user decision, `plans/issue-capture/decisions/disabled-button-affordance/decision.md`):
  ship issue-capture as-is, then do one app-wide disabled-state token pass in `style.css`.
  Cite: `plans/issue-capture/review.md`. **Folded into plan `new-ui-design-colors`
  (spec 2026-09-02, #3 above)** — do not plan separately.

- [ ] **`isThemeChoice` should derive from the theme registry** — `web/src/render/settings.ts`
  hard-codes the four radio values instead of reading `THEMES`, so adding a theme (REQ-1's
  "one block plus one registry entry") would silently leave its radio dead until this guard
  is also edited. Suggested: `value === "follow" || (THEMES as readonly string[]).includes(value)`.
  Cite: `plans/new-ui-design-colors/review.md` (cycle 1, Minor 1, `[web-impl]`).

- [ ] **Rail cards should carry a session summary, not a truncated last reply** ([#17](https://github.com/Zalaras/muster/issues/17))
  — "it would be nicer to have a summary of what's going on in the chat. Just a short sentence
  or two". Today the card's one-liner is the closing `Stop` hook's `last_assistant_message`
  truncated to 200 chars (`internal/claudecode/interpret.go:45`, `internal/session/machine.go`
  `KindTurnClosed`), so it reads as a mid-thought fragment rather than an overview. A real
  summary cannot come from a hook payload at all — it needs the transcript plus a summarizer,
  i.e. a model call Muster does not currently make. Two things have to be settled before this
  can be planned: whether Muster may spend tokens summarizing (SPEC §3's v1 non-goal is
  cost *tracking*, but spending is a new class of behaviour either way), and where a summary
  is cached and invalidated so it isn't recomputed every render. Wants a `/spec` pass.

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
- **Compiled hook helper** (m4-hook-lifetime, 2026-08-27): the `sh`+`curl` wrapper costs
  ~50 ms/event vs. ~25 ms for the old http hooks (measured, `spikes/FINDINGS.md`
  "command-hook latency probe" — curl startup dominates, ~48 ms of the 50). A small
  compiled helper binary doing the same envelope+POST was estimated at ~10 ms/event in
  that probe's micro-benchmark. Not built for m4-hook-lifetime (YAGNI — the shell version
  is measured-correct and ships one file, no build/distribution story); revisit if the
  per-event cost is ever felt on a tool-heavy turn.

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
