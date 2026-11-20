# Web Tests: better-terminal

**Plan**: better-terminal
**Verdict**: pass
**Pack**: kb: pack 32484 words (budget 30000)

## Summary

Vitest: 114 files, 3367 tests, all passing (before this step: 2 failing in `api/sessions.test.ts`, type errors in 6 test files). New this step: about 70 tests across two new files plus additions to five existing ones.

`npx tsc --noEmit` still reports 3 errors, all in `web/render/surfaces.spec.ts` (`shellsBusy`). That file is owned by render-tests and was ruled out of my scope, so `npm run build` (which runs `tsc --noEmit` first) fails until render-tests fixes it. `npx vite build` succeeds, and `npm run -s lint` is clean.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `src/protocol/terminals.test.ts` (new) | parseTerminalsMessage / parseSnapshotTerminals / parseMessage routing | valid lists, `[]`, malformed rows (n 0, negative or fractional n, bad name or busy), null list, non-numeric session keys; retired `shellActivity` is unknown; `snapshot.terminals` absent, malformed and stray `shellsBusy` | pass |
| `src/terminal/terminals.test.ts` (new) | getTerminals, anyBusy, setTerminals, forgetTerminals, terminalsFromSnapshot | whole-list replace, identity when unchanged, per-session isolation, empty drops entry, snapshot rebuild | pass |
| `src/terminal/surfaceswitch.test.ts` | showTerminal, terminalsChanged table, surfaceKey with n | INV-5 fallback to the lowest remaining terminal, last-gone reverts shell to claude, docs untouched, composite key carries n | pass |
| `src/features/surfaces.test.ts` | select('shell') asks the daemon; terminals/snapshot handling; activity any-busy; actions | last-shown kept when listed, response `n` used otherwise, unknown session ignored, snapshot resync, sessionRemoved, stale `newTerminal` guard, rename/close forwarding | pass |
| `src/render/surfaceseg.test.ts` | count, title and ▾ opener | count absent below 2 and updated in place, title only while shell is selected, opener disabled while down | pass |
| `src/render/mainhead.test.ts`, `src/render/tiles.test.ts` | signature repairs | new `terminals` argument and `SurfaceSegmentRefs` fields in the fakes | pass |
| `src/api/sessions.test.ts` | createShell `n`; createTerminal, renameTerminal, closeTerminal | `n` required, URLs, methods and bodies, error envelopes, malformed success bodies | pass |
| `src/api/http.test.ts` | network_error table | rows for the three new endpoints | pass |
| `src/terminal/shellactivity.test.ts` | comments only | no longer names `shellActivity`/`shellsBusy` | pass |

## Handoff Received

- `surfaceswitch.test.ts`: `shellRunning` replaced by `shell`; `setShellRunning`/`shellEnded` tests replaced by `showTerminal` and `terminalsChanged` tests.
- `surfaceseg.test.ts`: new 5th argument and fields; added terminal count, title and opener cases.
- `mainhead.test.ts`, `tiles.test.ts`: fakes gained `terminalsBtn`, `countEl` (and `removeAttribute`); `renderMainhead` calls pass `NO_TERMINALS_VIEW`.
- `features/surfaces.test.ts`: `n` in results, `shell` replaces `shellRunning`, plus new terminal coverage.
- `shellactivity.test.ts`, `api/sessions.test.ts`, `api/http.test.ts`: brought up to the contract as above.
- Not touched: `web/render/surfaces.spec.ts` (render-tests owns it).

## Implementation Bugs

None.

## Notes

- Declined: render-tier display assertions (R1 to R5) are render-tests' job. I did not re-verify `web/e2e/terminals.spec.ts:686`, which web-impl's Handoff names as a spec defect.
- `terminalspanel` controller and `render/terminalspanel.ts` are DOM-bound with no pure module to unit-test; the Playwright specs cover them.
- The `terminalsChanged` cases are a table, and the surfaceseg and API cases use `it.each`, so no `dupl` repetition was added.
- `make check` was started but not awaited; lint, tsc, vitest and vite build were run directly.

## Test Run Output

```
Test Files  114 passed (114)
     Tests  3367 passed (3367)

npx tsc --noEmit:
render/surfaces.spec.ts(50,33): error TS2339: Property 'shellsBusy' does not exist on type 'Snapshot'.
render/surfaces.spec.ts(61,24): ...
render/surfaces.spec.ts(71,27): ...
```

## Fix Attempt (review cycle 1)

- W4 (correctness Minor 4): web/src/features/surfaces.test.ts gained an it.each, one row per action (rename, close), resolving a no_shell error result. Asserts no throw, no unhandled rejection, and the mocked showDeadSurfaceNotice never called (render/dead partially mocked).
- render/popover.ts options ignoreOpenDialogs / keepOnInnerScroll: no Vitest test. They are document-level pointerdown/scroll listeners over real DOM nodes (closest("dialog[open]"), panel.contains) and web/vitest.config.ts has no jsdom. Belongs to render tests (web/render/), owned by render-tests this wave.
- tsc --noEmit and npm run build clean; vitest passing.
