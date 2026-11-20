# Correctness review: diff-viewer

**Plan**: diff-viewer
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 68239 words (budget 30000)

Delta re-review: the change under review is `git diff febf5415..HEAD`. It contains the merge of `main` (`8f4ae1c9`) and the fix wave `9b5a1b9d`, `195b94ea`, `ad764ebd`, `27326de5`, `54c3ba84`, `9ee6aa9a`. Main's own Terminals code (`fc7599f4` and the commits after it) was reviewed on main and is not re-reviewed here. In scope: the merge's conflict resolutions (`git show --remerge-diff 8f4ae1c9`), the regenerated diff fixtures and the fix commits. Every gate result is read from `gates-diff-viewer-c3` (0 failed lines); this reviewer re-ran nothing.

## Requirements

Only rows whose code or evidence changed this cycle are listed. REQ-1 to REQ-28 otherwise stand as in cycles 1 and 2, and their tests are green in this gate run.

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-10 the viewer selects no segment; choosing a surface closes it (now including main's Terminals menu) | Yes. `web/src/features/focus.ts`: `onSelect` still calls `deps.diff.close(id)` before `select`, because a click on the already-selected segment emits nothing. The new `app.on("surfaceSwitched", (id) => deps.diff.close(id))` closes the viewer on a menu pick and on New terminal, since both go through `showAndSelect`. `close` returns early when the viewer is not open (`features/diff.ts:73–75`), so closing twice is harmless | R5 in `web/render/diff.spec.ts`: four `.surfseg` buttons share the unselected ground; opening the menu and pressing Escape leaves the viewer open; New terminal closes it; picking `build` (from the new `diff-terminals` scenario) closes it and shows `shell` pressed with `#sizenote` back; rename and close leave it open; the `shell` count stays at opacity 1. Render 564 passed (`09-render-test.log`) | pass |
| REQ-15 / REQ-28 a tick survives a load that overlaps it | Yes. `applyTicks` bumps `s.tickWrites` (`diffreviewui.ts`). `load` snapshots the count before `flushPending`, and `applyReview` keeps the local tick set when the count has moved (`diffviewer.ts:118–126, 139`). `applyTicks` and `applyReview` are the only writers of `s.ticks` | R18 "a tick made after a Refresh's review read…": it holds the diff GET, ticks, waits for the 204 tick POST, then releases. Progress must read 3/5 and still read 3/5 after a 500 ms settle. Without the guard, the recorded review (2 ticks) would replace the set and show 2/5, so the test can fail. web-impl's guard-off run of the same journey showed `0 / 3` | pass |
| REQ-25 reading never writes the repository | Yes. After `195b94ea`, `GIT_INDEX_FILE` reaches `Exec` as an explicit `env` argument instead of through ctx (`tracked.go:89–101`, `gitutil.go:173–179`). `cmd.Env` is still environ + `GIT_OPTIONAL_LOCKS=0` + env. `rg 'WithEnv\|envKey' internal` finds only a test name and a test comment | `TestRead_NeverWritesTheRepository` is unchanged (3 rows). New: `TestReader_RunSeam/only the two tracked diffs carry env…` checks that both `git diff` calls carry exactly one absolute `GIT_INDEX_FILE` that exists while git runs and lies outside the git dir and the repo, and that every other call carries no env. Green in `02-test.log` (`internal/gitdiff`, `internal/gitutil`) and in `24-D4.log` | pass |
| DIAG | `kb:diagram/daemon-components` (gitutil is still "the one lock-free git runner"; `gitdiff → gitutil` holds), `kb:diagram/one-launch-end-to-end` (launch's gitutil calls have the same signatures; only the run seam gained `env`), `kb:diagram/domain-model` (merge resolution keeps "(not the diff viewer)" plus main's "one Terminal at a time"), `kb:diagram/web-components` (named by `kb for web/src/features/focus.ts` and `diffviewer.ts`) | — | **fail**: web-components' module counts (Major 2) |

## Build & Tests

E2E tests: pass (364, scoped to 31 files including `terminals.spec.ts`, `shell.spec.ts`, `shell-activity.spec.ts`, `22-e2e.log`) · Render tests: pass (564, `09-render-test.log`) · Daemon tests (race): pass (`24-D4.log`) · Web tests: pass (3475 in 121 files, `05-web-test.log`) · Daemon build: pass (`01-build.log` empty) · Web build: pass (`04-web-build.log`) · Lint: pass (0 issues, `03-lint.log`; web lint clean) · Render fixtures: pass (`07-render-fixtures.log`, "render fixtures up to date (129 scenarios)") · contrast, kb check, e2e-lint, render-lint, features scope, comments, comment ledger: pass. All read from `$GATES_LOG_DIR`. `WARN size` and the e2e-level census belong to review-maintainability, which is skipped this cycle.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (`23-D1.log`) |
| D2 | `go build ./...` | pass (deduped to `01-build.log`) |
| D3 | `make lint` | pass (deduped to `03-lint.log`, 0 issues) |
| D4 | `make test-race` | pass (`24-D4.log`) |
| D5 | `make check-render-fixtures` | pass (deduped to `07-render-fixtures.log`, 129 scenarios) |
| W1 | `make web-build` | pass (deduped to `04-web-build.log`) |
| W2 | `make web-test` | pass (deduped to `05-web-test.log`, 3475) |
| W3 | `make web-lint` | pass (deduped to `10-web-lint.log`) |
| R1 | `make render-test` | pass (deduped to `09-render-test.log`, 564) |
| E1 | `make e2e` | pass (deduped to the scoped `22-e2e.log`, 364) |
| K1 | `make check-kb` | pass (deduped to `15-kb-check.log`, 724 records, 0 problems) |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL**: (a) `TODO.md:63` "Code diff viewing" is still `- [ ]` and has not moved to `docs/history/todo-done.md` (carried over from cycle 2). (b) web-impl's new `doc-delta:` line (Terminals-menu pick closes the viewer) is not in the plan's `## Doc Delta`: Major 1. (c) `kb:adr/process-render-fixtures-record-diff-opt-in` says "the nine diff scenarios"; ten now opt in: Minor 1. Both `deviation:` arrows still name `proposed` ADRs with `refs: plan:diff-viewer`, and the regenerated `diff*` fixtures match the generator (D5) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | the delta's web source (`diffviewer.ts`, `diffviewerstate.ts`, `diffreviewui.ts`, the `button(...)` call sites, `focus.ts`) adds no `any` |
| V2 | no innerHTML with interpolated text | pass | none added. The eight button sites go through `button(text, className)`, which sets text with `textContent` |
| V3 | no diff, file or comment text to a logger | pass | the delta adds no log call |
| V4 | every git invocation carries a timeout and `WaitDelay` | pass | every `Git` method and `Reader.output` goes through `RunFunc`, and production is always `gitutil.Exec` (30 s `WithTimeout`, `WaitDelay` 2 s, `gitutil.go:173–190`) |
| V5 | viewer matches the prototype | unchanged by the delta; review-browser's to measure | — |
| V6 | size row: button flush right, note at left | pass (unchanged; R5 asserts `#sizerow`/`#sizenote` after a Terminals pick) | — |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. `modelcheck.go` changes only a doc reference; no Claude Code field leaves `internal/claudecode` |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass. No hook path is touched |
| 4 | Bare tmux | pass. `diff-terminals` reuses the rig's `driveTerminalsOn` on the rig's private socket |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass. No branch in the delta renders `0`/empty for absent data |
| 7 | Identity on `session_id` | pass |
| 8 | Settings trespass | pass. The only extra env is `GIT_INDEX_FILE` to a temp copy, passed as `Exec`'s argument |
| 9 | Real `claude` outside canary | pass |

## Delta

| Prior issue (id) | Status | Fix commit | Verified how |
|---|---|---|---|
| Critical 1 `[orchestrator]` `internal/server/renderfix.go:renderRig.repoTick:branch lacks main's retry` | resolved | `8f4ae1c9` | `fc7599f4` is an ancestor of HEAD (`git merge-base --is-ancestor`). `renderRepoReadAttempts = 5` and its retry loop are at `renderfix.go:416–424`, from main, not a hand-ported copy. D5 is green: "render fixtures up to date (129 scenarios)". `git show --remerge-diff` shows that each of the nine `diff*` fixtures changed one line (main's session wire shape) and the generator check accepts all of them, so none was edited by hand. The merge resolution brings in no change beyond what was needed: `focus.ts` keeps both callbacks and the diff close; `style.css` keeps both blocks and restores the `.dv-resolved-detail` closing brace. In docs, `domain-model` keeps both sentences, and the generated hashes were regenerated (K1 green) |

## Issues

### Critical

### Major
1. **[orchestrator]** The plan's `## Doc Delta` does not include web-impl's `doc-delta:` line from the cycle-3 merge (`plans/diff-viewer/web-implementation.md`, "Fix Attempt (review cycle 3) — merge of main"): "picking or creating a terminal from the Terminals menu closes the diff viewer, like a segment click; opening the menu does not". `git log febf5415..HEAD -- plans/diff-viewer/plan.md` is empty. The staged **surfaces** sentence ("choosing a segment closes the viewer and shows that surface, and closing it any other way returns to the surface that was selected") is now incomplete. A menu pick is a way of closing that shows the picked terminal, not the previously selected surface. Renaming, closing or merely opening the menu leaves the viewer open, as R5 asserts. doc-reconcile promotes the delta verbatim, so a fix must add the menu clause to the surfaces (and, if wanted, diff) "becomes true" lines before reconcile.
   id: plans/diff-viewer/plan.md:Doc Delta:terminals-menu clause missing | confidence: 85
2. **[orchestrator]** `kb:diagram/web-components` (`docs/diagrams/web-components.md`), named by `kb for` on `web/src/features/focus.ts` and `diffviewer.ts`, states counts this plan made false. It says `main.ts` "inits 23 controllers" (24 now; `initDiff` added). It says `features/` has "53 modules" (62: main's 53 plus nine `diff*.ts`), described as "22 stateful per-feature controllers … plus 21 DOM-free helpers" (`diff.ts` is a new controller; `diffbutton`/`diffmodel`/`diffplace`/`diffwords` are new pure helpers). It says `render/` has "49 modules" (55: plus six `diff*.ts`). It says `api/` has "11 modules" (13; main already has 12). Measured with `ls web/src/<dir>/*.ts | grep -v '\.test\.ts' | wc -l` on the branch and `git ls-tree main`. A fix must make the fence's counts and the features/ description true of HEAD. The plan's `## Diagrams` staged only store-schema and domain-model, and cycles 1–2 did not check this record.
   id: docs/diagrams/web-components.md:module counts:stale after diff modules | confidence: 85

### Minor
1. **[orchestrator]** `kb:adr/process-render-fixtures-record-diff-opt-in` (proposed, this plan) says "**Decision.** B. The nine diff scenarios set it". Ten do now: `ad764ebd` added `diff-terminals` through `diffScenario`, which sets `recordDiff`. The decision itself (opt-in) is still what shipped. A fix makes the count true, or drops it.
   id: docs/adr/process-render-fixtures-record-diff-opt-in.md:Decision:nine scenarios now ten | confidence: 80
2. **[render-tests]** `web/render/diff.spec.ts`, test "renaming and closing a terminal from the menu leave the viewer open…": the close half can pass without the close ever being sent. Its confirm branch (`if (await confirm.isVisible().catch(() => false))`) never runs, because `shell 1` is idle and an idle close asks nothing (`features/terminalspanel.ts:62`). Nothing then asserts that the `DELETE …/shells/1` went out. If the Close click missed, `stillOpen()` still passes and the claim "closing a terminal leaves the viewer open" goes untested. A fix awaits the DELETE request (for example, `page.waitForRequest` on the stubbed route) before `stillOpen()`, and removes the dead confirm branch.
   id: web/render/diff.spec.ts:renaming and closing:close never asserted | confidence: 65

### Notes
1. **[note]** The `surfaceSwitched` listener in `focus.ts` also fires when a tile pick switches surfaces, and when the viewer is open `close` then runs `deps.surfaces.focusSelected(id)` from inside that emission. Which element ends up focused is review-browser's to observe. The code path is idempotent and per session.
2. **[note]** The render stubs for `POST /shells` (200, no `rev`), `PUT …/name` (200 `{}`) and `DELETE` (204) follow what `web/src/api/sessions.ts` and main's own `terminals.spec.ts` expect, not `docs/protocol.md` § `POST /api/sessions/{id}/shells` (201 with `rev`) or § `DELETE` (200). That mismatch between docs and client is main's Terminals code, outside this plan. Outside the delta: carry it to the proposed backlog for main's surfaces owner.
3. **[note]** `internal/gitutil/gitutil_test.go:338` is still named `TestExec_IsLockFreeAndHonoursWithEnv` after `WithEnv` was removed. Its body passes env as `Exec`'s argument. It is a test name, not a statement this part reviews.
4. **[note]** `web/e2e/zz-browser-review.spec.ts` is untracked in the worktree, probably review-browser's throwaway spec for this cycle. It must not reach the commit.
