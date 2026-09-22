# Muster backlog

Derived from `SPEC.md` §10 (build order) and §9 (open questions & risks). `SPEC.md` stays
authoritative — this file tracks execution, not decisions.

Milestone rule from the spec: **each milestone ends with something used day-to-day.**

**The entries here are filed by hand.** An agent or pipeline run may only tick a finished item and
move its block to `docs/history/todo-done.md`, or copy an entry a plan's approved `## Out of
scope` already names. Everything else it finds is proposed — in `plans/<plan>/proposed-backlog.md`
or in its report — and waits (`kb:adr/process-backlog-entries-are-the-users-to-file`,
`docs/conventions.md` § Backlog).

## Setup ✅ done 2026-08-16

All items done — see `docs/history/todo-done.md` § "Setup".

## Before M0

All items done — see `docs/history/todo-done.md` § "Before M0".

## M0 — Skeleton

All items done — see `docs/history/todo-done.md` § "M0 — Skeleton".

Follow-ups from the M0 review (`plans/m0-skeleton/review.md`, both Major — fix before M1):

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

All items done — see `docs/history/todo-done.md` § "M1 — Sessions exist".

Follow-ups from the M1 reviews (three cycles; final verdict approved 2026-08-22):

## M2 — Terminal panes ✅ done 2026-08-23 (plan `m2-terminal`, via `/orchestrate`; approved review cycle 2)

All items done — see `docs/history/todo-done.md` § "M2 — Terminal panes".

## M3 — Gauges (plan `m3-gauges` approved 2026-08-23; run via `/orchestrate m3-gauges`)

All items done — see `docs/history/todo-done.md` § "M3 — Gauges".

> **Caveat, added 2026-08-23 after manual testing:** every item below is implemented and
> passes its tests, but all of it was validated against *synthesized* status-line posts.
> The real chain never delivered a single one — see M4's unquoted-command-path entry —
> so these surfaces have not yet been seen rendering real data. Re-verify there.

## M4 — Durability → v1 complete

All items done — see `docs/history/todo-done.md` § "M4 — Durability → v1 complete".

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

## Pre-v1 Cleanup

Everything below is now blocking a v1 release (the developer, 2026-09-12: no v1 until all of it is
in) — a mix of small cleanup and full features that used to be filed as post-v1. **Cutting
v1.0.0 (last below) is the final step, done only once everything above it has landed.**

~~**Text-size setting**~~ — **dropped 2026-09-13**, `kb:adr/nongoal-ui-scaling-delegated-to-browser-zoom`.
A `/spec` pass established the want was *UI* size, not text size; every spacing dimension in
`web/src/style.css` is a pixel literal, so a `--fs-root` pref would grow type inside chrome that
doesn't move. Browser zoom scales the pixel layer and the terminal together and persists per origin
(the daemon's address is a fixed default), so it is the control. Don't re-derive; revisit only if
the mobile/responsive pass rem-ifies the pixel layer.

Plan-mode flow (§4.1) → worktree manager with setup scripts (§4.2) → start-from-PR/issue
(§4.3) → permissions UI (§4.4) → `code <worktree>` button (trivial, anytime).
Conflict-handling groundwork for §4.2 (option analysis + external survey, 2026-09-01) is in
`docs/history/design/worktree-conflicts.md` — read it before planning the worktree manager.
§4.2's first half is now specced: `plans/worktree-lifecycle/spec.md` (2026-09-14), resting on
`kb:adr/worktree-muster-owned-sibling-path` and the two facts a probe measured that day. Both
facts carry `guard: none` — `kb:fact/worktree-flag-defaults` and
`kb:fact/worktree-create-hook-owns-path` want canary or unit coverage when the feature is built,
and the second is the one to re-measure if a Claude Code bump touches worktrees.

- [ ] **Richer terminal functionality** — a second pass over the shell. The first pass
  (`plans/plain-terminal-session/spec.md`, #21 — cross-reference; the owning entry is in the history file)
  deliberately ships the smallest useful shell: one per Claude session, tethered to its
  directory, ephemeral. What a second pass could pick up, once there's real usage behind the
  choices rather than guesses — these are examples, not a committed list: a true `kind:
  "shell"` session row (own state, rail card, `⌥⌘1–9` addressability); a global terminal
  untethered from any session, with its own directory picker; VS Code-style shell restore
  across daemon restarts instead of reconcile killing orphans; more than one shell per
  session, and a real tab strip rather than a single toggle; a rail-card marker so a shell
  running in a session you aren't viewing is visible in Focus view.

- [ ] **Code diff viewing** — view a session's code diff directly in the dashboard. Revisits
  `kb:adr/nongoal-diff-review-placeholder-button` (today's placeholder just opens the worktree
  in an editor, an acknowledged hack); would need a superseding ADR before being planned.

- [ ] **Rail cards should carry a session summary, not a truncated last reply** ([#17](https://github.com/Zalaras/muster/issues/17))
  — "it would be nicer to have a summary of what's going on in the chat. Just a short sentence
  or two". Today the card's one-liner is the closing `Stop` hook's `last_assistant_message`
  truncated to 200 chars (`internal/claudecode/interpret.go:45`, `internal/session/machine.go`
  `KindTurnClosed`), so it reads as a mid-thought fragment rather than an overview. A real
  summary cannot come from a hook payload at all — it needs the transcript plus a summarizer,
  i.e. a model call Muster does not currently make. Two things have to be settled before this
  can be planned: whether Muster may spend tokens summarizing (`kb:adr/nongoal-cost-tracking` rejects
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

- [ ] **A Homebrew tap** — **split out of the installer item above on 2026-09-10** (the developer:
  "we'll skip brew for now"), then folded into this section on 2026-09-12, so it blocks v1
  like everything else here; it sits last by priority, not because anything blocks it. Its
  original deferral reason is gone — that was the *private*-tap cost
  (`GitHubPrivateRepositoryReleaseDownloadStrategy` plus a permanent
  `HOMEBREW_GITHUB_API_TOKEN`, SPEC 2026-08-31), and the repo is public now.
  **Scoped 2026-09-10** (GoReleaser docs via context7, against this repo's
  `.goreleaser.yaml` and `release.yml`); this supersedes the "a `brews:` block and a tap repo,
  nothing more" reading, which was wrong on two counts:

  - **`homebrew_casks:`, not `brews:`.** `brews` is *fully deprecated* as of GoReleaser v2.16
    — prebuilt binaries are casks now. `release.yml` pins `version: "~> v2"`, which floats, so
    writing `brews:` earns a deprecation warning today and a hard failure whenever it goes.
  - **A publish token is still needed.** Going public removed the *download*-side cost the
    2026-08-31 entry named (the custom download strategy, and a `HOMEBREW_GITHUB_API_TOKEN` on
    every installing machine) — it did **not** remove the CI cost. `release.yml` passes
    `secrets.GITHUB_TOKEN`, which GitHub scopes to `Zalaras/muster` alone; writing a cask into
    a second repo fails with "resource not accessible by integration". Needs a fine-grained PAT
    with `contents: write` on the tap repo only, as a repo secret, referenced from the cask
    block's `repository.token` — *not* swapped in for `GITHUB_TOKEN` wholesale, which would
    widen what the PAT can reach to the release itself.

  By hand (the developer): create **`Zalaras/homebrew-muster`**, public, empty — the `homebrew-`
  prefix is what makes `brew install zalaras/muster/<name>` resolve; GoReleaser commits the
  cask file into it. And mint the PAT above.

  In-repo: a `homebrew_casks:` block (`repository` owner/name/token, `name`, `desc`,
  `homepage`, `license: MIT`, and `url.verified: github.com/Zalaras/muster` so `brew audit`
  tolerates homepage ≠ download domain), plus the workflow env var.

  **Gatekeeper is the one that bites.** `musterd` is unsigned and unnotarized (no signing
  anywhere in `.goreleaser.yaml`) and Homebrew *quarantines* cask artifacts, unlike a plain
  download — so without a post-install hook the binary is killed on first run:

  ```yaml
  hooks:
    post:
      install: |
        if OS.mac?
          system_command "/usr/bin/xattr", args: ["-dr", "com.apple.quarantine", "#{staged_path}/musterd"]
        end
  ```

  That is a workaround for not notarizing, not a fix.

  Open decision: the **cask name is what users type** — `brew install zalaras/muster/muster`
  vs `.../musterd`. Recommendation: cask `muster`, installing the `musterd` binary.

  Interaction to document, and a constraint on the auto-update item above: `install.sh` puts
  `musterd` in `~/.local/bin`, a cask puts it in Homebrew's prefix. Someone who uses both ends
  up with two binaries and whichever leads `$PATH` wins — a stale one silently shadows a fresh
  one. Needs a README line, and **a self-replacing updater must not overwrite a brew-managed
  install**. Any README edit is guarded by `TestReadmeTmuxRemedyMatchesPreflight`.

  Verification ritual: `goreleaser release --snapshot --clean` locally to inspect the generated
  cask without publishing; then, after the first real release, `brew tap` → install →
  `musterd -version` → `brew audit --cask --strict --online`. Note the cask is only pushed on a
  tagged release, so the first true end-to-end test costs a version bump.

- [ ] **Codebase maintainability cleanup** (filed 2026-09-22 at the developer's request; the
  measured audit is `plans/_audit/code-quality-2026-09-22.md`) — one big pass, separate from the
  review-agent redesign that is meant to keep it standing afterwards. The pipeline reviewer has
  only ever checked plan and convention conformance: across all 58 review files, 0 findings on
  patterns/principles/coupling, 3 on duplication, 5 on concurrency. Measured starting points:
  `go test -race ./...` fails (one race, a test fake in `internal/server/shellscroll_test.go`;
  `make test` never runs the detector); `dupl` 7 hits (all tests) and `funlen` 50, neither linter
  in `.golangci.yml`; `internal/session/manager.go` is 1699 lines with 34 lock sites;
  `web/src/protocol.ts` 877 and `api.ts` 745. The review redesign (2026-09-22, the
  `review-split` docs branch) already landed the mechanical half: `make test-race` is a failing baseline
  gate (the test-fake race is fixed), and `make size-warn` reports `funlen`, `dupl` and files over
  500 lines as **warnings the maintainability reviewer reads, never failures**
  (`kb:adr/process-size-linters-warn-never-fail`). What remains for this session: a newcomer's read
  per package and per `web/src` directory against `docs/conventions.md` § Design — sibling
  divergence, duplicated helpers and logic (run a clone detector on the TypeScript side; `dupl` sees
  Go only), coupling, dead code — then split the hotspots the warnings name (`manager.go`,
  `main.run`, `server.New`, `protocol.ts`, `api.ts`), each commit naming the convention it restores.
  `/review-maintainability <plan> Scope: <paths>` runs the new reviewer over a directory.

- [ ] **Cutting v1.0.0 is the act of removing `--v0`** (settled 2026-09-01, `docs/history/spec-changelog.md`):
  `release.yml` passes `svu next --v0`, so while the flag exists a 1.0.0 cannot be cut, by
  accident or otherwise. When every item above closes, v1 ships as one deliberate commit
  that deletes the flag and carries `feat!:` (`MUSTER_BREAKING=1`, human-set — the commit-msg
  hook gates it). Until then `!` on 0.x just bumps minor and records the breakage.

## Reported issues (pre-v1 release)

All items done — see `docs/history/todo-done.md` § "Reported issues".

Issues filed from the dashboard's masthead `Issue` button land on
[`Zalaras/muster`](https://github.com/Zalaras/muster/issues) and are triaged into this file by
**`/triage`**: muster creates issues and does nothing else with them — no reading, no labels, no
status sync (`SPEC.md` 2026-08-31 changelog, `plans/issue-capture/plan.md` §Overview). An issue
counts as triaged iff its `issues/N` link appears in this file or in `docs/history/todo-done.md`
(ticked entries move there), so **every entry in either file must keep its full markdown link** — a bare `#N` is a cross-reference and does not mark an issue triaged.
Closing happens when the fix lands: `/land` puts `closes #N` in the squash subject
(`docs/conventions.md` § Commits), and `/triage --audit` reports any issue whose entry is ticked
while the issue is still open.

Entries sit in **the developer's priority order**, not issue-number or filing order, and are
grouped under `###` sub-headings by the work they share — a group is a plausible single piece of
work, not a ranking. `/triage` appends new entries at the end of the section; move one into a
group deliberately, and otherwise don't re-sort this list.

### Together — the new-session flow (#28, #29, #41)

- [ ] **New Session Reset** ([#28](https://github.com/Zalaras/muster/issues/28)) — picking a folder in the new-session dialog resets the options
  already chosen, even when it is the same folder. Also change the default mode to manual or
  auto, never accept-edits.

- [ ] **Block model selection** ([#29](https://github.com/Zalaras/muster/issues/29)) — a session can be launched with a model that is not
  available (e.g. Fable) and Claude then errors when changing it. Block the selection, or refuse
  the launch — erroring after the fact is not user-friendly.

- [ ] **Starting a new session should open the new session** ([#41](https://github.com/Zalaras/muster/issues/41)) — starting a session while
  another runs leaves you on the running one instead of navigating to the one you just started.

### Together — Needs Input state transitions (#32, #40)

- [ ] **Stuck on needs input** ([#32](https://github.com/Zalaras/muster/issues/32)) — after suggesting changes to a plan the session stayed on Needs
  Input until the first response came back, only then flipping to Planning.

- [ ] **Needs Input disappears while giving input** ([#40](https://github.com/Zalaras/muster/issues/40)) — answering a run of Claude questions
  flips the state back to Planning after the first one, while more remain and Claude is idle.

### Together — the plan and document tab (#35, #46; #44 in M5+ is the same seam)

- [ ] **Plan missing** ([#35](https://github.com/Zalaras/muster/issues/35)) — a plan was not visible after the fact; unclear whether Claude cleans it
  up or it is genuinely lost. Needs reproducing before it can be scoped.

- [ ] **Handle frontmatter in renderer** ([#46](https://github.com/Zalaras/muster/issues/46)) — the markdown renderer shows frontmatter as one
  large paragraph blob at the top of the file instead of parsing it.

### Together — session retention and clearing (#27, #47; #39 in M5+ is the same seam)

- [ ] **Remove All Sessions** ([#27](https://github.com/Zalaras/muster/issues/27)) — a bulk "remove everything" action to start from a
  clean slate, plus the option to select several sessions and remove those.

- [ ] **Sessions survive only one daemon start after their tmux server is gone** — filed by the
  developer 2026-09-22 during `rail-card-improvements` planning. Reconcile keeps a session whose pane
  vanished while musterd was down as an ended, resumable card, but the *following* start deletes it
  (`kb:adr/lifecycle-reconcile-converges-with-the-socket`, restating the sweep rule of
  `kb:adr/lifecycle-ended-rows-swept-next-start`). So after a computer restart, or a crash that
  also took the tmux server, one unresumed restart of musterd clears the whole rail — a crash must
  not clear sessions. Wants a superseding ADR: keep ended rows until Removed, or until the archive
  policy of #39 moves them. Same seam as #27 and #39.

- [ ] **I lost my session from yesterday (I think)** ([#47](https://github.com/Zalaras/muster/issues/47)) — three sessions left open were
  gone after stopping musterd and killing tmux. They should come back on restart as resumable
  rows, even though Claude itself has quit. Mechanism, read from the ownership classifier's row
  classes (`internal/session/manager.go:376-383`) and not yet reproduced: a row whose pane is
  absent but which is still `alive=true` is "marked ended and kept — the resume chance is not
  lost", and only the *following* startup sweeps it. That one-restart grace assumes a crash. A
  graceful shutdown under `-on-exit=kill` runs `Manager.EndAll`, which marks every row
  `alive:false` and persists it before exit, so the next startup sees "absent, alive=false" and
  sweeps immediately — the grace is spent by the shutdown itself, and a cleanly stopped session
  gets zero resume chances rather than one. `-on-exit=leave` should preserve the row; `ask` (the
  default) depends on what was answered. Confirm with a test before planning. Changing it means
  superseding kb:adr/lifecycle-reconcile-converges-with-the-socket, which is what ties a kept row
  to having been alive at Reconcile time. The resume path itself already exists
  (kb:anchor/sessions.resume).

  Same mechanism as the entry above: both are the one-restart grace of the sweep rule,
  reached by different routes — a crash that took the tmux server there, a clean
  `-on-exit=kill` shutdown here — so the superseding ADR each asks for is one ADR, and the
  archive policy of #39 is where a kept row eventually goes.


### On their own

- [ ] **Dragging a file does not enable focus** ([#36](https://github.com/Zalaras/muster/issues/36)) — dropping a file on a Claude session does
  not snap focus back to that terminal. Confirm the behaviour in a plain terminal first
  (developer to check).

- [ ] **Issue tag management** ([#43](https://github.com/Zalaras/muster/issues/43)) — define real GitHub labels and have the triage skill apply
  them per its assessment. Needs kb:adr/issue-daemon-creates-issues-only revisited first:
  triage deliberately never labels, assigns or milestones.


## M5+ (v1.x, re-rank when reached)

New post-v1 ideas go here.

- [ ] **Drop the `lodash-es` override once mermaid stops needing it** — `web/package.json`
  carries `"overrides": { "lodash-es": "4.18.1" }`, added 2026-09-21 to clear Dependabot alerts 21
  (prototype pollution) and 22 (code injection). It exists because `mermaid@12.0.0` pins
  `chevrotain` at `~11.1.2` and every chevrotain 11.x pins `lodash-es` at exactly `4.17.23`,
  so neither `npm update` nor `npm audit fix` can move it — chevrotain only drops the
  dependency in 13.x, outside mermaid's range. After any mermaid bump, check
  `npm ls lodash-es`: once nothing pins it below the patched line, delete the block. Left in
  place it silently holds `lodash-es` back and nothing will warn.

- [ ] **Usage under API-key auth** ([#9](https://github.com/Zalaras/muster/issues/9)) — the ask
  is "support API usage billing as well". **Moved out of Pre-v1 Cleanup on 2026-09-13** (the developer:
  park it post-v1) after a spike answered whether it's even possible. Findings, traps and the
  proposed shape are in `docs/history/design/api-key-usage.md` — **read it before planning**;
  the wire facts it rests on are `kb:fact/otel-usage-metrics-shape` and
  `kb:fact/status-line-cost-is-local-estimate`. The short version:

  - **The gauge cannot be repaired.** Under API-key auth `rate_limits` is absent because both
    windows come from subscription-only response headers, and an API key has per-minute
    throughput limits rather than a budget window — there is no quantity a bar could show.
    The fix is a different surface, not a fixed gauge.
  - **Tokens and dollars are both reachable**, from two sources that agree exactly: the status
    line's `cost.total_cost_usd` (already in every post Muster ingests, no auth gate, no new
    infrastructure) and Claude Code's OTel export (`claude_code.cost.usage` /
    `claude_code.token.usage` — the only source of *cumulative tokens*).
  - **The dollars are an estimate, not an invoice** — computed locally from a list-price
    table. The authoritative billed figure needs an Admin API key, which the docs say is
    "unavailable for individual accounts", i.e. out of reach for the reporter of #9.
  - Gate: `kb:adr/nongoal-cost-tracking` (rejected) still binds and needs a superseding ADR
    before this can be planned — not a plan. `docs/features/usage/spec.md` § Does not moves
    with it.

- [ ] **Remote access (mobile app / website)** — connect to Muster from outside the local
  network, not just the LAN dashboard. Needs a design pass: today sessions/tmux/hooks are
  all localhost-only (single-user, macOS, no auth beyond LAN trust per `CLAUDE.md`), so this
  implies at minimum an auth story and either a tunnel/relay or a public-facing listener —
  genuinely unsettled, wants a `/spec` pass before planning.

- [ ] **Resize left sidebar** ([#37](https://github.com/Zalaras/muster/issues/37)) — resize the left sidebar, and minimise it the way the docs
  outline does.

- [ ] **Archive** ([#39](https://github.com/Zalaras/muster/issues/39)) — archive ended sessions rather than only removing them: move them after X
  time or immediately, with a setting to disable it and one to auto-clear the archive.

- [ ] **Show rendered plan** ([#44](https://github.com/Zalaras/muster/issues/44)) — auto-open the document tab when Claude presents a plan. Likely
  only worth doing once the rendered view carries Accept/Reject and can swap back.

## Open questions carried forward

From `spikes/FINDINGS.md` "Still open" and the open-question ADRs (`go run ./tools/kb ls --type adr --status proposed`). None block M0.

- [ ] **Hook ordering under heavy concurrency** — no inversion observed at four parallel
      tool calls; low risk given turn-level transitions.
- [ ] **`StopFailure` error taxonomy** — 2 of 9 types induced; 7 unobserved.
- [ ] **Status-line behaviour on failure paths** — does a session that never reaches a first
      API response ever emit usable usage data?
- [ ] **Launch/worktree data-layer design** (`docs/design/ux-flows.md` § 2, `kb:adr/launch-hybrid-mru-directory-memory`) — genuinely unsettled; design during
      §2.5, revisit at §4.2.
