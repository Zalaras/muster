# Muster backlog

Derived from `SPEC.md` §10 (build order) and §9 (open questions & risks). `SPEC.md` stays
authoritative — this file tracks execution, not decisions.

Milestone rule from the spec: **each milestone ends with something used day-to-day.**

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
These are some minor changes and cleanup needed before we can move into post v1.

- [ ] **Cutting v1.0.0 is the act of removing `--v0`** (settled 2026-09-01, `docs/history/spec-changelog.md`):
  `release.yml` passes `svu next --v0`, so while the flag exists a 1.0.0 cannot be cut, by
  accident or otherwise. When the pre-v1 sections here close, v1 ships as one deliberate commit
  that deletes the flag and carries `feat!:` (`MUSTER_BREAKING=1`, human-set — the commit-msg
  hook gates it). Until then `!` on 0.x just bumps minor and records the breakage.

- [ ] **A Homebrew tap** — **split out of the installer item above on 2026-09-10** (Damian:
  "we'll skip brew for now"). Deferred originally because a *private* tap needs
  `GitHubPrivateRepositoryReleaseDownloadStrategy` plus a permanent
  `HOMEBREW_GITHUB_API_TOKEN` (SPEC 2026-08-31). Not blocked by anything — a priority call,
  not a dependency. **Scoped 2026-09-10** (GoReleaser docs via context7, against this repo's
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

  By hand (Damian): create **`Zalaras/homebrew-muster`**, public, empty — the `homebrew-`
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

Open entries below are in **Damian's priority order** (set 2026-09-01), not issue-number or
filing order: #3 → #8 → #11 → #12 → #13, then the rest. Keep new entries appended at the end
unless he re-ranks — don't re-sort this list.

## M5+ (v1.x, re-rank when reached)

Plan-mode flow (§4.1) → worktree manager with setup scripts (§4.2) → start-from-PR/issue
(§4.3) → permissions UI (§4.4) → `code <worktree>` button (trivial, anytime).
Conflict-handling groundwork for §4.2 (option analysis + external survey, 2026-09-01) is in
`docs/history/design/worktree-conflicts.md` — read it before planning the worktree manager.

- [ ] **Richer terminal functionality** (post-release) — the first pass
  (`plans/plain-terminal-session/spec.md`, #21 — cross-reference; the owning entry is in the history file)
  deliberately ships the smallest useful shell: one per Claude session, tethered to its
  directory, ephemeral. What a second pass could pick up, once there's real usage behind the
  choices rather than guesses — these are examples, not a committed list: a true `kind:
  "shell"` session row (own state, rail card, `⌥⌘1–9` addressability); a global terminal
  untethered from any session, with its own directory picker; VS Code-style shell restore
  across daemon restarts instead of reconcile killing orphans; more than one shell per
  session, and a real tab strip rather than a single toggle; a rail-card marker so a shell
  running in a session you aren't viewing is visible in Focus view.

- [ ] **Terminal bandwidth — `tmux -CC` control mode** — moved here from the #13 scroll-fix
  follow-ups on 2026-09-09 (Damian): post-v1, and a plan of its own rather than a loose end of
  that fix. Today's `tmux attach` path costs **19.4×** the bytes of a bare PTY for the same
  repaint, and 1,759 bytes/sec while idle against zero (S6 §3). `tmux -CC` control mode measured
  **2.1×** and would keep tmux, session identity, reconcile and the existing tests intact
  (S6 §4). Complementary to the `CLAUDE_CODE_SCROLL_SPEED` fix that shipped for #13:
  `SCROLL_SPEED` cuts the *number* of repaints, `-CC` would cut the cost of each.

- [ ] **Text-size setting** — `prefs.textSize` enum (`small | medium | large`), a Settings-dialog
  segmented control beside Theme, `<html data-text-size>` driving `--fs-root`, and the first-paint
  hint extended so a reload doesn't flash. Deferred from `ui-text-and-focus` (Damian, 2026-09-03):
  tokens first, control later — the `--fs-*` ramp shipped there is the thing this control turns.

- [ ] **Usage gauges are dead on API-key auth** ([#9](https://github.com/Zalaras/muster/issues/9))
  — the ask is "support API usage billing as well". On a subscription the gauges come from the
  status line's `rate_limits`; under API-key auth that key is **absent entirely** (`kb:spec/usage`,
  measured), so the gauges honestly render "unknown" and never move. The seam is already named
  and deliberately post-v1: `usage.source` is `subscription` today with `api`/`otel` reserved
  (`internal/usage/aggregator.go:14-15`). Scope decision comes first — an `api` source
  reporting *tokens* fits the existing seam, but if what's wanted is spend in dollars it runs
  into the explicit v1 non-goal (`kb:adr/nongoal-cost-tracking`), which is a superseding ADR, not a
  plan.

- [ ] **`isThemeChoice` should derive from the theme registry** — `web/src/features/settings.ts` (moved from `render/` by plan `code-breakup`)
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

- [ ] **`/claude-code-upgrade` skill** — a thin wrapper over the version ritual in
  `docs/claude-code-versions.md` (canary → extend the verified range → README → commit). Deferred
  until upgrades are routine; the doc alone suffices. Carried from the retired session plan
  (`next-steps.md` §6, deleted 2026-09-11).

## Open questions carried forward

From `spikes/FINDINGS.md` "Still open" and the open-question ADRs (`go run ./tools/kb ls --type adr --status proposed`). None block M0.

- [ ] **Hook ordering under heavy concurrency** — no inversion observed at four parallel
      tool calls; low risk given turn-level transitions.
- [ ] **`StopFailure` error taxonomy** — 2 of 9 types induced; 7 unobserved.
- [ ] **Status-line behaviour on failure paths** — does a session that never reaches a first
      API response ever emit usable usage data?
- [ ] **Launch/worktree data-layer design** (`docs/design/ux-flows.md` § 2, `kb:adr/launch-hybrid-mru-directory-memory`) — genuinely unsettled; design during
      §2.5, revisit at §4.2.
