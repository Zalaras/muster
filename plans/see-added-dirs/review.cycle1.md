# Review: see-added-dirs

**Plan**: see-added-dirs
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: See added directories

**Plan**: see-added-dirs
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 59188 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes: `claudecode.InterpretStatus` reports `workspace.added_dirs` as `*[]string` (nil = absent/null); `session.adoptAddedDirs` replaces the list, reported order, launch dir dropped, deduped | Yes: `TestInterpretStatus_AddedDirs`, `TestNormalizeAddedDirs`, `TestAdoptAddedDirs`, E2E E1/D1/D2 | pass |
| REQ-2 | Yes: `session.ResolvePath` (EvalSymlinks, else Clean) on every entry; a relative entry is joined to `sess.Directory` first; the launch dir is compared after resolving | Yes: `TestResolvePath`, `TestAddedDirsInvariants_LaunchDirectoryNeverListed`, E2E launch-only spellings and the relative/symlink test | pass |
| REQ-3 | Yes: `RecordLaunch`/`RecordResume` call `clearAddedDirs`; `markEnded` (the liveness, Stop and reconcile death path, `reconcile.go:81`) clears it; `adoptAddedDirs` refuses a dead session | Yes: `TestAddedDirsInvariants_EveryDeathFromEveryState` (7 source states x 3 deaths, bystander kept), `TestRecordLaunchAndResume_EmptyAddedDirs`, E2E stop/liveness/reconcile/resume | pass |
| REQ-4 | Yes: `added_dirs` column (0017), paths only, read and written with the row; nothing on the `/clear` path touches the list | Yes: `TestAddedDirs_SurviveADaemonRestart`, `TestAddedDirs_ClearPairInEitherOrder`, `TestRepoPoll_RestartRereadsAddedDirs`, E2E E4 and both `/clear` orders | pass |
| REQ-5 | Partly: name, branch, null for a non-checkout or detached HEAD, last-known reading kept for a missing dir, nudge when the list changes, reading revalidated at apply. **The worktree flag is wrong for a subdirectory of an ordinary checkout** (correctness Major 1) | Partly: the subdirectory case leaves `isWorktree` unasserted on purpose (correctness Major 2) | fail |
| REQ-5a | Yes: the status path lists the entry with `repo` nil and runs no git; the reading arrives on a later upsert | Yes: `TestApplyStatus_AddedDirs` (D15), `TestRepoPoll_AddedDirsGetTheirReading`, E2E E7 | pass |
| REQ-6 | Yes: `renderRepoLines(..., addedCount)` builds `.rf-name` + `.plus`; `.plus` is `flex: none` in `--fg-muted`, the name ellipsizes; at N = 0 the spans are removed (`textContent = folder`) | Yes: `mainhead.test.ts` suffix cases, E2E E1 (computed colour), W4 sweep | pass |
| REQ-7 | Yes: `renderMeta` no longer writes `title`; `render/locationpanel.ts` builds a body-appended `.pop` with `role="tooltip"`, `Location`, launch row, `↳` row while `claudeLocation` is non-null, `Added directories · N` and rows in wire order | Yes: `sessions/locationpanel.test.ts`, `render/locationpanel.test.ts`, E2E E2 and the adapted `card-location.spec.ts` tests | pass |
| REQ-8 | Yes: rail and tile callers of `renderRepoLines` pass no count; `locationHover` kept for the tile `.wh` | Yes: E1 asserts the rail `.r2`/folder and tile `.wh` text and title unchanged; `card.test.ts` | pass |
| REQ-9 | Yes: `POPOVER_DELAY_MS` imported from `grouppopover.ts`; `pointer-events: none` from the shared `.pop` rule; appended to `document.body` | Yes: unit (350 ms delay), E2E (pointer-events, parent is body) | pass |
| INV-1 / INV-2 / INV-3 | Yes | Yes (see REQ-3, REQ-2, REQ-6 rows) | pass |
| DIAG | `kb:diagram/store-schema` (updated: 0017 line and ranges, true), `kb:diagram/daemon-components` (no new package edge, true), `kb:diagram/web-components` (**stale**: `render/` reads "41 modules", now 42; `sessions/` reads "16 modules", now 17) | — | fail (correctness Major 3) |

## Build & Tests

E2E tests: pass (981, full suite, `make e2e`) · Daemon tests (race): pass (every package ok) · Web tests: pass (2806 in 98 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues, biome clean, e2e-lint clean) · Contrast: pass (54 pairs x 3 themes, 0 failures) · kb check: pass (612 records, 0 problems) — all read from `/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-see-added-dirs-c1b`

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D12 | `make test` | pass (deduped to `go test -race -count=1 ./...`, 02-test.log) |
| D13 | `make lint` | pass (0 issues) |
| D14 | `go build ./...` | pass (01-build.log, empty, exit 0) |
| D11 | `! rg -n '"added_dirs"' cmd/ internal/ --glob '!internal/claudecode/**' --glob '!**/*_test.go'` | pass (18-D11.log empty, exit 0) |
| W6 | `make web-test` | pass (2806 tests) |
| W7 | `make web-build` | pass (`tsc --noEmit && vite build`) |
| W8 | `make web-lint` | pass |
| W9 | `make contrast` | pass |
| E6 | `make e2e` | pass (981 passed, 10.2 m) |
| K1 | `make check-kb` | pass |
| DOC | doc upkeep + Doc Delta vs what shipped | pass: #93 and #101 moved to `docs/history/todo-done.md`; both decisions are `proposed` ADRs with `refs: plan:see-added-dirs` and describe what shipped; no `deviation:` line in either log; every `doc-delta:` line is in `doc-delta.md`; each Doc Delta sentence (card-location `## Added directories`, Focus-header-only closing line, focus `+N` and panel, the replaced hover sentence, `<repo>+N` with no ` /`, nonexistent entry only cleaned) matches the code |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | Neutral tokens only | pass | `style.css` additions use `--fg-muted` (`.plus`, `.lead`), `--fg-dim` (`.b`, `.dp`, `.sub`), `--fg` (`.df`) and `--line` (the `.sub` rule). No state token, no colour literal |
| R2 | Panel matches `final.html` row for row in its six states | pass (structure) | Same markup as the mockup's `row()`/`pop()`: `.ph` Location, `.dr > .df ([.lead ↳] folder [.b · branch]) + .dp path`, `.sub Added directories · N`; the model yields Location-only for no-data and for a dead session (both lists empty by INV), the `↳` row plus the list for the moved state, every row for six entries. Rendered fidelity is review-browser's |
| R3 | No `any` in new web code | pass | grep of the web diff's added lines finds `any` only in English prose (a comment and a test title) |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: the `added_dirs` JSON key is read only in `internal/claudecode/status.go`; the remaining `added_dirs` hits are Muster's own SQL column name in `internal/store` |
| 2 | Terminal-output state parsing | pass: none added |
| 3 | Blocking hook handler | pass: ingest untouched; `ApplyStatus` runs on the worker and does no git (it stats paths for EvalSymlinks) |
| 4 | Bare tmux / resize-pane | pass: no tmux call added; the E2E pane kills go through `daemon.killTmuxWindow` (per-daemon socket) |
| 5 | Payload logging | pass: the only new log line is the store's corrupt-column warning (row id and decode error) |
| 6 | Empty-gauge dishonesty | pass: no gauge; an empty list renders no suffix, which the plan's States section settles as accurate |
| 7 | Identity on `session_id` | pass: the list lives on the Muster session; `/clear` leaves it alone |
| 8 | Settings trespass | pass: none |
| 9 | Real `claude` | pass: none; every test fakes posts or uses scratch git checkouts |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** An added directory that is a subdirectory of an ordinary checkout goes on the wire with `isWorktree: true`. REQ-5 and the contract promise "that directory's checkout's … worktree flag". `readAddedRepos` → `checkoutRepo` → `checkoutState` (`internal/server/launcher.go:369`) → `gitutil.isWorktree` (`internal/gitutil/gitutil.go:90-99`) compares the raw output of `rev-parse --git-dir` and `--git-common-dir`. From a subdirectory those two outputs differ only in spelling. I measured this in a scratch repo (git 2.50.1): at the root both print `.git`; in `r/pkg` they print `/…/r/.git` and `../.git`. So `/add-dir ~/code/infra/docs` and the plan's own relative-entry case (`relative-dir` inside the launch checkout, E2E D4) both report a worktree that does not exist. daemon-tests found the same thing and recorded it in its Notes. The same flaw already reaches `claudeLocation` and a launch directory inside a subdirectory, so the fix should cover the whole category, not just the added-directory caller (kb:lesson/fix-closed-one-cause-of-two). What must become true: a directory inside an ordinary checkout reads `isWorktree: false`, and a directory inside a linked worktree still reads `true`. A fix in `internal/gitutil` lands in the `launch` feature's territory (see Note 5).
2. **[daemon-tests]** `TestReadAddedRepos_SubdirectoryNamesItsCheckoutsTopLevel` (`internal/server/reporefresh_addeddirs_test.go:245-260`) does not assert the worktree flag, on purpose, so nothing pins REQ-5's flag for a subdirectory. What must become true: the test asserts `IsWorktree == false` for a subdirectory of an ordinary checkout and `true` for a subdirectory of a linked worktree. It goes red until Major 1 is fixed.
3. **[orchestrator]** `kb:diagram/web-components` is stale (doc drift). Its `render/` node reads "41 modules" and its `sessions/` node "16 modules". Both counts matched `main`. This branch adds `render/locationpanel.ts` and `sessions/locationpanel.ts`, which makes them 42 and 17. No import edge changes: `render → sessions` and `features → render/sessions` are already drawn. What must become true: the two counts are 42 and 17 in the same branch.

### Minor

None.

### Notes

1. **[note]** The first gate run (`gates-see-added-dirs-c1`) went red on `e2e/rail-layout.spec.ts:81`. This plan did not author that spec, and the test is a Compact-density click timeout. The orchestrator re-ran it green on its own three times and then in the full 981-test sweep. The only change this plan makes on the rail path is in `renderRepoLines`: with a count of 0 it writes `textContent` exactly as before and also calls `classList.remove("has-plus")`. I found no causal link. No flake repair is in the diff, so I ran no soak.
2. **[note]** The new `reporefresh_addeddirs_test.go` reaches real `git` through production `gitutil` with no run-func seam. This matches its sibling `reporefresh_test.go`, which does the same, and the repo poll has no seam to cross. Whether one should exist is review-maintainability's call.
3. **[note]** The `W4` repair, test-specs Repairs row 1, is honest. The sweep now stops at the 600 px floor that every existing header sweep uses (`sweepWidths`). Every check still runs at every width, and `ellipsizedAtNarrowest` is still required at 600 px, so the suffix checks are not vacuous. No assertion was removed or loosened.
4. **[note]** Two fixture shapes are the plan's, not measured: a `workspace` without `added_dirs`, and a relative entry (e2e-specs handoff). Both leave a field out or use the plan's stated shape; neither adds a field Claude Code never sends. daemon-tests also observed that a wrongly typed `added_dirs` (a string, or numbers) decodes as "reported none" and empties the list. Claude Code has never been measured sending that. An `/interface-probe` would settle all three if wanted.
5. **[note]** For the orchestrator, if correctness Major 1 is fixed in `internal/gitutil/gitutil.go`: that file belongs to `launch`, which is in neither **Features** nor **Touches**. The features-scope gate will then need `launch` under **Touches** (precedent kb:adr/process-features-widened-for-a-refactor-call-site).
6. **[note]** `kb:adr/lifecycle-added-dirs-from-status-line-cleared-on-death` names `lifecycle` among its features while `lifecycle` sits under **Touches**. No lifecycle spec sentence changes and no log carries a lifecycle `doc-delta:`, so I am not asking for it to be promoted to Features.

## Browser review

# Browser review: See added directories

**Plan**: see-added-dirs
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 12278 words (budget 30000)
**Rig**: `make web-build build` at 9f60d26b (`v0.22.2-29-g9f60d26b`, 17:42); per-test scratch daemons from `helpers/fixtures.ts` (`repoPoll: "200ms"`), space-bearing data dirs (`…/T/muster e2e-f58d7fd5-*`), a private tmux socket per daemon (torn down by the fixture), stub `claude` `2.0.0-e2e-stub`; headless Chromium driven by a throwaway `web/e2e/zz-review-browser.spec.ts` (deleted); real scratch git checkouts and plain dirs as the added directories.

Gates log `gates-see-added-dirs-c1b`: every line green (`17-e2e` 981 passed; `04-web-build` built). The app I drove is the one that ships.

## Matrix

Hosts: **focus** (`#mainhead`, the only surface that renders `addedDirs`), **tiles** (tile `.thead .wh`), **rail** (card `.r2`). **pop-out** (`/doc.html`) is the docs reader's host and carries no session header: N/A for every row.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-6 / INV-3 | focus | no data | no suffix | pass | `.rf` textContent `muster-e2e-loc-UcDHzE /`, class `rf`, no `span.plus` |
| REQ-6 / INV-3 | focus | data (3 dirs: 2 git, 1 plain) | `+N` = length, last child of `.rf` | pass | `.rf` reads `muster-e2e-loc-UcDHzE+3`; wire `addedDirs.length` 3 (`/api/state`, branches `main`,`feature-x`,`null`) |
| REQ-6 / R1 | focus | data | suffix in `--fg-muted` | pass | computed `rgb(178,182,195)` = `--fg-muted` (instrument); light `rgb(65,69,79)` = token; dark `rgb(193,197,204)` = token |
| REQ-6 | focus | data | visible | pass | `display:block`, `visibility:visible`, `opacity:1`; `elementFromPoint` at its right edge hits the suffix |
| REQ-6 | focus | data | suffix never ellipsized, name gives way first, 1280→600 px in 8 px steps | pass | 60-char folder +1: 86/86 widths suffix inside `.rf` and hit-tested, name ellipsized at 56 of them; at 600 name box 416–459, suffix 459–472.6, `.rf` right 472.6. Same sweep with `+2` and `+12`: 0 failures |
| REQ-6 | focus | data | header fit invariants hold with `+12`, 1280→600 px in 8 px steps | pass | `mainheadFitProblems` empty at all 86 widths |
| REQ-6 | focus | data | suffix keeps its node across a render tick | pass | same `span.plus` node after 1.3 s |
| REQ-6 | focus | data, plain launch dir | `<basename>+N` | pass | `muster-e2e-plain-2INQ2d+1` |
| REQ-6 | focus | moved (↳ shown) | suffix does not change when the ↳ block hides, 1920→1000 px in 40 px steps | pass | ↳ `hidden`/`display` identical with and without `+2` at every width (grid at 1920, none at 1000) |
| REQ-6 / INV-1 | focus | dead | no suffix | pass | after `/end`, settled 1.5 s: `.rf` `muster-e2e-loc-QTbnHn /`, no `.plus` |
| REQ-6 | focus | daemon-down | suffix kept with last snapshot | pass | `+1` still drawn 1.2 s after SIGTERM, hit-tested |
| REQ-4 / E4 | focus | data, after restart | `+N` and branches come back | pass | `+12` after restart + reload; panel rows carry `· main`; 4-dir case: wire repos null at t≈0, all read by t≈1 s |
| REQ-7 / W2 | focus | all states | `.loc` has no `title` | pass | `getAttribute("title")` null in no data, data, dead, daemon-down |
| REQ-7 | focus | no data | panel: Location + launch row only | pass | `LOCATION / muster-e2e-loc-UcDHzE · main / <path>`; no `Added` sub-heading |
| REQ-7 | focus | data | panel content, wire order, plain dir without branch | pass | `ADDED DIRECTORIES · 3`, rows `…LpEou8 · main`, `…I70QLW · feature-x`, `muster-e2e-plain-0YorJU` (no branch), each over its path |
| REQ-7 / W3 | focus | moved | `↳` row while `claudeLocation` non-null, then the added list | pass | `↳muster-e2e-loc-PeytmN · main` row between launch row and `ADDED DIRECTORIES · 2` |
| REQ-7 | focus | dead | panel Location only | pass | settled dead session: panel has no Added section |
| REQ-7 | focus | dead **while the panel is open** | a dead session never shows directories | FAIL | panel kept `ADDED DIRECTORIES · 2` and both rows 1.5 s after the session ended, while the header beside it had already dropped the suffix (Minor 1) |
| REQ-5 / E5 | focus | data, branch changed **while the panel is open** | panel shows the current branch | FAIL | wire `addedDirs[0].repo.branch` `while-open`; panel still read `· main` 1.2 s later (Minor 1) |
| REQ-7 | focus | data | placed under the readout, inside the viewport | pass | readout 499,55–673.4,85.4; panel 499,89.4–879,315.4 in 1280×800; at 600 px: 212–592 inside 600; at 480: 92–472 |
| REQ-7 | focus | data, 2-line paths ×15 (1280×800) / ×13 (720) / ×18 (900) | panel under the readout, not covering it | FAIL | panel flips to top 8: 499,8–879,726 overlaps the readout 55–85.4 and the session name (decision 1) |
| REQ-7 / edge 15 | focus | data, many dirs | every row visible | FAIL | 22 long-path dirs: panel 499,8–879,1281 in an 800 px viewport; 20 short-path dirs: bottom past 800; `pointer-events:none`, `overflow:visible` — rows past the bottom edge cannot be reached (decision 1) |
| REQ-7 | focus | data | rows wrap inside `.pop`'s max width | pass | 51-char unhyphenated folder and a 47-char branch: no child box outside the panel box, no child `scrollWidth > clientWidth` |
| REQ-7 | focus | data | visible | pass | `display:block`, `visibility:visible`, `opacity:1` |
| REQ-7 | focus | data | stays open across a render tick while hovered | pass | same tooltip node after 1.3 s |
| REQ-7 | focus | data | leave closes, pointerdown closes | pass | count 0 after `mouse.down()` on the readout; count 0 after moving to 0,0 |
| REQ-7 | focus | daemon-down | opens with last-known values | pass | banner `musterd unreachable — …` display block, box 0,46–1280,78; panel opened after 352 ms with `ADDED DIRECTORIES · 1` and the last-known rows, below the shifted readout (87–117.4 → panel top 121.4) |
| REQ-7 | focus → tiles | panel open | the panel does not survive a view switch | pass | Cmd+Backslash with the panel open: tooltip count 0 in Tiles |
| REQ-9 | focus | no data / data / daemon-down | hover delay = group popover's | pass | `mouseenter`→tooltip append measured 353 / 353 / 352 ms (`POPOVER_DELAY_MS` 350) |
| REQ-9 | focus | data | `pointer-events:none`, parent is `body`, `role=tooltip` | pass | computed `none`; `parentElement === document.body`; `pop loc-pop` |
| REQ-5 | focus | data, 1–24 dirs | branch reading arrives | pass (slow) | time to every `repo` set: 1 dir 546 ms, 4 dirs 970 ms, 12 dirs 2543 ms, 24 dirs 5707 ms (≈220 ms per directory) |
| REQ-5 / card-location branch | focus | data, 32 dirs | the session's own branch and the added readings refresh | FAIL | after `git checkout -b moved-launch` in the launch repo: wire `repo.branch` and header `.rb` still `main` 25 s later; 0 of 32 added dirs ever read (Major 1) |
| REQ-5a | focus | data | a not-yet-read / non-git dir shows folder + path | pass | plain dir row `muster-e2e-plain-0YorJU` over path, wire `repo:null` |
| REQ-8 | rail | data (+3) | no suffix, hover unchanged | pass | `.r2` text `muster-e2e-loc-UcDHzE /main`, `title` `muster-e2e-loc-UcDHzE / main`, 0 `.plus` |
| REQ-8 | tiles | data (+3) | no suffix, hover unchanged, no panel | pass | `.wh` `muster-e2e-loc-UcDHzE / main`, `title` launch line + path, 0 `.plus`; hovering `.wh` 800 ms opens no tooltip; no visible `.plus` anywhere in Tiles |
| REQ-8 | pop-out | any | unchanged | N/A — `/doc.html` hosts the docs reader, no session header | |
| REQ-6/7 | tiles | any | header suffix / panel | N/A — plan: rail card and tile header do not change | |
| Hidden | focus | all | `[hidden]` elements computed `display:none` | N/A — no element this plan adds is toggled by `hidden` (`.claude-at` pre-existing; measured `display:none` while `hidden`) | |
| §6 honesty | focus | daemon-down | daemon-down surfaced prominently | pass | `role=alert` banner full width at 46–78, visible computed |
| §6 honesty | focus | no data | absence of suffix is not an unknown-drawn-as-zero | pass | plan States: `[]` means nothing known added; no gauge or count drawn |
| §7 terminal | all | all | one live client, geometry, scrollback, pane styling | N/A — plan touches no terminal surface; not measured this cycle | |

## Issues

### Critical

(none)

### Major
1. **[daemon-impl]** With many added directories the repo poll's reading for the whole session is thrown away every tick, so the session's **own** branch stops refreshing. `internal/server/reporefresh.go` `readRepoState` reads every added directory (three git calls each, ≈220 ms per directory measured) inside the per-session `repoReadTimeout` (5 s), and a reading whose context expired is discarded (`ok` false). Measured: with 32 added directories, `git checkout -b moved-launch` in the launch checkout was still `main` on the wire and in the Focus header 25 s later, and none of the 32 directories ever got a `repo`; with 24 the reading only just completed (5.7 s). Because the loop is serial, each such session also holds every other session's refresh back by up to 5 s per tick. A fix must make true: the launch directory's branch, worktree flag and `claudeLocation` keep refreshing within one tick however many directories are added, and every added directory eventually gets its reading (or keeps its last-known one), never a permanent null. No spec covers a list this long; the regression test belongs with the fix wave's test agent.

### Minor
1. **[web-impl]** The open panel is a snapshot and never follows the session. With the mouse resting on the readout: (a) the session ended — the header dropped `+2`, but the panel kept `Added directories · 2` and both rows 1.5 s later, so a dead session shows directories (REQ-3, INV-1); (b) an added directory's branch changed to `while-open` on the wire — the panel kept `· main` 1.2 s later. The developer can end a session from the keyboard (`/exit` in the terminal) while the mouse sits on the header, so (a) is reachable. `web/src/render/locationpanel.ts` (built once in `show`), `web/src/features/focus.ts` (closes only on `focusChanged`). A fix must make true: while open, the panel shows what the focused session's latest upsert says (rebuilt, or closed on change), and never an Added section on a dead session.

### Decisions
1. **[orchestrator:decision]** How the location panel behaves when its rows do not fit under the readout. Measured at 1280 px wide with 83-character paths (each path wraps to two lines): the panel no longer fits below the readout at 15 directories (800 px tall), 13 (720) and 18 (900). `placeAnchored` then moves it to top 8, where it covers the readout and the session name. At 20+ directories it runs past the bottom of the viewport: 22 long paths give 8–1281 in an 800 px viewport. Because the panel is `pointer-events: none` with no overflow rule, the rows past the edge cannot be reached. Edge case 15 says "the panel lists all", and with this many rows that cannot be done inside the viewport without a scroll the panel cannot take.
   - **Option A — bound the panel:** cap the rows at what fits below the readout and end with a stated `+K more` line, so the panel never covers the readout or leaves the viewport. Cost: a new visible line and a plan amendment to edge case 15. It also means the full list is not shown anywhere.
   - **Option B — accept as is:** keep listing every row and record that past about 13–20 directories (depending on viewport height) the panel covers the header and drops rows off-screen. Cost: none now. The panel is wrong only at counts the developer is unlikely to reach.

### Notes
1. **[note]** Below the 600 px header floor the panel follows the header out of the viewport: at 360 px it spans 8–379.4 (the header itself already overflows at that width with no suffix, as the impl log measured). This is outside the supported range, so no change is asked.
2. **[note]** For review-work, wire values seen in passing that the panel does not show: an added directory that is a plain subdirectory of a checkout reads `isWorktree: true` (`…/muster-e2e-loc-xcJOjc/sub0` → `{name: "muster-e2e-loc-xcJOjc", branch: "main", isWorktree: true}`). The launch-directory reading for the same subdirectory names it `sub0` (`{name: "sub0", isWorktree: true}`), while the added-directory row names the checkout's top level. So the same directory reads as `sub0 · main` in the Location row and as `muster-e2e-loc-xcJOjc · main` in the Added list.
3. **[note]** §7 terminal rules were not measured. This plan changes no terminal surface, sizing or client path.
4. **[note]** Keyboard access to the panel was not measured, because the plan puts it out of scope (mouse only).
5. **[note]** Light and dark were measured by setting `data-theme` on the root (the theme control was not driven). They confirm only that the suffix resolves to each theme's `--fg-muted`. Contrast is gate `07-contrast` (green).
6. **[note]** `git status` shows `docs/diagrams/web-components.md` modified (module counts 41→42, 16→17, mtime 17:49). This review did not make that change. It is not part of this review's output.

## Maintainability review

# Maintainability review: See added directories

**Plan**: see-added-dirs
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 16269 words (budget 30000)
**Scope**: 24 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/status.go | (package exemplar itself), its `statusPayload`/`StatusUpdate` siblings `Cwd`, `Effort` | covered by REQ-1 line | none | pass |
| internal/server/reporefresh.go | sessionwire.go, server.go | yes (`checkoutRepo`, `RepoState.AddedRepos`, `ResolvePath` move) | none | pass |
| internal/server/sessionwire.go | reporefresh.go, server.go | covered (reuses `toWireLocation`) | funlen `toWireSession` 61 > 60, newly over, no reason | Minor 5 |
| internal/session/actions.go | location.go (`clearClaudeLocation`) | yes (writers line) | none | pass |
| internal/session/addeddirs.go | location.go, effort.go, status.go | yes | none | Minor 2 |
| internal/session/apply.go | status.go, manager.go (`nudgeRepoPoll`) | yes (nudge reuse) | none | Minor 3 |
| internal/session/liveness.go | location.go | yes (writers line) | none | pass |
| internal/session/manager.go | apply.go, server/server.go | yes (callback reuse, rename deferred) | filelen 625, reason holds | Minor 3 |
| internal/session/repo.go | location.go, row.go, writeorder.go | yes | none | pass |
| internal/session/row.go | its own `xFromRow`/`xToRow` pairs | covered (store line) | none | pass |
| internal/session/session.go | location.go (`ClaudeLocation` field) | yes (guard `Manager.mu`, writers named) | none | pass |
| internal/session/status.go | location.go `adoptClaudeDir`, effort.go | yes | none | pass |
| internal/session/writeorder.go | `restoreIfUnchanged` siblings in the same func | no line; inline compare is forced (a slice is not `comparable`) | none | pass |
| internal/store/migrations/0017_added_dirs.sql | 0015, 0016 | n/a | none | pass |
| internal/store/session.go | group.go (JSON kv blob with warn-on-corrupt), `decodeRowTime` | yes | filelen 548, reason holds; funlen `UpdateSession` 69 (was 64), `scanSession` 68 (was 66), no reason | Minor 5 |
| web/src/features/focus.ts | rename.ts, launch.ts (same focused-session lookup) | covered (panel owned by focus) | none | pass |
| web/src/protocol/session.ts | decode.ts, usage.ts, groups.ts | yes (`AddedDirectory`) | none | Major 2 |
| web/src/render/locationpanel.ts | grouppopover.ts, cardtip.ts, anchored.ts | yes (duplication acknowledged) | none | Major 1 |
| web/src/render/mainhead.ts | repolines.ts, context.ts | covered | none | pass |
| web/src/render/repolines.ts | context.ts, mainhead.ts, selectbar.ts | covered (render-tick reuse line) | none | Major 3 |
| web/src/sessions/card.ts | sections.ts, paths.ts | covered (model moved out of card.ts) | at threshold 494 lines, none hit | Minor 1 |
| web/src/sessions/locationpanel.ts | sections.ts (`popoverModel`), card.ts | yes | none | Minor 1 |
| web/src/sessions/testfixtures.ts | n/a (fixture default) | n/a | none | pass |
| web/src/style.css | `.pop .pr`/`.pop .pt` group popover rules | covered | n/a | pass |

## Issues

### Critical

None.

### Major

1. **[web-impl]** `createLocationPanel` is a second copy of `createGroupPopover`'s hover controller — `web/src/render/locationpanel.ts:53-89` against `web/src/render/grouppopover.ts:77-117`. Cites docs/conventions.md § Design, "Reuse before add": "A second implementation of an existing idea is a defect even when both work." The two are the same line for line: the `timer`/`panel` pair, `close()` (clearTimeout, `panel?.remove()`, null both), `show()` (close, build, `document.body.append`, `placeAnchored`), `onEnter` (close, then `setTimeout(show, POPOVER_DELAY_MS)`), and the add/remove of `mouseenter`/`mouseleave`/`pointerdown`. The only differences are that the group popover also opens on a keyboard focus, and the location panel skips opening when the model is null. The web `design:` line says this was copied on purpose ("the timer/close logic is therefore duplicated once"). The reason it gives is that `attach` is typed to `PopoverModel`. That is a type parameter, not a different idea, so it does not justify a copy. Also, `locationpanel.ts:3` imports `POPOVER_DELAY_MS` from the group feature's module, which shows the delay already has one owner the panel depends on. A fix must make this true: the delayed-hover lifecycle of a body-appended tooltip (timer, open panel, close, the three pointer listeners) has one implementation, and both the group popover and the location panel use it. The group popover keeps its focus path and `grouppopover.ts`'s exported API and behaviour stay unchanged.

2. **[web-impl]** `parseAddedDirs` re-implements `parseListOf` — `web/src/protocol/session.ts:241-250` against `web/src/protocol/decode.ts:43-52`. Cites § Design, "Reuse before add". decode.ts's header says it "owns how … 'an array of these' … [is] recognised" and that every protocol module imports from it. The new function is the same loop, the same `Array.isArray` guard and the same reject-the-whole-array-on-one-bad-element rule:
   ```
   $ rg -n 'Array.isArray' web/src/protocol --glob '!*.test.ts'
   web/src/protocol/session.ts:242:  if (!Array.isArray(value)) return null;
   web/src/protocol/decode.ts:8:  return typeof value === "object" && value !== null && !Array.isArray(value);
   web/src/protocol/decode.ts:44:  if (!Array.isArray(value)) return null;
   ```
   `usage.ts`, `groups.ts`, `messages.ts` and `batch.ts` all import `parseListOf`. A fix must make this true: `addedDirs` is decoded through `parseListOf` with the existing `parseClaudeLocation`, and `protocol/` holds no second array-decode loop.

3. **[web-impl]** `writeText` in `web/src/render/repolines.ts:8-10` duplicates `setText` in `web/src/render/context.ts:85-87`. Both are `if (el.textContent !== text) el.textContent = text;`. Cites § Design, "Reuse before add".
   ```
   $ rg -n 'export function (set|write)Text|function (setText|writeText|setIfChanged)' web/src
   web/src/render/repolines.ts:8:function writeText(el: HTMLElement, text: string): void {
   web/src/render/context.ts:85:function setText(el: HTMLElement, text: string): void {
   ```
   A fix must make this true: one named write-if-changed helper exists, and both render modules call it. Do not add a third private copy.

### Minor

1. **[web-impl]** The folder label of a repo readout is now decided in three places. Cites § Design, "One owner per concept … Two places that must agree will not." `partsOf` (`web/src/sessions/card.ts:183-185`) composes `` `${repo.name} /` `` or the basename. `mainheadMeta` (`card.ts:248`) then strips that slash again with `repo.folder.replace(/ \/$/, "")`. `rowOf` (`web/src/sessions/locationpanel.ts:18`) decides "repo name, else basename" a second time, with its own null-branch rule. Checked with `rg -n 'basename\((session\.)?directory\)|\.name : basename' web/src` (only card.ts:183 and locationpanel.ts:18). A fix must make two things true: the repo-name-else-basename rule has one home, and the folder text is composed with or without the ` /` from the start, never composed and then edited back with a regex.

2. **[daemon-impl]** `session.ResolvePath` is in `internal/session/addeddirs.go:8`, but its callers and the stated owner are elsewhere. Its non-test callers include `deriveLocation` and `topLevel` (`internal/server/reporefresh.go:124,170`), which serve `claudeLocation`, not added directories. The daemon `design:` line puts it in `session` because that package "already owns `Elsewhere`, the symlink-resolved comparison rule". `Elsewhere` is in `location.go:31`, beside `Location`. The siblings put one concept per file (`location.go`, `effort.go`, `addeddirs.go`), so a reader looking for the path rule `Elsewhere` depends on would not look in the added-directories file. A fix must make this true: `ResolvePath` lives in the file its `design:` line names as its owner (with `Elsewhere`), and `addeddirs.go` holds only added-directory logic.

3. **[daemon-impl]** `Config.OnClaudeDirChange` and `Manager.onClaudeDirChange` (`internal/session/manager.go:96,122`; wired at `internal/server/server.go:198`) now also fire when the added-directory list changes (`internal/session/apply.go:196`, `nudgeRepoPoll(dirChanged || addedChanged)`). The name now states a narrower trigger than the code has. The `design:` line says so itself ("The name is now slightly narrow") and defers the rename. The reason it gives is the number of files the rename touches, which is not a reason the name is right. Cites § Design, "Match the siblings … naming". A fix must make this true: the callback's name describes what fires it, which is the repo poll being needed because the claude directory or the added-directory list changed. The `nudgeRepoPoll` name already does.

4. **[daemon-tests]** Follows maintainability Minor 3. `internal/session/repo_test.go:36` and `internal/server/reporefresh_test.go:77` set `OnClaudeDirChange`. They must use the renamed field in the same wave, so the tree compiles once Minor 3 lands.

5. **[daemon-impl]** Three funlen warnings on touched functions have no reason in `## Decisions`. Cites kb:adr/process-size-linters-warn-never-fail and § Design, "Size is read, not obeyed … Exceeding one is fine with a reason in Decisions". `toWireSession` (`internal/server/sessionwire.go:149`) goes from 60 to 61 on this branch's `AddedDirs:` line, so the warning is new. `UpdateSession` (`internal/store/session.go:296`, 64 to 69) and `scanSession` (`:466`, 66 to 68) grew past warnings they already had. The size `design:` line only covers the two file-length hits. A fix must make this true: each of the three has a reason in Decisions that the code bears out, or a real restructure. Do not split a function only to silence the warning.

### Notes

1. **[note]** `kb:diagram/web-components` gives `render/` as "41 modules". With `render/locationpanel.ts` added there are now 42 non-test modules (`ls web/src/render/*.ts | grep -v test | wc -l` gives 42). That is review-work's DIAG row.
2. **[note]** Shared state, question 3. `Session.AddedDirs` names its guard (`Manager.mu`) and its writers (`adoptAddedDirs`, `SetRepoState`, the three `clearAddedDirs` callers, and `restoreChangedFields`). Every writer assigns a fresh slice: `normalizeAddedDirs` and `withAddedRepos` both allocate, and nothing writes an element in place. So a `Clone()` that shares the backing array with a broadcast snapshot is safe. `RepoTargets` copies the paths under the lock. `readAddedRepos` reads off-lock and checks `isDir` again after the git reads (kb:lesson/off-lock-reading-revalidated-at-apply). `SetRepoState` applies a reading only to entries listed at apply time. The gates' `go test -race -count=1 ./...` is green. I found no interleaving that it would miss.
3. **[note]** `adoptAddedDirs` runs `EvalSymlinks` stats under `Manager.mu` on every status post that carries the key. The stated reason holds: `persistWholeRowLocked` already does SQLite I/O under that lock, and the stats run no git.
4. **[note]** `AddedDirectory` (`web/src/protocol/session.ts:44`) has the same shape as `ClaudeLocation`, while the Go side uses one `session.Location` and one `sessionWireLocation` for both. The `design:` line gives the naming reason. A shared name for `{directory, repo}` would mirror the daemon, but this is taste.
5. **[note]** Two display strings are composed in render builders: `+${addedCount}` (`web/src/render/repolines.ts:29`) and `` ` · ${row.branch}` `` (`web/src/render/locationpanel.ts:25`). render/CLAUDE.md says every displayed string comes from a view-model. The siblings do the same thing, for example `render/launch.ts:253` (`` ` · ${branch}` ``) and `render/context.ts:28`, so this matches local practice.
6. **[note]** The new panel CSS (`.pop .dr`, `.pop .sub`, `.pop .dr .df .b`, `.lead`) is scoped under the shared `.pop` class, not `.loc-pop`, which matches the group popover's `.pop .pr`/`.pop .pt`. A later `.sub` or `.b` inside the group popover would pick these rules up.
7. **[note]** `writeorder.go:222-224` restores `AddedDirs` with an inline `addedDirsEqual`, unlike its `restoreIfUnchanged` siblings. This is forced, because `restoreIfUnchanged` needs `comparable` and a slice is not.
8. **[note]** There are two test funlen hits, `internal/session/addeddirsrepo_test.go:16` (97 > 60) and `internal/store/session_test.go:181` (113 statements). Both are test files outside this diff, and neither is a `dupl` line, so they are not filed.
9. **[note]** The file-length warnings on `internal/session/manager.go` (625, which this branch only touched by removing lines) and `internal/store/session.go` (548) have a reason that holds: the column read and write belong with the row gateway.
