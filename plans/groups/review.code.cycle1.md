# Correctness review: Rail groups

**Plan**: groups
**Verdict**: needs-changes
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
