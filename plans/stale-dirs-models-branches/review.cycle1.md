# Review: stale-dirs-models-branches

**Plan**: stale-dirs-models-branches
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 1 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 57444 words (budget 20000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes: `reporefresh.go` `tick`, `SetRepoState` (one upsert, only on a real change, alive only) | Yes: `TestRepoPoll_BranchFollowsCheckouts`, `_DeadSessionIsNotPolled`, E1, the dead-neighbour E2E | pass |
| REQ-2 | Partly: `tick` skips a missing or non-directory path, but a directory that vanishes **between** `isDir` and the git reads gets `repo: null` (correctness Critical 2) | Yes: `TestRepoPoll_KeepsLastKnownWhenTheDirectoryIsGone`, REQ-2 E2E (2/10 failures in my soak) | **fail** |
| REQ-3 | Yes: `interpret.go` `mainAgentCwd`, `status.go` `statusDir` (`current_dir`, else `cwd`), `adoptClaudeDir` (absent or empty changes nothing) | Yes: `TestInterpret_Cwd`, `TestInterpretStatus_Cwd`, status-line E2E | pass |
| REQ-4 | Yes: any `agent_id`-marked event, plus `SubagentStart`/`SubagentStop`, gives nil `Cwd` | Yes: `TestInterpret_CwdIgnoredForSubagents`, both E6 tests | pass |
| REQ-5 | Yes: `Elsewhere`, `deriveLocation`, `SetRepoState` stale-reading guard, `markEnded` clears | Yes: `TestElsewhere` (14 rows), `TestRepoPoll_ClaudeLocationMatrix` ({alive, dead} × 13 places), E2, E3, E7 | pass |
| REQ-6 | Yes: `OnClaudeDirChange` → `nudge` (coalesced, non-blocking), fired after the persist | Yes: `TestNew_ClaudeDirChangeNudgesTheRepoPoll`, `TestRepoPoll_NoTimerStillTicksAtStartAndOnNudge`, `repoPoll: "0"` E2E | pass |
| REQ-7 | Yes: `RecordLaunch`/`RecordResume` → `clearClaudeLocation` | Yes: `TestRecordLaunchAndResume_ClearClaudeDirAndLocation`, E7 | pass |
| REQ-8 | Yes: the only non-session reader of `ClaudeDir` is `reporefresh.go` (and the `server.go` nudge wiring) | Yes: E5 (reader + `/api/state` directory) | pass |
| REQ-9 | Yes: `applyBind` same id keeps the pointer, a different id or a nil model gives `{id, id}`; an empty id never reaches it (`modelID != ""`) | Yes: `TestApplyBind_ModelRule`, E8, E9, the late same-id E2E | pass |
| REQ-10 | Yes: `.r2 > .rf/.rb`, `renderRepoLines`, per-line ellipsis CSS | Yes: W1, render tests, E10 comfortable and expanded | pass |
| REQ-11 | Yes: compact flex rules | Yes: E10 compact | pass |
| REQ-12 | Yes: `.r2c` with `.lead` `↳`, bare location branch, basename fallback | Yes: W2, E2, non-git move E2E | pass |
| REQ-13 | Yes: `.meta .loc`, `.rf` 30ch, `.rb` 44ch, `.model { flex: none }` | Yes: E11 | pass |
| REQ-14 | Yes: `locationHover` on `.loc` | Yes: W3, E4 | pass |
| REQ-15 | Yes: `.wh` `title`, `.wh-claude` + `.sr-only` | Yes: tiles render tests, E2, E4 | pass |
| REQ-16 | Yes: `--fg-muted` glyph, `--fg-dim` text only | Yes: the colour E2E | pass |
| REQ-17 | Yes: `button.rename.title` = display title | Yes: mainhead render test, E12 | pass |
| DIAG | `store-schema` (0012 row and summary), `domain-model` (prose delta) applied and true. `daemon-components` (server → gitutil edge already there), `containers` (musterd → git), `web-components` (render → sessions), `one-launch-end-to-end` (launch reads unchanged) all still true | — | pass |

## Build & Tests

E2E tests: pass (540) · Daemon tests (race): pass (24 packages ok, 0 FAIL) · Web tests: pass (1993) · Daemon build: pass · Web build: pass · Lint: pass. All read from $GATES_LOG_DIR. Baseline lines: contrast pass (0 failures in 3 themes), versions pass, e2e-honest pass, kb-check pass, dead-refs pass (0 missing), e2e-lint pass, features pass, **comments FAIL** (`web/src/style.css:2429`), size WARN (review-maintainability's).

Reviewer soak (the diff repairs a flake, Repairs row 2, and ```checks soaks nothing): `make e2e-soak` could not build, because review-browser's untracked scratch `web/e2e/zz-review-browser.spec.ts` fails `tsc` and e2e-lint. So I ran the same soak on the 14:36 binary, which was built from this unchanged tree, under the exclusive gate lock: `npx playwright test e2e/card-location.spec.ts --repeat-each=10` → **248 passed, 2 failed**. Both failures were the REQ-2 test (correctness Critical 2).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D11 | `make test` | pass (deduped to test-race) |
| D12 | `make lint` | pass (`0 issues.`) |
| W6 | `make web-build` | pass |
| W7 | `make web-test` | pass (77 files, 1993 tests) |
| W8 | `make web-lint` | pass (266 files) |
| E14 | `make e2e` | pass (540 passed, 4.7m) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. `TODO.md` group moved to `docs/history/todo-done.md`, design-system §5 Rail card / Tile / Focus mainhead updated, both diagram deltas applied, six ADRs `proposed` with `refs: plan:stale-dirs-models-branches` (the superseded one flips at Completion), both `deviation:` lines carry an ADR. Every Doc Delta line is true of the shipped code. One unamended log `doc-delta:` line is listed as correctness Major 2 `[orchestrator]` |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W9 | No `any` types in new web code | pass | No added line in the `web/src`/`web/e2e` diff has `: any`, `<any>` or `as any` |
| W10 | `↳` blocks and glyph use only neutral tokens | pass | `style.css`: `.r2c` text `--fg-dim`, `.r2c .lead` / `.claude-at .lead` / `.thead .wh-claude` `--fg-muted`, `.claude-at` inherits `.meta`'s `--fg-dim`. No state token. `make contrast` 0 failures |
| W11 | Rendered rail card, Focus header, tile header match `c-long-names.html` in Instrument and Light | pass on structure (CSS read). Rendered comparison is review-browser's | The DOM shape matches the mockup's `.pair`/`.lead2`/`.r2b`, with 30ch/44ch caps and `.model { flex: none }`. One divergence: the mockup's Focus `.pair .b` (branch line) is `--fg-muted`, while the shipped `.mainhead .meta .rb` inherits `--fg-dim` (Note 1) |
| D15 | No git subprocess while the manager lock is held | pass | `tick` copies through `RepoTargets()` (lock held only for the copy), runs `readRepoState` with the lock free, then `SetRepoState` takes the lock and runs no git. `nudge` is a non-blocking channel send |
| D16 | Working-directory key names only under `internal/claudecode/`; no production read of CwdChanged's target | pass | Searching `internal`/`cmd` outside `internal/claudecode` for `"cwd"`, `current_dir`, `new_cwd`, `"workspace"` and `agent_id` finds only a pre-existing `machine_turnstate_test.go` line, which is not in this diff. Tests use `claudecodetest.EnvelopedHookInDirectory`. `new_cwd` appears in no non-test Go file |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: the key names live only in `internal/claudecode` (`interpret.go`, `status.go`, `claudecodetest`). `session`/`server` see only `StateInput.Cwd`/`StatusUpdate.Cwd` |
| 2 | No terminal-output state parsing | pass: location comes from hooks and the status line, branch from `git`. No `capture-pane` in new code |
| 3 | Non-blocking hook handler | pass: the handler is unchanged. `OnClaudeDirChange` runs on the ingest worker after the persist and is a coalescing non-blocking send |
| 4 | tmux via `-L muster` / sizing | pass: no tmux invocation added |
| 5 | No payload logging | pass: the one new log line (`repo poll: applying repo state failed`) carries only the error and session id |
| 6 | Empty-gauge honesty | pass: a null model reads `unknown` (`mainheadMeta`); a null `claudeLocation` renders nothing extra; a null branch is `—` as before |
| 7 | Identity on tmux target | pass: the poll keys on the Muster session id. `ClaudeDir` survives `/clear` (edge case 12) |
| 8 | No settings trespass | pass |
| 9 | No real `claude` | pass: E2E and Go tests use real `git` in temp repos (with per-command `-c user.*`) and synthesized hooks only |

## Issues

### Critical
1. **[web-impl]** The `comments` gate line failed: `web/src/style.css:2429` opens a new comment with the plan ID `REQ-11:`. Replace it with the reason itself (it already gives one: compact keeps one line, so the flex items each ellipsize inside the card), and cite `kb:adr/rail-repo-line-wraps-at-slash` if wanted.
2. **[daemon-impl]** REQ-2 is broken by a race in the repo poll: a launch directory that disappears **during** a tick is read as "not a git checkout", and the card permanently loses its last-known `repo`. `internal/server/reporefresh.go` `tick` checks `isDir(t.Directory)` and only then runs `readRepoState` → `repoContext` (`IsRepo`, then `Branch`, then `IsWorktree`). If the directory vanishes after the check, `git` fails, `branch` comes back nil and `SetRepoState` broadcasts `repo: null`. From the next tick on, the directory is gone, so it is skipped and the null stays. The same failure that E2E Validate's Repairs row 2 saw is still there after that repair: my soak of `card-location.spec.ts` at N=10 failed this test twice, `Expected: "muster-e2e-loc-lgWWyj /"` / `Received: "muster-e2e-loc-lgWWyj"` at `card-location.spec.ts:215`. Repair 2's `vanish()` (an atomic rename) removed the window where the directory existed without `.git`, but not this window, which is between the stat and the git reads. **Fix:** in `tick`, after `readRepoState`, re-check `isDir(t.Directory)` and drop the reading (do not call `SetRepoState`) when the directory has gone. Better still, separate "git failed" from "not a checkout", so that a transient git error or the 5 s `repoReadTimeout` expiring under load cannot null `repo` on a directory that still exists. The spec is correct as written, so this is not `[e2e-specs]`. The process gap: E2E Validate ran the test live and soaked it 250/250, but put the remaining cause on the spec ("not the REQ-2 scenario") instead of the daemon, and one green soak passed by luck.

### Major
1. **[daemon-impl]** The `-repo-poll` flag help text is false about the shipped behaviour. `cmd/musterd/main.go` says "0 disables the timer (the poll then runs only when Claude's reported directory changes)", but with `0` the poll also runs once at start, so a restarted daemon re-derives `claudeLocation` (`RepoRefreshConfig.Poll`'s own doc comment, `runTicked`, and the amended `kb:adr/lifecycle-branch-refreshed-by-repo-poll` all say so, and `TestRepoPoll_NoTimerStillTicksAtStartAndOnNudge` pins it). Make it say "runs at start and when Claude's reported directory changes".
2. **[orchestrator]** `daemon-implementation.md` has an unamended `doc-delta:` line: "`-repo-poll 0` still runs one tick at start, so the Protocol Contract's '… runs only on a nudge' should read 'runs at start and on a nudge only'". The plan's Protocol Contract (§ Daemon flag) still says "only on a nudge", and `## Doc Delta` does not reflect the change. `docs/protocol.md` is already right ("start, every `-repo-poll`, and on a nudge"), so this is a plan-text amendment, or an explicit "no spec change" disposition, before doc-reconcile. The log's other two `doc-delta:` lines are already handled: the lifecycle `go:` glob gained `internal/server/reporefresh*.go` in `bfbf46a`, and the `ingest.go` line concerns the plan's Affected Files, not a document. The Doc Delta's ingest sentence stays true.

### Minor
1. **[daemon-impl]** `internal/server/bgloop.go`'s `runTicked` doc comment names the new poller `repoRefresher`. No type has that name: it is `repoRefreshFeature`, which the `bgLoop` comment a few lines above spells correctly.

### Notes
1. **[note]** For review-browser (W11): `c-long-names.html` colours the Focus header's branch line `--fg-muted` (`.pair .b`), while the shipped `.mainhead .meta .rb` inherits `--fg-dim`. The plan does not pin the launch block's branch colour (REQ-16 covers only the `↳` blocks). Whether the rendered header matches the mockup is the browser part's call.
2. **[note]** D5's "an unchanged `Cwd` persists nothing" holds for `ApplyStatus` and for the nudge. `Apply` persists every event anyway, as before. The impl log says so, and I read it as within the criterion.
3. **[note]** D17 is proven by its effect (a dead session keeps a stale branch while an alive twin in the same tick updates), not by counting subprocesses, because `gitutil`'s run seam is package-private. The mutation check (`tick` polling dead sessions) fails the test, so the assertion is not vacuous.
4. **[note]** Repairs honesty: both rows keep their assertions. Row 1 measures one line's height with a probe in `.r2`'s own font. Row 2 replaces `rm -rf` with an atomic rename. Nothing was deleted or weakened. Row 2's root-cause analysis was incomplete (Critical 2), but the assertion it protects is correct and is what exposed the daemon race.
5. **[note]** The deviation that keeps `claudeLocation` as last known when the launch directory is gone (ADR amended) means `docs/protocol.md`'s "null iff" for `claudeLocation` has one unlisted exception: a moved session whose launch directory was deleted. Claude cannot then report being back in that directory, so the gap is harmless. doc-reconcile may want to add one clause.
6. **[note]** My soak could not use `make e2e-soak`, because review-browser's untracked `web/e2e/zz-review-browser.spec.ts` (`TS6133`, unused `page`) fails `web-build` and e2e-lint while it is present. That file must be gone before the orchestrator commits or re-gates.

## Browser review

# Browser review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 37403 words (budget 20000)
**Rig**: `make web-build build` at 4968c2d → `bin/musterd`, per-test scratch `-data-dir` `$TMPDIR/muster e2e-XXXX` (space-bearing), `-tmux-socket` inside it (killed by the harness teardown), E2E stub `claude` via `-claude-bin`, `-repo-poll 200ms`; headless Chromium 1280×800 through two throwaway specs on the committed helpers (deleted; `git status --porcelain` shows only the two sibling review parts)

Gates log read, not re-run: `web-build` and `e2e` green (540 passed); the one red line is `comments` (`web/src/style.css:2429`), which is review-work's.

Fixtures used: a 60-character launch folder on an 80-character branch, moved into a `.claude/worktrees/` worktree with a 44-character folder name on an 83-character branch; a short-named repo moved into `lightwt`/`stripwt`; a non-git launch directory with no hooks posted (no data yet); six sessions so the Tiles strip holds two cards.

## Matrix

Hosts: **rail** (Focus view `#sessions`), **strip** (Tiles view `#tiles-strip`, same card template), **focus** (`#mainhead`), **tile** (`article.tile .thead`). The pop-out (`/doc.html`) is the docs reader and has no repo readout, so it is N/A for every row.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-10 | rail | data | two lines, folder over branch, each truncates on its own, comfortable | pass | `.rf` 14,139–288,152, `.rb` 14,152–288,165 (below it); both `text-overflow: ellipsis`, sw/cw 420/274 and 542/274; both inside card 0–299 |
| REQ-10 | rail | data | same, expanded | pass | same boxes; `.rf` sw/cw 420/274, `.rb` 542/274 |
| REQ-10 | strip | data | two lines, comfortable/expanded | pass | `.rf` 14,694–629,707, `.rb` 14,707–629,720 inside card 0–640 |
| REQ-10 | rail | no data | `repo: null` → one line, basename, no slash | pass | `.r2` = `.rf` only, text `muster-e2e-plain-…` (no `/`), `.rb` count 0; API `repo: null` |
| REQ-10 | strip | no data | same | N/A — a single session is tiled, so the strip holds no card | |
| REQ-10 | rail, focus | daemon-down | last snapshot keeps the two lines | pass | after SIGTERM: `.rf`/`.rb` still 274 px wide at y 171/184, beside `#banner` 0,46–1280,78 |
| REQ-11 | rail | data | compact keeps one line, inside the card | pass | `.r2` height 13 (130–143), `.rf` 14–131 and `.rb` 137–288 on the same top, `.rb` right 288 = `.r2` right, both clipped (sw 420/542 > cw 117/151) |
| REQ-11 | strip | data | compact one line | pass | `.r2` 749–762, `.rf` 14–170, `.rb` 177–258 on the same top |
| REQ-12 | rail | data | `↳` block after the repo block, same two-line shape | pass | `.r2c` display `grid`, 14,167–288,193 below `.r2` (165); `.lead` `↳` 14–21; `.rf` `worktree-… /` and `.rb` branch, each at x 26–288, ellipsized |
| REQ-12 | rail | data, compact | `↳` block one line | pass | `.r2c` 145–158 (13 px), display `flex` |
| REQ-12 | strip | data | `↳` block in each density, inside the card | pass | comfortable 722–748, compact 764–777; the strip card's children end at 790 inside a 641–800 card; the unmoved neighbour's card in the same row is the same height |
| REQ-12 | rail | no data / dead | hidden | pass | `.r2c` `[hidden]` with computed `display: none` (no data, dead, and dead + daemon-down); API `claudeLocation: null` once dead |
| REQ-12 | rail | daemon-down, moved | last snapshot stays | pass | `.r2c` still `grid` and visible, `#banner` visible (see Note 4) |
| REQ-13 | focus | data | folder capped at 30ch, branch at 44ch, model not truncated, 1280 | pass | unmoved long names: `.rf` cw 203 (30ch), `.rb` cw 298 (44ch); `.model` sw/cw 115/115, right 848 < `.meta` right 848 ≤ `.surfseg` left 902 |
| REQ-13 | focus | data, moved | `↳` block between repo and model; model never truncates | pass | at 1280: `.loc > .sep` 580–586, `.claude-at` 592–756, `.model` 774–890 sw=cw 115; at 1024: `.model` 518–634 sw=cw 115 while the name blocks shrink (Note 2) |
| REQ-13 | focus | dead | ended age after the model | pass | `.ended-at` visible 810–890, text `· ended now`; `.claude-at` `display: none` |
| REQ-13 | focus | no data | basename alone, no `↳`, model is the launch value | pass | `.rf` `muster-e2e-plain-…`, no `.rb`; `.loc > .sep` and `.claude-at` `[hidden]` with `display: none`; `.model` `haiku` |
| REQ-14 | focus | data | `.loc` title = lines 1–2 unmoved, 1–4 moved | pass | moved: `<repo> / <branch>`⏎`<dir>`⏎`Claude is in <wt dir>`⏎`on <wt branch>`, matching `/api/state` `directory`, `repo` and `claudeLocation` read in the same pass |
| REQ-14 | focus | no data | lines 1–2 | pass | `muster-e2e-plain-…`⏎`/private/var/…/muster-e2e-plain-…` |
| REQ-14 | rail, strip | data | `.r2` title = line 1; `.r2c` title = lines 3–4 | pass | `.r2` `<repo> / <branch>` one line; `.r2c` `Claude is in …`⏎`on …` |
| REQ-15 | tile | data | `.wh` one line with the REQ-14 title; `↳` glyph after it with hidden text | pass | `.wh` 59–482 one line, title is the four lines; `.wh-claude` display `block` 491–498, before `.ctxinfo` 507; `.sr-only` 1×1, text `Claude is in <wt dir>` |
| REQ-15 | tile | data, narrow tile (900 px viewport) | glyph not clipped | pass | `.wh-claude` 301–308 inside `.thead` 2–449, `.ctxinfo` from 317 |
| REQ-15 | tile | no data / dead / unmoved | glyph hidden | pass | `.wh-claude` `[hidden]` with computed `display: none` in all three |
| REQ-15 | tile | data, long names | session name still readable beside the long repo line | FAIL | `.nm` cw 21 of sw 61 (`r…`) beside `.wh` cw 423, at a 640 px tile; 12 px at a 450 px tile (Minor 1) |
| REQ-16 | rail, focus, tile, strip | data, Instrument | glyph `--fg-muted`, text `--fg-dim` | pass | `.lead` and `.wh-claude` `rgb(178,182,195)` = `--fg-muted`; `.rf`/`.rb` `rgb(166,171,188)` = `--fg-dim`; neither equals `--rose`/`--amber` |
| REQ-16 | rail, focus, tile | data, Light | same | pass | `.lead`, `.wh-claude` `rgb(65,69,79)` = `--fg-muted`; `.rf`/`.rb` `rgb(73,77,92)` = `--fg-dim` |
| REQ-17 | focus | data | `button.rename` title = display title | pass | `title="rb-long"`, `"rb-br"`, `"rb-nodata"` |
| REQ-17 | focus | data | keeps keyboard focus across a re-render | pass | arrived by `Tab` from the previous tabbable (the rail pin button); after a `git checkout -b` upsert plus 1.5 s the same tagged node is still `activeElement`; `Enter` then opens `input.name-edit` |
| REQ-1 | rail, focus | data | the branch follows a checkout with no hook | pass | `.rb` → `kbd-branch` / `focus-branch` after a real `git checkout -b`, focus and rail both |
| REQ-1 | tile, strip | data | same | pass | tile `.wh` → `<repo> / tiles-branch`; strip `.r2 .rb` → `focus-branch` |
| REQ-1 | rail | dead | keeps the last-known branch | pass | the dead card keeps its long branch; API `repo` unchanged |
| REQ-5/12 | rail, focus, tile | data | `↳` only while Claude is in another checkout | pass | absent before the move, present after a main-agent `cwd` hook naming the worktree; API `claudeLocation.repo.isWorktree: true` |
| REQ-9 | focus | data | bind with a different id shows the id, then the status line's name | pass | launched `sonnet`, `SessionStart` `claude-sonnet-5-5` → `.model` `claude-sonnet-5-5`, API `displayName` = id; a status post → `.model` `Haiku 4.5` |
| REQ-9 | focus | no model (resumed from list) | `unknown`, then the id | not measured (Note 1) | |
| W11 | rail, focus | data, Instrument | matches `c-long-names.html` | pass | screenshots side by side: folder over branch, `↳` block indented under the glyph, model after the `·` |
| W11 | tile | data, long names | matches the mockup tile header | FAIL | the mockup keeps `rework shi…` beside the repo line; the app leaves 3 characters (Minor 1) |
| §7.1 | tiles, focus | data | one live client per session | pass | `totalAttachedClients` = 4 with 4 tiles of 6 sessions; 1 in Focus |
| §6.7 | all | daemon-down | daemon-down surfaced prominently | pass | `#banner` full width 0,46–1280,78, `display: block`, text `musterd unreachable — hook output in open panes is Muster's …` |
| Hidden | rail, focus, tile | every toggled element | `[hidden]` computes `display: none` | pass | `.r2c` (comfortable and compact rules), `.claude-at`, `.loc > .sep`, `.ended-at`, `.wh-claude` all `display: none` while hidden |

## Issues

### Critical

(none)

### Major

(none)

### Minor

1. **[web-impl]** Tile header: with a long repo line, the session name all but disappears. `.thead .nm` and `.thead .wh` both shrink in proportion to their width, so an 80-character `<repo> / <branch>` leaves the title 21 px of 61 (`r…`) in a 640 px tile and 12 px in a 450 px tile, while `.wh` keeps 423 px. W11 binds the tile header to `c-long-names.html`, where the title keeps about 80 px (`rework shi…`) and the repo line is what truncates. The flex rules are older than this plan, but this plan's long-names edge case (24) is what exposes it. `web/src/style.css` `.thead .nm` / `.thead .wh`. A fix must make true: at a 420–640 px tile with edge case 24's names, `.nm` keeps a floor of several characters (for example the masthead title's `min-width: 6rem` pattern) and `.wh` gives up width first.

### Notes

1. **[note]** REQ-9 "no model" cell (a resumed-from-list session with a null model reads `unknown`, then the id) was not driven in the browser: it needs a past-session transcript fixture, and the rig's throwaway spec did not build one. The only evidence is that `card-location.spec.ts` E9 is green in the gate log.
2. **[note]** Focus header, moved with long names: once Claude has moved, both name blocks share what is left after the title, `.surfseg` and `.acts`. At 1280 each block is 131–158 px. At 1024 they fall to 22–32 px, close to their `2ch` floors. The model stays whole in both (sw = cw 115), as REQ-13 requires, and the mockup's narrow example shows the same trade-off. No change requested.
3. **[note]** The tile's `↳` glyph (`.wh-claude`) has no hover of its own. The hover sits on `.wh` beside it, as REQ-15 specifies.
4. **[note]** Daemon-down with a moved session: the `↳` block and its `Claude is in …` hover stay on screen from the last snapshot, carrying no age. The plan's States section says this ("the last snapshot stays on screen as today"), and the banner is up the whole time, so §6.8 is met through the banner.
5. **[note]** §7.4 (`scrollback: 0`) and §7.5 (pane styling) were not re-measured: the plan touches neither xterm nor pane contents.
6. **[note]** The gate log's red `comments` line (`web/src/style.css:2429`, a plan ID in a comment) belongs to review-work.

## Maintainability review

# Maintainability review: Stale dirs, models and branches

**Plan**: stale-dirs-models-branches
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 42147 words (budget 20000)
**Scope**: 31 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` (plus `web/index.html`, read as the markup half of the web change)

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | (its flag/const siblings in-file: usagePoll, claudeThemePoll) | n/a (one flag) | filelen 525, reason holds; funlen `parseFlags` 48, no reason; funlen `run` 44, function untouched | Minor 3 |
| internal/claudecode/CLAUDE.md | (generated trailer) | n/a | — | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | `EnvelopedHookBody`, `SessionStartOpts`, `ToolFileOpts` in-file | n/a (one helper, `EnvelopedHookBody`'s shape) | filelen 630, no reason | Minor 3 |
| internal/claudecode/interpret.go | per-arm `agent_id` reads in-file, doc.go | yes (`interpretKind` split) | — | pass |
| internal/claudecode/status.go | interpret.go | covered by the interpret line | — | pass |
| internal/gitutil/gitutil.go | `Branch`/`IsWorktree`/`IsRepo` in-file | yes (in the reporefresh line) | — | pass: `TopLevel` takes the exported-wrapper-over-`gitRunner` shape its siblings use |
| internal/server/bgloop.go | usagepoll.go, themepoll.go, shellactivity.go, updatemanager.go | yes | — | pass (see Note 5) |
| internal/server/reporefresh.go | usagepoll.go, themepoll.go, shellactivity.go, launcher.go (`repoContext`), updatemanager.go | yes | — | Minor 1, Minor 2 |
| internal/server/server.go | (composition root) usage/theme/shellActivity registration lines | yes (`OnClaudeDirChange`) | funlen `New` 44, no reason | Minor 3; the root still holds one `register` line per feature, and the closure matches `OnUpsert`/`OnRemoved` |
| internal/server/sessionwire.go | `sessionWireRepo`, `toWireSession` in-file | n/a | — | pass: `sessionWireLocation` reuses `sessionWireRepo` |
| internal/session/CLAUDE.md | — | n/a | — | pass |
| internal/session/actions.go | liveness.go, reader.go | covered by the session line | — | pass |
| internal/session/apply.go | status.go, reader.go | covered | — | pass |
| internal/session/liveness.go | actions.go | covered | — | pass |
| internal/session/location.go | session.go, status.go | yes (`Elsewhere` pure) | — | pass |
| internal/session/machine.go | status.go | n/a (rule change in `applyBind`) | funlen `applyInput` 51: function untouched, the documented exemption | pass |
| internal/session/manager.go | liveness.go, actions.go | yes (callback) | filelen 580, reason holds (one field) | pass |
| internal/session/repo.go | reader.go (`SetTranscript`, `SetPlan`), title.go | yes | — | pass: `SetRepoState` uses the same lock / unknown-id / no-op / `persistWholeRowLocked` shape as `SetPlan` |
| internal/session/row.go | — | n/a | — | pass |
| internal/session/session.go | — | yes (`ClaudeDir`/`ClaudeLocation` writers named at declaration) | — | pass |
| internal/session/status.go | apply.go | covered | — | pass |
| internal/session/writeorder.go | — | n/a | — | pass: restored/immutable lists kept in step with `CheckSessionFieldCoverage` |
| internal/store/migrations/0012_claude_dir.sql | 0011_turn_state.sql | n/a | — | pass (same header shape) |
| internal/store/session.go | — | n/a | — | pass |
| web/src/protocol/session.ts | `parseRepoInfo`, `parseModelInfo` in-file | n/a | — | pass (see Note 9) |
| web/src/render/mainhead.ts | render/tiles.ts, render/sessions.ts, render/context.ts | yes | — | pass |
| web/src/render/repolines.ts | render/context.ts ("one builder, two renderers") | yes | — | pass |
| web/src/render/sessions.ts | render/context.ts, render/tiles.ts | covered | — | pass |
| web/src/render/tiles.ts | render/sessions.ts | covered | — | pass |
| web/src/sessions/card.ts | sessions/paths.ts, sessions/context.ts | yes | — | pass (see Note 3) |
| web/src/style.css | its own `.r2`, `.mainhead .meta` and `.thead` blocks | yes (`.sr-only`, compact flex) | — | Minor 4 |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[daemon-impl]** `resolvePath` (`internal/server/reporefresh.go:130`) is a second copy of an existing helper, and the `design:` line says there was none. Decisions: "Grep: `rg "TopLevel|show-toplevel|EvalSymlinks" internal --glob '!*_test.go'` found no existing top-level or path-resolving helper". Running that grep today returns, among others:
   ```
   internal/claudecode/launchtranscripts.go:56:	if r, err := filepath.EvalSymlinks(dir); err == nil {
   internal/locate/locate.go:129:		resolved, err := filepath.EvalSymlinks(path)
   internal/claudecode/claudecodetest/transcripts.go:31:	if resolved, err := filepath.EvalSymlinks(cwd); err == nil {
   cmd/musterd/main.go:193:		if resolved, err := filepath.EvalSymlinks(exePath); err == nil {
   ```
   `internal/claudecode/launchtranscripts.go:54` `func resolveTranscriptDir(dir string) string` does exactly what `func resolvePath(path string) string` does: it resolves symlinks, falls back to the input, and cleans the result. This goes against conventions § Design, "Reuse before add … paste the grep in Decisions". A fix must make one of these true. Either both callers use one resolve-or-clean helper in a home that is not Claude-Code-specific. Or the `design:` line names `resolveTranscriptDir` and says why it is not reused (for example: it is unexported inside the Claude-format adapter, and the server must not reach into it for generic path code). The design line's "found no … path-resolving helper" must not stay as written.

2. **[daemon-impl]** `deriveLocation` (`internal/server/reporefresh.go:123`) gets the branch and worktree flag for Claude's directory by calling `gitutil.Branch` and `gitutil.IsWorktree` directly. That is the body of `repoContext` (`internal/server/launcher.go:326`) again. Decisions says: "`repoContext` in `launcher.go` is reused unchanged for the launch directory read, so launch and poll answer 'branch and worktree flag' through one function". That holds for the launch directory only. The Claude directory has a second, hand-copied path. This goes against conventions § Design, "One owner per concept … Two places that must agree will not". A fix must make one of these true. Either one function answers "branch and worktree flag of a checkout" for both directories (it can skip `IsRepo` when the top level is already known). Or the `design:` line says why the second path exists.

3. **[daemon-impl]** Some size warnings on touched code have no reason in Decisions. The Decisions "Size warnings" line covers only the file lengths of `internal/session/manager.go` (580) and `cmd/musterd/main.go` (525). The `size` log also lists these, each touched by this diff:
   - `cmd/musterd/main.go:112` `parseFlags` funlen 48 > 40 (this diff adds a flag and a validation branch)
   - `internal/server/server.go:149` `New` funlen 44 > 40 (this diff adds a `register` line and a callback)
   - `internal/claudecode/claudecodetest/claudecodetest.go:1` filelen 630 > 500 (this diff adds `EnvelopedHookInDirectory`)

   The rule is conventions § Design, "Size is read, not obeyed … Exceeding one is fine with a reason in Decisions". A fix must make true that each of the three has a reason in Decisions that holds (for example, one flag declaration per statement; one registration line per feature), or a real restructure. A split made only to silence the warning does not count (kb:adr/process-size-linters-warn-never-fail).

4. **[web-impl]** `web/src/style.css` lays out the `↳` two-line block twice, with differences nobody explained. `repolines.ts` renders the same `RepoParts` into `.r2c` and `.mainhead .meta .claude-at`. Its header says the readout is "the same `RepoParts` rendered four times". But the CSS that shapes that one readout has two owners:
   - `.mainhead .meta .claude-at` at `style.css:739`: `grid-template-columns: auto minmax(0, 1fr); column-gap: 4px`. Its `.lead` has `grid-row: 1 / span 2; align-self: start`.
   - `.r2c` at `style.css:2191`: `grid-template-columns: auto minmax(0, 1fr); column-gap: 5px`. Its `.lead` has `grid-row: 1 / span 2` and no `align-self`.

   On top of that, each host has its own `.rf`/`.rb` ellipsis rule (`.mainhead .meta .rf, .mainhead .meta .rb` and `.r2 .rf … .r2c .rb`). The 4px against 5px gap and the `align-self` on one side only look accidental, and a later change to one host will not reach the other. This goes against conventions § Design, "One owner per concept". A fix must make one of these true. Either the shared block layout (lead column spanning both lines, the line column, per-line ellipsis) is declared once and both hosts use it, keeping only real per-host differences such as `max-width`. Or the `design:` line states why the two hosts must differ.

### Notes

1. **[note]** The coalescing nudge (`select { case ch <- struct{}{}: default: }` on a `chan struct{}` of size 1) now exists three times: `internal/server/usagepoll.go:65`, `internal/server/updatemanager.go:376` and `internal/server/reporefresh.go:70`. The design line's grep `rg "refresh chan struct"` missed `updatemanager.go` because of field alignment padding. It is a four-line idiom that was already copied before this plan, so this review asks for no change. If it is ever extracted, its natural home is `bgLoop`, beside `runTicked`, which already takes the channel.
2. **[note]** `Server.StopLivenessPoll` (`internal/server/server.go:324`) now also stops the repo poll. Decisions says the name is now narrower than what the function does, and the doc comment says so. The rename touches test files that are not daemon-impl's to edit, so it is a candidate follow-up for the orchestrator to propose, not a fix-wave item.
3. **[note]** The `CardViewModel.hover` field (`web/src/sessions/card.ts:48`) is filled by `locationHover` and used only by the tile's `.wh`. A comment has to explain that, which suggests `locationHover` would be the clearer field name. Taste only; no citation.
4. **[note]** For review-work: the `comments` gate is red on `web/src/style.css:2429` (`/* REQ-11: …`, a plan ID in a comment).
5. **[note]** For review-work: `runTicked`'s doc comment (`internal/server/bgloop.go:42`) names the type `repoRefresher`, while the type and `bgLoop`'s own comment say `repoRefreshFeature`.
6. **[note]** For review-work (DIAG): `kb:diagram/web-components` says `render/` has "28 modules". It had 29 on `main`, and `render/repolines.ts` makes 30. The daemon diagram's `gitutil` description ("Repo, branch and worktree detection") now also covers the top-level read. It still reads true, but review-work may want it updated.
7. **[note]** For review-work: `-repo-poll 0` means "no timer; start tick and nudges still run". Its siblings `-usage-poll 0` and `-claude-theme-poll 0` mean the poller is never built (`internal/server/themepoll.go:14`). The difference follows the plan's contract (Decisions lists it as a doc-delta), so it is not a shape finding here. A newcomer reading the flags will still expect "0 disables".
8. **[note]** Test-file funlen hits on new tests (`TestRepoPoll_ClaudeLocationMatrix` 113 lines, `TestSetRepoState` 145 lines) are daemon-tests' to read. No `dupl` warning names a test file.
9. **[note]** For review-work: `parseSession` reads an absent `claudeLocation` as `null` (`web/src/protocol/session.ts`, "An older daemon omits the key"), while `sessionwire.go` calls it a "Required key on every Session object". Whether the decoder may tolerate a missing key is a contract question.
10. **[note]** Shared state checked: `repoRefreshFeature.refresh` is written by the ingest worker (through `OnClaudeDirChange`) and read by the loop goroutine, and the design line names both. `Session.ClaudeDir` and `Session.ClaudeLocation` name their writers and `Manager.mu` where they are declared (`internal/session/session.go`). `s.repoRefresh` is assigned in `New` before any goroutine starts, so the closure's read is ordered by `Start`. `SetRepoState` drops a stale reading on a `ClaudeDir` mismatch or a dead session, and its own writes go under `Manager.mu` and the per-id write turnstile. The gates' `test` line is `go test -race -count=1 ./...` with 0 FAIL. I found no interleaving it would miss.
