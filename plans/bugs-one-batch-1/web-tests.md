# Web Tests: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: pass
**Pack**: kb: pack 29379 words (budget 30000)

## Summary

Red-first. W4 red on assertion (required). W3 green on purpose. W1 and W2 are new logic tests against
names that do not exist yet, so they fail and `npx tsc --noEmit` reports missing exports until the impl lands.

## Tests

| File | Test | Status today |
|------|------|--------------|
| `web/src/terminal/shellkeys.test.ts` | a wheel the other way after a clamped downward / upward flick scrolls the new direction at once | red (assertion: -200 vs 5, and mirror) |
| `web/src/render/focusview.test.ts` | a reserving null-geometry call stays visible and holds exactly one NBSP | green (guard, as planned) |
| `web/src/features/railmenuitems.test.ts` | `selectionMenuItems`: all-live, all-ended, mixed, label count, no Resume/Pin, danger, disabled when disconnected / in flight | red (export missing) |
| `web/src/reader/memory.test.ts` | `withScroll`, `withScrollPruned`, old-shape JSON parses to `scroll: {}`, malformed scroll falls back to `{}` | red (exports and field missing) |

## Handoff Received

None (red-first).

## Names the impl agent must match

- `railmenuitems.ts`: `selectionMenuItems(sessions: readonly Pick<Session, "alive">[], state: CardMenuState)` returning
  `{ label: string; actions: CardMenuAction[]; moveDisabled: boolean }`. The label is `Actions for N sessions`. Actions are
  `Stop…` (action `end`) when any session is alive, then `Remove…` (action `remove`, danger) when any is ended. No Resume and no `pin` key. Every action and `moveDisabled` are disabled when `!connected || busy`.
- `memory.ts`: `ReaderMemory.scroll: Readonly<Record<string, number>>`, default `{}`; `withScroll(memory, path, top)`; `withScrollPruned(memory, listedPaths: readonly string[])`; `parseMemory` falls back to `{}` when `scroll` is missing, not a record, or has a non-number value.
- Existing `EMPTY` in `memory.test.ts` was changed to include `scroll: {}`, so all 38 pre-existing memory tests fail until the field lands (expected, part of the contract).

## Notes

The `implicit any` tsc errors in railmenuitems.test.ts disappear once the export exists.

## Test Run Output

```
src/terminal/shellkeys.test.ts: 2 failed (the two new W4 rows, AssertionError on lines)
src/render/focusview.test.ts: all pass
src/reader/memory.test.ts: 38 failed; src/features/railmenuitems.test.ts: 9 failed (new selectionMenuItems cases)
```


## Ordinary Mode (after web-impl 45a68d8c)

The red-first tests are green. Added at the unit level:

| File | Test | What it tests | Status |
|------|------|---------------|--------|
| `web/src/wsapp.test.ts` | update relays (popout and dashboard rows) | `onUpdate` emits `update` bare and renders once; `onHelloArrived` emits `helloArrived`, no render; pop-out carries no dashboard-only handler | pass |
| `web/src/features/readerscroll.test.ts` | 8 tests | restore on open and again after diagrams settle; top for no stored position; user wheel drops pending restore; 150 ms debounce saves last value once; own restore scrolls not saved; open flushes against old path; dispose flushes last seen value and detaches; nothing saved before open | pass |

Declined, DOM-only, left for render/E2E: the selection menu's "any selected id in flight disables every item" is
`ids.some(deps.actions.inFlight)` in `railmenu.ts` (DOM builder); the pure half's busy-disables-all rows are
already in `railmenuitems.test.ts` (`in flight` rows). The reader's pruning against the plan path and the pop-out's
`?path=` happens inside the `reader.ts` class (DOM); the pure `withScrollPruned` is covered in `memory.test.ts`.

Run: `make web-test` 106 files / 3030 tests passed; `make web-lint` clean; `npx tsc --noEmit` and `npm run build` ok.

## Fix Attempt (review cycle 1)

Code Minor 2: `railmenuitems.test.ts` label test is now a table with a one-session row (`Actions for 1 session`) beside 2 and 3. Against the old `${n} sessions` literal the 1-row would read `Actions for 1 sessions` and fail the exact `toBe`. railmenuitems tests: 19 passed; `tsc --noEmit` clean. Verdict: pass.
