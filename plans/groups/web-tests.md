# Web Tests: Rail groups

**Plan**: groups
**Verdict**: pass
**Pack**: kb: pack 45630 words (budget 20000)

## Summary

Tests created: 371 | Passing: 371 | Failing: 0

262 are in nine new files and 109 are added to existing files. The whole suite is 2363 passing in 86 files.

```
npx tsc --noEmit    exit 0
npm test            Test Files 86 passed (86), Tests 2363 passed (2363)
npm run build       built in 2.07s
npx biome check .   Checked 295 files in 314ms. No fixes applied.
comment-checks.py --gates   comment-checks: clean
dead-refs.py                dead-refs: 1420 references checked, 0 missing
```

The first pass ended `implementation-bug`: the rule for which ids a batch Stop or Remove carries sat inside `initActions` and could not be unit-tested. Commit d87d1b8 moved it into `batchPlan` in `features/batchplan.ts`. `dispatchMany` (`actions.ts:221`) and the header menu (`groups.ts:411`) both call it. This re-run pins it, and the verdict is `pass`.

## Implementation Bugs

None. The bug of the first pass is resolved by d87d1b8; see the `batchplan.test.ts` row below.

## Tests

| File | Tests | What It Tests | Status |
|------|-------|---------------|--------|
| `src/sessions/sections.test.ts` (new) | 84 | `buildSections` flat and headed, unknown `groupId` in Ungrouped (W5), headless-iff-no-group (W6), per-section sort in both modes with sections fixed (I8), `visibleCards`/`shownCards`/`filterHides` (W8), `filterForFocus` and `defaultFocusId` (I4, W9), `sectionOrder`/`moveSection` including Ungrouped id 0, `groupOf`/`groupLabel`/`commonGroupId`, `summarize` order and ended-from-`alive:false` (W6), `popoverModel`, `selectionState`, section text | pass |
| `src/protocol/groups.test.ts` (new) | 38 | `parseGroup`, `parseUngroupedLayout`, strict `groups` message, lenient snapshot with neither key and strict with one, `emptyGroupsFields` returns fresh objects | pass |
| `src/protocol/batch.test.ts` (new) | 17 | `parseBatchResult` three lists, malformed, non-integer ids | pass |
| `src/features/groupscopy.test.ts` (new) | 36 | Bulk Stop, bulk Remove, delete-group, new-group, menu and count text exactly as the Testable UI Elements table states, singular at 1 (W12), `batchReport` | pass |
| `src/features/launchgroupchoice.test.ts` (new) | 21 | Group select options and key, default value, kept value, what the launch request carries, blank name refused | pass |
| `src/api/groups.test.ts` (new) | 32 | The five group calls: URL, method, body, 2xx decode, error envelopes, malformed 200 | pass |
| `src/render/selectbar.test.ts` (new) | 8 | Bar visibility, count, enablement per selection and per daemon-down, no rewrite of an unchanged count | pass |
| `src/wsapp.test.ts` (new) | 7 | `groups` and snapshot reach the event bus whole and in order, older-daemon snapshot, malformed dropped, store untouched | pass |
| `src/features/batchplan.test.ts` (new) | 19 | `batchPlan`: Stop keeps only live known ids and is `null` with none live; Remove keeps every known id, reports the live count, and is `null` with none known; unknown ids dropped; order follows `sessions`; a repeated id once; inputs untouched; accepts a bare `{ id, alive }` | pass |
| `src/sessions/testfixtures.ts` (new) | n/a | Shared `makeSession` for the new files | n/a |
| `src/sessions/railorder.test.ts` | +8 | Cross-section `moveCard`: target section's ids, insert before target, `pinnedCount` from the drop side, target `groupId`, Ungrouped as target (W7) | pass |
| `src/shortcuts.test.ts` | +21 | ⌥⌘G is `new-group` (W11); ⌘G, ⌥⇧⌘G and ⌃⌥⌘G match nothing; 16-cell modifier grid for the new chord; dead-key `©` | pass |
| `src/render/mainhead.test.ts` | +3 | Group control writes the caller's text, follows `connected`, untouched by the no-session pass | pass |
| `src/protocol/session.test.ts` | +11 | `groupId` required; null or integer accepted; string, fraction, boolean, object, array rejected | pass |
| `src/protocol/messages.test.ts` | +19 | `groups` message, snapshot groups, `sessionUpsert` `groupId` | pass |
| `src/api/sessions.test.ts` | +17 | `putSessionOrder` with and without `groupId` (null is not omitted), `putSessionsGroup`, `endSessions`, `removeSessions` | pass |
| `src/api/launch.test.ts` | +8 | `groupId`/`newGroup` on both request forms, `unknown_group`, 201 without `groupId` rejected | pass |
| `src/api/http.test.ts` | +9 | The nine new endpoint functions join the `network_error` table | pass |
| `src/ws.test.ts` | +4 | `onGroups` dispatch, no handler registered, malformed frame | pass |
| `src/app.test.ts` | +2 | Initial `groups`/`ungrouped`, not shared between apps | pass |
| `src/sessions/card.test.ts` | +4 | `displayTitle` and its agreement with the card view-model | pass |
| `src/sessions/sort.test.ts` | +3 | `orderRail`, `sortSessions` and `pickNeediest` ignore `groupId`, so the strip's order stays flat (W10) | pass |

The per-file additions are the difference in collected cases between the committed file and mine, table rows counted. `render/sessions.test.ts` lost its one `renderSessions` case, so the net change in existing files is 108.

### Fails on the old code

Run in a throwaway copy under the scratchpad, one mutation at a time; the worktree was not touched. Each mutation undoes the behaviour the new tests pin, and the named file ran red.

| Mutation | Test file | Result |
|----------|-----------|--------|
| unknown `groupId` kept out of Ungrouped | `sections.test.ts` | 2 failed |
| `visibleCards` ignores collapsed | `sections.test.ts` | 4 failed |
| `filterForFocus` never flips to `all` | `sections.test.ts` | 5 failed |
| ended counted from `state`, not `alive` | `sections.test.ts` | 3 failed |
| `defaultFocusId` without the whole-rail fallback | `sections.test.ts` | 3 failed |
| flat rail drawn headed | `sections.test.ts` | 5 failed |
| cross-section drop inserts after target | `railorder.test.ts` | 5 failed |
| `moveCard` returns the whole rail | `railorder.test.ts` | 6 failed |
| `moveCard` returns the dragged card's own `groupId` | `railorder.test.ts` | 5 failed |
| snapshot with one key accepted | `groups.test.ts` | 1 failed |
| `groupId` optional on a Session | `session.test.ts` | 2 failed |
| batch report missing `failed` accepted | `batch.test.ts` | 2 failed |
| `batchReport` ignores `failed` | `groupscopy.test.ts` | 1 failed |
| `removeManyBody` always states a live count | `groupscopy.test.ts` | 1 failed |
| launch name not trimmed | `launchgroupchoice.test.ts` | 3 failed |
| launch sends both `groupId` and `newGroup` | `launchgroupchoice.test.ts` | 1 failed |
| ⌥⌘G binding removed | `shortcuts.test.ts` | 3 failed |
| ⌥⌘G requires shift | `shortcuts.test.ts` | 5 failed |
| group control ignores connection | `mainhead.test.ts` | 1 failed |
| group label never written | `mainhead.test.ts` | 1 failed |
| `putSessionOrder` omits a null `groupId` | `sessions.test.ts` | 1 failed |
| `endSessions` posts to the wrong route | `sessions.test.ts` | 1 failed |
| `deleteGroup` ignores the `deleted` type | `groups.test.ts` (api) | 2 failed |
| `updateGroup` expects 200 | `groups.test.ts` (api) | 1 failed |
| snapshot does not emit `groups` | `wsapp.test.ts` | 3 failed |
| `groups` frame falls through to `onSnapshot` | `ws.test.ts` | 1 failed |
| initial `groups` state wrong | `app.test.ts` | 1 failed |
| `displayTitle` fallback changed | `card.test.ts` | 2 failed |
| Stop ignores `anyAlive` | `selectbar.test.ts` | 1 failed |
| Stop keeps ended ids | `batchplan.test.ts` | 3 failed |
| Remove drops ended ids | `batchplan.test.ts` | 4 failed |
| `live` counts every kept id | `batchplan.test.ts` | 4 failed |
| `live` always 0 | `batchplan.test.ts` | 10 failed |
| unknown ids kept | `batchplan.test.ts` | 11 failed |
| order follows the chosen ids, not `sessions` | `batchplan.test.ts` | 6 failed |
| never `null` | `batchplan.test.ts` | 3 failed |
| Stop with no live id returns an empty plan | `batchplan.test.ts` | 2 failed |
| Remove with no known id returns an empty plan | `batchplan.test.ts` | 1 failed |

All 38 mutations were caught. The nine `batchplan.test.ts` ones ran in a second throwaway copy under the scratchpad against the committed `batchplan.ts`; the first batch of 29 ran earlier. The old inline rule was a closure and cannot be imported, so each mutation undoes one clause of the rule instead. A further one, in `sort.ts`, was a no-op by construction and is not counted.

## Handoff Received

Each file the web-impl log's `## Handoff` names, and what I changed.

- `api/launch.test.ts`, `api/sessions.test.ts`, `features/actionscopy.test.ts`, `render/dead.test.ts`, `render/mainhead.test.ts`, `render/sessions.test.ts`, `render/tiles.test.ts`, `sessions/card.test.ts`, `sessions/live.test.ts`, `sessions/sort.test.ts`, `sessions/store.test.ts`, `ws.test.ts`: `groupId: null` on every `Session` fixture. Not on `PastSession` in `api/launch.test.ts`, which has no such field: my first pass added it there and `tsc` rejected it, so I removed it.
- `protocol/session.test.ts`, `protocol/messages.test.ts`: `groupId: null` on the wire fixtures, plus the tests above.
- `protocol/prefs.test.ts`, `protocol/theme.test.ts`, `protocol/update.test.ts`, `protocol/messages.test.ts`, `ws.test.ts`, `features/updaterestart.test.ts`: `groups: []` and `ungrouped: { pos: 0, collapsed: false }` on every snapshot fixture. The parser now emits both keys, so a `toEqual` against an input without them failed (90 failures at the start).
- `render/mainhead.test.ts`: the fake elements gain `groupBtn`, a button whose `querySelector(".ig-name")` returns the name span. Every `renderMainhead` call takes the new trailing `groupText`.
- `render/sessions.test.ts`: the one `renderSessions` test is deleted with its import and the now-unused `fakeElement`. See Notes for the covering e2e.
- `sessions/railorder.test.ts`: `items()` takes an optional `groupId`, defaulting to null, and the existing expectations carry `groupId: null`.
- `shortcuts.test.ts`: the ⌥⌘G rows and cases above.
- Not mine, per the Handoff: `web/e2e/shell.spec.ts:47` and the four spec findings for validate mode.

## Notes

**Declined coverage, with the test that covers the exact case.**

- `renderSessions`' empty state ("No sessions yet") moved to `railsections.ts`, which builds DOM. `web/e2e/shell.spec.ts:25`: `await expect(page.getByText("No sessions yet", { exact: true })).toBeVisible();` covers a rail with no groups. `web/e2e/groups-select.spec.ts:589`: `page.locator("#sessions").getByText("No sessions yet", { exact: true })` covers it with groups present.
- Delete-group disposition mapping in `groups.ts` `confirmDelete`: `groups.spec.ts:491`, `:533` and `:565` cover ungroup, move and remove, each asserting the resulting membership.
- A blank rename sends nothing: `groups.spec.ts:256`, "a whitespace-only name on Enter, each restore the old name and send nothing".

**Mixed live and ended Stop, and the stale-id drop:** now covered by `batchplan.test.ts`, "live and ended together: the request carries only the live ids" (`batchPlan("end", [1, 3, 2], rail)` equals `{ ids: [1, 2], live: 2 }`) and "drops an id no session carries" (`batchPlan(action, [1, 99], rail)` equals `{ ids: [1], live: 1 }`), each for Stop and Remove where it applies. That `dispatchMany` and the header menu actually call `batchPlan` is read from `actions.ts:221` and `groups.ts:411`, not tested; the DOM wiring is Playwright's.

**Still uncovered, by design:** `rail.ts` `onDropZone` ignoring a drop on the card's own section, and `groups.ts` `commitRename` sending nothing for an unchanged name. The plan does not specify either, so neither is a defect; the blank-name rename case is covered by `groups.spec.ts:256`.

**Dropped on purpose.** I wrote a test that the Focus header's group control stays enabled for a dead session, then removed it. The plan does not say, so it would have pinned behaviour the plan leaves open.

**Observation, no impact.** `groupOptionsKey` joins value and label with `\u0000` and `\u0001`. A group name containing both characters could collide with another option set and skip one select rebuild. I removed my test for it; a name needs two control characters to hit it.

**`dupl`.** `make size-warn` names no web test file. The new files share one `makeSession` in `src/sessions/testfixtures.ts`, beside `api/testfakes.ts`. The sixteen older test files keep the private copy each declared; I did not collapse them, since the task was bringing them up to the contract and a fixture swap is a separate change.

**Plan items checked by search, not by test.** W13: `grep -rnE ":\s*any\b|\bas any\b|<any>" web/src --include='*.ts'` has no type-position hit, only four comments using the word "any". `grep -rn innerHTML web/src` finds only three comments saying the code does not use it. W14: `git diff c14074e..e24beb6 -- web/src/main.ts` adds `initGroups`, its `groups` into `focus`, `rail` and `shortcuts`, and one comment line; `grep -n 'from "\./' web/src/features/groups.ts` returns only `./groupscopy`.

## Test Run Output

```
$ npm test
 Test Files  86 passed (86)
      Tests  2363 passed (2363)
```

## Fix Attempt 1 (review cycle 1)

**Verdict**: pass

No review issue was tagged web-tests. This wave repaired the file the web-impl fix wave broke and covered the helpers it added. Tests added: 41. The whole suite is 2404 passing in 89 files, up from 2363 in 86.

```
npx tsc --noEmit            exit 0
npm test                    Test Files 89 passed (89), Tests 2404 passed (2404)
npm run build               built in 2.15s
npx biome check .           Checked 302 files, No fixes applied
comment-checks.py --gates   comment-checks: clean
make size-warn              no web test file named; no dupl line
```

### Handoff Received

- `render/selectbar.test.ts`: the daemon-down test expected All and Done enabled. It now expects every button disabled, `all: false, done: false`, and its title says so. The re-enable test also asserts All and Done come back.

### Tests

| File | Tests | What It Tests | Status |
|------|-------|---------------|--------|
| `protocol/decode.test.ts` (new) | 16 | `asInteger`: zero, negatives, safe-integer limit and `4.0` kept; fractions, NaN, both infinities, strings, booleans, null, undefined, objects and arrays are null | pass |
| `sessions/sections.test.ts` | 5 | `groupsInRailOrder` orders by `pos` not id, returns a new array without reordering the caller's, handles empty, leaves Ungrouped out; `NO_GROUP_CHOICE` and `NEW_GROUP_CHOICE` wording | pass |
| `render/anchored.test.ts` (new) | 9 | `placeAnchored`: below with a 4px gap; flips above past the bottom margin, stays below at the exact boundary; top clamp; default clamps right overflow; `alignRight` right-aligns only when overflowing; left clamp, also under `alignRight` | pass |
| `render/options.test.ts` (new) | 4 | `fillOptions`: one option per row in order, value and label apart, replaces rather than appends, empty rows clear, label is text | pass |
| `render/dragreorder.test.ts` | 7 | `zoneKeyAttribute`: zone drop reports the key from the named attribute and the pre-drag focus; a card under the pointer wins; another attribute name reads its own; keyless zone ignored; no `zoneKeyAttribute` means ignored; zone highlight follows the pointer; a drop clears highlight and drag | pass |
| `render/selectbar.test.ts` | 1 changed | daemon-down disables All and Done too | pass |

### Mutation check

17 mutations ran in a throwaway copy under the scratchpad against the committed implementation, and each failed at least one new test: All and Done left enabled while down (2), `groupsInRailOrder` unsorted, sorted in place, and a changed label (3), `asInteger` accepting fractions, `placeAnchored` ignoring `alignRight`, never flipping, no right clamp, no left clamp, no top clamp and always right-aligning (6), `fillOptions` swapping value and label and appending (2), the drag zone beating a card, a default zone key, and no zone highlight (3). One further `asInteger` mutation was equivalent to the original by construction and is not counted.

### Notes

- **`reconcileSelectCheckbox` disabled state** (`render/sessions.ts`): builds and reconciles card DOM, so it is Playwright's. The wave-3 e2e-specs agent owns it; web-impl's handoff says the existing E24 test does not cover the card checkbox.
- **`selectMany` no-op while disconnected** (`features/groupsselect.ts`): its guard is DOM-bound and sits behind the controller, so it is Playwright's, as is the editor identity guard in `commitRename` and `commitNew`.
- **Constants**: the label values were already asserted at `features/groupscopy.test.ts:111`/`:125` and `features/launchgroupchoice.test.ts:25`/`:36`. The new test pins them at their one definition.
- `placeAnchored`'s caller choice (the menu passes `alignRight: true`, the popover does not) is read from `menu.ts` and `grouppopover.ts`, not tested; those files touch the DOM.
- `dupl`: no web test file appears in `make size-warn` output.
