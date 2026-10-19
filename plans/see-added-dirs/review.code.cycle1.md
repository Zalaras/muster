# Correctness review: See added directories

**Plan**: see-added-dirs
**Verdict**: needs-changes
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
