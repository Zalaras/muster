# Review: groups

**Plan**: groups
**Verdict**: needs-changes
**Cycle**: 3
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Rail groups

**Plan**: groups
**Part verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 66011 words (budget 20000)

Scope: a full review, not a delta cycle, because cycle 2 carried agent-tagged Majors. The code diff since `8a2bdd36` is limited to comments, the reworded test comment and the dialogs element hand-in, so the requirement verdicts below carry from cycle 2 and each was re-checked against that diff.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes — unchanged since cycle 2; the new group dialog's lookups moved to `groups.ts` byte for byte | Yes — E1, E2; D11 | pass |
| REQ-2 | Yes — unchanged | Yes — E3; D11, D14 | pass |
| REQ-3 | Yes — unchanged | Yes — E6, E8; D8 | pass |
| REQ-4 | Yes — unchanged | Yes — E4 | pass |
| REQ-5 | Yes — `groupsdialogs.ts` now takes `GroupsDialogsElements` from its caller; same element ids, same `onConfirm` | Yes — E7; D9, D13 | pass |
| REQ-6 | Yes — unchanged | Yes — E7; D4 | pass |
| REQ-7 | Yes — unchanged | Yes — E14 | pass |
| REQ-8 | Yes — unchanged | Yes — E10; D12 | pass |
| REQ-9 | Yes — unchanged | Yes — E5; W7; D4 | pass |
| REQ-10 | Yes — unchanged | Yes — E27, the 640/639 pair | pass |
| REQ-11 | Yes — unchanged | Yes — E17–E19; D10, D16 | pass |
| REQ-12 | Yes — unchanged; `groupsselect.ts` already took its elements | Yes — E12, E13, E16 | pass |
| REQ-13 | Yes — unchanged | Yes — E14; W12 | pass |
| REQ-14 | Yes — unchanged | Yes — E15 | pass |
| REQ-15 | Yes — unchanged | Yes — E1, E7; W6 | pass |
| REQ-16 | Yes — unchanged | Yes — E8, E9; W6 | pass |
| REQ-17 | Yes — unchanged | Yes — E20, E22; W8 | pass |
| REQ-18 | Yes — unchanged | Yes — E8 | pass |
| REQ-19 | Yes — unchanged | Yes — E20, E21; W8 | pass |
| REQ-20 | Yes — unchanged | Yes — E6; D8 | pass |
| REQ-21 | Yes — unchanged | Yes — E25; D15 | pass |
| REQ-22 | Yes — unchanged; `ErrInvalidOrder`'s comment now names `runBatch` as a source, which matches `actions.go` | Yes — D9 | pass |
| REQ-23 | Yes — per-section `rebuild`; the `applyPin` comment now matches it | Yes — D4 | pass |
| REQ-24 | Yes — unchanged | Yes — E12 | pass |
| REQ-25 | Yes — unchanged | Yes — E10, E11 | pass |
| REQ-26 | Yes — unchanged | Yes — W5 | pass |
| REQ-27 | Yes — unchanged | Yes — E14 | pass |
| DIAG | `one-launch-end-to-end` true now: `launcher.go:389-394` discards only on final failure. `web-components` module counts true (33 and 37), but its features split still sums to 31 | — | fail — Major 2 |

## Build & Tests

E2E tests: pass (713) · Daemon tests (race): pass (24 packages `ok`, no FAIL) · Web tests: pass (2404) · Daemon build: pass · Web build: pass · Lint: pass (`0 issues.`; Biome clean, 302 files) — all read from $GATES_LOG_DIR

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `go build ./...` | pass (`01-build.log` empty) |
| test | `make test-race` | pass (`02-test.log`, no FAIL) |
| lint | `make lint` | pass |
| web-build | `make web-build` | pass (chunk-size warning only) |
| web-test | `make web-test` | pass (2404) |
| web-lint | `make web-lint` | pass |
| contrast | `make contrast` | pass (43 pairs × 3 themes, 0 failures) |
| versions | `make check-versions` | pass |
| e2e-honest | `! rg -n 'test\.(skip\|fixme\|only)\(' web/e2e` | pass (empty) |
| kb-check | `make check-kb` | pass (522 records, 0 problems; the green re-run after the word-budget trim) |
| dead-refs | `dead-refs.py --all` | pass (3635 checked, 0 missing) |
| e2e-lint | `make e2e-lint` | pass |
| features | features-scope | pass |
| comments | comment-checks | pass |
| size | `make size-warn` | WARN (27 hits), review-maintainability's |
| e2e | `make e2e` | pass (713 passed) |
| D1 | `make test` | pass (deduped to test-race) |
| D2 | `go build ./...` | pass (deduped to build) |
| D3 | `make lint` | pass (deduped to lint) |
| D17 | `! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'` | pass (`17-D17.log` empty) |
| D18 | `make test-race` | pass (deduped to test) |
| W1 | `make web-build` | pass (deduped) |
| W2 | `make web-test` | pass (deduped) |
| W3 | `make web-lint` | pass (deduped) |
| W4 | `make contrast` | pass (deduped) |
| W13 | `! rg -n ": any\b\|as any\b\|\.innerHTML = " web/src …` | pass (`18-W13.log` empty; Note 1) |
| E28 | `make e2e` | pass (deduped to e2e, 713 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL** — the `web-components` features split is still false (Major 2). The rest is fixed: the launch diagram, the design-system selection-bar size (`--fs-2xs`, matches `style.css:3997-4000`), and the module counts. Every `deviation:` line carries `→ kb:adr/…` or a stated no-ADR reason. The Doc Delta and `doc-delta.md` are unchanged since cycle 2, and no code since makes a line false. TODO ticks are correctly deferred until `approved`. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D4–D16 | named daemon tests | pass | Unchanged since cycle 2 apart from one comment in `manager_writeorder_test.go`, and no assertion changed. Its wording is Major 1. |
| W5–W12 | Vitest coverage | pass | No web test changed; 2404 pass; no unit test imports `initGroupsDialogs` |
| W14 | main.ts registration only; no sibling controller imported | pass | `main.ts` unchanged. `groups.ts` imports only its own sub-controllers and now looks up both their markups, the `launch.ts` → `launchgroup.ts` shape |
| E1–E27 | driven live by review-browser | present | No spec file changed since cycle 2; each criterion is still named by a test in the four `groups*.spec.ts` files |
| copy | labels match the table verbatim | pass | The copy module is untouched; the dialog element ids are the same ones, moved |
| colour | no literal, state tokens only for their state | pass | No stylesheet change since cycle 2 |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — D17 green; this cycle's Go diff is comments only |
| 2 | Terminal-output state parsing | pass — none added |
| 3 | Blocking hook handler | pass — no hook path touched |
| 4 | Bare tmux | pass — no tmux invocation added |
| 5 | Payload logging | pass — no log line added |
| 6 | Empty-gauge dishonesty | pass — no render branch changed |
| 7 | Identity on `session_id` | pass — unchanged |
| 8 | Settings trespass | pass — none |
| 9 | Real `claude` | pass — none launched |

## Cycle 2 fixes

| Cycle-2 issue | Fix commit | Verified how |
|---------------|------------|--------------|
| correctness Major 1 `[daemon-impl]` `applyPin` comment claims rebuild renumbers 0..n-1 | `d1eb995a` | Comment read against `rebuild` (`railorder.go:205-243`). It now says rebuild renumbers only a duplicate-railPos candidate and moves entries only where a section breaks the invariant, which matches the code. `ErrInvalidOrder` now names `runBatch` too, also true. Comments only, no code change. |
| correctness Major 1 handoff, the same stale claim in `manager_writeorder_test.go` | `384f29eb` | Reworded. The new text is false in the corrupt case (Major 1). |
| correctness Major 2 `[orchestrator]` `web-components` counts | `836e9086` | The counts are now 33 and 37, which match `ls`. The controller and helper split was not recounted (Major 2). |
| correctness Major 2 `[orchestrator]` launch diagram rollback | `ef7e8ec0` | The retry branch keeps the held group, and `DiscardLaunchGroup` is a final-failure note. Both match `launcher.go:389-394`. |
| correctness Minor 1 `[web-impl]` stale package guides | `fdb5aed3`, `6bb10267` | The features guide names `groupsselect.ts`, `groupsdialogs.ts` and `batchplan.ts`. The render guide names `anchored.ts` and `options.ts`. The trim kept every name, and `check-kb` is green. |
| correctness Minor 2 `[orchestrator]` design-system bar-button size | `ef7e8ec0` | The doc says `--fs-2xs`, which matches `.selbar .btn`. |
| maintainability Minor 1 `[web-impl]` sub-controllers get markup differently | `fdb5aed3` | Diff read. Both sub-controllers now take `(app, elements, deps)`, `groupsdialogs.ts` no longer imports `requireElement`, and the element ids are unchanged. review-maintainability owns the shape verdict. |

## Issues

### Critical

None.

### Major

1. **[daemon-tests]** The reworded test comment claims something false about the corrupt-row repair this plan shipped. It is at `internal/session/manager_writeorder_test.go:151-152`, on `TestCreateSession_AfterRailReorderStillExceedsEveryExistingRailPos`. It says a corrupt duplicate row "is renumbered 0..n-1, which lowers values too. Either way no existing RailPos moves past nextRailPos". `rebuild`'s duplicate branch (`railorder.go:237-241`) sets each entry to its index, so values can rise. `LoadAll` seeds `nextRailPos` as max + 1 (`manager.go:313`). Three rows all holding railPos 0 seed it to 1, and the repair hands out 0, 1 and 2, so one value passes `nextRailPos`. The claim holds only for a rail whose railPos values are unique, which is the only state the test builds. Scope the sentence to that case, or say the corrupt-row repair can raise a value. No assertion needs to change.
2. **[orchestrator]** `kb:diagram/web-components` still miscounts the `features/` split (DIAG). The box says "33 modules", but its description is "18 stateful per-feature controllers … plus 13 DOM-free helpers", which sums to 31. `main.ts` registers 18 controllers. Of the other 15 modules, 4 are sub-controllers that hold DOM state: `launchresume.ts`, `launchgroup.ts`, `groupsselect.ts` and `groupsdialogs.ts`. The other 11 are DOM-free helpers. Cycle-2 correctness Major 2 asked for the two new sub-controllers in the split. The fix named them in the parenthetical but kept the numbers. Make it 18 controllers, 4 sub-controllers and 11 DOM-free helpers.

### Minor

None.

### Notes

1. **[note]** The W13 globs still do not reach `render/anchored.ts`, `render/options.ts`, `features/batchplan.ts`, `features/launchgroup.ts` or `features/launchgroupchoice.ts`. The same grep over those five files finds nothing.
2. **[note]** This is for daemon-impl, and no change is requested. The edge in Major 1 is also a latent behaviour. A corrupt duplicate-railPos rail that is reordered after `LoadAll` can renumber a session onto or past `nextRailPos`, so the next new session can share a railPos. The following rebuild repairs it. Main's whole-list renumber had the same edge, and the daemon never writes duplicates itself.
3. **[note]** The features guide's list of pure helpers omits `launchpastlist.ts`, which calls itself "Pure decisions". The omission predates this branch and is on `main` too.
4. **[note]** Cycle-2 correctness Notes 2–5 still stand unchanged. They cover the untested 500 branch of `writeBatchError`, two `sessions.order` points for doc-reconcile, `render/options.ts` calling itself the one option builder, and cycle-1 Notes 4–6.

## Browser review

# Browser review: Rail groups

**Plan**: groups
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 39368 words (budget 20000)
**Rig**: `bin/musterd` built fresh by `make web-build build` (under `bin/gatelock run --exclusive`) at 6bb10267. Each test ran its own `ScratchDaemon` from `web/e2e/helpers/fixtures.ts`: a space-bearing data dir `$TMPDIR/muster e2e-XXXX`, a private socket `<data dir>/tmux.sock` removed with it, and the shared E2E stub `claude` at `$TMPDIR/muster e2e-stub-cd75a542396fd84f/claude`. Driven by headless Chromium (1280×900) through a throwaway `web/e2e/zz-rb3-dialogs.spec.ts` in the foreground, now deleted. Afterwards no `musterd` or tmux process was left, and `git status --porcelain` showed nothing of mine.

Gates log read, not re-run (`gates-groups-c3`). Every line is green: `web-build` built, `e2e` reads `713 passed (5.7m)`, `dead-refs` reads `0 missing`. The app I drove is the one that ships.

Scope. Since my cycle-2 approval the only web source change is fdb5aed3. It moves the lookup of the new-group and delete-group dialog elements from `features/groupsdialogs.ts` into `features/groups.ts`, which hands them to `initGroupsDialogs`. 6bb10267 edits package guides only. This cycle re-drives every surface that wiring touches, in both sort modes (manual and attention): the New group from selection modal, reached from select mode's Move to and from the Focus header's group control, and the Delete group dialog. The rest of the cycle-2 matrix (`review.browser.cycle2.md`, commit 8a2bdd36) stands. Its dialog-adjacent cells were re-observed in passing and agree: the Move to menu, Escape closing only the modal and keeping the selection, and the daemon-down disabled controls.

Sort mode was set by keyboard typeahead on the rail's Sort select. Dialog controls were driven by pointer clicks and keys; the Target group select by typeahead, never `selectOption`.

## Matrix

Hosts are `focus` (rail, select bar, mainhead) and `pop-out` (`/doc.html`). Every cell below ran once with `manual` sort and once with `attention` sort, with the same result; where the two differ, the evidence says so.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| all rows | pop-out | all | — | N/A — `/doc.html` hosts only the reader (cycle 2) | |
| all rows | tiles | all | — | N/A — the rail, the select bar and the Focus header control are not in Tiles; both dialogs open only from them | |
| REQ-13 | focus | data, 2 selected | Move to → New group… by pointer opens the modal titled from the count, named by role | pass | title `New group from 2 sessions`; `getByRole('dialog', {name})` count 1 |
| REQ-13 | focus | data | modal placed inside the viewport; field, Cancel and Create inside it; no overflow | pass | dialog 420,374–860,527 in 1280×900; input 521,435–843,463; Cancel 706,489–770,514; Create 778,489–843,514; scroll 151/151 |
| REQ-13 | focus | data | `Group name` field focused on open and the same node after a tick | pass | active `#new-group-input`; tagged node still active after 1300 ms |
| REQ-13 | focus | data | the error line is not laid out at rest | pass | `#new-group-error` display none, 0 rects |
| REQ-13 | focus | data | Cancel by pointer closes, sends nothing, keeps the selection | pass | open false, display none; `POST /api/groups` 0; `2 selected`; groups `Existing` only |
| REQ-13 | focus | data | Move to → New group… by keyboard (Enter, ArrowDown, Enter) opens it focused | pass | menu `Existing, New group…, ✓Ungrouped`; active `#new-group-input` |
| REQ-13/REQ-12 | focus | data | Escape with typed text closes only the modal; nothing sent; selection kept; focus back on Move to | pass | posts 0; bar flex, `2 selected`; active `Move to ▾` |
| REQ-13 | focus | data | reopening starts with an empty field | pass | value `""` |
| REQ-1/REQ-13 | focus | data | Create with an empty name and Enter with a whitespace-only name send nothing; the modal stays, the field keeps focus | pass | open true; active `#new-group-input`; posts 0 |
| REQ-13/I6 | focus | data | Create by pointer with `  From selection  ` makes the trimmed group holding the selection; DOM = daemon | pass | groups `Existing, From selection`; members `[1,2]` = DOM `[1,2]`; one `POST /api/groups`; sections `["1","2","ungrouped"]` = oracle; modal display none |
| REQ-13 | focus | data, a selected session removed behind the open modal | the daemon's refusal shows inside the modal; nothing is created; typing clears it | pass | error `unknown session` display block 437,449–843,487 inside dialog 420,349–860,551; groups unchanged; display none after a key |
| REQ-10/REQ-13 | focus | data, ungrouped focused session | Focus control → New group… opens `New group from 1 session`, focused, inside the viewport | pass | dialog 420,374–860,527; active `#new-group-input` |
| REQ-10 | focus | data | Escape and Cancel each close it with nothing sent; focus returns to the control | pass | posts `[]` both; active `.ingroup` `no group▾` |
| REQ-10 | focus | data | typed name and Enter create the group with the session; the control relabels | pass | one `POST /api/groups`; members `[1]` = DOM `[1]`; label `Solo group▾` |
| REQ-5 | focus | data | header ⋯ → Delete group… by pointer opens the dialog named by role | pass | `getByRole('dialog', {name: 'Delete group “Alpha”?'})` count 1 |
| REQ-5 | focus | data | title, count body, three labels and hints, Ungrouped checked, confirm `Delete group` enabled | pass | `The group goes away. Choose what happens to its 2 sessions.`; checked `ungroup` |
| REQ-5 | focus | data | dialog inside the viewport with no overflow; choices and confirm inside it | pass | dialog 420,255–860,645, scroll 388/388 × 438/438; choices 421,361–859,595; confirm 738,607–843,632 |
| REQ-5 | focus | data, five groups | Target group select is laid out in the move row and lists the other groups in rail order | pass | select 471,468–749,494 display block in row 437,440–843,520; options `Bravo, Charlie, Delta, Echo` for rail `Alpha…Echo`; for Bravo `Charlie, Delta, Echo` |
| REQ-5 | focus | data | focus lands on the checked radio on open | pass | active `#delete-choice-ungroup` (pointer and keyboard opens) |
| REQ-5 | focus | data | Cancel by pointer closes; no `DELETE`; members kept; focus back on the header ⋯ | pass | dels `[]`; Alpha `[1,2]`; active `Group actions` |
| REQ-5 | focus | data | opened by keyboard (Enter on ⋯, arrows, Enter), Escape closes; no `DELETE`; focus back on ⋯ | pass | dels `[]`; Alpha `[1,2]`; active `Group actions` |
| REQ-5 | focus | data | Tab from the move radio reaches Target group; typeahead picks Charlie and checks the move radio; focus holds across a tick | pass | active `#delete-group-target`; value `3` = Charlie; move checked; same node after 1300 ms |
| REQ-5/E7 | focus | data | Move them to another group: Alpha's members join the end of Charlie | pass | daemon Charlie `[4,1,2]`; DOM manual `[4,1,2]`, attention `[1,2,4]` (cards sort by attention inside a section, REQ-18) |
| REQ-5/E7 | focus | data | Move them to Ungrouped (default), confirmed by Enter on the focused button | pass | b1 groupId null; Ungrouped daemon `[7,3]`; DOM manual `[7,3]`, attention `[3,7]` |
| REQ-5/E7/I3 | focus | data, one live and one ended member | Stop and remove them: both sessions and cards gone; the live member's tmux window gone | pass | sessions `[7,1,2,3,4]`; cards 0; tmux windows 6 → 5 |
| REQ-4/REQ-5 | focus | data, empty group | the one line shows; choices not laid out; confirm deletes it | pass | `The group is empty; nothing else changes.`; choices display none, 0 rects; dialog 420,382–860,518 |
| REQ-5 | focus | data, one group left | the move row and Target group are not laid out; two radios remain | pass | row display none; select 0 rects; labels `Move them to Ungrouped, Stop and remove them` |
| REQ-5 | focus | data | each confirm sent exactly one `DELETE` and Cancel/Escape sent none | pass | `DELETE /api/groups/1, /2, /5, /4` in order |
| States/E24 | focus | daemon-down, new-group modal open with typed text | the modal closes; Move to and the header ⋯ are disabled; select mode stays | pass | open false, display none; both `disabled`; bar flex; banner 1280×32 at 0,46 |
| States/E24 | focus | daemon-down | forced clicks on Move to and the header ⋯ open no menu and no dialog | pass | menus 0; both dialogs closed |
| States/E24 | focus | reconnect | the modal reopens with an empty field and Create enabled | pass | value `""`; Create enabled; `New group from 1 session` |
| REQ-5/E24 | focus | daemon-down, delete dialog open | the dialog closes; the header ⋯ is disabled | pass | open false, display none; ⋯ `disabled` |
| REQ-5/E24 | focus | reconnect | sections render once each; the dialog reopens with confirm enabled; nothing was deleted | pass | `["1","ungrouped"]`; confirm enabled; groups `Alpha` |
| §6 | focus | all | neither dialog shows a gauge, cost, Done state or unlabelled stale value | pass | text above is the whole content |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The cycle-2 matrix was not re-driven outside the two dialogs. fdb5aed3 changes only where their elements are looked up, and the gates' `e2e` line is green on this tree. Cycle 2's notes still hold.
2. **[note]** After Create from a selection, select mode stays on with the same two sessions selected (`2 selected`). This matches cycle 2's Move to behaviour. No change requested.
3. **[note]** The new-group refusal shows the daemon's raw message `unknown session` when a selected session is removed behind the open modal. It sits inside the dialog and clears on the next keystroke. Whether that wording is enough is review-work's to weigh against the plan's copy.

## Maintainability review

# Maintainability review: Rail groups

**Plan**: groups
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 44313 words (budget 20000)
**Scope**: delta re-review. Cycle 2's only open agent-tagged issue was a Minor. The delta is `git diff 8a2bdd36..HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`, 5 files, from commits fdb5aed3, d1eb995a and 6bb10267. The siblings of each were opened.

## Delta

| Prior Minor | Fix commit | Verified how |
|---|---|---|
| Minor 1: the two sub-controllers of `features/groups.ts` get their elements differently (`groupsselect.ts` handed them, `groupsdialogs.ts` looked its own up), and the `design:` line claims both take `launchgroup.ts`'s shape | fdb5aed3 | `groupsdialogs.ts` now exports `GroupsDialogsElements` (`:28-31`), built from the render module's own `NewGroupElements` and `DeleteGroupElements`. Its signature is `initGroupsDialogs(app, elements, deps)` (`:48-52`), the same as `initGroupsSelect(app, { toggle, bar }, deps)` (`groupsselect.ts:50`). `rg requireElement` over `groupsdialogs.ts` and `groupsselect.ts` finds nothing. `groups.ts:110-145` looks up the dialog markup beside the select-bar lookups (`:99-108`) and passes it at `:181`. `launch.ts:729-748` looks up its `resume` and `group` elements inside `initLaunch` and hands them to `initLaunchResume` (`:161`) and `initLaunchGroup` (`:171`), so all four sub-controllers now follow one shape. The `design:` line (`web-implementation.md:226`, "`init<Name>(app, elements/deps)`") is true of both modules. The header comment (`groupsdialogs.ts:3-6`) and `features/CLAUDE.md` say the caller looks the markup up. `groups.ts` grew from 435 to 475 lines, which is under the 500 threshold and not on `15-size.log`. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/session/railorder.go | actions.go, groupops.go, manager_rail.go | n/a (comments only) | — | pass (cycle 2 Notes 5 and 6 answered) |
| web/src/features/CLAUDE.md | groups.ts, groupsselect.ts, groupsdialogs.ts, launchgroup.ts | n/a (doc) | — | pass |
| web/src/features/groups.ts | groupsselect.ts, groupsdialogs.ts, launch.ts, launchgroup.ts, launchresume.ts | yes (`web-implementation.md:226`, fix log `:254-258`) | none (475 lines) | pass |
| web/src/features/groupsdialogs.ts | groupsselect.ts, launchgroup.ts, launchresume.ts, render/groupdialogs.ts | yes (`:226`, `:254`) | — | pass (cycle 2 Minor 1 fixed) |
| web/src/render/CLAUDE.md | anchored.ts, options.ts, menu.ts, grouppopover.ts | n/a (doc) | — | pass |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The fix wave changed no shared state. The daemon change in `railorder.go` touches only comments. The `ErrInvalidOrder` comment (`:9-15`) now names `runBatch` as a source, and `rg ErrInvalidOrder internal/session` confirms the three sources it lists (`railorder.go:85,100,105,136`, `actions.go:131`). Whether the reworded `applyPin` comment (`:42-45`) is true belongs to review-work.
2. **[note]** The size log is unchanged from cycle 2. The cycle 2 reasons still hold for `launcher.go`, `manager.go`, `launch.ts`, `launchResume` and `New`. No delta file appears in it.
3. **[note]** This is for review-work, as plan-doc truth. The file table row for `groupsdialogs.ts` (`web-implementation.md:195`) still lists "element lookups" among the module's jobs. The fix log at `:254` records the change. The `design:` line, the header comment and the package guide agree with the code.
4. **[note]** `kb:diagram/web-components` now says 33 `features/` modules and 37 `render/` modules. It describes groups' select mode and dialogs as sub-controllers. Both counts match the tree, which closes cycle 2's Note 8.
5. **[note]** Cycle 2's Note 2 is still open. No `design:` line says why `groupsselect.ts` adds its own `window` keydown listener for Escape. It is not a divergence, so no change is requested.
