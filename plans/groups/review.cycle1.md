# Review: groups

**Plan**: groups
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 1 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Rail groups

**Plan**: groups
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 65356 words (budget 20000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes — rail ⋯, ⌥⌘G, Move to → New group…, launch `newGroup`, Focus control; pending section, trimmed 1–40 (`NormalizeGroupName`) | Yes — E1, E2; D11 | pass |
| REQ-2 | Yes — dblclick / ⋯ Rename, `PUT /api/groups/{id}` | Yes — E3; D11, D14 | pass |
| REQ-3 | Yes — caret/header/⋯ toggle, persisted `collapsed` | Yes — E6, E8; D8 | pass |
| REQ-4 | Yes — empty body line, menu keeps Rename/Delete | Yes — E4 | pass |
| REQ-5 | Yes — delete dialog, three dispositions, count | Yes — E7; D9, D13 | pass |
| REQ-6 | Yes — `ungroup` keeps railPos | Yes — E7; D4 | pass |
| REQ-7 | Yes — Stop all… → `POST /api/sessions/end`, live ids only (`batchPlan`) | Yes — E14 (flow 4); batchplan.test.ts | pass |
| REQ-8 | Yes — header drag → `PUT /api/groups/order` | Yes — E10; D12 | pass |
| REQ-9 | Yes — drop on header → `sessions/group`; among cards → `sessions/order` + `groupId` | Yes — E5; W7; D4 | pass |
| REQ-10 (amended) | Yes — `.ingroup` between name and meta, Move-to menu with No group, container query, 6rem title floor, repo block floor | Yes — E27 (amended), groups-focus.spec.ts | pass (comment Major 1) |
| REQ-11 | Yes — Group row both tabs, default from focused session, both-or-neither launch | Yes — E17, E18, E19; D10, D16 | pass |
| REQ-12 | Yes — Select toggle, checkboxes, bar, Escape/Done/Tiles exits | Yes — E12, E13, E16 | pass |
| REQ-13 | Yes — Move to menu; bulk Stop/Remove dialogs with counts | Yes — E14; W12 | pass |
| REQ-14 | Yes — All → Remove… → `POST /api/sessions/remove` | Yes — E15; `TestRemoveSessions_RemoveAllLeavesNothing` | pass |
| REQ-15 | Yes — Ungrouped header and filter iff a group exists | Yes — E1, E7; W6 | pass |
| REQ-16 | Yes — `.gsum` count + per-state dots in `SUMMARY_ORDER`, popover | Yes — E8, E9; W6 | pass |
| REQ-17 | Yes — All · Groups · Ungrouped, `n of m`, window state | Yes — E20, E22; W8 | pass |
| REQ-18 | Yes — `buildSections` sorts per section, sections fixed | Yes — E8; sections.test.ts | pass |
| REQ-19 | Yes — `nth` over `visibleCards`; ⌥⌘0 `reveal(id, true)` | Yes — E20, E21; W8 | pass |
| REQ-20 | Yes — `LoadAll` loads groups and layout | Yes — E6; D8 | pass |
| REQ-21 | Yes — `rail_group` rows, whole-list `groups`, `groupId` on upsert; client adopts only from wire | Yes — E25; D15; wsapp.test.ts | pass |
| REQ-22 | Yes — `dispatchMany` calls the batch endpoints once | Yes — D9; E14, E15 | pass |
| REQ-23 | Yes — per-section `rebuild` (option C′), unique railPos | Yes — D4 (`TestRailInvariants_HoldAfterEverySourceAndAReload`, `TestI1_HoldsFromEveryMutationSource`) | pass |
| REQ-24 | Yes — `draggable="false"` in select mode | Yes — E12 | pass |
| REQ-25 | Yes — header drag install, `draggable` independent of sort | Yes — E10, E11 | pass |
| REQ-26 | Yes — `buildSections` puts an unknown `groupId` in Ungrouped | Yes — W5 (sections.test.ts) | pass |
| REQ-27 | Yes — `batchReport` fixed phrase into `#action-error` | Yes — groupscopy.test.ts; E14 (visible/hidden only — the plan pins no phrase) | pass |
| DIAG | store-schema, domain-model (updated, true); daemon-components (still true); web-components, one-launch-end-to-end (stale) | — | fail — Major 6 |

## Build & Tests

E2E tests: pass (707) · Daemon tests (race): pass on the re-run (`01-test.log`; the first run `02-test.log` was red on a pre-existing flake, Note 1) · Web tests: pass (2363) · Daemon build: pass · Web build: pass · Lint: pass (`0 issues.`; Biome clean) — all read from $GATES_LOG_DIR

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `make build` | pass (`01-build.log`) |
| test-race | `make test-race` | pass on re-run (`01-test.log`, every package ok); first run red at `terminal_test.go:408` (Note 1) |
| dead-refs | `dead-refs.py --all` | **FAIL** — 3 missing, all `.claude/worktrees` in files this branch never touches (Critical 1) |
| lint | `make lint` | pass |
| size | `make size-warn` | WARN (26 hits) — review-maintainability's |
| web-build | `make web-build` | pass |
| web-test | `make web-test` | pass (2363) |
| web-lint | `make web-lint` | pass |
| contrast | `make contrast` | pass (43 pairs × 3 themes, 0 failures) |
| versions | `tools/versions check` | pass |
| e2e-honest | e2e honesty check | pass (no output) |
| kb-check | `tools/kb check` | pass (520 records, 0 problems) |
| e2e-lint | `make e2e-lint` | pass (`e2e-lint: clean`) |
| features | features-scope | pass (header as amended) |
| comments | comment-checks | pass |
| e2e | `make e2e` | pass (707 passed) |
| D1 | `make test` | pass (`17-D1.log`) |
| D2 | `go build ./...` | pass (deduped to build) |
| D3 | `make lint` | pass (deduped to lint) |
| D17 | `! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'` | pass (`18-D17.log` empty) |
| D18 | `make test-race` | pass on re-run (see test-race row) |
| W1 | `make web-build` | pass (deduped) |
| W2 | `make web-test` | pass (deduped) |
| W3 | `make web-lint` | pass (deduped) |
| W4 | `make contrast` | pass (deduped) |
| W13 | `! rg -n ": any\b\|as any\b\|\.innerHTML = " web/src …` | pass (`19-W13.log` empty) |
| E28 | `make e2e` | pass (deduped to e2e, 707 passed) |
| SOAK | `make e2e-soak SPEC=e2e/groups.spec.ts N=10 GREP='dropping a header onto a card'` (run by this reviewer for Repairs row 2's flake fix) | pass — 10 passed |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL** — no ADR for `decisions/features-header-widened/decision.md` (Major 5); one proposed ADR false (Major 4); two diagram records stale (Major 6); `docs/protocol.md` and `design-system.md` carry false statements not in `doc-delta.md` (Majors 2, 3). TODO ticks are correctly deferred until `approved`. Every `deviation:` line carries `→ kb:adr/…` and each record is `proposed` with `refs: [plan:groups, …]`. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D4 | I1 from every source incl. reload | pass | `groups_invariants_test.go:126` runs 38 sources (pin, order ×join×prefix, move, create, delete ×3, launch ×4, remove-gap, reload) on two groups + Ungrouped with pinned/unpinned members, asserts after each and after `restart()`; `railorder_group_test.go` `TestI1_HoldsFromEveryMutationSource` |
| D5 | no dangling `GroupID` | pass | same test's `assertConsistent` (I2) after each delete disposition and restart |
| D6 | bystanders untouched | pass | `TestBystanders_AreNeverChangedOrBroadcast`, 15 ops; a pinned mover's target-section shift is named as touched, per the contract (Note 3) |
| D7 | `/clear`, straggler, late `SessionEnd(clear)`, resume keep `GroupID` | pass | `TestGroupID_SurvivesClearRebindStragglerLateSessionEndAndResume` |
| D8 | `LoadAll` restores everything; first snapshot carries it | pass | `TestLoadAll_RestoresGroupsLayoutAndMembership`, `TestGroupsContribute_SnapshotCarriesTheReloadedGroups` |
| D9 | done/skipped/failed, failed keeps row, `deleted:false` | pass | `actions_batch_test.go` (`…BeforeItsTurnIsSkipped`), `TestDeleteGroup_RemoveWithAFailedKillKeepsTheGroupAndTearsDownOnlyWhatWasRemoved` |
| D10 | failed `newGroup` launch leaves no row, no broadcast | pass | `TestLaunchGroup_ASpawnFailureLeavesNoGroupAndAnnouncesNone`, `…ResumeFormFailuresCreateNoGroup`, refused-model subtest |
| D11 | name bounds 400 with the documented message | pass | `TestCreateGroup_RefusesAndCreatesNothing` (asserts the exact message, incl. multibyte), `TestUpdateGroup_Refuses` |
| D12 | order refusals change nothing | pass | `TestSetGroupsOrder_RefusesAnInvalidOrderAndChangesNothing` |
| D13 | move to unknown `to` → 404, nothing changes | pass | `TestDeleteGroup_Refuses` "move to an unknown target" asserts `unknown target group`, membership and no broadcast |
| D14 | one `groups` on change, none on no-op | pass | `TestUpdateGroup_AlreadyInTheRequestedStateBroadcastsNothing`, `TestSetAllCollapsed` |
| D15 | `groups` before joins, after leaves | pass | `TestCreateGroup_WithSessionsBroadcastsGroupsBeforeEveryUpsert`, `TestDeleteGroup_BroadcastsMemberChangesBeforeGroups` |
| D16 | both keys 400, unknown 404, 201 carries `groupId`, highest railPos | pass | `TestLaunchGroup_RefusesBeforeAnySideEffect`, `TestLaunchGroup_IntoAnExistingGroup` |
| W5 | unknown `groupId` in Ungrouped | pass | sections.test.ts (mutation "kept out of Ungrouped" caught) |
| W6 | headless iff no group; summary order; ended from `alive:false` | pass | sections.test.ts |
| W7 | cross-section `moveCard` | pass | railorder.test.ts +8 |
| W8 | `visibleCards` skips collapsed/filtered; `nth` reads it | pass | sections.test.ts; `focus.ts` `displayedOrder` read |
| W9 | filter-flip pure function, launch/neediest/default cases | pass | sections.test.ts `filterForFocus (I4, W9)`, `defaultFocusId` |
| W10 | strip order unchanged; no strip checkbox/header | pass | sort.test.ts (`orderRail` ignores `groupId`); the checkbox/header half is held by E16/E23, not Vitest |
| W11 | ⌥⌘G only | pass | shortcuts.test.ts +21 |
| W12 | copy verbatim, singular at 1 | pass | groupscopy.test.ts; `groupscopy.ts` read against the table |
| W14 | main.ts registration only; groups.ts imports no controller | pass | main.ts diff adds `initGroups` and `groups` deps only; `groups.ts` imports `./groupscopy` and `./batchplan`, both pure |
| E1–E27 | driven live by review-browser | present | every E1–E27 is named by at least one test in the four `groups*.spec.ts` files; the observed result is review-browser's |
| copy | summary order, dialog copy, menu labels match the table | pass | `SUMMARY_ORDER`, `groupscopy.ts`, `index.html`, `railsections.ts` labels |
| colour | no literal, state tokens only for their state | pass | no colour literal in the stylesheet diff; `--amber/--rose/--violet/--teal` appear only under `[data-state]` selectors whose items carry a `title` with the state word |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — D17 green; no Claude-Code field names in the diff outside `internal/claudecode/` |
| 2 | Terminal-output state parsing | pass — no `capture-pane` in the diff |
| 3 | Blocking hook handler | pass — no hook path touched |
| 4 | Bare tmux | pass — no tmux invocation added; tests use the fake spawner |
| 5 | Payload logging | pass — new log lines carry ids and errors only |
| 6 | Empty-gauge dishonesty | pass — an empty group shows its true `0` count and no dots; no gauge rendered |
| 7 | Identity on `session_id` | pass — `groupId` keys on the Muster id; D7 test |
| 8 | Settings trespass | pass — the one `settings.local.json` write is a test's scratch-dir project file |
| 9 | Real `claude` | pass — none launched |

## Issues

### Critical
1. **[orchestrator]** The `dead-refs` gate line is red, but not because of this diff — `docs/adr/lifecycle-card-directory-follows-claude-cwd.md:32`, `internal/server/reporefresh_test.go:296` and `internal/session/location.go:28` cite `.claude/worktrees`, which exists only as an empty, untracked, un-ignored directory in the primary checkout, so the check is red in every fresh worktree. None of the three files is touched by the branch, so no pipeline agent can fix it in scope. Fix: add `.claude/worktrees/` to `.gitignore`, which `dead-refs.py` already classifies as "ignored (gitignored by design)", or create the directory in this worktree before the gate re-runs; propose the durable fix in `proposed-backlog.md`.

### Major
1. **[web-impl]** A false comment contradicts the amended REQ-10 and E27 — `web/src/style.css:4277-4279` says "the title keeps its floor, repo / branch never truncate". Since the developer's amendment, a folder over 8 characters may ellipsize above its floor (kb:adr/focus-repo-block-keeps-floor-beside-group-control). Restate the comment as the floor rule: the repo block keeps its 8-character floor and never hides.
2. **[orchestrator]** `docs/protocol.md` makes two claims about shipped behaviour that are false, and `doc-delta.md` does not mark either as stopping being true, so `doc-reconcile` would keep them:
   - `kb:anchor/sessions.group` (line 515) says "Sessions outside `ids` are never touched". A pinned mover shifts the target section's unpinned members, as the same paragraph's re-enforce-and-broadcast rule requires. `TestSetSessionsGroup` and `TestBystanders_…` "move a pinned card to A" pin that shift.
   - `kb:anchor/sessions.order` (line 487) says "`railPos` = index in `ids`". Under option C′ (kb:adr/rail-pin-invariant-scoped-per-section) a section reuses the railPos values it already holds, so listed ids take those values in order, not 0..n-1.
   Add both as stop-being-true lines in `doc-delta.md`. The plan's I3 and D6 wording carries the first overstatement too (Note 3).
3. **[orchestrator]** The new §5 entries in `docs/design/design-system.md` name tokens the shipped CSS does not use. The CSS follows the mockup's `shared.css` in each case:
   - The Section header name is said to be `--fg`; `.ghead .gname` is `--fg-muted`, and Ungrouped's is `--fg-dim`.
   - The Popover border is said to be `--line-control`; `.pop` uses `--edge`.
   - The Popover session titles are said to be `--fg-dim`; `.pop .pt` is `--fg-muted`.
   - The Selection bar is said to be mono `--fs-2xs`; `.selbar` is `--fs-xs`.
   Correct the document to the shipped values.
4. **[orchestrator]** The proposed ADR `kb:adr/focus-group-control-hides-below-640px-container-width` is false about what shipped. Its Consequences say "repo and branch keep their text at every width", which the developer's amendment withdrew. Its Decision says "640px of the header's own width", but the query measures the header's content box (14px padding each side). Amend the Consequences to cite kb:adr/focus-repo-block-keeps-floor-beside-group-control and name the content box.
5. **[orchestrator]** `plans/groups/decisions/features-header-widened/decision.md` has no ADR. `doc-upkeep.md` requires one per decision file this run produced: `proposed`, with `refs: [plan:groups, <decision file>]`.
6. **[orchestrator]** Two diagram records that `kb for` names for changed files are stale (DIAG):
   - `kb:diagram/web-components` still reads "inits 17 controllers", "render/ 30 modules", "protocol/ 8 modules" and "sessions/ 12 modules". All four were true at the base commit. The branch makes them 18, 35, 10 and 14; `features/` (31) and `api/` (11) were already off before the branch.
   - `kb:diagram/one-launch-end-to-end` lists the launch's side effects in order but has no group step. Missing are the `404 unknown_group` refusal after the model verdict, `CreateLaunchGroup` before `CreateSession`, and `DiscardLaunchGroup` in the rollback.

### Minor
1. **[daemon-impl]** A group held back by an in-flight launch makes every section reorder fail. `SetGroupsOrder` validates against `groupListLocked()` (`internal/session/groupops.go:97`), which includes a group `CreateLaunchGroup` inserted but `RecordLaunch` has not yet announced. While a launch with `newGroup` spawns, a header drag that lists every group the client was told of gets `400 order must list every group id and 0 exactly once`. Fix: validate against the visible groups and keep the held group's `pos` out of the reorder, or slot it back above Ungrouped.
2. **[web-impl]** The container query hides the control one pixel too early. `@container (max-width: 640px)` (`web/src/style.css:4319`) hides it at exactly 640px, but the plan's Views and the design system say "narrower than 640px" and "under 640px". Use `@container (width < 640px)`.

### Notes
1. **[note]** The first `make test-race` run was red on `TestHandleTerminal_SecondSocketSupersedesTheFirst` (`internal/server/terminal_test.go:408`, "An error is expected but got nil"); the re-run in `$GATES_LOG_DIR` is green. Neither that test nor any terminal code is touched by the branch. daemon-tests saw a second unrelated flake, `TestHandleShellTerminal_ScrollErrorIsLoggedNotFatal` (`shellscroll_test.go:195`). Both are candidates for `proposed-backlog.md`.
2. **[note]** On `PUT /api/sessions/group`, a missing or mistyped `groupId` gets `groupId is required and must be an integer or null` (`internal/server/sessions.go`). `docs/protocol.md` prints one message, "ids must be known session ids without duplicates", after a list of causes that includes the missing key. The contract text is ambiguous and the code is the same. `doc-reconcile` should record the shipped message.
3. **[note]** The plan contradicts itself in two places, and the tests honestly pin the contract both times:
   - I3 and D6 say non-requested sessions never change, but the contract re-enforces the per-section invariant, which moves a target section's unpinned members when a pinned session joins.
   - Edge case 22 says ungrouped pinned members land "at the end of" Ungrouped's pinned block, but `ungroup` keeps railPos, so they land by railPos (`TestApplyGroupMove`).
   No code change is requested.
4. **[note]** In `deleteGroupRemoving` (`internal/session/groupops.go:223`), a session moved into the group by another window during a `remove` batch makes the response `deleted:false` with no `failed` member. The contract says `false` "only when a remove left a failed member behind". The race is narrow and the group correctly stays.
5. **[note]** `parseSession` requires `groupId`, as W2 mandates. The plan's "an older daemon's snapshot … renders flat" therefore holds only for a snapshot with no sessions; one with sessions is rejected whole.
6. **[note]** The rail spec's `go` frontmatter did not gain `internal/session/groups*.go` and `grouplayout*.go` as the plan's doc upkeep listed. The new session files are owned by lifecycle's glob, and `check-kb` is clean.
7. **[note]** For review-maintainability: the stylesheet adds px glyph sizes for the caret, kebab and tick (`font-size: 10px`, `14px`, `11px`), following the existing `.arr` precedent rather than an `--fs-*` token.

## Browser review

# Browser review: Rail groups

**Plan**: groups
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 39368 words (budget 20000)
**Rig**: `bin/musterd` built fresh by `make web-build build` at 25e6780 (tree dirty only in `plans/groups/orchestration-state.json`). Each test ran its own `ScratchDaemon` from `web/e2e/helpers/fixtures.ts`: a space-bearing data dir `$TMPDIR/muster e2e-XXXX`, a private socket `<data dir>/tmux.sock` removed with it, and the shared E2E stub `claude` at `$TMPDIR/muster e2e-stub-cd75a542396fd84f/claude`. Driven by headless Chromium through throwaway `web/e2e/zz-rb-*.ts` specs, now deleted. Afterwards no `musterd` or scratch tmux process was left and `git status --porcelain` showed nothing of mine.

Gates log read, not re-run (`gates-groups-c1`). `web-build` and `e2e` are green (`707 passed`), so the app I drove is the one that ships. The one red line is `dead-refs` (`.claude/worktrees`), which this review does not touch. See Note 1 for the `test-race` log.

## Matrix

Hosts are `focus` (rail, mainhead, launch dialog), `tiles` (grid, strip, launch dialog opened from Tiles) and `pop-out` (`/doc.html`).

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| all rows | pop-out | all | — | N/A — `/doc.html` hosts only the reader | `grep -c 'id="sessions"\|id="mainhead"\|launch-dialog' web/doc.html` → 0 |
| States | focus | no data yet (WS mocked silent) | no header, no filter, no select bar, no gauge before the first snapshot | pass | heads 0; `#rail-filter` display none; `#select-bar` display none; gauges 0 |
| REQ-15 | focus | no data (0 sessions) | row 2 holds Select and ⋯ only, inside the rail head | pass | Select 202,83–257,102 and ⋯ 263,83–287,102 inside railhead 0,46–299,112; filter display none |
| REQ-15 | focus | no data | select bar hidden | pass | `#select-bar` computed display none |
| Views: rail ⋯ | focus | no data | New group… enabled, Collapse/Expand all disabled, menu inside viewport, opened by Enter | pass | items `New group…⌥⌘G`, `Collapse all groups(disabled)`, `Expand all groups(disabled)`; hint `aria-hidden` |
| Views: menu | focus | no data | keyboard: focus enters the menu, ArrowDown moves, Escape closes and returns focus to the opener | pass | active `#rail-actions-button` after Escape |
| REQ-15 | focus | data, no groups | flat rail: no header, cards as today | pass | heads 0, cards 3, filter display none |
| REQ-1 | focus | data, no groups | rail ⋯ → New group…: pending section above the loose cards, `Group name` focused | pass | pending 0,112–299,146 above first card 0,146–299,284 |
| REQ-1 | focus | data, no groups | pending field keeps node and focus across a tick (1.3 s) | pass | same INPUT node active after 1300 ms |
| REQ-1/E2 | focus | data, no groups | Escape, empty Enter and blur each discard with no request | pass | heads 0, filter display none, requests `[]` each time |
| REQ-1 | focus | data, no groups | ⌥⌘G opens the pending field focused | pass | active INPUT[Group name] |
| REQ-1/E1/I6 | focus | data | Enter keeps the trimmed name; the Ungrouped header and Filter appear; count unchanged | pass | typed `   Review queue   ` → DOM and daemon `Review queue`; one `POST /api/groups`; count 3 |
| REQ-1 | focus | data | a name over 40 characters cannot be entered | pass | 45 typed, field holds 40 |
| REQ-15 | focus | data | row 2 (filter, Select, ⋯) fits the 300 px rail head | pass | filter 12–178, Select 202–257, ⋯ 263–287 inside head 0–299; row2 scroll 275/275 |
| Views: sections | focus | data | a 40-character name ellipsizes; summary and ⋯ stay inside the header | pass | name 28–72 clipped; sum and kebab inside head 0–299 |
| Views: header ⋯ | focus | data | ⋯ opacity 0 at rest, 1 on hover and on keyboard focus | pass | rest 0, hover 1, focus 1 |
| REQ-2 | focus | data | double-click opens a prefilled, fully selected, focused field inside the header | pass | `{"v":"Alpha","s":0,"e":5,"active":true}`; field 28,123–168,138 in head 0,114–299,148 |
| REQ-2 | focus | data | rename field keeps node and focus across a tick | pass | same node after 1300 ms |
| REQ-2/E3 | focus | data | new name shows at once in header, Focus header, popover and launch Group options | pass | daemon `Alpha two`; mainhead `Alpha two▾`; popover `Alpha two 2 sessions…`; options `No group, Alpha two, Beta, New group…` |
| E3/edge 12 | focus | data | Escape and a whitespace-only Enter restore the name with no request | pass | requests `[]` |
| Views: header ⋯ | focus | data | items and order match the plan; menu inside viewport | pass | `Rename, Collapse, Select all (2), New group…, Stop all…, Ungroup, Delete group…` |
| Views: header ⋯ | focus | data | Rename chosen by keyboard leaves focus in the field across a tick | pass | same INPUT node after 1300 ms |
| Views: header ⋯ | focus | data | the Ungrouped menu omits Rename, Ungroup and Delete group… | pass | `Collapse, Select all (1), New group…, Stop all…` |
| REQ-3 | focus | data | header click collapses: body display none, caret `Expand <name>`, `aria-expanded=false`, daemon collapsed | pass | body display none; caret `Expand Alpha two`; daemon `collapsed:true` |
| REQ-3 | focus | data | caret by keyboard expands and keeps its node focused across a tick | pass | same BUTTON.disc after 1300 ms |
| REQ-3 | focus | data | ⋯ → Collapse collapses | pass | body display none |
| Views: rail ⋯ | focus | data | Collapse all and Expand all flip every section, Ungrouped included (settled) | pass | daemon all collapsed; laid-out cards `[]` |
| REQ-3/REQ-20/E6 | focus | data, reload | collapsed state, section order and membership survive reload | pass | sections `["1","2","ungrouped"]` before and after; B collapsed |
| REQ-17 | focus | data, reload | filter resets to All | pass | pressed `All` after reload |
| REQ-20/E6 | focus | data, daemon restarted | names, order, collapsed state and membership survive a restart | pass | sections unchanged; A name `Alpha two`; members `[1,2]` |
| REQ-16 | focus | data | summary count, then one item per state in attention order, matching the daemon | pass | `needs_input, failed, started, working, idle, ended`, each `1` with title `1 <word>`; daemon states agree |
| REQ-16 / §3 | focus | data | each dot is its own state token; ended is neutral `--line-control` | pass | computed backgrounds equal `--amber`, `--rose`, `--fg-muted`, `--teal`, `--idle`, `--line-control` |
| REQ-16 | focus | data | six summary items fit the 300 px header with no overlap | pass | sum 118–263, kebab 269–291, head 0–299 |
| REQ-16 | focus | data | popover after about ⅓ s, below the header, inside viewport, pointer-events none | pass | none at 150 ms; visible at about 386 ms; tip 8,152–228,376 under head 114–148 |
| REQ-16/E9 | focus | data | popover names the group, `6 sessions`, each state word and each member under it | pass | `STATES 6 sessions NEEDS INPUT 1 a3-need … ENDED 1 a3-end` |
| Views: popover | focus | data | removed on leave; caret focus shows it; Tab (blur) removes it | pass | 0 tooltips after leave and after Tab |
| Views: popover | focus | data, header near viewport bottom | popover and header ⋯ menu stay inside the viewport | pass | at 560 px tall: tip 8,443–228,527; menu flipped to 275–411 |
| REQ-16/I8/E8 | focus | data, collapsed, manual | a needs-input change in a collapsed group updates the summary and moves no section | pass | needs_input 1→2; sections and header y unchanged |
| REQ-16/I8/E8 | focus | data, collapsed, attention | same in attention sort | pass | needs_input 2→3; sections and header y unchanged |
| REQ-4/E4 | focus | data, empty group | count 0, no dots, drop line shown, menu offers Rename and Delete group…; Select all (0) and Stop all… disabled | pass | line `empty — drop sessions here` display block 299×40 |
| States | focus | data, empty group | popover says `empty`; empty Ungrouped says `no ungrouped sessions` | pass | `SOON EMPTY 0 sessions empty` |
| REQ-9/E5 | focus | data, manual | card dropped on a header joins the end of that section (DOM = daemon) | pass | DOM `[1,2,5]` = daemon; invariant problems `[]` |
| REQ-9/E5 | focus | data, manual | card dropped on a pinned card of another section joins it at the drop and takes its pin | pass | DOM `[2,3,4]` = daemon; a2 pinned true |
| REQ-9 | focus | data, manual | card dropped on the Ungrouped header leaves its group | pass | Ungrouped DOM `[1]` |
| REQ-8/E10 | focus | data, manual | header dragged above another reorders the sections (DOM = daemon) | pass | `["2","1","ungrouped"]` both |
| REQ-25/E10 | focus | data, attention | Ungrouped header drags in attention; cards `draggable=false`, headers `true` | pass | sections `["ungrouped","2","1"]` |
| REQ-8 | focus | data, reload | section order survives reload | pass | `["ungrouped","2","1"]` |
| edge 16/E11 | focus | data, manual | header onto a card and card onto the rail head or filter send nothing and change nothing | pass | requests `[]`; state unchanged; no drop-target class left |
| REQ-8/REQ-9 | focus | data, overflowing rail (720 px) | drags with both ends on screen in a scrolled list | pass | card onto header B and header B onto header A both applied |
| REQ-8/REQ-9 | focus | data, overflowing rail | drag onto a header scrolled out of view | not measured — Note 2 | |
| REQ-7 | focus | data | Stop all… dialog: `Stop 2 sessions?`, body ending ` The group stays.`, confirm `Stop 2`, inside viewport | pass | dialog 420,282–860,438 |
| REQ-7/E14 | focus | data | members end and stay in the group; ended dot reads 2 | pass | daemon `1:false, 2:false`, groupId kept |
| REQ-5 | focus | data | delete dialog: title, count body, three radios with Ungrouped checked, Target group, footer; no overflow | pass | `Delete group “Bb”?` / `…its 1 session.`; scroll 438/438 × 388/388 |
| REQ-5 | focus | data | delete dialog and Target group keep focus across a tick; target lists other groups only | pass | options `["Aa"]` |
| REQ-5/E7 | focus | data | Move to Ungrouped / Move to another group (end of target) / Stop and remove, each against the daemon | pass | b1 null; A DOM `[1,2,4]`; d1 row and tmux session gone |
| Views: delete dialog | focus | data | Target group absent with no other group; empty group shows the one line and hides radios | pass | `.choices` display none |
| REQ-6 | focus | data | Ungroup: no dialog; members keep relative order | pass | `[1,2,4]` before and after |
| REQ-15/I6 | focus | data | deleting the last group removes the Ungrouped header and the filter | pass | heads 0; filter display none |
| REQ-12 | focus | data (12 cards) | Select: a checkbox per card (12) and header (3), all cards `draggable=false`, pin display none, `aria-pressed=true` | pass | as stated |
| REQ-12 | focus | data, overflow (640 px tall) | bar at the rail's foot inside rail and viewport; list scrolls above it | pass | rail 0,46–300,640; bar 0,579–299,640; list 114–579, scroll 1745/465, overflow-y auto |
| REQ-12 | focus | data, overflow | scrolled to the end, the last card sits above the bar | pass | last card bottom 579 = bar top 579 |
| Views: sections | focus | data, overflow | a section header sticks to the list top while its body scrolls | pass | head y 114 = list y 114 at scrollTop 120 |
| REQ-12 | focus | data | at 0 selected: `Select sessions`, Move to/Ungroup/Stop…/Remove… disabled, all buttons inside the bar | pass | as stated |
| REQ-12/E13 | focus | data | card clicks toggle, `2 selected`, mainhead and current marker unchanged | pass | mainhead `b3-s10`; current 10 → 10 |
| Views / §3 | focus | data | a selected card is a neutral `--fg` stripe on `--bg-hover`, not a state colour | pass | stripe rgb(232,230,225) = `--fg`; ground = `--bg-hover` |
| REQ-12 | focus | data | Space on a card checkbox toggles it and keeps its node across a tick | pass | `3 selected`; same node after 1300 ms |
| REQ-12 | focus | data, comfortable / compact / expanded | checkbox inside the card, clear of the title; compact card height and title line unchanged | pass | compact height 102.5 → 102.5; title y unchanged |
| REQ-12/E13 | focus | data | a header checkbox selects all its members | pass | 2 → 5 selected |
| REQ-13 | focus | data | Move to opens inside the viewport, flipped above the bar; header and items as the plan says | pass | menu 88,438–278,584 clear of bar content; `Grp A, Grp B, New group…, Ungrouped` |
| REQ-13/E14 | focus | data | Move to Grp A puts the selection at the end of Grp A (DOM = daemon) | pass | `[1..8]` both |
| REQ-13 | focus | data | New group… modal is titled from the count and its field keeps focus; Create makes the group (settled) | pass | `New group from 5 sessions`; 5 members |
| REQ-13/E14 | focus | data | Stop… and Remove… copy (`5 of them are alive…`, `Remove 5`) | pass | as stated |
| REQ-12/E16 | focus | data | Escape and Done each leave the mode; re-entry starts at 0; cards draggable again | pass | checkboxes 0; draggable 12 |
| REQ-12 | focus | data | Escape with the Move to menu or a bulk dialog open closes only that and keeps the selection | pass | bar shown; `2 selected` |
| REQ-12/E12 | focus | data, attention | select mode and Move to work in attention sort | pass | Alpha DOM `[1,2,3,4]` |
| REQ-14/E15 | focus | data → no data | Select → All → Remove 12 with groups present: `No sessions yet`, mainhead hidden, mode off | pass | daemon sessions 0 (layout: Note 3) |
| REQ-14 (#27) | focus | data, no groups | Select → All → Remove… with no groups empties the rail; Ungroup disabled | pass | Move to `New group…, ✓Ungrouped`; heads 0 |
| REQ-27 | focus | data | a partial batch shows the fixed phrase in a shown action-error line; a later complete batch clears it | pass | `Not every session was handled — some were skipped or failed.`; then display none |
| REQ-26/edge 21 | focus | data, `groups` frame withheld | a card whose groupId is unknown renders in Ungrouped with no error; the next frame corrects it | pass | Ungrouped `[2,1]`, errors `[]`, then section `[1]` |
| REQ-11 | focus | data | Group row under Title, inside the dialog, defaulting to the focused session's group | pass | select 381,478–561,508 below Title 439–467 |
| REQ-11 | focus | data | name field display none until New group…; keyboard typeahead picks it; select and field keep focus across a tick | pass | field 569–983 beside the select |
| REQ-11 | focus | data, Resume tab | the same row is shown and inside the dialog, keeping the same choice | pass | select 381,496–561,526 in dialog 129–591 |
| REQ-11/E18 | focus | data | refused launch with New group…: no group, no session; name kept | pass | groups `["Alpha"]`, sessions 2 |
| REQ-11/E18 | focus | data | New group… launch creates group and session together; the new card is its only member and focused | pass | DOM `[3]`; control `Hotfix▾` |
| REQ-11 | focus | data | a launch into an existing group lands at its end (DOM = daemon) | pass | `[1,2,4]` |
| edge 28/E19 | focus | data, real frames | the chosen group deleted while the dialog is open | observed — Note 4 | select falls to `No group` within a tick |
| REQ-11/edge 27 | tiles | data | a dialog opened from Tiles defaults to the focused session's group | pass | `Bravo`; row inside the dialog |
| REQ-19/E20 | focus | data, A collapsed | ⌥⌘1 focuses the first displayed card | pass | `c2-b1`; displayed `[3,4,5]` |
| REQ-17 | focus | data, filter Groups | count reads `n of m` against the daemon; the filter button keeps focus across a tick | pass | `3 of 5` (counting rule: Note 5) |
| REQ-19/E20 | focus | data, filter Groups | ⌥⌘1 focuses the first grouped displayed card | pass | `c2-b1` |
| REQ-19/I4/E21/E22 | focus | data, filter Ungrouped, A collapsed | ⌥⌘0 onto a2: section expands, filter flips to All, card current and in view | pass | card 287–430 inside list 114–720 |
| I4/E22 | focus | data, filter Groups | an ungrouped launch flips the filter to All, shows the plain total and focuses the shown card | pass | count 6 = daemon 6 |
| I4 | focus | data | the user's own filter hides the focused session | observed — Note 6 | |
| REQ-10 | focus | data | the control opens Move to below itself, inside the viewport: groups (tick), New group…, No group | pass | control 416,62–469,79; menu 416,83–606,229 |
| REQ-10 | focus | data | arrows move focus; choosing Bravo by keyboard moves the session to Bravo's end; focus returns to the control and holds across a tick | pass | B DOM `[2,1]` |
| REQ-10 | focus | data | No group reads `no group` | pass | `no group▾` |
| REQ-10/E27 (amended) | focus | data, long title, 6-char folder | 4 px sweep 1240→480: control shown iff content box > 640; title ≥ 6rem; folder at or above 8ch, whole; no overlap; fit clean | pass | 1140 shown, title 503; 724 shown, 293; 600 hidden, 276; 500 hidden, 176; folder 54/54 throughout; hides at header 668 (content 640) |
| REQ-10/E27 (amended) | focus | data, long title, 10-char folder | same sweep, folder at its 8ch floor or wider, never hidden | pass | folder 54–55 against a 54 floor at every step; same edge |
| REQ-10/E27 (amended) | focus | data, 29-char title | same sweep | pass | title ≥ 123 px > 96 px floor throughout |
| REQ-10 | focus | data, 29-char title | "it hides before the title shortens" | FAIL (Major 1) | title shortened at header 760–864 with the control shown |
| REQ-10 | tiles | data | — | N/A — the plan gives tiles no group control | `.tiles-view .ingroup` count 0 |
| I7/E23 | tiles | data, collapsed + filter + select mode | grid and strip carry no header, section or checkbox | pass | group chrome 0 |
| I7/E23 | tiles | data (9 sessions, A collapsed) | strip is the flat manual order | pass | strip `[6,8,9,5,7]` = flat |
| REQ-12/E16 | tiles | data | switching to Tiles left select mode; back in Focus, no checkbox | pass | `aria-pressed=false`; checkboxes 0 |
| REQ-1/W11 | tiles | data | ⌥⌘G is inert in Tiles, with no pending section back in Focus | pass | pending 0 |
| rail rows (REQ-1–9, 12–19) | tiles | all | — | N/A — the rail is hidden in Tiles (`#view-focus` display none); I7 rows above cover what Tiles shows | |
| States | focus | daemon-down | banner shown and inside the viewport | pass | 1280×32 at 0,46 |
| States/E24 | focus | daemon-down | an open menu closes; rail ⋯, Select, caret, header ⋯ (both), Focus header control, Move to/Ungroup/Stop…/Remove…, header checkbox disabled | pass | menus 0 |
| States | focus | daemon-down | every selection control disabled | FAIL (Minor 1) | card checkbox, All and Done enabled |
| States | focus | daemon-down | header click and name double-click do nothing; headers not draggable; ⌥⌘G opens nothing | pass | collapsed false; field 0; draggable `false`×3 |
| States/E24 | focus | reconnect | sections render once each in daemon order; controls enabled; select mode intact | pass | `["1","2","ungrouped"]`; cards 3 |
| States | tiles | daemon-down | — | N/A — Tiles has no group control | |
| REQ-5/E24 | focus | daemon-down | the delete-group dialog closes on status change; on reconnect the sections render once | pass | dialog `open:false`, display none 800 ms after the banner; 2 headers after restart |
| edge 7/E25 | focus (second window) | data | create, rename, collapse and delete appear in the other window without reload | pass | p2 headers follow; filter display none after the last delete |
| window state | focus (second window) | data | a filter in one window leaves the other on All | pass | p2 `All` |
| E26/edge 17 | focus | data, delete dialog open | ⌥⌘1, ⌥⌘0, ⌥⌘G change nothing | pass | focused unchanged; pending 0; dialog open |
| §7.1 | focus | data, focused section collapsed | collapse keeps exactly one live client and the pane | pass | attached clients 1 → 1; xterm shown |
| §6 | focus | all | no gauge, Done state, cost, or unlabelled stale display among the plan's surfaces | pass | summaries are counts of known states; ended is neutral; the bar's `Done` is a mode exit (Note 7) |

## Issues

### Critical

None.

### Major

1. **[orchestrator:decision]** The REQ-10 clause "it hides before the title shortens", which the amendment keeps, does not hold under the 640 px container rule the plan's Views section and kb:adr/focus-group-control-hides-below-640px-container-width mandate. The test used a 29-character title (228 px whole) and a 6-character folder. Between header widths 760 and 864 px the title is ellipsized, down to 123 px, while the control is shown. With the control hidden by an injected style the title reads whole at those widths. With longer titles the title is ellipsized beside the control from 1160 px down. The two halves of the plan contradict each other, so settling them is a choice, not a fix.
   - **Option A: keep the 640 px rule and amend REQ-10.** The control hides only below a 640 px content box, and above that the title may shorten beside it. This costs nothing in code. The measured cost is a 29-character title clipped to 123–227 px across 760–864 px.
   - **Option B: make the hide title-aware.** The control also hides whenever showing it would ellipsize the title, so the title never shortens while the control is shown. This needs a measure in the mainhead render, not a pure container query. The cost is that a long title (66 characters) hides the control at every header width up to about 1160 px.

### Minor

1. **[web-impl]** While the daemon is down, part of the selection stays live. The card checkboxes and the bar's All and Done stay enabled, while the header checkbox and the other bar buttons are disabled. Measured with select mode on and the banner shown: `cardChk:false`, `All disabled false`, `Done disabled false`, `headChk:true`. The plan's daemon-down list says "bar buttons" are disabled "exactly as the action buttons are". A fix must leave every bar button and both checkbox kinds disabled while disconnected. Escape still leaves the mode.

### Notes

1. **[note]** In the gates directory, `02-test.log` (19:36) records `make test-race` failing at `TestHandleTerminal_SecondSocketSupersedesTheFirst`. `01-test.log` (19:51) is green, and the orchestrator reports one red line (`dead-refs`). This belongs to review-work.
2. **[note]** A drag onto a header scrolled out of view was not measured. Playwright scrolls the target into view mid-drag, and the drop then never lands (b1 kept its group). With both ends on screen in the same overflowing 720 px rail, the drags apply. A native drag would rely on Chromium's edge autoscroll, which this instrument cannot reproduce. Card drag in an overflowing rail predates this plan.
3. **[note]** Removing every session while groups exist leaves each group's empty line and `no ungrouped sessions`. A separate `No sessions yet` sits below the last section (header bottom 370, line at 410–457). E15 asks for that line and it is present. The rail reads two "empty" statements, one under the other. No change requested.
4. **[note]** In edge case 28 with real frames, the select drops the deleted group and shows `No group` within a render tick, so a launch then goes ungrouped without an error. The `unknown group` refusal appears only inside that sub-second window, which `groups-launch.spec.ts` holds open by withholding frames. This matches the plan's "re-populates from the next render".
5. **[note]** `n of m` counts members of collapsed sections that the filter keeps. With A collapsed and filter Groups the count read `3 of 5` while one card was laid out. This matches the spec's "while the filter hides cards". The plan's Web notes say the count comes from `visibleCards`, which skips collapsed sections. That is a statement for review-work.
6. **[note]** A filter the developer picks can hide the focused session (filter Ungrouped while a grouped session is focused). Focus keeps showing it, with one live client and no visible current card in the rail. I4 lists only launch, ⌥⌘0 and default focus as sources, so this is not a violation.
7. **[note]** The selection bar's `Done` is the plan's mode-exit label, not a session state, so design-system §6.5 is not engaged. The planning-state summary dot was not driven, because it needs a plan-mode hook sequence. The other six states were measured against their tokens. xterm `scrollback` is not observable without a page hook. The plan touches no terminal code, and one live client held across collapse and filter.
8. **[note]** Pre-existing, not this plan: with zero sessions `#rail-count` reads `""`, not `0`. Double-clicking the Ungrouped name collapses it, because both clicks read the same state, which follows the recorded single-click-folds deviation.

## Maintainability review

# Maintainability review: Rail groups

**Plan**: groups
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 44195 words (budget 20000)
**Scope**: 72 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/server/CLAUDE.md | — | n/a (doc) | — | pass |
| internal/server/groups.go | prefs.go, usage.go, sessions.go, sessionwire.go, respond.go | yes (groupsFeature, writeBodyError) | — | Minor 9 |
| internal/server/launcher.go | launcherpast.go, launcherrors.go | yes (size line) | file 606 (559 on main), reason holds | pass |
| internal/server/launchergroup.go | launcher.go, launcherpast.go | yes (size line names it) | — | pass |
| internal/server/launcherpast.go | launcher.go | yes (size line) | funlen `launchResume` 62 (61 on main), reason holds | pass |
| internal/server/launcherrors.go | launcher.go | n/a (one constructor beside its siblings) | — | pass |
| internal/server/respond.go | groups.go, sessions.go | yes (writeInvalidRequest) | — | pass |
| internal/server/server.go | usage.go, prefs.go | yes (groupsFeature registration) | funlen `New` 45 (44 on main), documented reason holds | pass |
| internal/server/sessions.go | groups.go, sessionwire.go | yes (teardownRemoved) | — | Minor 8 |
| internal/server/sessionwire.go | groups.go | n/a (one field) | — | pass |
| internal/server/state.go | groups.go, prefs.go | n/a (two fields) | — | pass |
| internal/session/CLAUDE.md | — | n/a (doc) | — | pass |
| internal/session/actions.go | manager.go, manager_rail.go | yes (runBatch) | — | pass |
| internal/session/grouplaunch.go | groups.go, groupops.go, manager.go | yes (launchGroups) | — | pass |
| internal/session/grouplayout.go | railorder.go | yes | — | pass |
| internal/session/groupops.go | groups.go, manager_rail.go | yes (groupsMu writers) | — | pass |
| internal/session/groups.go | manager.go, manager_rail.go, railorder.go | yes | — | pass |
| internal/session/manager.go | manager_rail.go, writeorder.go | yes (groupsMu, launchGroups) | file 623 (580 on main), reason holds | pass |
| internal/session/manager_rail.go | railorder.go, groups.go | n/a (extends SetOrder) | — | pass |
| internal/session/railorder.go | grouplayout.go, manager_rail.go | yes (deviation line on rebuild) | — | pass (see Minor 8, Notes) |
| internal/session/row.go | session.go | n/a (one field) | — | pass |
| internal/session/session.go | row.go, writeorder.go | n/a (one field) | — | pass |
| internal/session/writeorder.go | session.go | n/a (one field) | — | pass |
| internal/store/CLAUDE.md | — | n/a (doc) | — | pass |
| internal/store/group.go | usage.go, session.go, store.go | yes (GroupLayout) | — | pass |
| internal/store/migrations/0013_groups.sql | 0012 and earlier | n/a | — | pass |
| internal/store/session.go | group.go | n/a (one column) | — | pass |
| web/src/api/groups.ts | api/sessions.ts, api/prefs.ts, api/http.ts | yes (deviation line on BatchResult) | — | pass |
| web/src/api/launch.ts | api/sessions.ts | n/a (one interface) | — | pass |
| web/src/api/sessions.ts | api/groups.ts | n/a (three calls beside their siblings) | — | pass |
| web/src/app.ts | wsapp.ts, features/rail.ts | yes (protocol/groups.ts prefs pattern) | — | pass |
| web/src/features/CLAUDE.md | — | n/a (doc) | — | pass |
| web/src/features/actions.ts | features/groups.ts, render/confirm.ts | yes (dispatchMany) | — | pass |
| web/src/features/actionscopy.ts | groupscopy.ts, sessions/card.ts | n/a | — | Minor 7 |
| web/src/features/batchplan.ts | launchgroupchoice.ts, groupscopy.ts | yes (fix 2 log) | — | pass |
| web/src/features/focus.ts | features/rail.ts, features/groups.ts | yes (groups deps) | — | pass |
| web/src/features/groups.ts | features/rail.ts, features/launch.ts, features/launchgroup.ts, features/shortcuts.ts, render/rename.ts | yes | file 610, **no reason** | Critical 1, Minor 1, Minor 3 |
| web/src/features/groupscopy.ts | actionscopy.ts, launchgroupchoice.ts | yes | — | Minor 4 |
| web/src/features/launch.ts | launchresume.ts, launchgroup.ts | yes | file 770 (731 on main), reason holds | pass |
| web/src/features/launchgroup.ts | launchresume.ts, launch.ts | yes | — | pass |
| web/src/features/launchgroupchoice.ts | launchpastlist.ts, groupscopy.ts | yes | — | Minor 3, Minor 4 |
| web/src/features/launchresume.ts | launch.ts | n/a (one parameter) | — | pass |
| web/src/features/rail.ts | features/groups.ts, features/tiles.ts | yes | — | pass |
| web/src/features/shortcuts.ts | shortcuts.ts | n/a (one binding) | — | pass |
| web/src/main.ts | features/*.ts registration | n/a (registration only) | — | pass |
| web/src/protocol/batch.ts | protocol/decode.ts, protocol/prefs.ts | yes (deviation line) | — | Minor 2 |
| web/src/protocol/groups.ts | protocol/prefs.ts, protocol/decode.ts | yes (prefs pattern) | — | Minor 2 |
| web/src/protocol/messages.ts | protocol/prefs.ts | n/a | — | pass |
| web/src/protocol/session.ts | protocol/decode.ts | n/a (one field) | — | Minor 2 |
| web/src/render/CLAUDE.md | — | n/a (doc) | — | pass |
| web/src/render/confirm.ts | groupdialogs.ts | yes (ConfirmRequest) | — | pass |
| web/src/render/dragreorder.ts | keyedreorder.ts, railsections.ts | yes | — | Minor 6 |
| web/src/render/groupdialogs.ts | confirm.ts, render/launch.ts, masthead.ts, issue.ts | yes (confirm.ts shape) | — | Minor 5 |
| web/src/render/grouppopover.ts | menu.ts | yes | — | Major 1 |
| web/src/render/keyedreorder.ts | railsections.ts, sessions.ts | yes (widened id) | — | pass |
| web/src/render/launch.ts | groupdialogs.ts, masthead.ts, issue.ts | yes (launchgroup.ts line) | — | Minor 5 |
| web/src/render/mainhead.ts | render/tiles.ts | n/a (one control) | — | pass |
| web/src/render/menu.ts | grouppopover.ts | yes | — | Major 1 |
| web/src/render/railsections.ts | render/sessions.ts, keyedreorder.ts, rename.ts | yes (reconcileCards shape) | — | pass |
| web/src/render/selectbar.ts | render/mainhead.ts | yes (renderMainhead shape) | — | pass |
| web/src/render/sessions.ts | railsections.ts, tiles.ts | yes (adopt, renderSessions dropped) | — | pass |
| web/src/render/tiles.ts | render/sessions.ts | n/a (comment) | — | pass |
| web/src/sessions/CLAUDE.md | — | n/a (doc) | — | pass |
| web/src/sessions/card.ts | actionscopy.ts, issue.ts, pane.ts | n/a (one helper) | — | see Minor 7 |
| web/src/sessions/railorder.ts | sessions/reorder.ts, sessions/sort.ts | n/a (extends moveCard) | — | pass |
| web/src/sessions/sections.ts | sessions/sort.ts, sessions/railorder.ts, sessions/reorder.ts | yes | — | Minor 3 |
| web/src/sessions/sort.ts | sections.ts | n/a (comment) | — | pass |
| web/src/sessions/testfixtures.ts | api/testfakes.ts, nine private `makeSession` copies | stated in the file header | — | note |
| web/src/shortcuts.ts | features/shortcuts.ts | n/a (one table row) | — | pass |
| web/src/style.css | existing state-dot and dialog rules | n/a (contrast gate owns it) | — | pass |
| web/src/ws.ts | wsapp.ts | n/a (one handler) | — | pass |
| web/src/wsapp.ts | ws.ts, app.ts | n/a (prefs pattern) | — | pass |

## Issues

### Critical

1. **[web-impl]** A daemon answer closes whatever name field is open, not the one it committed — `web/src/features/groups.ts:333-336` (`commitRename`) and `web/src/features/groups.ts:350-352` (`commitNew`'s success path) — the per-window `editing` state is written from an async continuation with no identity check. The interleaving, in order:
   1. The developer renames group A and presses Enter. `commitRename` sets `editing.readOnly = true` and sends `updateGroup`.
   2. Before the daemon answers, the developer double-clicks group B's name. `startRename` (`groups.ts:298-309`) has no in-flight check, so it replaces `editing` with B's editor. A's field blurs, and `onNameBlur` returns on `readOnly` (`groups.ts:546`).
   3. A's response arrives. `closeEditing()` (`groups.ts:335`) sets `editing = null`, and the next pass closes B's field mid-typing, which loses what was typed.

   The same happens when ⌥⌘G (`newGroup`, `groups.ts:311-322`) or a rename starts while a new group's create is in flight. The window is one daemon round trip, which includes the SQLite write the daemon makes under `groupsMu`. The module already guards this correctly in two places: the `groups` handler compares the object it holds (`groups.ts:157-160`), and `commitNew`'s failure path mutates only `pending`. The sibling editor, `web/src/render/rename.ts:71-82`, never closes from an async continuation. A fix must make this true: a daemon answer closes the editor only while `editing` is still the object that answer was for, or no new edit can start while one is in flight.

### Major

1. **[web-impl]** The branch adds two implementations of anchored-panel placement — `web/src/render/menu.ts:96-108` (`position`) and `web/src/render/grouppopover.ts:72-81` (`place`) — cites § Design "Reuse before add" ("A second implementation of an existing idea is a defect even when both work"). Both place the panel below the anchor, flip it above when it would overflow, and clamp it inside the viewport, and each declares its own `EDGE_GAP = 8` and a 4px gap (`menu.ts:35-36`, `grouppopover.ts:15-16`). The only difference is the menu's right-align when it would overflow. The two `design:` lines for these files do not mention each other. Search output:
   ```
   web/src/render/grouppopover.ts:15:const EDGE_GAP = 8;
   web/src/render/grouppopover.ts:78:    below + height > window.innerHeight - EDGE_GAP ? box.top - ANCHOR_GAP - height : below;
   web/src/render/grouppopover.ts:79:  panel.style.left = `${Math.max(EDGE_GAP, Math.min(box.left, window.innerWidth - width - EDGE_GAP))}px`;
   web/src/render/menu.ts:35:const EDGE_GAP = 8;
   web/src/render/menu.ts:105:    below + height > window.innerHeight - EDGE_GAP ? anchor.top - OPENER_GAP - height : below;
   web/src/render/menu.ts:106:  panel.style.left = `${Math.max(EDGE_GAP, Math.min(left, window.innerWidth - width - EDGE_GAP))}px`;
   ```
   A fix must leave one placement routine in `render/` that both modules call, with the right-align behaviour as the caller's choice.

### Minor

1. **[web-impl]** `web/src/features/groups.ts` is 610 lines and trips the file-length warning with no reason given. Fix attempt 2 says the file is "kept for the reason in the initial log", but the initial log's only `size:` line is about `features/launch.ts` (`web-implementation.md:64`). The file is one roughly 500-line `initGroups` closure. It holds select mode and its bar, the filter, the name editor, three menus, two dialogs and the header drag. Its sibling `features/launch.ts` moves this kind of growth into sub-controllers (`launchresume.ts`, `launchgroup.ts`). This cites kb:adr/process-size-linters-warn-never-fail. A fix must either give a reason that holds or extract a cohesive sub-controller the `launchgroup.ts` way, such as select mode and its bar. A split that only silences the warning is not a fix.
2. **[web-impl]** The integer adapter for wire values is spelled three times, and none of the copies is in `decode.ts`. They are `web/src/protocol/batch.ts:14-16` (a private `asInteger`), `web/src/protocol/groups.ts:44` and `web/src/protocol/session.ts:346`, all three new on this branch. The header of `web/src/protocol/decode.ts:1-5` says that module "owns how a JSON primitive … [is] recognised", and its existing `asNumber` (`decode.ts:17-19`) is the sibling adapter. This cites § Design "One owner per concept". A fix must leave one exported integer adapter in `decode.ts` that all three sites use.
3. **[web-impl]** "Groups in rail order" is computed in three places: `web/src/sessions/sections.ts:42-49` (`byPlace`), `web/src/features/groups.ts:106-108` (`byPos`, used at 389 and 510) and `web/src/features/launchgroupchoice.ts:27`, which sorts inline. This cites § Design "One owner per concept". A fix must leave one derivation in `sessions/sections.ts` that the menu, the delete dialog's targets and the launch Group row all read.
4. **[web-impl]** The same user-facing labels are defined in more than one module. "No group" appears in `features/groupscopy.ts:21` and `features/launchgroupchoice.ts:14`. "New group…" appears in `groupscopy.ts:10` and `launchgroupchoice.ts:15`. "Ungrouped" appears in `sessions/sections.ts:21` and `groupscopy.ts:20`. This cites § Design "One owner per concept". A fix must give each label one constant that every surface imports.
5. **[web-impl]** The branch builds `<option>` lists twice, in the same shape. One is `web/src/render/launch.ts:296-310` (`renderGroupOptions`), the other `web/src/render/groupdialogs.ts:57-66` (`fillTargets`). Each does `select.replaceChildren(...items.map(createElement("option")))`. This cites § Design "Reuse before add". A fix must leave one option-list builder in `render/` that both call. The older copies at `render/masthead.ts:209` and `render/issue.ts:32` predate the branch, so moving them is optional.
6. **[web-impl]** The generic drag module hard-codes the rail's attribute name: `web/src/render/dragreorder.ts:192` reads `zoneOf(event.target)?.dataset["groupId"]`. The same install already takes the item id's attribute as an option (`idAttribute`, `dragreorder.ts:58-60` and `105`), and its header says it has "no Session or store knowledge at all". This cites the sibling option in the same file. A fix must make the zone key's attribute the caller's, as `idAttribute` is for items.
7. **[web-impl]** The new `displayTitle` (`web/src/sessions/card.ts:96-101`) is the shared title fallback, but `web/src/features/actionscopy.ts:17`, which this branch edits, still spells `session.title ?? "untitled"` itself. This cites § Design "One owner per concept". A fix must make the files this branch touches use `displayTitle`. `render/issue.ts:34` and `terminal/pane.ts:96` predate the branch, so changing them is optional.
8. **[daemon-impl]** The rule that a batch id list has no duplicates lives in the HTTP handler for the batch endpoints, `internal/server/sessions.go:165-185` (`decodeBatchRequest`, `hasDuplicateIDs`). The sibling handlers do it differently: `handleSetOrder` and `handleSetSessionsGroup` let the manager refuse a repeated id (`internal/session/railorder.go:98-101` in `applyOrder`, `railorder.go:129-145` in `validateSessionIDs`, both returning `ErrInvalidOrder`) and only map the error. The same seen-map loop appears a third time as `hasDuplicateRailPos` (`railorder.go:244-254`). This cites conventions § Go "Business logic never lives in HTTP handlers; handlers decode, delegate, encode" and the sibling handlers. A fix must make the session package own the duplicate rule for `EndMany` and `RemoveMany`, with the handler mapping its error as its siblings do.
9. **[daemon-impl]** The batch report's wire shape lives in the group endpoints' file but serves the session endpoints too. `batchWire`, `toWireBatch` and `nonNil` (`internal/server/groups.go:103-121`) are used by `sessions.go:198` and `sessions.go:214` as well as by delete-group. Session wire shapes live in `internal/server/sessionwire.go`. This cites sibling placement. A fix must put the batch wire beside the endpoints that own it, with `groups.go` importing it from there.

### Notes

1. **[note]** These size warnings have reasons that hold:
   - `launcher.go` is 606 lines, up from 559. The group pieces went to `launchergroup.go`.
   - `manager.go` is 623 lines, up from 580. The group pieces went to `grouplaunch.go`, `groups.go` and `groupops.go`.
   - `launchResume` is 62 lines, up from 61, with its prefix moved to `checkResumeRequest`.
   - `New` has 45 statements, up from 44. That is one registration line under its documented reason.
   - `features/launch.ts` is 770 lines, up from 731. The Group row lives in `launchgroup.ts`.
   - No `dupl` warning names a touched file.
2. **[note]** These funlen warnings are on new test files, which are outside this diff and are not `dupl` hits. `daemon-tests.md` gives no reason for them:
   - `groupSources` (73 lines) in `groups_invariants_test.go`.
   - `TestSetSessionsGroup` (66 lines) in `groups_test.go`.
   - `TestRebuild_PerSection` (85 lines) and `TestApplyGroupMove` (70 lines) in `railorder_group_test.go`.
3. **[note]** This is for review-work, as comment truth. The `groupsMu` comment at `internal/session/manager.go` says its writers are "the group methods in groups.go and LoadAll", but most of them live in `groupops.go` and `grouplaunch.go`. The `displayTitle` comment says "none composes its own fallback", which Minor 7 shows is not yet true.
4. **[note]** This is for review-work, as a diagram row. The module counts on `kb:diagram/web-components` are now stale: `features/` 24, `render/` 30 and `protocol/` 8. No new dependency edge appeared on either component diagram.
5. **[note]** Two comments in `internal/session/railorder.go` were edited without being re-wrapped. One is the `ErrInvalidOrder` comment, whose line 11 now runs past the paragraph's wrap. The other is in the `applyPin` comment. This is cosmetic only.
6. **[note]** `internal/server/groups.go:178` builds a `groupWire` inline beside `toWireGroups`, which does the same conversion.
7. **[note]** `features/groups.ts:273` adds a second `window` keydown listener, for Escape leaving select mode. `features/shortcuts.ts`'s header calls that listener "the one … for every bound chord". Escape is not a bound chord, so this is not a divergence. A `design:` line saying so would spare the next reader the search.
8. **[note]** `internal/session/groups.go`'s `GroupRef` has no `design:` line. Its doc comment explains why it is a pointer to a nullable id, and the `json.RawMessage` deviation line covers the decode side.
9. **[note]** These choices diverge from a sibling, and each has its reason stated in the code or the logs:
   - `web/src/sessions/testfixtures.ts` adds a shared `makeSession` while nine private copies remain, and its header says so.
   - The section header carries two ids, `data-group-id` (pinned by the Testable UI table) and `data-section-id` (the wire id). The design line covers this.
   - `writeInvalidRequest` is used only by the new handlers, and its design line says the 26 older literal sites were left alone.
   - The name field's `maxLength = 40` literal matches `render/rename.ts:108`'s `100`.
