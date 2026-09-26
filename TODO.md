# Muster backlog

This file tracks execution, not decisions — `SPEC.md` and the ADRs hold those.

**The entries here are filed by hand.** An agent or pipeline run may only tick a finished item and
move its block to `docs/history/todo-done.md`, or copy an entry a plan's approved `## Out of
scope` already names. Everything else it finds is proposed — in `plans/<plan>/proposed-backlog.md`
or in its report — and waits (`kb:adr/process-backlog-entries-are-the-users-to-file`,
`docs/conventions.md` § Backlog).

## Issues

Done items are in `docs/history/todo-done.md` § "Issues".

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

### Together — Needs Input state transitions (#32, #40, #57)

- [ ] **Stuck on needs input** ([#32](https://github.com/Zalaras/muster/issues/32)) — after suggesting changes to a plan the session stayed on Needs
  Input until the first response came back, only then flipping to Planning.

- [ ] **Needs Input disappears while giving input** ([#40](https://github.com/Zalaras/muster/issues/40)) — answering a run of Claude questions
  flips the state back to Planning after the first one, while more remain and Claude is idle.

- [ ] **Needs Input is shown on /clear** ([#57](https://github.com/Zalaras/muster/issues/57)) — running `/clear` puts the card on
  Needs Input. A freshly cleared session should read idle.

### Together — turn-state gaps (#59, #60)

The first two were filed by the developer 2026-09-23 from the interface probe that settled the
hook-ordering, `StopFailure` and status-line open questions; #59 is the probe's interrupt gap,
since reported from real use.

- [ ] **A background subagent clears a main-agent permission wait** — while the main agent
  waits on a permission prompt and a background subagent is still working, the card leaves
  Needs Input and can sit on `working` with the permission dialog on screen until it is
  answered.

- [ ] **Interrupt from me still shows working in rail card** ([#59](https://github.com/Zalaras/muster/issues/59)) — after Esc
  interrupts a turn, the card reads `working` until the next prompt. It should leave `working`
  when the interrupt lands.

- [ ] **Running a command in Claude does not change the status from IDLE** ([#60](https://github.com/Zalaras/muster/issues/60)) — while
  a command is still running in the Claude session, the card reads idle. It should show that
  something is running: `working`, or a new status. If the command is a backgrounded shell,
  kb:adr/lifecycle-subagent-marked-events-not-stragglers accepted idle for that case and would
  need superseding first.

### Together — session retention and clearing (#27, #47; #39 in Post v1 is the same seam)

- [ ] **Remove All Sessions** ([#27](https://github.com/Zalaras/muster/issues/27)) — a bulk "remove everything" action to start from a
  clean slate, plus the option to select several sessions and remove those.

- [ ] **Sessions survive only one daemon start after their tmux server is gone** — filed by the
  developer 2026-09-22 during `rail-card-improvements` planning. After a computer restart, or a
  crash that also took the tmux server, sessions come back once as ended, resumable cards, and
  the next restart of musterd clears the whole rail. A crash must not clear sessions.

- [ ] **I lost my session from yesterday (I think)** ([#47](https://github.com/Zalaras/muster/issues/47)) — three sessions left open were
  gone after stopping musterd and killing tmux. They should come back on restart as resumable
  rows, even though Claude itself has quit.

### Together — a launch request in flight

Filed 2026-09-26 by the developer from `plans/maintainability-regressions/proposed-backlog.md`.

- [ ] **Launch can be pressed again while a launch is in flight** — during the ~1 s pre-check a
  second press sends a second launch. Launch should stay disabled until the first one answers.
  From `plans/maintainability-regressions/`.
- [ ] **A model refusal can move focus after the selection changed** — in one open dialog:
  submit model A (refused), change to B and submit, change back to A and click Title; B's
  refusal moves focus to the custom-model field. A refusal should move focus only while the
  refused model is still the selection. From `plans/maintainability-regressions/`.

### On their own

- [ ] **Watch until 2026-10-02: tool hooks surfaced `hook error` after an update** ([#54](https://github.com/Zalaras/muster/issues/54)) — closed by plan `maintainability-regressions`. Remove this entry on 2026-10-02 if no hook error of the same kind has been logged since; otherwise reopen #54.

- [ ] **Dragging a file does not enable focus** ([#36](https://github.com/Zalaras/muster/issues/36)) — dropping a file on a Claude session does
  not snap focus back to that terminal. Confirm the behaviour in a plain terminal first
  (developer to check).

- [ ] **Issue tag management** ([#43](https://github.com/Zalaras/muster/issues/43)) — define real GitHub labels and have the triage skill apply
  them per its assessment. Needs kb:adr/issue-daemon-creates-issues-only revisited first:
  triage deliberately never labels, assigns or milestones.

- [ ] **Add right click for rail card and remove End button** ([#56](https://github.com/Zalaras/muster/issues/56)) — a custom
  right-click menu on a rail card carrying each of its actions, with the End button removed from
  the rail card (only there).

- [ ] **Resume old Claude session** ([#62](https://github.com/Zalaras/muster/issues/62)) — an easy way to resume Claude sessions
  that were not started in Muster.

### From the maintainability cleanup (2026-09-24)

Filed by the developer from the cleanup's proposed backlog (`plans/maintainability-cleanup/proposed-backlog.md`).

Fix:

- [ ] **`make check` fails in a fresh clone or worktree** — `check-kb` reports `refs` entries for
  `test/rig/captures/*.jsonl` that match no file; it passes only in the developer's checkout.
- [ ] **Two E2E specs fail on a release-tag commit** — `shell.spec.ts:47` and
  `update.spec.ts:449` fail whenever HEAD is exactly a release tag (e.g. `main` right after a
  release).
- [ ] **Shutdown's `/ws` close code disagrees with the protocol** — musterd closes dashboard
  sockets with 1000 at shutdown; `docs/protocol.md` says 1001.
- [ ] **The ingest endpoint accepts hook bodies of any size.**
- [ ] **Check the Focus view's first-attach terminal height** — the size note's reserved row
  was restored; confirm the terminal is not a row short on first attach.
- [ ] **A card's model name is empty or stale after the model changes in a session.**
- [ ] **Switching a session to its shell leaves keyboard focus on the `shell` button** — typing
  goes nowhere until the terminal is clicked. Same on `main` before the cleanup.

Refactor:

- [ ] **Decide the owner of the ingest route and `MUSTER_SESSION`** — both are Muster names,
  declared today in `internal/claudecode`.
- [ ] **Plan IDs remain in test-file comments** — about 370 lines; production code is clean.
- [ ] **No test covers the launch rollback after a failed record.**
- [ ] **`internal/boundedwait` has no tests of its own.**
- [ ] **The self-updater swaps in the new binary with its own temp-file-and-rename writer** —
  it should use the daemon's shared atomic write (a fresh temp name, synced before the rename).
  From `plans/maintainability-regressions/`.

Quality of life:

- [ ] **A card shows alive for up to 5 s after Claude exits** when no terminal is attached.

### Filed 2026-09-25 by the developer from the plans' proposed-backlog.md files

- [ ] **Code cites external docs** — Go and TS comments (and test names) carry `kb:` citations
  to records under `docs/`; code should carry no citations to external docs. Reverses
  `docs/conventions.md` § Comments, which asks for them — change it there first. From
  `plans/settings-update-failures/`.
- [ ] **The pop-out reader keeps the old dashboard after Update and restart** — dashboard
  windows reload onto the new version; an open pop-out should too. From
  `plans/settings-update-failures/`.
- [ ] **Keyboard focus drops to the page body after Check now** — pressing Check now by
  keyboard loses focus; it should stay on the button. From `plans/settings-update-failures/`.

## Pre-v1

Everything below is blocking a v1 release (the developer, 2026-09-12: no v1 until all of it is
in) — a mix of small cleanup and full features that used to be filed as post-v1. The release
itself is § v1 Release, done only once this section and § Issues are empty.

Plan-mode flow (§3.1) → worktree manager with setup scripts (§3.2) → start-from-PR/issue
(§3.3) → permissions UI (§3.4) → `code <worktree>` button (trivial, anytime).
Conflict-handling groundwork for §3.2 (option analysis + external survey, 2026-09-01) is in
`docs/history/design/worktree-conflicts.md` — read it before planning the worktree manager.
§3.2's first half is now specced: `plans/worktree-lifecycle/spec.md` (2026-09-14), resting on
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
- Staleness follow-up (m3 review Minor, honesty rule 8 "stale is labelled, not hidden"):
  `usage.sampledAt` is on the wire but rendered nowhere, and an idle session emits no
  status posts (measured without `refreshInterval`; the 2026-08-25 probe showed
  `refreshInterval: 5` *does* tick every 5 s while idle), so the masthead
  bars can be minutes stale with no cue. Deliberately scoped out of M3 (reference render
  shows no sample age either); if it ever matters, render a sample-age cue from
  `sampledAt` client-side.
- **Compiled hook helper** (m4-hook-lifetime, 2026-08-27): the `sh`+`curl` wrapper costs
  ~50 ms/event vs. ~25 ms for the old http hooks (measured, `spikes/FINDINGS.md`
  "command-hook latency probe" — curl startup dominates, ~48 ms of the 50). A small
  compiled helper binary doing the same envelope+POST was estimated at ~10 ms/event in
  that probe's micro-benchmark. Not built for m4-hook-lifetime (YAGNI — the shell version
  is measured-correct and ships one file, no build/distribution story); revisit if the
  per-event cost is ever felt on a tool-heavy turn.

Filed 2026-09-23 by the developer from the plans' `proposed-backlog.md` files (each names its
source; the file records the decision). Entries that make one plan are grouped under a parent;
tick a sub-item as it lands, the parent when all have.

- [ ] **Pipeline gate fixes** — one tooling plan (releases nothing), both in
  `.claude/skills/orchestrate/scripts/`:
  - [ ] **Run `make web-lint` in the wave-2 gate** — `gates.sh`'s wave cases hard-code
    build/lint/test/web-build/web-test/e2e, and Biome reaches a wave only when a plan authors
    `make web-lint` in its ```` ```checks ```` block. `terminal-fixes-cleanup` authored none, so a
    format error passed every wave gate and was caught only by hand (`bbad9cf`). Add `web-lint`
    to the wave-2 case so no plan can forget it. From `plans/terminal-fixes-cleanup/`.
  - [ ] **Investigate an any-owner rule for `features-scope.sh`** — today a changed file fails
    the gate unless *every* feature owning it is in the plan's `**Features**` header, so editing
    one handler in a shared file (e.g. `internal/server/sessions.go`: launch, actions, rail,
    rename) pulls in every co-owner and grows each role's pack by about 11,000 words. Find out
    whether one owner is enough; `doc-reconcile.md` Step 1 would have to change to match.
    Background: `plans/new-session-improvement/decisions/features-scope/`,
    `kb:adr/process-features-scope-answered-by-widening-header`.

- [ ] **Shell terminal follow-ups** — one web plan over the shell pane (`web/src/terminal/`,
  `web/src/style.css`):
  - [ ] **Unit-test the real wheel accumulator** — `shellkeys.test.ts`'s `accumulateFrame`
    mirrors `pane.ts`'s private sub-line accumulation instead of calling it, so reverting the fix
    in `pane.ts` leaves those tests green (only the `shell-scroll.spec.ts` E2E catches it). Lift
    the step into `shellkeys.ts` as a pure `(accum, deltaY) => { accum, lines }` that `pane.ts`
    calls. From `plans/terminal-fixes-cleanup/`.
  - [ ] **Reduced-motion rule for the activity spinner** — `shellact-spin` (0.7 s infinite) is
    the stylesheet's only animation, and nothing in `web/src` or `docs/design` handles
    `prefers-reduced-motion`. Stop or slow the spin under it. From
    `plans/terminal-fixes-cleanup/`.

- [ ] **Keep the current session's rail card on screen** — in a rail with more cards than fit,
  a launch and the number chords (⌥⌘5–9, ⌥⌘0) move the current marker to a card that can be
  scrolled out of view, so you can't see which session you're on; nothing in `web/src` calls
  `scrollIntoView`. Candidate: the single "bring a session forward" owner scrolls the card into
  view (`block: "nearest"`) on every path. Doing it supersedes
  `kb:adr/rail-launch-leaves-rail-scroll-untouched`, which left launch unscrolled to match the
  chords. From `plans/new-session-improvement/`.

- [ ] **Name a launched session's `model_not_found`** — a model the installed Claude Code knows
  but the account cannot run passes the launch pre-check and fails its first turn with
  `StopFailure.error = "model_not_found"` (kb:fact/unknown-model-fails-first-turn); the card
  shows only the generic failure. Candidate: say "model unavailable" on the card and offer
  Resume with another model. From `plans/new-session-improvement/` (its `## Out of scope`).

- [ ] **Bypass permissions** ([#61](https://github.com/Zalaras/muster/issues/61)) — offer the bypass-permissions mode at launch
  ("dangerously allow"). kb:adr/launch-bypass-and-dontask-unoffered (rejected, 2026-09-03) holds
  it back until the permissions UI (§3.4, in the order above) supplies guardrails, so it lands
  with or after that.

## v1 Release

The release itself: the Homebrew tap, then cutting v1.0.0 — last, once § Issues and § Pre-v1
are empty.

- [ ] **A Homebrew tap** — **split out of the installer item on 2026-09-10** (the developer:
  "we'll skip brew for now"), then made a v1 blocker on 2026-09-12. Its original deferral
  reason is gone — that was the *private*-tap cost
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

  Interaction to document, and a constraint on auto-update (shipped): `install.sh` puts
  `musterd` in `~/.local/bin`, a cask puts it in Homebrew's prefix. Someone who uses both ends
  up with two binaries and whichever leads `$PATH` wins — a stale one silently shadows a fresh
  one. Needs a README line, and **a self-replacing updater must not overwrite a brew-managed
  install**. Any README edit is guarded by `TestReadmeTmuxRemedyMatchesPreflight`.

  Verification ritual: `goreleaser release --snapshot --clean` locally to inspect the generated
  cask without publishing; then, after the first real release, `brew tap` → install →
  `musterd -version` → `brew audit --cask --strict --online`. Note the cask is only pushed on a
  tagged release, so the first true end-to-end test costs a version bump.

- [ ] **Cutting v1.0.0 is the act of removing `--v0`** (settled 2026-09-01, `docs/history/spec-changelog.md`):
  `release.yml` passes `svu next --v0`, so while the flag exists a 1.0.0 cannot be cut, by
  accident or otherwise. When § Issues, § Pre-v1 and the tap above have all closed, v1 ships
  as one deliberate commit that deletes the flag and carries `feat!:` (`MUSTER_BREAKING=1`,
  human-set — the commit-msg hook gates it). Until then `!` on 0.x just bumps minor and records the breakage.

## Post v1

New post-v1 ideas go here; re-rank when reached.

- [ ] **Drop the `lodash-es` override once mermaid stops needing it** — `web/package.json`
  carries `"overrides": { "lodash-es": "4.18.1" }`, added 2026-09-21 to clear Dependabot alerts 21
  (prototype pollution) and 22 (code injection). It exists because `mermaid@12.0.0` pins
  `chevrotain` at `~11.1.2` and every chevrotain 11.x pins `lodash-es` at exactly `4.17.23`,
  so neither `npm update` nor `npm audit fix` can move it — chevrotain only drops the
  dependency in 13.x, outside mermaid's range. After any mermaid bump, check
  `npm ls lodash-es`: once nothing pins it below the patched line, delete the block. Left in
  place it silently holds `lodash-es` back and nothing will warn.

- [ ] **Usage under API-key auth** ([#9](https://github.com/Zalaras/muster/issues/9)) — the ask
  is "support API usage billing as well". **Moved out of Pre-v1 on 2026-09-13** (the developer:
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

From `spikes/FINDINGS.md` "Still open" and the open-question ADRs (`go run ./tools/kb ls --type adr --status proposed`).

- [ ] **Launch/worktree data-layer design** (`docs/design/ux-flows.md` § 2, `kb:adr/launch-hybrid-mru-directory-memory`) — genuinely unsettled; revisit at
      SPEC §3.2 (worktree manager).
