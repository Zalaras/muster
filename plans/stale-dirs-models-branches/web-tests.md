# Web Tests: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Verdict**: pass
**Pack**: kb: pack 46876 words (budget 20000)

## Summary

Tests created: 48 net new (suite 1945 -> 1993; 5 old `mainheadMeta` string tests replaced by 22 structured ones, 84 previously failing now green) | Passing: 1993 | Failing: 0

Gates, all from `web/`: `npx tsc --noEmit` clean; `npm test` 77 files, 1993 passed; `npm run build` and `make web-build` clean; `npm run -s lint` clean (266 files). `make size-warn` names none of the touched test files (`grep -E 'web/src/(render/(mainhead|sessions|tiles)|sessions/card|protocol/session)\.test|dupl'` is empty).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `sessions/card.test.ts` | `repoParts` table (5 rows) | W1: `{folder:"muster /", branch}`, `" (worktree)"` on the launch branch, em-dash for a null branch, `{folder: basename, branch: null}` for `repo: null` (also trailing slash); `repoLine` derived from the same parts | pass |
| `sessions/card.test.ts` | `claudeLocationParts` table (4 rows) | W2: null when not moved, same shape as `repoParts` with the bare branch (no worktree marker), em-dash branch, basename fallback for a null location repo | pass |
| `sessions/card.test.ts` | `locationHover` / `claudeHover` / `claudeNote` table (5 rows) | W3: lines 1-2 not moved, 1-4 moved, 1-3 moved with a null location repo, line 4 omitted for a null location branch, basename line 1 for `repo: null` | pass |
| `sessions/card.test.ts` | `buildCardViewModel` carries the split readout (2) | `repo`, `claudeAt`, `claudeHover`, `claudeNote`, `hover` filled from the same session; `↳` fields null when not moved | pass |
| `sessions/card.test.ts` | `mainheadMeta` structured view-model (6) | W4: model `unknown` for null, `displayName` otherwise; `repo`/`claudeAt`/`hover` carried; `ended` null for alive, `ended 6m ago` for dead, null for dead without `endedAt` | pass |
| `protocol/session.test.ts` | `claudeLocation` (1 + 4 accept + 5 reject) | W5: absent key reads null (session kept); null, worktree location, null location repo, null location branch parse and round-trip; string, missing `directory`, non-string `directory`, repo missing `isWorktree`, non-object repo each reject the whole session | pass |
| `render/mainhead.test.ts` | `structured meta` (9) | `.rf`/`.rb` text under `.repo`, `↳` block and its separator hidden/shown, `.loc` hover lines, `.rb` removed when the repo goes away, `↳` hidden again after ExitWorktree, model slot `unknown`/name, ended slot, `button.rename` `title` incl. `untitled` (REQ-17), no-session pass leaves the slots | pass |
| `render/sessions.test.ts` | `repo block and ↳ block` (8) | `.r2` `.rf`/`.rb` text and one-line hover, `(worktree)` on launch only, `repo: null` one line, `.rb` removed/recreated across renders, `.r2c` hidden with empty title when not moved, shown with folder/bare branch and lines 3-4 hover, null location repo one line, hidden again on return | pass |
| `render/tiles.test.ts` | `Claude-location hover and ↳ marker` (3 rows + 1) | `.wh` `title` = location hover, `.wh-claude` hidden/shown, `.sr-only` text `Claude is in <directory>`, cleared on return | pass |
| 13 fixture files | n/a | `claudeLocation: null` added to each full `Session` literal and to the wire fixtures in `protocol/session.test.ts` and `protocol/messages.test.ts` | pass |

## Handoff Received

- The 13 fixtures (`api/launch`, `api/sessions`, `features/actionscopy`, `render/dead` x2, `render/mainhead`, `render/sessions`, `render/tiles`, `sessions/card`, `sessions/live`, `sessions/sort`, `sessions/store`, `ws`): `claudeLocation: null` added to each base `Session` literal. `tsc` clean afterwards.
- `protocol/session.test.ts` and `protocol/messages.test.ts`: the wire fixtures carry `claudeLocation: null`, so the parsed sessions compare equal (the 28 failures).
- `sessions/card.test.ts`: the five `mainheadMeta` string tests are replaced by the W4 structured tests; the `repoLine` tests stay (tile `.wh`, actions dialog, rail hover). W1 to W3 added.
- `render/sessions.test.ts`: the card template fake gained `.r2 > .rf` and `.r2c > [.lead, .rf]` (hidden), and `FakeDomNode` gained `append`, which `renderRepoLines` calls when it creates `.rb`.
- `render/tiles.test.ts`: `fakeTileRoot` gained `.wh-claude` (with a `.sr-only` child) and a `title` on `.wh`.
- `render/mainhead.test.ts`: `metaEl` is now a small class-addressable tree of `.meta`'s static slots (`.loc > [.repo > .rf, .sep, .claude-at > [.lead, .rf]]`, `.sep`, `.model`, `.ended-at > .ended`); corrected in review cycle 3, see Fix Attempt (review cycle 3).

## Fix Attempt (review cycle 3)

**Issue**: correctness Major 2 — `fakeMeta()` and its comment described `index.html` before `4e465fe` moved the trailing `.sep` inside `.loc`.

- `render/mainhead.test.ts`: `fakeMeta()` is now `.loc > [.repo > .rf, .sep, .claude-at > [.lead, .rf], .sep]`, then `.model`, `.ended-at > [.sep, .ended]` (the real tree), and its comment says so. `slots()` exposes `locSeps` (`.loc`'s direct `.sep` children, document order) in place of the single `locSep`.
- The three `↳`-block tests assert `locSeps.map(hidden)`: `[true, false]` while unmoved (first hidden, last shown, also after returning to the launch checkout) and `[false, false]` while moved.
- Proof: in a throwaway copy (deleted), `renderMeta` changed to toggle the last `.loc > .sep` instead; `npx vitest run src/render/mainhead.test.ts` -> `2 failed | 12 passed` (the "not moved" and "returning to the launch checkout" tests, `[true, false]` expected). Before the fix the one-`.sep` fake would have passed that mutant.
- Gates: `make web-test` 77 files, 1993 passed; `make web-build` and `make web-lint` clean.

## Implementation Bugs

None.

## Notes

- Declined coverage, none from a missing test. Truncation and compact inline layout (REQ-10 two-line truncation, REQ-11, REQ-13's 30ch/44ch caps) are layout, Playwright's job; `web/e2e/card-location.spec.ts` carries them. The one known defect there (spec line 857 reads `lineHeight`, `NaN` for `line-height: normal`) is the e2e agent's, flagged in the impl Handoff, and I did not touch it.
- The DOM-shaped suites (`render/mainhead`, `render/sessions`, `render/tiles`) keep their existing fake-element convention; no jsdom was added. The tests assert which nodes carry which text, `title` and `hidden` state, not rendering.
- No `dupl` line names these files; repetition in the new tests is table rows.
- Formatting: a stray `prettier` run reflowed existing code in four files; I three-way merged it back (`git merge-file` against prettier(HEAD)), so the diff touches only the intended lines (748 insertions, 31 deletions across the 14 files). `biome check` is clean.
- Left alone: daemon-impl's uncommitted `cmd/`, `internal/` files, and the generated docs/rules diffs that the orchestrator owns.

## Test Run Output

```
 Test Files  77 passed (77)
      Tests  1993 passed (1993)
```
