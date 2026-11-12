# Web Tests: claude-tmp-files

**Plan**: claude-tmp-files
**Verdict**: pass
**Pack**: kb: pack 21649 words (budget 30000)

## Summary

Tests created: 84 new rows/cases | Passing: 3267 of 3267 (`npm test`) | Failing: 0

Attempt 2 (pre-review fix): web-impl added `scratchpadDir: null` to the shared `src/sessions/testfixtures.ts`; I added the field to the nine test-local typed Session literals in `src/features/actionscopy.test.ts`, `src/render/{dead(x2),mainhead,sessions,tiles}.test.ts`, `src/sessions/{card,sort,store}.test.ts`. `npx tsc --noEmit` clean, `npm test` 3257/3257, `npm run build` built.

Review cycle 1 fix: `biome format` on `src/api/reader.test.ts` (no assertion change; `make web-lint` exit 0), and new `src/features/readerscratch.test.ts` (10 cases) covering `createScratchTracker`: observeSession re-scan decisions, dir memory via session and listing, `docChangedNeedsRescan` through the tracker's session dir. Remaining `tsc` errors are only unused imports in `render/reader-scratch.spec.ts` (render-tests').

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `src/reader/claude.test.ts` | claudeChips, latestIso, isScratchPath, docChangedNeedsRescan, scratchDirMoved | REQ-7 chips (plan / no plan / n tmp, none at 0), age pick, tmp badge path test, REQ-11 re-scan decisions and moved-folder rule | pass |
| `src/api/reader.test.ts` | scratch block, plan.modifiedAt | decodes scratch (nested, null writtenAt, empty files, null); rejects absent/malformed scratch and plan.modifiedAt | pass |
| `src/features/readerscratch.test.ts` | createScratchTracker | re-scan decisions, scratch dir memory, doc-changed re-scan via session dir | pass |
| `src/protocol/session.test.ts` | scratchpadDir | string and null decode; rejects absent, number, object, boolean | pass |
| `src/reader/memory.test.ts` | claudeFolded, withClaudeFolded | default folded, absent/invalid decode to folded, false kept, setter joins the fold table | pass |

## Handoff Received

Added `scratchpadDir: null` to `src/api/launch.test.ts`, `src/api/sessions.test.ts`, `src/sessions/live.test.ts`, `src/ws.test.ts`, `src/protocol/session.test.ts`, `src/protocol/messages.test.ts`; `claudeFolded: true` to `src/reader/memory.test.ts`; `scratch`/`modifiedAt` into `src/api/reader.test.ts` bodies. `src/sessions/testfixtures.ts`: done by web-impl in b1c9a9cf; the nine local literals listed in Summary fixed in attempt 2. No existing test asserts `planSlot`/`badgeVisible` (grep: none).

## Implementation Bugs

None.

## Notes

DOM-side logic (`render/reader.ts`, `features/reader.ts`) is the render and E2E tiers' (REQ-7..12 display, REQ-11 trigger wiring); the pure decisions it calls are covered above.

## Test Run Output

```
Test Files  111 passed (111)
      Tests  3257 passed (3257)
tsc: clean; build: built in 2.58s
```
