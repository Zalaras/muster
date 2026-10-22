# Muster backlog

This file tracks execution, not decisions — `SPEC.md` and the ADRs hold those.

**The entries here are filed by hand.** An agent or pipeline run may only tick a finished item and
move its block to `docs/history/todo-done.md`, or copy an entry a plan's approved `## Out of
scope` already names. Everything else it finds is proposed — in `plans/<plan>/proposed-backlog.md`
or in its report — and waits (`kb:adr/process-backlog-entries-are-the-users-to-file`,
`docs/conventions.md` § Backlog).

Issues filed from the dashboard's masthead `Issue` button land on
[`Zalaras/muster`](https://github.com/Zalaras/muster/issues) and are triaged into this file by
**`/triage`**, which files each one with a validated summary and applies its labels
(kb:adr/triage-labels-from-validated-names): a `bug` under § Bugs, every other kind under § Tweaks
until the developer moves it (kb:adr/triage-section-by-kind); the daemon itself creates issues and
does nothing else with them (kb:adr/issue-daemon-creates-issues-only). An issue counts as triaged
iff its `issues/N` link appears in this file or in `docs/history/todo-done.md` (ticked entries move
there), so **every entry in either file must keep its full markdown link** — a bare `#N` is a
cross-reference and does not mark an issue triaged. Closing happens when the fix lands: `/land`
puts `closes #N` in the squash subject (`docs/conventions.md` § Commits), and `/triage --audit`
reports any issue whose entry is ticked while the issue is still open.

Everything down to § v1 Release blocks v1 (the developer, 2026-09-12: no v1 until all of it is
in). Work items sit in one of four sections by how they are worked, each in **the developer's
priority order**, not issue-number or filing order — `/triage` appends at the end of its section,
and nothing else re-sorts a list:

- **Features** — new capability. Each is its own `/spec`, `/plan-work` and `/orchestrate`.
- **Enhancements** — a large change to an existing feature. Worked like a feature.
- **Bugs** — something that does not behave as it should. `/fix`.
- **Tweaks** — a small change to existing functionality. `/fix`.
- **Tooling and docs** — work that releases nothing: a plan and a commit.

A Bug or Tweak whose research shows it needs a protocol change, a new feature spec or a new UI
surface is not a `/fix`; `/fix` stops and says so, and the entry moves up a section.

## Features

- [ ] **Plan-mode flow** (`SPEC.md` §3.1, high interest) — auto-accept research prompts while
  a session's permission mode is `plan`, and approve or reject the plan from the dashboard. The
  surfacing half is shipped (a session's `docs` surface renders the plan it wrote); the approval
  controls are the follow-on. A `PermissionRequest` hook races the terminal prompt rather than
  blocking it (kb:fact/permission-request-races-terminal-prompt); the hook sequence is
  kb:fact/plan-mode-hook-sequence.

- [ ] **Worktree manager** (`SPEC.md` §3.2) — create, assign and remove worktrees per repo, with
  setup scripts (copy untracked `.env` files, run install steps) as a must-have. The first half is
  specced: `plans/worktree-lifecycle/spec.md` (2026-09-14, still Draft), resting on
  `kb:adr/worktree-muster-owned-sibling-path` and two measured facts. Both facts carry `guard:
  none` — `kb:fact/worktree-flag-defaults` and `kb:fact/worktree-create-hook-owns-path` want canary
  or unit coverage when the feature is built, and the second is the one to re-measure if a Claude
  Code bump touches worktrees. Read `docs/history/design/worktree-conflicts.md` (option analysis
  + external survey, 2026-09-01) before planning.

- [ ] **Start from PR / issue** (`SPEC.md` §3.3) — "PR #123 needs changes" → one click → a
  session on that branch in a worktree, with PR context, through the `gh` CLI
  (kb:adr/stack-git-and-gh-clis-not-go-git). Depends on the worktree manager.

- [ ] **Basic permissions UI** (`SPEC.md` §3.4) — user-level scope only; a deterministic JSON
  merge into settings with an atomic write, never an LLM editing settings
  (kb:adr/nongoal-permissions-ui-basic-user-level-only).

- [ ] **Need a way to restart all claude session with latest Claude version** ([#88](https://github.com/Zalaras/muster/issues/88)) —
  after Claude Code updates, the developer wants to restart every session onto the new version
  with each one resumed where it was, and also to restart just one session or just one group.

- [ ] **Code diff viewing** — view a session's code diff directly in the dashboard. Revisits
  `kb:adr/nongoal-diff-review-placeholder-button` (today's placeholder just opens the worktree
  in an editor, an acknowledged hack); would need a superseding ADR before being planned.

## Enhancements

- [ ] **Search the directory picker in the launch dialog** — filed by the developer 2026-10-22.
  The launch dialog's Finder-style picker (`docs/features/launch/spec.md`: a Recent sidebar, a
  breadcrumb and one child listing) only lets you descend one directory at a time. Typing in the
  picker should search the directory you are in, so a deep checkout is reached by name rather than
  by clicking down through each level.

- [ ] **Tiles per group** — a Tiles view scoped to one group (the grid holds that group's live sessions, the strip the rest of it), reached from the group's ⋯ menu. The grid and strip ignore groups today. The tile footer's live (Stop) versus ended (age, Resume, Remove) row shapes, and the layout shift between them, are reworked here too, matching the Focus header's single Stop/Resume button (plan `title-crop-stop-resume-button` left the footer alone, 2026-10-13).

- [ ] **Resizable side panels** ([#37](https://github.com/Zalaras/muster/issues/37)) — the
  developer can drag to resize both the session rail on the left and the docs reader's file
  nav / outline panel on the right, and minimise the rail the way the docs nav already
  collapses. Each panel keeps its width across reloads.

- [ ] **I'd like to be able to add group level notes that persist with the group** ([#108](https://github.com/Zalaras/muster/issues/108)) — The
  author wants to add notes at the group level that persist with the group, which cannot be done
  today. Expected: A group should carry a persistent note that the author can add and that stays
  with the group.
  Filed 2026-10-21 from musterd 0.25.1 / Claude Code 2.1.306, focus view, session working.
  Labels: enhancement, rail.

- [ ] **Richer terminal functionality** — a second pass over the shell. The first pass
  (`plans/plain-terminal-session/spec.md`, #21 — cross-reference; the owning entry is in the history file)
  deliberately ships the smallest useful shell: one per Claude session, tethered to its
  directory, ephemeral. What a second pass could pick up, once there's real usage behind the
  choices rather than guesses — these are examples, not a committed list: a true `kind:
  "shell"` session row (own state, rail card, `⌥⌘1–9` addressability); a global terminal
  untethered from any session, with its own directory picker; VS Code-style shell restore
  across daemon restarts instead of reconcile killing orphans; more than one shell per
  session, and a real tab strip rather than a single toggle; a rail-card marker so a shell
  running in a session you aren't viewing is visible in Focus view. Wants a `/spec` pass.

- [ ] **Rail cards should carry a session summary, not a truncated last reply** ([#17](https://github.com/Zalaras/muster/issues/17))
  — "it would be nicer to have a summary of what's going on in the chat. Just a short sentence
  or two". Today the card shows Claude's last reply cut short, which reads as a
  mid-thought fragment rather than an overview. A summary means a model call Muster does not
  make today. Two things have to be settled before this
  can be planned: whether Muster may spend tokens summarizing (`kb:adr/nongoal-cost-tracking` rejects
  cost *tracking*, but spending is a new class of behaviour either way), and where a summary
  is cached and invalidated so it isn't recomputed every render. Wants a `/spec` pass.

## Bugs

- [ ] **Sessions survive only one daemon start after their tmux server is gone** — filed by the
  developer 2026-09-22 during `rail-card-improvements` planning. After a computer restart, or a
  crash that also took the tmux server, sessions come back once as ended, resumable cards, and
  the next restart of musterd clears the whole rail. A crash must not clear sessions. #47 below
  is the same defect; #39 in Post v1 is the same seam.

- [ ] **I lost my session from yesterday (I think)** ([#47](https://github.com/Zalaras/muster/issues/47)) — three sessions left open were
  gone after stopping musterd and killing tmux. They should come back on restart as resumable
  rows, even though Claude itself has quit.

- [ ] **Long background tasks note the session as IDLE** ([#96](https://github.com/Zalaras/muster/issues/96)) — A
  session running a long background task is shown as IDLE on the dashboard, and the author asks
  whether this is intended or whether it should show WORKING. Expected: A session with a long
  background task still running should show WORKING rather than IDLE, unless an existing decision
  says otherwise. May need a decision on what counts as working before it is a fix.
  Filed 2026-10-15 from musterd 0.21.2 / Claude Code 2.1.300, focus view, session idle.
  Labels: bug, lifecycle.

- [ ] **planning status dropped after last message** ([#110](https://github.com/Zalaras/muster/issues/110)) — A
  session in plan mode went to idle after the main session replied that it was waiting on two
  subagents, instead of staying in its planning status. Expected: A session in plan mode that is
  waiting on subagents should keep showing its planning status rather than dropping to idle.
  Filed 2026-10-21 from musterd 0.25.1 / Claude Code 2.1.306, focus view, session idle.
  Labels: bug, lifecycle.

- [ ] **A card shows alive for up to 5 s after Claude exits** when no terminal is attached. From
  `plans/maintainability-cleanup/`.

- [ ] **Right click menu with multiple select only applies action to one** ([#97](https://github.com/Zalaras/muster/issues/97)) — With
  several items selected, the right click menu applies its action to only one item instead of all of
  the selected items. Expected: The right click menu should apply its action to all selected items
  rather than just the one under the pointer.
  Filed 2026-10-15 from musterd 0.21.2 / Claude Code 2.1.300, focus view, session working.
  Labels: bug, rail, ux.

- [ ] **5h gauge showing 100% after reset** ([#105](https://github.com/Zalaras/muster/issues/105)) — The
  5h usage gauge still shows 100% after the limit window reset, and neither the refresh button
  beside the gauge nor a browser page reload updates it. Expected: The 5h gauge should show the
  reset usage value after the window resets, and the refresh button or a page reload should update
  it.
  Filed 2026-10-20 from musterd 0.24.0 / Claude Code 2.1.304, focus view, session failed.
  Labels: bug, usage.

- [ ] **Problem with overlap for new note** ([#106](https://github.com/Zalaras/muster/issues/106)) — Hovering
  the note on a rail card shows it, then about a second later the file path and branch hover appears
  and overlaps the top of the note. Expected: The file and branch hover should only trigger over the
  file and branch, not over the note, or the note should be isolated from it.
  Filed 2026-10-21 from musterd 0.25.1 / Claude Code 2.1.293, focus view, session idle.
  Labels: bug, rail, ux.

- [ ] **Closing notes should take focus back to Claude typing** ([#111](https://github.com/Zalaras/muster/issues/111)) — After
  closing the session note with Esc, keyboard focus does not return to the Claude typing area.
  Expected: Closing the note with Esc should give focus back to Claude typing.
  Filed 2026-10-22 from musterd 0.25.1 / Claude Code 2.1.308, focus view, session idle.
  Labels: bug, focus.

- [ ] **I don't want my position in the doc reset on swapping sessions** ([#109](https://github.com/Zalaras/muster/issues/109)) — Switching
  between sessions, or between tabs such as docs, shell and claude, resets the scroll position in
  the document being read. Expected: The scroll position in a document should be preserved when
  swapping sessions or tabs and coming back.
  Filed 2026-10-21 from musterd 0.25.1 / Claude Code 2.1.306, focus view, session started.
  Labels: bug, documents, ux.

- [ ] **running musterd on one profile blocks another** ([#107](https://github.com/Zalaras/muster/issues/107)) — With
  two user profiles on one laptop, musterd running under one profile prevents it from running under
  the other, and the installation cannot be updated from one user despite both being admins.
  Expected: Each user profile should run its own musterd in isolation, and the installation should
  be updatable from either admin user.
  Filed 2026-10-21 from musterd 0.25.1 / Claude Code 2.1.306, focus view, session idle.
  Labels: bug, process, install.

- [ ] **Focus lands nowhere after a keyboard Dismiss of the effort warning** — pressing Dismiss
  on the Focus header's effort-mismatch strip with the keyboard hides the strip and leaves focus
  on the page itself. Focus should land somewhere sensible in the header. From `plans/effort/`.

- [ ] **Check the Focus view's first-attach terminal height** — the size note's reserved row
  was restored; confirm the terminal is not a row short on first attach. From
  `plans/maintainability-cleanup/`.

- [ ] **A hard wheel flick swallows the next wheel the other way** — after a hard downward
  flick over a shell surface, the next several wheel-ups do nothing before the pane starts
  scrolling up. Reversing direction should scroll the other way straight away. From
  `plans/shell-pane-fixes/`.

- [ ] **"Could not reach musterd." stays after the daemon is back** — after an action fails while
  musterd is down, the action-error line keeps that message once the connection returns, until
  the next action replaces it. It should clear when the daemon is reachable again. From
  `plans/effort/`.

- [ ] **Review how menus behave while the daemon is down** — an open card right-click menu
  closes at each reconnect attempt (about 2 s, 4 s and 8 s) while musterd is unreachable; the
  other menus, popovers and dialogs may do the same. Decide how each should behave while the
  daemon is down and make them consistent — a decision for the developer before it can be fixed.
  From `plans/rail-card-organise/`.

- [ ] **The pop-out reader keeps the old dashboard after Update and restart** — dashboard
  windows reload onto the new version; an open pop-out should too. From
  `plans/settings-update-failures/`.

- [ ] **Shutdown's `/ws` close code disagrees with the protocol** — musterd closes dashboard
  sockets with 1000 at shutdown; `docs/protocol.md` says 1001. From `plans/maintainability-cleanup/`.

- [ ] **A subdirectory's folder name differs between the Location row and the Added list** — a
  session launched in a subdirectory of a checkout shows that subdirectory's own name (`sub0`) in the
  location panel's Location row, while an added directory in a subdirectory shows its checkout's
  top-level name. Expected: one naming rule for both rows; the current split matches the protocol
  contract, so changing it needs a contract decision first. From `plans/see-added-dirs/`.

- [ ] **Added directories from status-line shapes nobody measured** — three shapes the
  added-directories list relies on were never captured from real Claude Code: a status post with no
  `added_dirs` key, a relative entry, and a wrongly typed list; today a wrongly typed list empties
  the session's list. Expected: each shape measured with `/interface-probe` and recorded as a fact,
  and the list behaves as measured. From `plans/see-added-dirs/`.

## Tweaks

- [ ] **Add mark unread right click option** ([#103](https://github.com/Zalaras/muster/issues/103)) — There
  is no right-click option to mark a session as unread or read. Expected: A right-click menu option
  should let the user mark a session as unread or read.
  Filed 2026-10-19 from musterd 0.23.0 / Claude Code 2.1.303, focus view, session idle.
  Labels: enhancement, rail, ux.

- [ ] **Add the remove option without me having to Stop** ([#104](https://github.com/Zalaras/muster/issues/104)) — In
  the right-click menu a session must be stopped before the Remove option becomes available.
  Expected: The right-click menu should offer Remove directly, without requiring the session to be
  stopped first.
  Filed 2026-10-19 from musterd 0.23.0 / Claude Code 2.1.303, focus view, session idle.
  Labels: enhancement, lifecycle, ux.

- [ ] **Should select mode be disabled after an action?** ([#98](https://github.com/Zalaras/muster/issues/98)) — After
  selecting several sessions and removing them, it is unclear whether the dashboard should stay in
  select mode or leave it. Expected: Select mode should end after an action, or stay on depending on
  the action, as the author suggests. A question for the developer before it can be fixed.
  Filed 2026-10-15 from musterd 0.22.1 / Claude Code 2.1.301, focus view, session working.
  Labels: question, rail, ux.

- [ ] **Keep the current session's rail card on screen** — in a rail with more cards than fit,
  a launch and the number chords (⌥⌘5–9, ⌥⌘0) move the current marker to a card that can be
  scrolled out of view, so you can't see which session you're on; nothing in `web/src` calls
  `scrollIntoView`. Candidate: the single "bring a session forward" owner scrolls the card into
  view (`block: "nearest"`) on every path. Doing it supersedes
  `kb:adr/rail-launch-leaves-rail-scroll-untouched`, which left launch unscrolled to match the
  chords, so it carries a new ADR. From `plans/new-session-improvement/`.

- [ ] **Cache should maybe show the local time for the person** ([#100](https://github.com/Zalaras/muster/issues/100)) — The
  cache indicator shows only the time remaining until expiry, not the local clock time at which it
  expires. Expected: The cache should show the local time of expiry, either instead of the remaining
  duration or in brackets after it.
  Filed 2026-10-16 from musterd 0.22.2 / Claude Code 2.1.293, focus view, session working.
  Labels: enhancement, usage, ux.

- [ ] **Name a launched session's `model_not_found`** — a model the installed Claude Code knows
  but the account cannot run passes the launch pre-check and fails its first turn with
  `StopFailure.error = "model_not_found"` (kb:fact/unknown-model-fails-first-turn); the card
  shows only the generic failure. Candidate: say "model unavailable" on the card and offer
  Resume with another model. From `plans/new-session-improvement/` (its `## Out of scope`).

- [ ] **Permission-mode indicator per session** (`SPEC.md` §3.5) — a visible indicator of each
  session's permission mode; today only `bypass` shows a chip on the card. It can only ever be
  *last known*: cycling modes with Shift+Tab fires no hook and no status-line update
  (kb:fact/shift-tab-mode-cycle-fires-no-hook), so Muster seeds it from the launch flag and
  corrects it from the first hook carrying the field (kb:fact/permission-mode-presence-split).

- [ ] **A `code <worktree>` button** — open a session's checkout in the editor from the
  dashboard. The placeholder `kb:adr/nongoal-diff-review-placeholder-button` allows, and the
  stand-in until Code diff viewing above is built.

- [ ] **Decide the owner of the ingest route and `MUSTER_SESSION`** — both are Muster names,
  declared today in `internal/claudecode`. A refactor. From `plans/maintainability-cleanup/`.

## Tooling and docs

- [ ] **`make check` fails in a fresh clone or worktree** — `check-kb` reports `refs` entries for
  `test/rig/captures/*.jsonl` that match no file; it passes only in the developer's checkout. From `plans/maintainability-cleanup/`.

- [ ] **Pipeline gate fixes** — one tooling plan (releases nothing), both in
  `.claude/skills/orchestrate/scripts/`:
  - [ ] **Run `make web-lint` in the wave-2 gate** — `gates.sh`'s wave cases hard-code
    build/lint/test/web-build/web-test/e2e, and Biome reaches a wave only when a plan authors
    `make web-lint` in its ```` ```checks ```` block. `terminal-fixes-cleanup` authored none, so a
    format error passed every wave gate and was caught only by hand (`bbad9cf`). Add `web-lint`
    to the wave-2 case so no plan can forget it. From `plans/terminal-fixes-cleanup/`.

- [ ] **Revisit every doc size budget** — filed by the developer 2026-10-21 after `session-notes`. Runs keep
  trimming text to fit a budget (feature specs at 800 words, hand-written `CLAUDE.md` prose at 400,
  diagram bodies at 300, record summaries at 160 characters, role packs at 30,000) and may be
  cutting information that was useful. Each budget should be checked against what it now forces out,
  and kept, raised or replaced so that fitting it never deletes a true, useful sentence.

- [ ] **The E2E sweep takes about nine minutes and is most of the gate's time** — 1,001 tests
  ran in 8.7 min at 4 workers (2026-10-19; 715 in 5.9 min on 2026-10-06). The median test is
  1.34 s, which is the harness floor for a daemon, a browser page and one or two launches, so
  the 743 tests under 2 s are 42% of the time and are nearly all floor; the 73 tests over 5 s
  (window sweeps, restart flows, timer waits) are another 32%. The sweep should take a fraction
  of that without dropping coverage. Levers with their measured returns, largest first: move
  floor-bound files to Vitest, more workers (needs an ADR and soaks), pre-start the tmux server
  in the fixture, coarser sweep steps; sharing daemons returns the least. Since 2026-10-19 the
  gates run the sweep scoped to a plan's specs per cycle and the whole suite once at Final
  Validation (kb:adr/process-e2e-gates-scoped-full-sweep-once-at-completion), so it runs less
  often; this entry is about how long one run takes.
  Measurements: `plans/_audit/test-audit-2026-10-19.md`; the earlier ones in
  `plans/_audit/test-audit-2026-10-06.md` § "Where the time goes".

- [ ] **Two E2E specs fail on a release-tag commit** — `shell.spec.ts:47` and
  `update.spec.ts:449` fail whenever HEAD is exactly a release tag (e.g. `main` right after a
  release). Each passes alone on an ordinary commit. From `plans/maintainability-cleanup/`.

- [ ] **Four E2E specs go red when a second Playwright suite shares the machine** —
  `shell.spec.ts:47`, `update.spec.ts:456`, `rail-cards.spec.ts:226`, `embedded.spec.ts:76`
  failed with another suite alive in a second worktree, and passed alone every time
  (`docs/history/design/test-strategy.md`, 2026-09-26). The gate lock now keeps a second suite
  out; these four are the ones to look at if the lock ever has to go.

- [ ] **`embedded.spec.ts:76` may be macOS holding a freshly copied musterd** — the embedded
  fixture copies a new `musterd` for every start and waits 10 s for `/healthz`; it went red alone,
  under the gate lock, with empty output (2026-10-15). A daemon start should pass whatever the
  binary's age. From `plans/claude-version-watch/`.

- [ ] **Rule on the E2E re-levelling's borderline tests** — the 2026-10-20 re-levelling left
  about 34 tests in E2E that could arguably be render tests. It also deleted two "with the
  daemon down" E2E tests after porting them to the render tier. Rule on each of the seven
  shapes in `plans/_audit/test-audit-2026-10-20-relevel.md` § Borderline. The per-batch
  sections under `plans/_audit/relevel/` give both readings of every test. Expected: each
  shape is either moved, kept as a journey with the reason recorded, or unblocked by the
  harness capability it names. The two deleted tests are restored from 2018bab6 if the ruling
  is that the connection-level failure is the claim. From `plans/_audit/`.

- [ ] **Code cites external docs** — Go and TS comments (and test names) carry `kb:` citations
  to records under `docs/`; code should carry no citations to external docs. Reverses
  `docs/conventions.md` § Comments, which asks for them — change it there first. From
  `plans/settings-update-failures/`.

- [ ] **Plan IDs remain in test-file comments** — about 370 lines; production code is clean.
  From `plans/maintainability-cleanup/`.

## v1 Release

The release itself: the Homebrew tap, then cutting v1.0.0 — last, once every section above is
empty.

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
  accident or otherwise. When every section above and the tap have all closed, v1 ships
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

- [ ] **Archive** ([#39](https://github.com/Zalaras/muster/issues/39)) — archive ended sessions rather than only removing them: move them after X
  time or immediately, with a setting to disable it and one to auto-clear the archive.

- [ ] **Show rendered plan** ([#44](https://github.com/Zalaras/muster/issues/44)) — auto-open the document tab when Claude presents a plan. Likely
  only worth doing once the rendered view carries Accept/Reject and can swap back.

- [ ] **Explore offering Claude Code's dontAsk permission mode** ([#63](https://github.com/Zalaras/muster/issues/63)) —
  the launch dialog can't start a `dontAsk` session, though a resumed one can come back in that
  mode. Measure what `dontAsk` does on the pinned Claude Code version and decide whether Start
  in should offer it; kb:adr/launch-bypass-and-dontask-unoffered records why it was left out
  and would need superseding.

- [ ] **Let an agent drive Muster** — a Claude session whose job is to start up to N sessions in
  Muster for the developer to monitor, and to end, resume or group them. Filed by the developer
  2026-10-19. Leaning: a CLI over the existing HTTP API (`muster launch`, `muster list --json`,
  `muster wait <id> --until <state>`), with a skill teaching an agent to use it; an MCP server, if
  ever wanted, is a thin wrapper over the CLI, not the first surface. Design challenges to settle
  in a `/spec` pass:

  - **Auth.** Every `/api/*` route takes only the cookie the dashboard gets for the UI token. A
    CLI needs a bearer path — ideally its own token in the data dir, not the UI one — which
    changes `kb:adr/ingest-separate-token-in-url-path` and needs an ADR.
  - **Waiting on state.** Launch is asynchronous; an agent needs to wait for started, needs
    input, idle or failed without polling `list` — a `wait` command or a state stream.
  - **Guardrails.** Bypass permissions is offered only behind the dashboard's danger warning
    (`kb:adr/launch-bypass-offered-with-danger-guardrails`); a CLI must not be a quiet way around
    it, so leave bypass out at first. The "up to N" cap belongs in the daemon, so a runaway agent
    cannot burn the subscription.
  - **Who launched what.** A controlling session running in Muster carries `MUSTER_SESSION`; the
    daemon could tag the sessions it launches (e.g. into their own group) so the rail shows which
    came from the agent.

## Notes, not work items

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
- **Launch/worktree data-layer design** (`docs/design/ux-flows.md` § 2,
  `kb:adr/launch-hybrid-mru-directory-memory`) — an open question carried forward from
  `spikes/FINDINGS.md` "Still open"; genuinely unsettled, revisit with the worktree manager
  (SPEC §3.2). The open-question ADRs are `go tool kb ls --type adr --status proposed`.
