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

### Together — Needs Input state transitions (#32, #40)

- [ ] **Stuck on needs input** ([#32](https://github.com/Zalaras/muster/issues/32)) — after suggesting changes to a plan the session stayed on Needs
  Input until the first response came back, only then flipping to Planning.

- [ ] **Needs Input disappears while giving input** ([#40](https://github.com/Zalaras/muster/issues/40)) — answering a run of Claude questions
  flips the state back to Planning after the first one, while more remain and Claude is idle.

### Together — turn-state gaps the 2026-09-23 interface probe measured

Both were filed by the developer 2026-09-23 from the interface probe that settled the hook-ordering,
`StopFailure` and status-line open questions. Both are `applyInput` arms in
`internal/session/machine.go`, reproduced by replaying captured 2.1.280 sequences through
`Interpret` + `applyInput`.

- [ ] **A background subagent clears a main-agent permission wait** — while the main agent
  waits on a permission prompt, a background subagent keeps emitting tool hooks
  (kb:fact/subagent-hooks-during-permission-wait). Each is `KindTurnActivity` on an open
  prompt, which clears `Attention` and sets `working`. So the card leaves `needs_input` on the
  first subagent event, and if the subagent outlasts the one-shot `permission_prompt`
  notification (15 s past it in the probe), the session sits `working` with the dialog on
  screen until it is answered. Candidate: subagent-marked activity leaves a permission
  `Attention` in place.

- [ ] **An interrupted turn stays `working` forever** — Esc ends a turn with no hook at all:
  no `Stop`, no `StopFailure`, no `PostToolUse`/`PostToolUseFailure`. No `idle_prompt`
  follows, either (kb:fact/interrupt-emits-no-turn-end). The prompt is never closed, so the card
  reads `working` until the next prompt. Needs a design pass: there is no hook signal to key
  on, and terminal output is never a state source (CLAUDE.md hard rule).

### Together — session retention and clearing (#27, #47; #39 in Post v1 is the same seam)

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

### Together — the Settings Updates panel (#53, and the update-check error below)

Both are what `#update-status` tells the developer when an update can't go ahead; one web-side
pass over that panel's copy and states (`kb for internal/server/update.go` for the governing
ADRs).

- [ ] **Check update shows the new update but cannot update** ([#53](https://github.com/Zalaras/muster/issues/53)) — on 0.18.0 the panel shows
  0.18.1 available with Update and Update-and-restart disabled and the unmanaged remedy
  (`not installed by the muster installer — run: curl … install.sh | sh`). That is the designed
  outcome for an install classified `unmanaged` (`kb:adr/update-install-kinds-decide-who-may-apply`;
  `selfupdate.Classify` in `internal/selfupdate/install.go`: an unwritable binary directory, or
  one inside a git tree below `$HOME`). **It is a misclassification:** the reporting copy was
  installed by `install.sh` on another machine (the developer, 2026-09-23), and the installer
  refuses a directory it can't write (`scripts/install.sh:118`), so the writability check should
  have passed. Suspects, to check on that machine: a `.git` in an ancestor of the bin dir
  strictly below `$HOME` (e.g. `~/.local` under a dotfiles manager); a `--bin-dir` or
  `MUSTER_BIN_DIR` elsewhere; a symlink resolving into a git tree; a different `$HOME` or
  user when the daemon started. Nothing records which rule fired, so start by logging the
  classified path and the rule at startup. That diagnostic belongs in the fix too: the remedy
  should name the reason and the path, not just "not installed by the muster installer".

- [ ] **Shorten the Settings update-check error** — with the release host down,
  `#update-status` prints Go's whole transport chain verbatim (`update check failed: requesting
  http://…/latest: Head "http://…/latest": dial tcp …: connect: connection refused`): four
  wrapped lines, the URL twice, pushing the action row down. Contract-compliant; decide how much
  of the chain to show. From `plans/rail-card-improvements-2/`; moved here from Pre-v1
  2026-09-23 to sit with #53.

### On their own

- [ ] **Dragging a file does not enable focus** ([#36](https://github.com/Zalaras/muster/issues/36)) — dropping a file on a Claude session does
  not snap focus back to that terminal. Confirm the behaviour in a plain terminal first
  (developer to check).

- [ ] **Issue tag management** ([#43](https://github.com/Zalaras/muster/issues/43)) — define real GitHub labels and have the triage skill apply
  them per its assessment. Needs kb:adr/issue-daemon-creates-issues-only revisited first:
  triage deliberately never labels, assigns or milestones.

- [ ] **Usage gauge is a little squashed on small 14" screen** ([#52](https://github.com/Zalaras/muster/issues/52)) — the masthead usage gauge
  cramps at a 14" laptop width (filed from Focus view, 2x2, one session). No screenshot; reproduce
  at the laptop's viewport width with the model-window selector showing before planning. Scope
  is the masthead's layout at that width, not UI scaling
  (`kb:adr/nongoal-ui-scaling-delegated-to-browser-zoom`).

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

- [ ] **Session `Manager` write ordering** — one daemon plan: both are writes that leave
  `Manager.mu` before they finish. Both touch `internal/session/manager.go`, which the Codebase
  maintainability cleanup above splits — land this first, or fold it into that pass.
  - [ ] **`observeWrite` can write an older plan back over a newer one** —
    `internal/server/reader.go` reads the session, then calls `SetPlan(…, sess.PlanPath, true)`
    under a separate lock; a transcript scan committing a new plan between the two is
    overwritten by the old path. Make the exists-flip a compare-and-set inside `Manager.mu`
    (flip only if the stored path still equals the one read). From `plans/frontmatter/`.
  - [ ] **Session setters persist out of order** — every `Manager` setter mutates under
    `Manager.mu`, then writes SQLite and broadcasts after unlocking, so two writers to one
    session can persist in the opposite order to their in-memory commit, leaving the stored row
    stale until the next write. From `plans/frontmatter/`.

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

- [ ] **Conventions to settle** — one docs-first plan: each settles a rule in
  `docs/conventions.md`, then applies it. The same kind of work as the Codebase maintainability
  cleanup above, so it can ride that pass.
  - [ ] **Settle where a controller's DOM-free decision module lives** — `docs/conventions.md`
    § Composition roots and `web/src/render/CLAUDE.md` call `render/` "pure DOM builders", yet
    `render/focusrestore.ts` and `render/launchrestore.ts` are DOM-free decisions kept there to
    avoid a `sessions/→api` dependency. Either the rule names this case or the two modules move.
    From `plans/new-session-improvement/`.
  - [ ] **Stale plan IDs in `update.go` doc comments** — several comments in
    `internal/server/update.go` carry auto-update's plan IDs (e.g. the `(D16)` at line 256), so
    a reader chasing one in a later plan that touched the file finds nothing, and `dead-refs`
    cannot check plan IDs. Decide whether code comments cite plan IDs at all, then apply it.
    From `plans/rail-card-improvements-2/`.

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
