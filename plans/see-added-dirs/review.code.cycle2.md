# Correctness review: See added directories

**Plan**: see-added-dirs
**Verdict**: approved
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
