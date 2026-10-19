# Web Tests: See added directories

**Plan**: see-added-dirs
**Verdict**: pass
**Pack**: kb: pack 21784 words (budget 30000)

## Summary

Tests created: 62 new cases (2806 total in the suite) | Passing: 2806 | Failing: 0

`npx tsc --noEmit`, `npm test` (98 files, 2806 tests), `npm run build` and `npm run lint` are green.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `protocol/session.test.ts` | addedDirs accepts (5 rows) | empty array, one entry, `repo: null` entry, null-branch repo, wire order kept | pass |
| `protocol/session.test.ts` | addedDirs rejects (9 rows + missing key) | null, undefined, object, string, string entry, missing/numeric directory, malformed repo, good-then-bad entry, absent key | pass |
| `protocol/messages.test.ts` | carries addedDirs through, rejects an upsert lacking the key | sessionUpsert decode | pass |
| `sessions/locationpanel.test.ts` | locationPanelModel (6 rows) | launch row, no-repo basename, claudeAt row, heading count, wire order, repo/branch/null rows | pass |
| `render/locationpanel.test.ts` | createLocationPanel (12) | 350 ms delay, tooltip appended to body, row order, no sub-heading at N = 0, `↳` lead, cancel on leave, close on leave/pointerdown, close() idempotent and cancels pending, no double panel, null model, model read at open, detach | pass |
| `sessions/card.test.ts` | mainheadMeta addedCount and folder line (3 rows) + tile hover unchanged | `muster+2` slash drop, no-repo basename, N = 0 keeps slash, REQ-8 | pass |
| `render/mainhead.test.ts` | the `+N` suffix on the folder line (6) | span structure, textContent `muster+2`, reuse across ticks with zero text writes, in-place count change, return to 0, no-repo `muster+1` | pass |
| `render/mainhead.test.ts` | three location tests | `.loc` has no `title` (REQ-7 W2) | pass |

## Handoff Received

- `sessions/testfixtures.ts`, `sessions/live.test.ts`, `api/launch.test.ts`, `api/sessions.test.ts`, `ws.test.ts`, `protocol/session.test.ts`, `protocol/messages.test.ts`, and the private Session fixtures in `store`, `sort`, `card`, `tiles`, `dead`, `actionscopy`, `mainhead`, `render/sessions` tests: `addedDirs: []` added.
- `sessions/card.test.ts`: the `hover` assertion replaced by `addedCount` and folder-line assertions.
- `render/mainhead.test.ts`: title assertions now `""`; fake DOM gained `classList.add/remove` and `:scope >` lookup for the new `repolines.ts`.
- `render/sessions.test.ts`: fake node gained a `classList` shim (all 37 failures were `classList` undefined in `repolines.ts`, a fixture gap).

## Notes

- Fails-on-old-code: in a `git archive a6b9c46c` copy (pre-implementation) with these test files overlaid, `6 failed | 8 passed` files; every new addedDirs, `+N`, panel and `addedCount` case fails (parseSession drops the key, `locationpanel` modules absent, `.loc` still has a title).
- Declined: the W4 width-sweep defect in `e2e/added-dirs.spec.ts:803` is an E2E spec-scope matter reported in web-implementation.md; not unit-testable.
- No `dupl` repetition kept; table rows used throughout.

## Fix Attempt 1 (review cycle 1)

**Verdict**: pass

Tests added for wave 1's web changes (19):

| File | Tests | What |
|------|-------|------|
| `web/src/render/hovertip.test.ts` (new) | 10 | `show` opens, no-op on null model (closes any open panel), never two panels; `refresh` no-op while closed or after `close()`, keeps node on an equal model, rebuilds on a changed one, new baseline after rebuild, closes on null, works on a hover-opened panel |
| `web/src/sessions/card.test.ts` | 5 | `folderName` table (repo name, basename, trailing slash); `repoParts(s, false)` carries no ` /`, default keeps it; no-repo bare basename |
| `web/src/render/locationpanel.test.ts` | 4 | `refresh()`: branch change shows without reopening; session end drops Added section; focused session gone closes; unchanged model keeps the node, closed stays closed |

Declined: `addedDirs` via `parseListOf` is covered by `protocol/session.test.ts` `describe("addedDirs")` (accepted table incl. `repo: null`, rejected missing/non-array/malformed), all passing unchanged. `grouppopover.ts` has no existing unit test. `focus.ts` `renderView` calling `locationPanel.refresh()` needs DOM; covered by web-impl's Playwright run (`e2e/added-dirs.spec.ts`), not unit-reachable.

Fails-on-old-code: `git archive 4bca4ec0^ web` extracted to a scratch dir, the three test files overlaid, scratch dir deleted after. `3 failed files | 8 failed | 175 passed`:
```
FAIL src/render/hovertip.test.ts  Error: Cannot find module './hovertip'   (all 10 cannot run)
FAIL card.test.ts > folderName ... (x3)  TypeError: folderName is not a function
FAIL card.test.ts > repoParts(session, false) carries no ` /`  expected { folder: 'muster /' } to equal { folder: 'muster' }
FAIL locationpanel.test.ts > refresh() ... (x4)  TypeError: panel.refresh is not a function
```
The remaining card test (no-repo bare basename) passes on old code by design (a regression guard).

Gates in `web/`: `npx tsc --noEmit` 0; `npm test` `Tests 2825 passed (2825)`; `npm run build` ok; `npm run lint` clean.
