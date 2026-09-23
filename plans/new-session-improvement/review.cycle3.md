# Review: new-session-improvement

**Plan**: new-session-improvement
**Verdict**: needs-changes
**Cycle**: 3
**Gates**: 1 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: New Session Improvement

**Plan**: new-session-improvement
**Part verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 35443 words (budget 8000, WARN exceeds)

Delta re-review (§9). Cycle 2's only open agent-tagged issues were Minors: correctness Minor 1 `[daemon-tests]` and maintainability Minor 1 `[web-impl]`. The browser part had none. I read `git diff 5d474a0..HEAD`. It touches `internal/server/sessions_test.go` and three `web/src/` files. The web edits go beyond the Minor's scope because they also rewrite comments (maintainability Note 2), so I read those comments for truth. Nothing else in `internal/`, `cmd/` or `web/src/` changed, so §3–§6 were not re-read.

Both prior Minors are fixed. One new Minor comes from the rewritten comment beside `NavigateOutcome`. The verdict is `needs-changes` for two reasons. One is that Minor. The other is K1, which is red. K1 is structurally unfixable before approval, and this is the last review cycle (Critical 1).

## Requirements

Unchanged from cycle 2; this cycle's diff changes no behaviour. The rows below are carried over, and the changed evidence is noted.

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 … REQ-9, INV-1 … INV-5 | Yes (cycle 2 table) | Yes. D8 is now a whole-struct comparison (Delta row 1) | pass (D13 pending, Note 1) |
| DIAG | `kb:diagram/web-components` now reads `render/` "22 modules" (`docs/diagrams/web-components.md:44`), and `web/src/render/` holds 22 non-test `.ts` files. Fixed in `4a07d07`. `daemon-components` and `containers` are unchanged and still true | — | pass |

## Build & Tests

E2E tests: pass (443/443, `15-e2e.log`) · Daemon tests (race): pass (every package `ok`; `internal/server` 110.8 s, `02-test.log`) · Web tests: pass (1837, `05-web-test.log`) · Daemon build: pass (`01-build.log` empty; written 11:38:54, after HEAD `2e67e89` at 11:38:52) · Web build: pass · Lint: pass (`03-lint.log` 0 issues; `06-web-lint.log` 184 files clean). All read from `$GATES_LOG_DIR`, not re-run.

Other gate lines: contrast pass (43 pairs × 3 themes, 0 failures); versions pass; e2e-honest pass (empty); dead-refs pass (2943 refs, 0 missing); e2e-lint clean; features-scope pass; size WARN ×12 (review-maintainability's). **kb-check FAIL** (the one failed line).

No soak needed: the diff repairs no spec.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (deduped to baseline `make test-race`, `02-test.log`) |
| D2 | `go build ./...` | pass (deduped to baseline `build`) |
| D3 | `make lint` | pass |
| D11 | `! rg -n -e '"--no-session-persistence"' -e '"--bare"' -e "model catalog" internal/ cmd/ --glob '!internal/claudecode/**'` | pass (`16-D11.log` empty) |
| D12 | `MUSTER_CANARY_OFFLINE=1 make canary` | pass (`17-D12.log`: `TestInstalledBinaryCarriesInterfaceStrings` PASS, `ok test/canary`) |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass (1837) |
| W3 | `make web-lint` | pass |
| E1 | `make e2e` | pass (443 passed; the `failed` matches in the log are test titles) |
| K1 | `make check-kb` | **FAIL**. `10-kb-check.log` lists the same 7 files as in cycle 2 as "owned by no feature": `internal/claudecode/modelcheck.go` and `modelcheck_test.go`, `web/e2e/launch-defaults.spec.ts`, `launch-model-check.spec.ts` and `launch-opens-session.spec.ts`, and `web/src/render/launchrestore.ts` and `launchrestore.test.ts`. `doc-delta.md:53-70` stages the globs. Critical 1 |
| DOC | doc upkeep and Doc Delta vs what shipped | pass. The cycle-2 orchestrator Major (the web-components count) is fixed in `4a07d07`. The fix wave added no `deviation:` or `doc-delta:` line (`web-implementation.md` says so; `daemon-tests.md`'s wave touched only a test). `plan.md` and `doc-delta.md` are unchanged since cycle 2, and that cycle checked every Doc Delta sentence against the code. The comment-only web edits do not affect any of them. `proposed-backlog.md` gained the placement item (cycle 2 maintainability Note 1), with **Change requested: no** |

## Reviewer-Verified Criteria

Unchanged from cycle 2 except for these two rows.

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D8 | recognised → 201 with the row the pre-plan launch produced | pass | `sessions_test.go:437-501`. The test copies both `Session` values by value and zeroes eight launch-identity fields on both copies: `ID`, `RepoID`, `TmuxTarget`, `TmuxPane`, `RailPos`, `StateSince`, `CreatedAt` and `Directory`. It then runs one `assert.Equal`. `reflect.DeepEqual` follows the pointer fields (`Model`, `Context`, `Attention`, …) and includes the unexported prompt fields. So the doc comment's "every other field must match" is now true, and it stays true as fields are added. Every field that stays in the comparison is one a launch-path difference could change |
| D13 | forced canary: run F and the explicit-`default` row | **not yet run** | Awaits the developer's approval (orchestrator context). No agent tag |

## Hard-Rule Checklist

Only a test body and three web comments changed this cycle. None of them touches a rule's surface, so every row carries over from cycle 2.

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (D11 green) |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass |
| 4 | Bare tmux | pass. The D8 test uses `newFakeTmux()` |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | n/a |
| 7 | Identity on `session_id` | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass (D8's `claudeBin` is `"irrelevant-never-reached"`, and the check is faked) |

## Delta (delta re-review only)

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 2 correctness Minor 1 `[daemon-tests]`: "`TestLauncher_ModelRecognised_ProceedsToCreated` claims more than it asserts … Also relabel `D7` → `D8`" | `ee17bb2` | Diff read. The review's preferred fix was applied: 17 hand-picked `assert.Equal`s became one whole-struct compare after zeroing the 8 fields the doc comment names. The doc comment's exclusion list and the zeroing loop match field for field. The repo-row comment is now `// D8:`. Only `sessions_test.go` changed. The test passes in `02-test.log` |
| cycle 2 maintainability Minor 1 `[web-impl]`: "`navigate()`'s return type is declared beside `navigate()`, and `render/launchrestore.ts` exports only what its own functions take or return" | `3b4b5d5` | Diff read. `type NavigateOutcome` is now local at `launch.ts:288`, directly above `navigate()` (`:296`). `rg NavigateOutcome web/src` finds only `launch.ts:288/296/320`. `launchrestore.ts` now exports `DEFAULT_MODEL`, `Touched`, `Restore`, `repoRestore` and `initialRestore`. `DEFAULT_MODEL` is the fallback `repoRestore` returns, and it was already there in cycle 2, which did not flag it. The stale "outcome-to-fallback mapping" doc went with the type. Both conditions hold. The new doc comment carries a small inaccuracy (Minor 1) |
| cycle 2 browser part | — | No Minors in that part |

The same commit also rewrote the web comments that cited review findings (maintainability Note 2, not a Minor). I read each rewritten comment against the code:
- `focus.ts:63-66`: true.
- `launch.ts:178-180`: true.
- `launch.ts:344-346`: true.
- `launch.ts:566-569`: true.
- `launchrestore.ts:1-5`: see Note 3.
- `launchrestore.ts:29-31`: true.
- `launch.ts:285-287`: Minor 1.

## Issues

### Critical
1. **[orchestrator:user-decision]** K1 `make check-kb` is red, and this cycle cannot turn it green. The failure is the same 7 unowned files as cycles 1 and 2 (Acceptance Checks row). The fix is launch-spec frontmatter globs, which `doc-delta.md` already stages. Under kb:adr/process-doc-reconcile-after-review (accepted), those globs belong to doc-reconcile, and doc-reconcile runs only after an `approved` verdict. But `merge-review --gates-failed 1` forces `needs-changes`, and my own Verdict Rules require every gate line green. So a plan that ships a file no existing glob covers cannot reach approval. This is the last review cycle, so the pipeline reaches Review Cycle Exhaustion on this line alone once Minor 1 is fixed. The resolution goes against an accepted ADR, so it is the user's call, not a debate:
   - **Option A:** before an approval cycle, the orchestrator (or doc-reconcile, spawned early for the frontmatter only) lands the staged globs in `docs/features/launch/spec.md`. K1 then goes green in the next gate run. Cost: one spec-file edit ahead of reconcile, which the ADR assigns to after review. Doc-reconcile still promotes the body later.
   - **Option B:** approve with K1's "owned by no feature" lines for this plan's own new files treated as the expected pre-reconcile state. Completion's Final Validation `gates.sh` run, which must be fully green after doc-reconcile, is the binding K1 check. Cost: an approval issued over a red gate line, which the merge script does not allow today. It needs a user-approved override or a change to the script, and probably a retro item so the next plan does not hit the same deadlock.

### Major

None.

### Minor
1. **[web-impl]** The new doc comment on `NavigateOutcome` (`web/src/features/launch.ts:285-287`) says "`initOpen` and `navigateUp` switch on this directly (REQ-6b/c)". Only `initOpen` switches on it. `navigateUp` (`:320-325`) returns `navigate()`'s result without looking at it. Its one consumer that reads the value, the ArrowLeft handler (`:483-484`), checks only `result !== null`. `navigateUp` is also REQ-15's, not REQ-6's. Suggested wording: "`initOpen` switches on this directly (REQ-6b/c); `navigateUp` passes it through."

### Notes
1. **[note]** D13 (the forced canary) still has not run. It is the only live evidence that 2.1.280 classifies `muster-canary-unrecognized-model` as unrecognised and haiku as recognised through the production `CheckModel`. It needs the developer's approval, and its log should be pasted into the review.
2. **[note]** The daemon half of cycle 2's maintainability Note 2 was not routed and is still present: `internal/server/sessions.go:147` and `:214` say "exactly as before this plan". These comments are true but narrate history. No change requested.
3. **[note]** Carried from cycle 2 Note 5. `launchrestore.ts:3-5` now states as a rule that "a pure decision split out of a controller lives here, not in features/". `docs/conventions.md` § Composition roots and `web/src/render/CLAUDE.md` say `render/` holds pure DOM builders. The backlog item "Settle where a controller's DOM-free pure decision lives" in `proposed-backlog.md` covers this. Whichever way that item is settled, the comment should be reworded to match.
4. **[note]** Cycle 2 Notes 2, 3, 4, 7, 8 and 9 still hold as written. Nothing in this cycle's diff touches them.

## Browser review

# Browser review: New Session Improvement

**Plan**: new-session-improvement
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 26792 words (budget 8000) — WARN exceeds; sections rules 1340 · features 10176 · diagrams 0 · decisions 11693 · proposed 0 · facts 2462 · lessons 1113 · runbooks 2
**Rig**: `make web-build build` at 2e67e89 (clean tree), producing `bin/musterd` v0.17.0-55-g2e67e89. Each probe test got its own scratch daemon from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-XXXXXX` (the path contains a space), tmux on `-S <datadir>/tmux.sock`, and the stub `claude` at `$TMPDIR/muster e2e-stub-635d9c3a50837164/claude`. Browser was headless Chromium at 1280×720. The one throwaway spec (`web/e2e/zz-rbc3-probe.spec.ts`) is deleted. No musterd or tmux server is left running, and `git status --porcelain` shows nothing of mine.

I read the cycle-3 gates log and did not re-run it. `web-build` is green, and `e2e` is green (443 passed). The one red line is `10-kb-check`: 7 problems, including `web/src/render/launchrestore.ts: owned by no feature`. That is a docs matter, not a runtime one, so the app I drove is the one that will ship.

**Scope.** The orchestrator scoped this pass. Since cycle 2, `git diff 5d474a0..HEAD -- web/src` touches three files. `features/focus.ts` has a comment rewrite only. `render/launchrestore.ts` loses the `NavigateOutcome` type export and has comments rewritten. `features/launch.ts` narrows its import, declares the same `"ok" | "failed" | "superseded"` union locally beside `navigate()`, and has comments rewritten. None of this emits runtime code. I re-measured the cells that exercise those files:

- the open/restore race (E9, E10, E12);
- a launch in Focus and a launch in Tiles;
- the number chords going through `bringForward`, in both views.

Everything else carries forward from cycle 2's matrix (`review.browser.cycle2.md`).

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-6a / E9 / Edge 14 | dialog from Focus (button) | data (recent: haiku / acceptEdits); first `GET /api/browse` held; `opus` label clicked by pointer | opus is kept and the untouched mode is restored | pass | mid-race `opus`/`auto`; settled after 1.2 s `opus`/`acceptEdits`; crumb = the recent's dir; dialog 280,97–1000,623 inside the 1280×720 viewport |
| REQ-6a | dialog from Focus (⌥⌘N) | same seed; browse held; mode changed by keyboard (focus on auto, ArrowLeft) | the mode is kept and the untouched model is restored | pass | mid-race `sonnet`/`plan`; settled `haiku`/`plan`; `activeElement` stays the radio INPUT |
| REQ-6b / E10 / Edge 15 | dialog from Focus | two recents (older haiku/plan, newer opus/acceptEdits); the first browse (newer) is held; older Recent clicked | the older Recent is listed and pressed with its values applied, and the page never falls back to browse-root | pass | after 1.5 s: crumb and footer = older's path; older `aria-pressed=true`, newer `false`; `haiku`/`plan`; `#launch-error` computed `display: none`, empty |
| REQ-6c / E12 / Edge 16 | dialog from Focus | first recent's dir deleted before opening | falls back to browse-root, error cleared, reset values | pass | crumb `browse-root`, footer = `daemon.browseRoot`; `sonnet`/`auto`; Recent `aria-pressed=false`; `#launch-error` `display: none`, empty |
| REQ-7 / E5 / E6 / INV-4 | Focus | 3 seeds, fc3 focused by pointer (keyboard in fc3's terminal); launch via ⌥⌘N → crumb → child → title typed → Enter | the new session is current, its title is in the mainhead, keyboard focus is in its terminal, and input reaches it only | pass | current `[fnew]` (1 card); mainhead `fnew`; `activeElement` in `Terminal: fnew` at close, at READY and after 1.2 s; `tmux capture-pane` shows `stub-echo:rbc3-typed` in fnew's pane and not in fc3's |
| REQ-7 | Focus | same | terminal placed in its host; geometry real; one client | pass | region 300,90–1280,694 = `#main-terminal-slot` 300,90–1280,694, inside `#view-focus` 0,46–1280,720; sizenote `130×25` = tmux `130x25`; 1 region, 1 live `/ws/terminal`, 1 attached tmux client |
| REQ-8 / E7 / Edge 13 | Tiles | full grid (tc1–tc4); launch via ⌥⌘N, Enter in Title | the new session is promoted and holds keyboard focus; input arrives; geometry is settled; one client per tile | pass | live `[tc1, tc2, tc3, tnew]`, tc4 demoted to the strip; focus in `Terminal: tnew` at close and after 1.2 s; echo in tnew's tmux pane; `expectAllTileGeometrySettled` over all 4 = match; tnew tile 641,328–1279,570 inside grid 0,84–1280,571; 4 tiles, 4 regions, 4 attached clients |
| chords via `bringForward` | Focus | right after the dialog launch (focus in fnew's terminal) | ⌥⌘1 / ⌥⌘2 select only | pass | ⌥⌘1 → current `[fc1]`, mainhead `fc1`, `activeElement` BODY, 1 region / 1 socket / 1 attached client; ⌥⌘2 → `[fc2]`, BODY, 1 region / 1 socket |
| chords via `bringForward` | Focus | fc3 driven to needs-input by hook POSTs | ⌥⌘0 selects the neediest, select only | pass | current `[fc3 needs input]`, BODY, 1 region / 1 socket / 1 attached client |
| chords via `bringForward` | Tiles | after the launch: grid `[tc1, tc2, tc3, tnew]`, tc4 in the strip | ⌥⌘5 on a session already live changes nothing | pass | live and positions unchanged; strip `[tc4]`; focus stays in `Terminal: tnew` (before = after) |
| chords via `bringForward` | Tiles | same | ⌥⌘4 promotes tc4 from the strip; geometry settled | pass | live `[tc1, tc2, tc3, tc4]`, tnew demoted to the strip; tc4 tile 641,328–1279,570 inside grid 0,84–1280,571; `expectAllTileGeometrySettled` = match; 4 tiles, 4 regions, 4 attached clients; `activeElement` BODY (the focused tile was the one demoted) |
| REQ-7 / REQ-8 / chords | pop-out | any | — | N/A — `/doc.html` hosts only the reader | |
| E9 / E10 / E12 | dialog | daemon down | — | N/A for this pass — the race needs a browse to land. The dialog's daemon-down cells did not change and carry forward from cycle 2 (Note 1) | |
| §7.1 | Focus / Tiles | data | one live client per session | pass | Focus: 1/1/1 in every Focus cell. Tiles: 4 attached clients for 4 live tiles; the demoted session is shown only as a static strip card |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Scoped pass, as the orchestrator directed. Every cycle-2 cell outside the rows above carries forward unchanged and was not re-measured this cycle. That covers REQ-3 refusals, REQ-4 argv, REQ-5 defaults, the daemon-down banner, the `[hidden]` computed checks and `scrollback: 0`. The web/src diff since cycle 2 is a type relocation plus comment text, which emits no runtime code, so nothing re-measured here could have moved and nothing did.
2. **[note]** Cycle-2 Notes 1–3 still stand as they were: the 184-character model name overflows sideways; the failure of the superseding navigation in REQ-6b is not measured; and switching Focus after a Tiles launch shows the old `focusedId`. This pass did not re-measure them.
3. **[note]** In Tiles, promoting tc4 with ⌥⌘4 demoted the launched `tnew`, the lowest-priority live tile in manual order. `tnew`'s terminal held keyboard focus, so focus fell to BODY. That fits chords being select-only (kb:adr/launch-opens-launched-session). I note it and ask for no change.
4. **[note]** Setup, not a claim. Seed sessions were launched through `POST /api/sessions`, and needs-input was driven with hook POSTs. Every claim cell used real pointer or keyboard input: label and Recent clicks, focus plus ArrowLeft, typing, Enter, ⌥⌘N, ⌥⌘0/1/2/4/5.

## Maintainability review

# Maintainability review: New Session Improvement

**Plan**: new-session-improvement
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 30625 words (budget 8000) — sections — rules 1874 · features 10176 · diagrams 3889 · decisions 11693 · proposed 0 · facts 2462 · lessons 523 · runbooks 2
**Scope**: 14 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. Four of them are CLAUDE.md files that changed only in the generated trailer, plus one hand-written invariant line in `internal/claudecode/CLAUDE.md`. Since cycle 2 (`5d474a0..HEAD`), only 3 source files changed: `web/src/features/focus.ts`, `web/src/features/launch.ts` and `web/src/render/launchrestore.ts`, all in `3b4b5d5`.

## Cycle-2 findings, re-checked

| Cycle-2 finding | State now | Evidence |
|---|---|---|
| Minor 1 (`NavigateOutcome` declared in a module that neither produces nor consumes it) | resolved | `rg -n NavigateOutcome web/src web/e2e` now finds only `launch.ts:288` (declaration), `:296` (`navigate(): Promise<NavigateOutcome>`) and `:320` (`navigateUp`). `render/launchrestore.ts` exports `DEFAULT_MODEL`, `Touched`, `Restore`, `repoRestore` and `initialRestore`. Each of these is taken or returned by a function in that same module, or is the fallback those functions use, which matches `crumbs.ts` and `focusrestore.ts`. Both fix conditions hold. |
| Note 2 (comments that cite review findings) | web side resolved | A sweep of the branch's added lines (`git diff main...HEAD … \| grep '^+' \| grep -iE 'review\|cycle [0-9]\|before this plan'`) finds no review citations left in web files. Two daemon lines remain (see Note 2). |
| Notes 1, 3–11 | unchanged | No daemon source changed since cycle 2. The fail-open, timeout and layering shape is as re-checked then. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/CLAUDE.md | — (one hand-written invariant line, plus the trailer) | n/a | — | pass |
| internal/claudecode/launch.go | settings.go, credentials.go (cycle 2) | n/a (no new type) | — | pass |
| internal/claudecode/modelcheck.go | credentials.go, version.go (cycle 2) | yes | — | pass |
| internal/server/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| internal/server/server.go | usage.go; the `attach` default in `New` (cycle 2) | yes (cycle-1 fix attempt) | funlen `New` 48>40, reason holds | pass |
| internal/server/sessions.go | the in-file `launchError` constructors, `validateLaunchRequest` | n/a | funlen `Launch` 83>60 and filelen 814, reason holds; `Resume` 41>40 is untouched | pass (Note 2) |
| web/src/api.ts | app.ts, protocol.ts (cycle 2) | n/a | filelen 776, reason holds (pre-existing; this change is comment-only) | pass |
| web/src/features/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| web/src/features/focus.ts | rail.ts, surfaces.ts, launch.ts | yes (cycle-1 fix attempt) | — | pass |
| web/src/features/launch.ts | focus.ts, rail.ts; shortcuts.ts, render/masthead.ts (for placing a non-exported type) | yes (cycle-2 fix attempt) | filelen 578 (was 582), reason holds | pass (Note 1) |
| web/src/main.ts | — | n/a | — | pass (one registration argument changed) |
| web/src/render/CLAUDE.md | — (generated trailer) | n/a | — | pass |
| web/src/render/launchrestore.ts | render/crumbs.ts, render/focusrestore.ts | yes | — | pass (Note 3) |
| web/src/terminal/pane.ts | terminal/*.ts (cycle 2) | n/a (comment only) | — | pass |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** `NavigateOutcome` is now a non-exported type inside `initLaunchModal`'s closure (`launch.ts:288`), directly above `navigate()`. It is the only function-scoped type alias in `web/src`: `rg -n '^\s+type \w+ =' web/src --glob '!*.test.ts'` finds only this one. The tree's other non-exported types sit at module level, such as `shortcuts.ts:15` `interface Binding` and `render/masthead.ts:156` `interface ModelWeekState`. The cycle-2 fix asked for the type to sit "beside navigate()", and this placement meets it. A newcomer would not misread it, so no change is requested.
2. **[note]** For review-work (§ Comments, "don't narrate history"). The web comments were cleaned up. Two daemon comments on this branch still refer to the plan's own history: `internal/server/sessions.go:147` ("behave exactly as before this plan") and `:214` ("the launch proceeds exactly as before this plan"). "Before this plan" means nothing to someone reading the code later. The cycle-2 fix wave rewrote only web files.
3. **[note]** For review-work (comment truth). `render/launchrestore.ts:4-5` presents its placement as a settled rule: "a pure decision split out of a controller lives here, not in features/, which holds controllers only". Conventions § Composition roots bullet 3 and `render/CLAUDE.md` still say `render/` holds pure DOM builders. That conflict is the open item in `proposed-backlog.md` ("Settle where a controller's DOM-free pure decision lives"). So the comment states as fact a rule the backlog item has not settled yet.
4. **[note]** For review-work (registry). The gates' one failing line is `10-kb-check.log`: 7 files are "owned by no feature". They are `internal/claudecode/modelcheck.go` and its test, `web/src/render/launchrestore.ts` and its test, and three `web/e2e/launch-*.spec.ts` files. The diagram half of cycle-2 Note 10 is fixed: kb:diagram/web-components now says `render/` has "22 modules", and 22 non-test modules exist there.
5. **[note]** Shared state and races are unchanged from cycle 2: `touched` has named writers, and the daemon closure captures only an immutable value. The gates' `go test -race -count=1 ./...` (`02-test.log`) is green, as are web-test (45 files, 1837 tests) and lint. The size log has 12 WARN hits and no `dupl` lines. The test-file funlen hits are outside this diff.
