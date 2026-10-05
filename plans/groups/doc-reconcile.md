# Doc Reconcile: groups

**Verdict**: blocked
**Pack**: kb: pack 55280 words (budget 20000) — WARN: pack exceeds budget of 20000 words
**Features derived**: rail, actions, launch, focus, shortcuts, tiles, lifecycle, connection, past-sessions, rename, update, surfaces, knowledge (plan header: rail, actions, launch, focus, shortcuts, tiles, lifecycle, connection, past-sessions, rename, update, surfaces)

Why blocked, in three parts. Everything that could be promoted is promoted and committed; `make check-kb` passes.

1. **The feature set widened to `knowledge`.** The only changed file mapping there is `tools/kb/anchors.tsv` (eight `3.2x` anchors and `5.9 ws.groups`), edited in the plan's own doc-upkeep commit 63491d67 and named at plan.md line 889. The knowledge spec does not mention it and no code is involved, so this looks like a registry edit the header should have named. The rule is a hard `blocked`; the developer may waive it.
2. **The rail spec cannot hold its delta in 800 words.** The delta's own deletions (activity-line enumeration, Does-not title clause, three replaced sentences) free about 100 words; the seven "becomes true" bullets are about 320. The rail spec sits at 792 with only the claims listed under "Not promoted" below left out. Fitting them is a feature-splitting decision (a `groups` feature owning sections, summary, select mode and the filter is the natural cut).
3. **The launch spec has no headroom either.** It stood at 797 words. The Start-in duplicate cut to a citation freed about 22 and the Group-row sentence uses them; the request fields and the created-with-the-session semantics are carried by citation only.

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| rail | Head shows sort, count (`n of m` while the filter hides cards), density; second row of Select, ⋯ menu (New group ⌥⌘G, Collapse all, Expand all) and, while a group exists, the filter | `web/index.html` `.row2`; `features/groups.ts` `renderChrome`, `railActionsBtn`; `features/groupscopy.ts:railCountText`; `sessions/sections.ts:filterHides` | edited (see Contradictions 1) |
| rail | Manual rule scoped to a section (pinned block, positional, no state change moves a card) | `sessions/sections.ts:buildSections` (`orderRail` per section) | edited |
| rail | Pin invariant holds within a section, held by the daemon | `internal/session/railorder.go:rebuild` | edited |
| rail | A session belongs to at most one group; collapsible section under a sticky header of caret, name, summary, ⋯; Ungrouped section while any group exists, not renameable or deletable | `render/railsections.ts:buildHeader`; `sessions/sections.ts:buildSections`; `server/groups.go:handleUpdateGroup`, `handleDeleteGroup` | added |
| rail | Groups are daemon rows broadcast whole as `ws.groups`; Delete group chooses ungroup / move / stop-and-remove | `server/groups.go:groupsWire`; `session/groupops.go:DeleteGroup`; `features/groupscopy.ts:DELETE_CHOICES` | added |
| rail | Sections keep their place in both sort modes; header drags in both; card dropped on a header or among a section's cards joins that group (manual mode) | `sessions/sections.ts:buildSections`; `features/groups.ts` `installDragReorder(".ghead")`; `features/rail.ts` `onDropZone`, `draggable: railSort === "manual" && !selecting` | added |
| rail | Activity-line pref enumeration shortened to one clause | — | deleted |
| rail | Does-not line's title-mapping clause | — | deleted |
| rail | "The rail head shows the sort select, the session count and the density control" as the whole head | `web/index.html` | replaced |
| actions | Stop and Remove apply to a selection, Stop to a group's members via Stop all…, through the two batch endpoints; per-id lock; done / skipped / failed | `session/actions.go:EndMany`, `RemoveMany`, `runBatch`; `server/sessions.go:handleEndSessions`, `handleRemoveSessions`; `features/groups.ts:headerMenuEntries` | added |
| actions | Each batch confirms with the count; bulk Remove of live sessions says they stop first; partial result in the action-error line | `features/actions.ts:dispatchMany`, `settleBatch`; `features/groupscopy.ts:removeManyBody`, `batchReport`, `stopManyTitle` | added |
| actions | Deleting a group can stop and remove its members the same way | `session/groupops.go:deleteGroupRemoving` calls `RemoveMany` | added |
| actions | "There are no bulk actions and no undo for Remove" | — | now "There is no undo for Remove" |
| launch | Group row under Title offers groups, No group, New group… with a name field, defaulting to the focused session's group | `features/launchgroup.ts`; `features/launchgroupchoice.ts:groupOptions`, `defaultGroupValue`; `web/index.html` `#launch-group` | added |
| launch | Request carries `groupId` or `newGroup`; group created with the session; refused launch creates neither | `server/launchergroup.go:resolveLaunchGroup`; `session/grouplaunch.go`; `features/launchgroupchoice.ts:groupChoice` | protocol only; spec cites the ADRs (see Not promoted) |
| launch | Start-in default explanation (explicit flag, auto fallback) cut to citations | `docs/adr/launch-start-in-explicit-flag-auto-fallback.md` carries it | deleted |
| past-sessions | Resume tab carries the Group row under the list; the resumed session joins the chosen group | `features/launchgroup.ts:place`; `features/launchresume.ts:submit(group)`; `server/launcherpast.go:checkResumeRequest` | added |
| focus | Group control between the name/bypass chip and the repo readout; offers groups, New group…, No group | `web/index.html` `.ingroup`; `features/focus.ts` `groupBtn` → `openMoveMenu`; `features/groups.ts:openMoveMenuFor` | added |
| focus | Control hides whole while the header's content box is under 640px (strict), stays above it with the title shortening beside it, never below 6rem; repo block keeps its 8-character floor and never hides, a long folder may ellipsize | `style.css` `@container (width < 640px)`, `.mainhead { container-type: inline-size }`, title `min-width: 6rem`, `.meta { --floor: 8ch }` | added (narrowing sentence re-cut) |
| focus | Default focus is the top of the rail's visible order (else its first card); a focus landing in a filtered-out section resets the filter to All | `sessions/sections.ts:defaultFocusId`, `filterForFocus`; `features/focus.ts` `bringForward`, `neediest`, render phase 6 | edited |
| focus | "defaults to the top of the rail's displayed order" and the pre-group narrowing sentence | — | replaced |
| shortcuts | ⌥⌘1–9 count cards as displayed, skipping collapsed or filtered-out ones (Tiles: flat order) | `features/focus.ts:displayedOrder`, `nth`; `sessions/sections.ts:visibleCards` | edited |
| shortcuts | ⌥⌘G opens a new group in the rail, inert in Tiles | `features/shortcuts.ts:newGroup`; `shortcuts.ts` `KeyG` binding | added |
| shortcuts | ⌥⌘0 expands the section it lands in and resets a filter that hides it | `features/focus.ts:neediest` → `reveal(id, true)`; `features/groups.ts:reveal` | edited |
| tiles | Grid and strip ignore groups and render the flat list | `features/tiles.ts:312` `orderRail(...)` over every session; no `sections` import | added |
| protocol | `sessions.order`: listed ids take, in order, the `railPos` values the section already holds; nothing renumbered 0..n-1 | `session/railorder.go:rebuild`, `applyOrder` | edited (false sentence replaced) |
| protocol | `sessions.group`: sessions outside `ids` never change `groupId` or `pinned`; the target section's members may be renumbered within it and are broadcast when they are | `session/railorder.go:applyGroupMove`, `rebuild` | edited (false sentence replaced) |
| protocol | `sessions.group` answers a missing or mistyped `groupId` with `groupId is required and must be an integer or null`; the `ids…` message covers `ids` causes only | `server/sessions.go:handleSetSessionsGroup` | edited |
| protocol | `sessions.order` answers a mistyped `groupId` with `groupId must be an integer or null`; `sessions.create` the same | `server/sessions.go:handleSetOrder`; `server/launchergroup.go:resolveLaunchGroup`; `server/groups.go:msgGroupIDField` | added (code did this, protocol was silent) |
| protocol | `groups.*`, `sessions.end-many`, `sessions.remove-many`, `ws.groups`, snapshot `groups` / `ungrouped`, `groupId` on Session, launch `groupId` / `newGroup` | `server/groups.go`, `server/sessions.go`, `server/launchergroup.go`, `session/groupops.go`, `session/grouplaunch.go` | already in `docs/protocol.md` from planning; spot-checked against the handlers, no other drift found |
| lifecycle, connection, rename, update, surfaces | no prose change | — | none |

## Not promoted

- **rail** (budget): the summary's composition (count plus a coloured dot and number per state, attention order, ended in a neutral dot) and the hover popover are named only through `kb:adr/rail-summary-dot-order-is-attention-order-idle-once`; select mode (checkbox per card and header, non-draggable cards, the bar, Escape / Done / Tiles / empty-rail exits, every selection control disabled while the daemon is down) only through `kb:adr/rail-select-mode-persists-across-bar-actions`; a header click folds except on a renameable group's name (`kb:adr/rail-group-name-click-does-not-fold`); Ungroup dissolving in place; name, order, collapsed state and membership surviving restart; a group being allowed empty; the filter and selection being per-window state (cited from the head sentence).
- **launch** (budget): the request carrying `groupId` or `newGroup`, the group created with the session, and a refused launch creating neither, carried only by citing the two Group ADRs and `kb:anchor/sessions.create`.

## Contradictions

None against the implementation. Two delta lines were wrong as worded and the spec follows the code and the approved plan instead:

1. The delta says "While a group exists the rail head has a second row". Code renders the second row always (`web/index.html` `.row2`); only the filter control is hidden until a group exists (`features/groups.ts:renderChrome`). Plan REQ-15 says exactly this ("with no groups the rail is today's plus the Select button and the ⋯ menu"), and the ⋯ menu is the only way to make a first group from the rail. The spec says the filter appears while a group exists.
2. The delta and `kb:adr/rail-group-name-click-does-not-fold` say the ⋯ still folds the section. In code the ⋯ opens the header menu and stops propagation (`render/railsections.ts`, kebab click handler). The spec makes no claim about ⋯ folding.

## For the orchestrator

- [orchestrator] Decide the `knowledge` widening: either amend the plan's Features header to include `knowledge` (it owns `tools/kb`) or waive it as a registry-only edit, then re-run reconcile or accept this verdict.
- [orchestrator] Developer decision needed to finish the rail and launch deltas: split a `groups` feature out of `rail` (sections, summary, select mode, filter, group endpoints; globs `internal/server/groups*.go`, `internal/store/group*.go`, `web/src/features/groups*.ts`, `web/src/render/railsections*`, `selectbar*`, `groupdialogs*`, `grouppopover*`, `menu*`, `sessions/sections*`) and decide launch's equivalent (the form is at the cap). Re-run reconcile after; the promoted sentences above stay valid.
- [orchestrator] `kb:adr/rail-group-name-click-does-not-fold` says the ⋯ still folds; it opens a menu. The ADR is `proposed`, so its text can still be corrected before completion.
- [orchestrator] Every ADR the specs now cite is still `proposed`; they flip to `accepted` at completion as usual.
- [orchestrator] `SPEC.md`: no change needed that I could find.

## Checks

```
$ make gen-kb && make check-kb
go run ./tools/kb gen
kb: all generated files fresh
go run ./tools/kb check
kb: 522 records, 25 features, 0 problem(s)
kb: all checks pass
```

Body words (kb count, mermaid fence interiors excluded; budget 800):

| Spec | Words |
|------|-------|
| rail | 792 |
| launch | 799 |
| focus | 427 |
| actions | 533 |
| past-sessions | 462 |
| shortcuts | 173 |
| tiles | 299 |

Commits: 3797c045 protocol and regenerated contracts; 18722fbf rail; b19392f0 actions; 62ba5948 launch; 0530a10d focus; 9df9c699 shortcuts; 5e33646b tiles; e5359a37 past-sessions.

---

# Re-run after the groups split

**Verdict**: reconciled
**Pack**: kb: pack 57148 words (budget 20000)
**Features derived**: rail, actions, launch, focus, shortcuts, tiles, lifecycle, connection, past-sessions, rename, update, surfaces, groups, knowledge (plan header: the same fourteen)

Both earlier blockers are resolved by the developer's decision (`decisions/groups-feature-split/decision.md`). The earlier promoted edits and commits 3797c045..6f654503 stand.

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| knowledge | Nine `tools/kb/anchors.tsv` rows; registry edit, no spec text | — | none (feature is in the header) |
| groups | A session is in at most one group; Ungrouped is the rest; Tiles ignore groups | `sessions/sections.ts:buildSections`; `features/tiles.ts` (no `sections` import) | added (new spec) |
| groups | Sticky header of caret, name, summary, ⋯; Ungrouped section while any group exists, not renameable or deletable; no header, filter or Ungrouped with no group | `render/railsections.ts:buildHeader`; `style.css` `.ghead` sticky; `sessions/sections.ts:buildSections` (`headed`); `server/groups.go:handleUpdateGroup`, `handleDeleteGroup` | added |
| groups | Sections keep place in both sort modes; per-section pinned block; header drag in both modes; card drop on header or body joins the group (manual) | `sessions/sections.ts:buildSections`, `moveSection`; `features/groups.ts` `installDragReorder(".ghead")`; `features/rail.ts` `onDropZone`, `draggable: railSort === "manual" && !selecting` | added |
| groups | Caret, summary and free space fold; a renameable group's name does not; ⋯ opens the menu; Ungrouped's name folds | `render/railsections.ts` header click handler | added |
| groups | Summary: count plus dot and number per state in attention order, ended neutral last; hover (350ms) or keyboard focus on the caret opens a popover of states and titles | `sessions/sections.ts:SUMMARY_ORDER`, `summarize`, `popoverModel`; `render/grouppopover.ts:POPOVER_DELAY_MS`, `attach` | added |
| groups | New group from the rail ⋯ or ⌥⌘G is a pending section above the sections; nothing is sent until Enter with a non-empty name; Escape, blur or empty discards | `features/groups.ts:newGroup`, `commitNew`, `onNameBlur`; `render/railsections.ts:reconcilePending` | added |
| groups | Move to's New group… asks the name in a dialog and creates the group with those sessions; names 1-40 after trimming; empty group allowed | `features/groupsdialogs.ts:promptNewGroupFrom` (`createGroup(name, ids)`); `session/groups.go:NormalizeGroupName` | added |
| groups | Menus: rail ⋯ (New group, Collapse all, Expand all); header (Rename, Collapse/Expand, Select all, New group, Stop all…, Ungroup, Delete group…), Ungrouped's only the shared ones; Move to lists groups, New group…, No group and is what the Focus control opens | `features/groups.ts:headerMenuEntries`, `railActionsBtn` handler, `openMoveMenuFor`, `openMoveMenu`; `features/groupscopy.ts:MENU_LABELS` | added |
| groups | Ungroup dissolves at once, members keep railPos in Ungrouped; Delete offers Ungrouped / another group / stop-and-remove; a remove leaving a member keeps the group | `features/groups.ts:ungroupGroup`; `session/groupops.go:DeleteGroup`, `deleteGroupRemoving`; `features/groupscopy.ts:DELETE_CHOICES` | added |
| groups | Select mode: checkbox per card and header; bar Move to, Ungroup, Stop…, Remove…, All, Done; cards not draggable, click toggles; header Select all turns the mode on; bar actions keep mode and survivors; Done, Escape, Tiles, empty rail end it; daemon down disables bar and both checkbox kinds, Escape still leaves | `features/groupsselect.ts`; `render/selectbar.ts:renderSelectBar`; `web/index.html` `#select-bar`; `render/railsections.ts:updateHeader`; `render/sessions.ts` `reconcileSelectCheckbox`; `features/rail.ts` `draggable` | added |
| groups | Filter All / Groups / Ungrouped on the second row while a group exists; count reads `n of m` while it hides cards, collapsed-but-kept members still count; All takes every kept card; per-window, All on reload; resets when focus lands in a hidden section | `features/groups.ts` filter handlers, `renderChrome`, `reveal`; `sessions/sections.ts:sectionShown`, `shownCards`, `filterHides`, `filterForFocus`; `features/groupscopy.ts:railCountText` | added |
| groups | Groups are daemon rows broadcast whole as `ws.groups`; membership is `groupId`; name, order, collapsed, Ungrouped's place and collapsed, membership survive restart; Ungrouped is id 0 on the wire, `groupId` null on a session | `server/groups.go:groupsWire`; `session/groups.go:loadGroups`; `store/group.go` (`rail_group`, `rail_ungrouped`); `store/session.go` `group_id` | added |
| rail | Head: sort, count, density, then a second row of Select, ⋯ and (while a group exists) the filter; detail moved to groups | `web/index.html` `.row2`, `#rail-filter` | edited |
| rail | Groups section reduced to: at most one group, sections in both sort modes, pin invariant per section, details in kb:spec/groups | `sessions/sections.ts:buildSections`; `session/railorder.go:rebuild` | edited (rest moved) |
| rail | Frontmatter: groups globs and the seven groups protocol anchors moved out; groups ADR refs moved out except the pin-invariant one the Order section still cites | — | edited |
| focus, actions, shortcuts, protocol | Citations of the group behaviour repointed from kb:spec/rail to kb:spec/groups (focus group control, actions group delete, shortcuts ⌥⌘G, protocol Group, `groups.*` and `groups` message intros) | — | edited |
| launch | Request fields, group created with the session, refused launch creates neither | carried by `kb:anchor/sessions.create` and the two Group ADRs | none (developer: keep citations) |

## Contradictions

None. The two delta wordings noted in the first run (the second row always rendered, the filter hidden until a group exists; ⋯ opens a menu and does not fold) stand as recorded there; the groups spec follows the code on both, and `kb:adr/rail-group-name-click-does-not-fold` already says ⋯ opens the header menu.

## For the orchestrator

- [orchestrator] ADR `features:` lines that should gain `groups` (left alone as instructed): rail-groups-daemon-rows-whole-list-broadcast, rail-pin-invariant-scoped-per-section, rail-ungrouped-is-section-zero-on-the-wire, rail-new-group-is-named-before-it-exists, rail-select-mode-disables-card-drag, rail-select-mode-persists-across-bar-actions, rail-section-headers-drag-in-both-sort-modes, rail-filter-and-selection-are-window-state, rail-summary-dot-order-is-attention-order-idle-once, rail-group-name-click-does-not-fold, web-menu-component-single-builder. Their `refs:` still say `kb:spec/rail` and may be repointed to `kb:spec/groups`.
- [orchestrator] The root and nested generated files changed through `make gen-kb` (new `.claude/rules/groups.md`, regenerated nested CLAUDE.md fragments); they ride the groups commit.
- [orchestrator] `SPEC.md`: no change needed that I could find.

## Checks

```
$ make gen-kb && make check-kb
go run ./tools/kb gen
kb: all generated files fresh
go run ./tools/kb check
kb: 523 records, 26 features, 0 problem(s)
kb: all checks pass
```

Body words (the budget function `wordsOutsideMermaid`; budget 800):

| Spec | Words |
|------|-------|
| groups (new) | 713 |
| rail | 706 (was 792) |
| focus | 427 |
| actions | 533 |
| shortcuts | 173 |

Commits: 414e4e92 groups spec and regenerated files; 02e77a69 rail spec; 38119ddd citation repoints in focus, actions, shortcuts and protocol.
