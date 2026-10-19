# Review: see-added-dirs

**Plan**: see-added-dirs
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser approved, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: See added directories

**Plan**: see-added-dirs
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 67860 words (budget 30000)

Scope: full review. Cycle 1 had agent-tagged Majors, so this is not a delta cycle. I re-read the whole branch against the plan. I read the cycle 1 fix waves (`7a4e67ea..HEAD`: `4bca4ec0`, `747e8d74`, `9f4adcbd`, `75b053b3`, `4bc055ff`, plus the orchestrator's doc commits) line by line.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes: `claudecode.InterpretStatus` reports `workspace.added_dirs` as `*[]string` (nil = absent); `session.adoptAddedDirs` replaces the list in reported order, drops the launch directory and removes duplicates | Yes: `TestInterpretStatus_AddedDirs`, `TestNormalizeAddedDirs`, `TestAdoptAddedDirs`, E2E E1/D1/D2 | pass |
| REQ-2 | Yes: `session.ResolvePath` (now in `location.go`, same body) on every entry; a relative entry is joined to the launch directory first; the launch directory is compared after resolving | Yes: `TestResolvePath`, `TestAddedDirsInvariants_LaunchDirectoryNeverListed`, E2E spellings and relative/symlink tests | pass |
| REQ-3 | Yes: `RecordLaunch`/`RecordResume` clear the list; `markEnded` (the Stop, liveness and reconcile death path) clears it; `adoptAddedDirs` refuses a dead session. On the web side the open panel now refreshes from the session's latest upsert, so it drops the Added section when the session ends | Yes: `TestAddedDirsInvariants_EveryDeathFromEveryState`, `TestRecordLaunchAndResume_EmptyAddedDirs`, E2E stop/liveness/reconcile/resume, plus the new resting-mouse E2E "the session ending drops the open panel's Added directories section" and `locationpanel.test.ts` `refresh()` | pass |
| REQ-4 | Yes: `added_dirs` column (0017), paths only; `/clear` leaves the list alone | Yes: `TestAddedDirs_SurviveADaemonRestart`, `TestAddedDirs_ClearPairInEitherOrder`, `TestRepoPoll_RestartRereadsAddedDirs`, E2E E4 and both `/clear` orders | pass |
| REQ-5 | Yes. `gitutil.isWorktree` asks for `--git-dir --git-common-dir` in one call and compares the two as resolved paths, so a subdirectory of an ordinary checkout reads `false` and a subdirectory of a linked worktree reads `true`. This closes cycle 1 correctness Major 1 for all three callers through `checkoutState`: the launch directory, `claudeLocation` and added directories. The added directories are now read under their own `repoReadTimeout`, 8 at a time. A directory whose read did not finish is left out and keeps its last-known reading | Yes: `TestIsWorktree_FromASubdirectory` (real git, root and 1–2 levels down), `TestIsWorktree_ComparesResolvedPaths` (runner seam, the measured spellings), `TestReadAddedRepos_SubdirectoryNamesItsCheckoutsTopLevel` (now asserts the flag both ways: cycle 1 correctness Major 2), `TestReadAddedRepos_MoreDirectoriesThanWorkers`, `TestReadAddedRepos_ExpiredContextLeavesEveryDirectoryOut`, `TestReadRepoState_WedgedAddedDirectoryKeepsTheLaunchReading`, E2E worktree-flag test and E5. Each new test except the worker-pool guard is shown failing on `4bca4ec0` | pass |
| REQ-5a | Yes: the status path lists the entry with `repo` nil and runs no git | Yes: `TestApplyStatus_AddedDirs` (D15), E2E E7 | pass |
| REQ-6 | Yes: `mainheadMeta` passes `repoParts(session, addedCount === 0)`, so the folder is built without ` /` up front (the regex is gone); `.plus` is `flex: none` in `--fg-muted` | Yes: `mainhead.test.ts`, `card.test.ts` `repoParts(s, false)`, E2E E1, W4 sweep | pass |
| REQ-7 | Yes: no `title` on `.loc`; `createLocationPanel` is `createHoverTip(buildPanel)`, a body-appended `.pop` with `role="tooltip"`, and the rows and order are unchanged since cycle 1. Edge case 15 as amended (kb:adr/focus-location-panel-lists-every-row): every row is listed with no cap; when the rows do not fit below the readout, `placeAnchored` moves the panel to top 8 | Yes: `sessions/locationpanel.test.ts`, `render/locationpanel.test.ts`, `hovertip.test.ts`, E2E E2 plus the three new overflow tests (3 fit below, 15 flip to the top, 22 all listed with no `+K more`) | pass |
| REQ-8 | Yes: rail and tile callers pass no count; `locationHover` kept for the tile `.wh` | Yes: E1 rail/tile assertions, `card.test.ts` | pass |
| REQ-9 | Yes: `POPOVER_DELAY_MS` (350) now lives in `hovertip.ts` and is re-exported from `grouppopover.ts`; `cardtip.ts` imports it from its new home; `pointer-events: none` comes from the shared `.pop` rule | Yes: `hovertip.test.ts` (fake timers at the delay), E2E pointer-events and parent-is-body | pass |
| INV-1 / INV-2 / INV-3 | Yes | Yes (see REQ-3, REQ-2, REQ-6) | pass |
| DIAG | `kb:diagram/web-components`: `render/` 43 (main's 41 + `locationpanel.ts` + `hovertip.ts`, measured with `ls`), `sessions/` 17 (main 16 + `locationpanel.ts`), no new import edge, so true. `kb:diagram/daemon-components`: no new package edge, true. `kb:diagram/one-launch-end-to-end` (names `gitutil.go`, "is it a worktree"): still true. `kb:diagram/store-schema`: 0017 line and ranges, true | — | pass |

## Build & Tests

E2E tests: pass (987, full suite: `make web-build build e2e-run`) · Daemon tests (race): pass (every package ok, `go test -race -count=1 ./...`) · Web tests: pass (2825 in 99 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues, biome 346 files clean, e2e-lint clean) · Contrast: pass (54 pairs × 3 themes, 0 failures) · kb check: pass (613 records, 0 problems) · features-scope: pass · comments/ledger: clean (10 blocks, all kept). All read from `/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-see-added-dirs-c2`.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D12 | `make test` | pass (deduped to `go test -race -count=1 ./...`, 02-test.log) |
| D13 | `make lint` | pass (03-lint.log, `0 issues.`) |
| D14 | `go build ./...` | pass (01-build.log empty, exit 0) |
| D11 | `! rg -n '"added_dirs"' cmd/ internal/ --glob '!internal/claudecode/**' --glob '!**/*_test.go'` | pass (18-D11.log empty, run reports 0 failed lines) |
| W6 | `make web-test` | pass (2825 tests) |
| W7 | `make web-build` | pass (`tsc --noEmit && vite build`) |
| W8 | `make web-lint` | pass |
| W9 | `make contrast` | pass |
| E6 | `make e2e` | pass (987 passed, 9.2 m, full suite) |
| K1 | `make check-kb` | pass |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. #93 and #101 are in `docs/history/todo-done.md`. All three proposed ADRs (`focus-added-dirs-folder-suffix-and-location-panel`, `lifecycle-added-dirs-from-status-line-cleared-on-death` and the new `focus-location-panel-lists-every-row`) are `proposed` with `refs: plan:see-added-dirs` and describe what shipped. Neither fix-wave log carries a `deviation:` line. Every fix-wave `doc-delta:` line is in `doc-delta.md` § "From review cycle 1's fix wave", and each one matches the code. The launch-deadline split, the kept last-known reading and the resolved-path worktree rule are in `reporefresh.go:113-128` and `gitutil.go:92-113`. The open panel following the session is `hovertip.refresh` plus `focus.ts:278`. The flip to the top is measured by E2E. The web-components counts, the `render/CLAUDE.md` Owns line and the `hovertip*.ts` registration under groups are done |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | Neutral tokens only | pass | `style.css` is untouched since cycle 1. Its additions use `--fg-muted`, `--fg-dim`, `--fg` and `--line`, with no state token and no colour literal |
| R2 | Panel matches `final.html` row for row in its six states | pass (structure) | `buildPanel` is unchanged since cycle 1 (same `.ph`/`.dr`/`.df`/`.dp`/`.sub` markup as the mockup). The model and its states are unchanged, and `folderName` gives the same folder text as before. Rendered fidelity is review-browser's |
| R3 | No `any` in new web code | pass | `hovertip.ts`, `dom.ts` `setText` and the `card.ts`/`session.ts` edits declare no `any`. Branch-wide, `any` appears only in English prose (one comment, one test title) |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: the `added_dirs` JSON key is read only in `internal/claudecode/status.go` (D11 green). The other `added_dirs` hits are Muster's own SQL column |
| 2 | Terminal-output state parsing | pass: none added |
| 3 | Blocking hook handler | pass: ingest untouched; the new git reads run on the repo poll, not the status path |
| 4 | Bare tmux / resize-pane | pass: no tmux call added |
| 5 | Payload logging | pass: no new log line this cycle |
| 6 | Empty-gauge dishonesty | pass: no gauge. An unread directory shows folder and path with no branch (REQ-5a) and is never drawn as an empty branch |
| 7 | Identity on `session_id` | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` | pass: none. The wedge test's fake `git` shim execs the real `git`, not `claude` |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Cycle 1 correctness issues are all closed. Major 1 is fixed in `internal/gitutil/gitutil.go:92-113`. The impl log lists every caller through `checkoutState` (`launcher.go:370`), and `rg` confirms that is the only non-test `IsWorktree(` caller. Major 2 is fixed: the table in `reporefresh_addeddirs_test.go` asserts `IsWorktree` false/true, and the E2E worktree-flag test asserts it on the wire. Major 3 is fixed: the diagram counts are 43/17, and I re-measured them.
2. **[note]** For review-browser, about browser Major 1's "never a permanent null": the daemon log's `limit:` line says that a list needing more than one `repoReadTimeout` (about 180 directories at 8 at a time) reads only the front of the list each tick, so the tail stays null. The contract's "null when … the repo poll has not read it yet" stays literally true. Under kb:adr/focus-location-panel-lists-every-row, those rows sit far past the viewport anyway. I do not ask for a change. Whether the fix fully meets the browser Major's wording is that part's call. The impl log also says one session's long list still delays the sessions after it in the same tick, by up to 1.6 s for 32 directories.
3. **[note]** `TestReadRepoState_WedgedAddedDirectoryKeepsTheLaunchReading` reaches git through a `$PATH` shim and waits out one real `repoReadTimeout` (about 6 s), because package `server` has no run-func seam for its git reads. Its sibling `TestIsWorktree_ComparesResolvedPaths` does use the `gitRunner` seam. Whether `server` should get a seam is review-maintainability's question, as it was in cycle 1 Note 2.
4. **[note]** `launch` is under **Touches** for the `gitutil` fix. No launch spec sentence changes: "a picked one is recognised" stays true, and the fix only stops a subdirectory being misread as a worktree. Its `doc-delta:` line targets card-location. kb:adr/launch-hybrid-mru-directory-memory's rule ("git-dir and common-dir differ") is unchanged in meaning: the code now compares them as directories rather than as strings. No promotion to Features is needed. `groups` is touched by a refactor only (`createGroupPopover` keeps its exported API and its focus path), per kb:adr/process-features-widened-for-a-refactor-call-site.
5. **[note]** The fix waves' tests are honest. The Repairs table for wave 3 is "None", so no existing assertion was touched. The two flip/fit geometry tests check their own premise ("the panel really is too tall for the room under the readout"), so they cannot pass vacuously. Each defect-pinning test is recorded as red with its defect put back: the `refresh()` call removed, the old `isWorktree` string compare restored, and the pre-fix archive for the Go and Vitest tests. No spec repair needs a soak: the spec soaked 260/260 in authoring, and no flake is named.

## Browser review

# Browser review: See added directories

**Plan**: see-added-dirs
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 13214 words (budget 30000)
**Rig**: `make web-build build` at 99160192 (`v0.22.2-44-g99160192`); per-test scratch daemons from `helpers/fixtures.ts` (`repoPoll: "200ms"`, plus one `startDaemon({})` on the daemon's default 5 s poll for the Major 1 re-measure), data dirs with spaces in their paths (`…/T/muster e2e-*`), a private tmux socket per daemon (the fixture tears it down), stub `claude`; headless Chromium driven by a throwaway `web/e2e/zz-review-browser-c2.spec.ts` (deleted). The added directories are real scratch git checkouts, plain directories, subdirectories and a linked worktree.

Gates log `gates-see-added-dirs-c2`: 0 failed lines (`17-e2e` 987 passed; `04-web-build` built), so the app I drove is the one that ships. After the run, `git status --porcelain` shows nothing of mine (only the other reviewers' part files). No scratch daemon or tmux server is left running.

This cycle re-measured the cycle 1 defects (browser Major 1 and Minor 1), the shared hover lifecycle (`render/hovertip.ts`) that the location panel **and** the rail group popover now run on, the folder-name rule change (`folderName`, `partsOf` `slash`), and the full cycle 1 matrix against the new build. Decision 1 is settled as B. Its cells below confirm the behaviour the amended edge case 15 records. They do not re-raise it.

## Matrix

Hosts: **focus** (`#mainhead`, the only surface that renders `addedDirs`), **tiles** (tile `.thead .wh`), **rail** (card `.r2`, and the group header popover now on the shared controller). **pop-out** (`/doc.html`) hosts the docs reader and has no session header, so it is N/A for every row.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-6 / INV-3 | focus | no data | no suffix | pass | `.rf` textContent `muster-e2e-loc-Y7xGrV /`, 0 `.plus` |
| REQ-6 / INV-3 | focus | data (2 git, 1 plain) | `+N` = length | pass | `.rf` `muster-e2e-loc-9RMqFP+3`; wire `addedDirs` length 3, branches `main`, `feature-x`, `null` |
| REQ-6 / R1 | focus | data | suffix in `--fg-muted` | pass | computed `rgb(178, 182, 195)`, token `#b2b6c3`. `style.css` is unchanged since cycle 1, which measured light and dark |
| REQ-6 | focus | data | visible | pass | `display:block`, `visibility:visible`, `opacity:1`; `elementFromPoint` at its right edge hits the suffix |
| REQ-6 / W4 | focus | data, 60-char folder `+12`, 1280→600 px in 8 px steps | suffix never ellipsized, name gives way, header fit invariants hold | pass | 86 widths: suffix inside `.rf`, hit-tested, `scrollWidth ≤ clientWidth`, `mainheadFitProblems` empty at all of them. The name is ellipsized at 57 |
| REQ-7 / W2 | focus | no data / data | `.loc` has no `title` | pass | `getAttribute("title")` null in both |
| REQ-7 | focus | no data | panel: Location + launch row only | pass | `Location` / `…Y7xGrV · main` / path; 1 `.dr`, no `Added` |
| REQ-7 / R2 | focus | data | panel content, wire order, plain dir without branch, mockup structure | pass | `Added directories · 3`, rows `…DWUYdr · main`, `…KZ5VJG · feature-x`, `muster-e2e-plain-8FfEAk` (no branch), each over its path; children `ph, dr, sub, dr, dr`; row DOM `.dr > .df (folder <span.b> · main) + .dp path`, the same as `final.html`'s `row()`; screenshot compared side by side with the mockup's "two added, panel open" state |
| REQ-7 / W3 | focus | moved (↳) | `↳` row between launch row and added list | pass | `Location / sub0 · main / … ↳ muster-e2e-loc-ZcnKDe · main / … Added directories · 2 / …`, 4 rows, panel 499,89.4–879,315.4 under readout 55–85.4 |
| REQ-7 | focus | data | placed under the readout, inside the viewport | pass | readout 499,55–673.4,85.4; panel 499,89.4–879,315.4 in 1280×800; at 600: panel 212–592 inside 600; at 480: 92–472 |
| REQ-7 | focus | data | visible, `role=tooltip`, parent `body`, `pointer-events:none` | pass | computed `block`/`visible`/`1`/`none`; `parentElement === document.body` |
| REQ-7 | focus | data, hovered, nothing changes | open panel keeps its node across a render tick | pass | same node after 1.3 s (the `refresh` key is unchanged, so the panel is not rebuilt) |
| REQ-7 | focus | data | leave closes, pointerdown closes | pass | count 0 after `mouse.down()`; count 0 after moving to 0,0 |
| REQ-7 / REQ-5 (cycle 1 Minor 1b) | focus | data, added dir's branch changes **while open** | open panel shows the new branch | pass | `git checkout -b while-open`: the open panel read `· while-open` 851 ms later with no re-hover; tooltip count 1; still under the readout (89.4–274.4) |
| REQ-7 (cycle 1 Minor 1, other path) | focus | data, **launch** branch changes while open | open panel and header follow | pass | `launch-moved` in the panel 855 ms later; header `.rb` `launch-moved` |
| REQ-7 / REQ-1 | focus | data, shorter list posted while open | open panel follows the count | pass | `Added directories · 1` with the one remaining row; header `+1` |
| REQ-3 / INV-1 (cycle 1 Minor 1a) | focus | dead **while the panel is open** | no Added section on a dead session | pass | after `/end`, settled 1.5 s: open panel `Location / …4GAjQg · launch-moved / path` only, 1 `.dr`, box 89.4–168.4; header suffix gone; wire `addedDirs` `[]` |
| REQ-7 | focus | data, focus moved to another session by keyboard (⌥⌘1 / ⌥⌘2) with the panel open | no stale panel for the other session | pass | tooltip count 0 after each chord, settled 1.3 s (closed on `focusChanged`; no panel for the wrong session) |
| REQ-7 / edge 16 | focus | daemon-down, panel open when the daemon dies | no panel stranded over the shifted header | pass | the banner (0,46–1280,78) pushes the readout to 87–117.4, out from under the pointer, and the panel closes (count 0 after 1.5 s), so it never covers the banner at the old spot |
| REQ-7 / W5 / edge 16 | focus | daemon-down | opens with last-known values | pass | re-hover: panel 499,121.4–879,347.4 under the shifted readout, `Added directories · 3` with `feature-x`; header keeps `+3` |
| §6 honesty | focus | daemon-down | daemon-down surfaced prominently | pass | `role=alert` banner, full width at 46–78, `display:block`, `opacity:1` |
| REQ-4 / E4 | focus | data, after restart | `+N` and branches come back | pass | `+3` after `daemon.restart()` and reload; the panel carries `feature-x` again; wire branches `main`, `feature-x`, `null` |
| REQ-9 | focus | data | hover delay = group popover's | pass | real pointer move to `mouseenter`, then tooltip append: 353.4 ms (`POPOVER_DELAY_MS` 350) |
| REQ-5 (cycle 1 Major 1) | focus | data, 32 added checkouts, 5 s poll | launch branch refreshes within a tick; every added dir read | pass | all 32 read 1.9 s after the post; launch `checkout -b` reached the wire in 3963–4988 ms and the header 6 ms later; the last dir's new branch arrived in 4.9 s |
| REQ-5 (cycle 1 Major 1) | focus | data, 64 added checkouts | same | pass | all 64 read in 1.9 s; launch branch 5975 ms (one 5 s tick plus the read); last dir 4.96 s |
| REQ-5 (cycle 1 Major 1) | focus | data, 200 added checkouts | same | pass | all 200 read in 3.9 s; launch branch 4939 ms; the 200th dir's new branch 4.95 s |
| REQ-5 (correctness Major 1 of cycle 1) | focus | data, added subdir of an ordinary checkout, a linked worktree | worktree flag on the wire and in the panel | pass | `…/pkg` → `{name: muster-e2e-loc-ptkvVm, branch: main, isWorktree: false}`; `wt1` → `isWorktree: true`; panel rows `muster-e2e-loc-ptkvVm · main`, `wt1 · worktree-wt1` |
| REQ-5a | focus | data | a non-git dir shows folder + path | pass | `muster-e2e-plain-8FfEAk` over its path, wire `repo: null` |
| REQ-7 / edge 15 (amended) | focus | data, 15 dirs (800 px tall) | flips to the top, every row inside the viewport | pass | panel 8–726, 16 rows, last row bottom 719 |
| REQ-7 / edge 15 (amended) | focus | data, 22 dirs | every row listed, rows past the viewport are the recorded limit | pass (recorded limit) | panel 8–1013, 23 `.dr`, last row bottom 1006 > 800, as `kb:adr/focus-location-panel-lists-every-row` records |
| REQ-8 | rail | data (+3) | no suffix, hover unchanged | pass | `.r2` `muster-e2e-loc-9RMqFP /main`, `title` `muster-e2e-loc-9RMqFP / main`, 0 `.plus` |
| REQ-8 | tiles | data (+3) | no suffix, hover unchanged, no panel | pass | `.wh` `… / main`, `title` launch line + path, 0 `.plus`; hovering `.wh` for 800 ms opens no tooltip |
| REQ-7 | focus → tiles | panel open | the panel does not survive a view switch | pass | Cmd+Backslash with the panel open: tooltip count 0 |
| groups popover (shared `hovertip`) | rail | data (group of 2) | delay, visible, placement, identity, close paths unchanged | pass | delay 354.7 ms; `block`/`visible`/`1`/`pointer-events:none`, `role=tooltip`, parent `body`; box 8,152–228,236 under the header 114–148; same node after 1.3 s; pointerdown closes (count 0) |
| groups popover (shared `hovertip`) | rail | data | keyboard focus opens, keeps focus, blur closes | pass | Tab to the caret: focused and count 1; still focused after 1.3 s; Tab away: count 0 |
| REQ-8 | pop-out | any | unchanged | N/A — `/doc.html` hosts the docs reader, no session header | |
| REQ-6/7 | tiles | any | header suffix / panel | N/A — plan: the tile header does not change | |
| Hidden | focus | all | `[hidden]` elements computed `display:none` | N/A — no element this plan adds is toggled by `hidden` | |
| §6 honesty | focus | no data | no suffix is not unknown data drawn as zero | pass | plan States: `[]` means nothing known added; no gauge or count is drawn |
| §7 terminal | all | all | one live client, geometry, scrollback, pane styling | N/A — the plan touches no terminal surface | |

## Issues

### Critical

(none)

### Major

(none)

### Minor

(none)

### Notes
1. **[note]** Cycle 1 browser Major 1 is closed. With 32, 64 and 200 added checkouts, the launch directory's branch reached the wire and the header within one 5 s poll tick plus the read (4.0–6.0 s). Every added directory got its reading (200 in 3.9 s). The last directory's branch change arrived within one tick.
2. **[note]** Cycle 1 browser Minor 1 is closed on every path I could reach with the mouse at rest: an added directory's branch, the launch branch, a shorter list and the session ending. A keyboard focus change closes the panel rather than rebuilding it for the new session. That is acceptable and shows no stale content.
3. **[note]** For review-work: cycle 1 Note 2's naming split remains, and it is by contract. A launch directory that is a subdirectory reads `sub0` in the Location row and the header (the session's `repo.name`). An added subdirectory reads its checkout's top level (`muster-e2e-loc-ptkvVm · main`), as the contract's "name = basename of that directory's checkout top level" says. The worktree flag is now correct (`false`).
4. **[note]** Light and dark were not re-measured this cycle, because `web/src/style.css` has no change since cycle 1 (`git diff 7a4e67ea..HEAD --stat` does not list it). Contrast is gate `07-contrast` (green).
5. **[note]** Keyboard access to the location panel was not measured. The plan puts it out of scope (mouse only).
6. **[note]** §7 terminal rules were not measured. This plan changes no terminal surface, sizing or client path.

## Maintainability review

# Maintainability review: See added directories

**Plan**: see-added-dirs
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 17205 words (budget 30000)
**Scope**: 33 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. This is a full cycle, because cycle 1 had Majors open. The 18 files the fix wave touched (`git diff 7a4e67ea..HEAD`) were read in full. The other 15 were re-checked against their cycle-1 rows and are unchanged since then.

## Prior cycle's issues

| Cycle-1 issue | Fix commit | Verified how |
|---|---|---|
| Major 1, second hover controller | 4bca4ec0 | `render/hovertip.ts` `createHoverTip<M>(build)` now owns the timer, the open panel, `close` and the three pointer listeners. `grouppopover.ts` and `locationpanel.ts` are both `createHoverTip(buildPanel)`. The group popover keeps its focus/blur path in its own `attach`, and its exported `attach`/`close`/`POPOVER_DELAY_MS` are unchanged. `rg -n 'mouseenter' web/src --glob '!*.test.ts'` finds the lifecycle only in `hovertip.ts`, plus `cardtip.ts`, which has its own different per-card lifecycle (stated in the design line, and it holds) |
| Major 2, `parseAddedDirs` loop | 4bca4ec0 | `protocol/session.ts:385` is `parseListOf(rawAddedDirs, parseClaudeLocation)`. `rg -n 'Array.isArray' web/src/protocol --glob '!*.test.ts'` finds only `decode.ts` |
| Major 3, `writeText`/`setText` | 4bca4ec0 | there is one `setText` in `web/src/dom.ts:42`, and `render/context.ts` and `render/repolines.ts` both import it. Both private copies are gone |
| Minor 1, folder rule in three places | 4bca4ec0 | `folderName` (`sessions/card.ts:180`) is the one repo-name-else-basename rule, and `sessions/locationpanel.ts:18` calls it. `partsOf` takes `slash`, and `rg -n 'replace\(/ ' web/src/sessions/card.ts` finds nothing |
| Minor 2, `ResolvePath` home | 747e8d74 | `ResolvePath` is at `internal/session/location.go:41` beside `Elsewhere`, and `addeddirs.go` holds only added-directory logic |
| Minor 3 + 4, callback name | 747e8d74, 9f4adcbd | the callback is `Config.OnRepoPollNeeded` / `Manager.onRepoPollNeeded` (`manager.go:96,121`), wired at `server.go:198`. The tests use the new name, since `rg -n OnClaudeDirChange internal` finds nothing |
| Minor 5, three funlen hits | 747e8d74 | the Decisions `size:` line gives a reason, and the code bears it out (see Notes 4) |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/status.go | `statusPayload`/`StatusUpdate` siblings `Cwd`, `Effort` | covered (REQ-1 line) | none | pass |
| internal/gitutil/gitutil.go | its own `isRepo`/`branch`/`topLevel` runners; `server/reporefresh.go` `topLevel`; `session/location.go` `ResolvePath` | no line for `resolveFrom` | none | Minor 1 |
| internal/server/reporefresh.go | sessionwire.go, usagepoll.go, launchermodels.go (`verdicts`) | yes (added read in `readRepoState`, slot pool) | none | pass (Note 2) |
| internal/server/server.go | n/a (one-line rename at the registration) | yes (rename) | `New` 52 > 40, predates this branch; the branch only renames one key | pass |
| internal/server/sessionwire.go | reporefresh.go, server.go | covered (reuses `toWireLocation`) | funlen `toWireSession` 61, reason holds | pass |
| internal/session/actions.go | location.go (`clearClaudeLocation`) | yes (writers line) | none | pass |
| internal/session/addeddirs.go | location.go, effort.go, status.go | yes | none | pass |
| internal/session/apply.go | status.go, manager.go (`nudgeRepoPoll`) | yes | none | pass |
| internal/session/liveness.go | location.go | yes | none | pass |
| internal/session/location.go | addeddirs.go, effort.go | yes (`ResolvePath` beside `Elsewhere`) | none | pass |
| internal/session/manager.go | apply.go, server/server.go | yes (rename) | filelen 622, reason holds | pass |
| internal/session/repo.go | location.go, row.go, writeorder.go | yes | none | pass |
| internal/session/row.go | its own `xFromRow`/`xToRow` pairs | covered (store line) | none | pass |
| internal/session/session.go | location.go (`ClaudeLocation` field) | yes (guard `Manager.mu`, writers named) | none | pass |
| internal/session/status.go | location.go `adoptClaudeDir`, effort.go | yes | none | pass |
| internal/session/writeorder.go | `restoreIfUnchanged` siblings | inline compare is forced (a slice is not `comparable`) | none | pass |
| internal/store/migrations/0017_added_dirs.sql | 0015, 0016 | n/a | none | pass |
| internal/store/session.go | group.go (JSON kv blob), `decodeRowTime` | yes | filelen 548, funlen `UpdateSession` 69, `scanSession` 68, reasons hold | pass |
| web/src/dom.ts | `requireElement`, `checkRadioValue` | covered (fix-wave table) | none | pass |
| web/src/features/focus.ts | rename.ts, launch.ts (same focused-session lookup) | yes (panel state owned by the hover-tip instance) | none | pass |
| web/src/protocol/session.ts | decode.ts, usage.ts, groups.ts | yes (`AddedDirectory`) | none | pass |
| web/src/render/CLAUDE.md | n/a | n/a | n/a | pass |
| web/src/render/cardtip.ts | hovertip.ts | covered | none | pass |
| web/src/render/context.ts | repolines.ts, dom.ts | covered | none | pass |
| web/src/render/grouppopover.ts | hovertip.ts, locationpanel.ts, railsections.ts | yes | none | pass (Note 1) |
| web/src/render/hovertip.ts | grouppopover.ts, cardtip.ts, anchored.ts, menu.ts | yes (shape, `refresh` key, state owner) | none | pass |
| web/src/render/locationpanel.ts | grouppopover.ts, hovertip.ts | yes | none | pass |
| web/src/render/mainhead.ts | repolines.ts, context.ts | covered | none | pass |
| web/src/render/repolines.ts | context.ts, mainhead.ts, dom.ts | covered (render-tick reuse line) | none | pass |
| web/src/sessions/card.ts | sections.ts, paths.ts, locationpanel.ts | yes (`folderName`) | filelen 501, reason holds | pass |
| web/src/sessions/locationpanel.ts | sections.ts (`popoverModel`), card.ts | yes | none | pass |
| web/src/sessions/testfixtures.ts | n/a (fixture default) | n/a | none | pass |
| web/src/style.css | `.pop .pr`/`.pop .pt` | covered | n/a | pass |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[daemon-impl]** The new `gitutil.resolveFrom` (`internal/gitutil/gitutil.go:104-113`) repeats the resolve-else-clean rule that `session.ResolvePath` (`internal/session/location.go:41-46`) already owns, and its `design:` line says nothing about it. Cites docs/conventions.md § Design: "Reuse before add … `rg` for one that already does it and paste the grep in Decisions", and "Match the siblings … or says in Decisions why it diverges". The two implementations:
   ```
   $ rg -n 'resolveFrom|ResolvePath\(|func resolveTranscriptDir' internal --glob '!*_test.go'
   internal/session/location.go:41:func ResolvePath(path string) string {
   internal/gitutil/gitutil.go:104:func resolveFrom(dir, path string) string {
   internal/server/reporefresh.go:200:	resolved := session.ResolvePath(*top)
   internal/session/addeddirs.go:35:		dir := ResolvePath(entry)
   internal/claudecode/launchtranscripts.go:54:func resolveTranscriptDir(dir string) string {
   ```
   `resolveFrom` joins a relative path to `dir` and then runs `EvalSymlinks`, falling back to `Clean`. That is `normalizeAddedDirs`'s join (`addeddirs.go:32-35`) followed by `ResolvePath`. It also breaks the shape gitutil already has. Until now gitutil returned what git prints, and the caller resolved it: `server/reporefresh.go:196-201` `topLevel` is "gitutil.TopLevel with the answer resolved the same way as the directories it is compared against", through `session.ResolvePath`. `isWorktree` now resolves inside the adapter with its own copy. There is a reason that could hold. `IsWorktree` returns a bool, so the caller cannot resolve the two paths itself, and gitutil, a leaf adapter in `kb:diagram/daemon-components`, cannot import `session`. But that reason is not written down, and the cycle-1 fix wave's Decisions list no `rg` for this helper. A fix must make one of these true. (a) `## Decisions` has a `design:` line naming `resolveFrom`, the existing rule it repeats and why gitutil keeps its own copy, and that reason has to hold. (b) The resolve-else-clean rule has one implementation that both the domain and gitutil call, and no adapter imports `internal/session`.

### Notes

1. **[note]** `grouppopover.ts:14` still re-exports `POPOVER_DELAY_MS` from `hovertip.ts`, which keeps its exported API unchanged as cycle 1 asked. Its only remaining importer is a test, `web/src/render/locationpanel.test.ts:3`, while `cardtip.ts` and `hovertip.test.ts` import the constant from its owner. A later tidy could repoint that test and drop the re-export. No change requested here.
2. **[note]** The Decisions say `readAddedRepos`'s bounded fan-out (a buffered-channel slot pool plus `sync.WaitGroup`, `reporefresh.go:154-191`) works "like `launchermodels.go`". That is only partly true: `launchermodels.go:143-155` `verdicts` starts one goroutine per model with no slot pool. The slot pool is idiomatic and the `rg` for errgroup holds. Each worker writes only `readings[i]` and the read happens after `wg.Wait()`, so the readings are not shared state (question 3). Go 1.27 loop variables are per iteration, and the gates' `go test -race -count=1 ./...` is green.
3. **[note]** In `readRepoState` (`reporefresh.go:113-128`), `isDir(t.Directory)` is checked twice: before the added read (with `launchCtx.Err()`) and again in the return, together with the parent `ctx.Err()`. The second check revalidates after the added read, per kb:lesson/off-lock-reading-revalidated-at-apply. It reads as intentional, so it is not filed.
4. **[note]** The size reasons hold. `toWireSession` (61), `UpdateSession` (69) and `scanSession` (68) are flat field-for-field mappings: one struct literal plus nil-guards, one UPDATE with every column, one Scan with every column. None of them has nested branching that interleaves concerns, so a split would only move lines. `manager.go` (622) shrank on this branch. `store/session.go` (548) keeps the column read and write with the row gateway. `sessions/card.ts` is 501 lines, and its reason holds: `sessions/paths.ts:1` declares itself pure path derivation, so `folderName`, a `SessionRepo` rule, does not belong there.
5. **[note]** Shared state is unchanged from cycle 1 Note 2. `Session.AddedDirs` names `Manager.mu` and its writers, and every writer assigns a fresh slice. The new hover-tip `open`/`timer` pair belongs to one `createHoverTip` instance. `focus.ts` calls its `refresh()` only from `renderView`, so no second render pass writes it.
6. **[note]** The `kb:diagram/web-components` counts now match the tree: `render/` "43 modules" against 43 non-test `.ts` files, and `sessions/` "17 modules" against 17 (counting `testfixtures.ts`). That row is review-work's.
7. **[note]** Out of diff: these test funlen hits are in test files and none is a `dupl` line, so they are not filed: `internal/server/reporefresh_test.go:299` (113), `internal/session/addeddirsrepo_test.go:16` (97), `internal/session/repo_test.go:281` (145), `internal/store/session_test.go:181` (113 statements).
