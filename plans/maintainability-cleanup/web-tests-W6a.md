# Web Tests: Maintainability Cleanup (Unit W6a — render layer, placement half)

**Plan**: maintainability-cleanup
**Verdict**: pass
**Pack**: `kb: pack 65885 words (budget 8000)` — sections rules 841 · features 26183 · diagrams 0 · decisions 27308 · proposed 0 · facts 9486 · lessons 1417 · runbooks 644 (`--plan maintainability-cleanup --role web-tests`; over budget, WARN only)

## Summary

Repaired the sanctioned test breakage from `web-implementation-W6a.md` (5 wrapped call
sites in `masthead.test.ts`) and relocated every test file whose subject module moved,
per the Handoff. No implementation files touched.

Test counts: **1829 total, all passing → 1852 total, all passing.**

- 10 test files moved/split to sit beside their relocated subject module (`git mv` plus,
  for six of them, splitting a file that covered both a moved pure function and DOM left
  behind — verified case-count parity before/after each split, see table).
- 2 new test files written for previously-untested pure logic that this unit's placement
  moves newly isolated (`features/actionscopy.ts`'s dialog-body composition,
  `render/settings.ts`'s wiring controller) — 23 new tests, listed under "New coverage".
- 1 new test file for the one DOM-trivial builder in a new render/ module
  (`render/launch.ts`'s `renderLaunchFooter`) — 4 new tests.
- 2 stale prose comments fixed for accuracy/dead-refs (`hello.test.ts`,
  `sessions/permission.test.ts` — the latter was an actual `dead-refs.py --all` gate
  failure, fixed).
- `docs/features/launch/{spec.md gloB already edited by web-impl}` needed `make gen-kb`
  to regenerate `.claude/rules/launch.md`/`docs/features/launch/INDEX.md` (stale, per
  `make check-kb`); done, tail below.

`npx tsc --noEmit` → 0 errors. `make web-lint web-test web-build check-kb` all green
(tails below).

## Tests — moved/split (case-count parity verified against the pre-move file)

| Original file (before this unit) | New location(s) | Cases before → after | Status |
|---|---|---|---|
| `render/crumbs.test.ts` (only ever tested `splitCrumbs`, which moved) | `features/launchcrumbs.test.ts` | 9 → 9 | pass |
| `render/focusrestore.test.ts` | `features/connectionrestore.test.ts` | import-path fix only | pass |
| `render/launchrestore.test.ts` | `features/launchrestore.test.ts` | import-path fix only | pass |
| `render/focus.test.ts` | `render/focuskeep.test.ts` (rename only, import already fixed by web-impl) | unchanged | pass |
| `render/masthead.test.ts` (`describeClaudeVersion` describe block) | split: block → `features/connectionversion.test.ts`; `renderClaudeVersion` describe's 6 call sites wrapped in `describeClaudeVersion(...)` per the Handoff | 51 → 44 + 7 | pass |
| `render/update.test.ts` (`buildUpdateViewModel` describes + `expectGridRowConsistent`/full-grid) | split: pure half → `features/updateview.test.ts`; DOM half (`renderUpdateSection`/`renderSettingsBadge`/`renderRestartImpact`/`initRestartConfirm`) stays, re-importing `buildUpdateViewModel` only to build its own fixtures | 67 → 46 + 21 | pass |
| `render/sessions.test.ts` (`renderFocusMain`/`renderSizenote` describes) | split: those two describes → `render/focusview.test.ts`; `reconcileCards`/`renderSessions` stay | 34 → 29 + 5 | pass |
| `terminal/surfaceswitch.test.ts` (`updateSurfaceSegment` describes + fakes) | split: DOM-attribute-write half → `render/surfaceseg.test.ts`; pure reducer tests stay | 50 → 39 + 11 | pass |
| `render/dead.test.ts` (`loadPane` describe) | split: `loadPane` → `features/actions.test.ts`; DOM half (`renderDeadSurface`/`showDeadSurfaceNotice`) stays | 21 → 16 + 5 | pass |
| `features/issue.test.ts` (`renderIssueButton` describe) | split: `renderIssueButton` → `render/issue.test.ts`; `composeNoteSection` stays | 13 → 11 + 2 | pass |

Each split's before/after `it(` count was checked against the file's own pre-move
content (read directly at the start of this unit, before any edit) — every pair sums
back to the original, confirming no case was dropped or duplicated in the split.

## New coverage

| File | What It Tests | Why new here |
|---|---|---|
| `features/actionscopy.test.ts` | `endDialogBody`/`removeDialogBody`: title vs `null` → "untitled", directory-basename vs `repo.name / branch`, the alive-only "This ends the session first." clause (REQ-14/E9), and that End's copy doesn't vary with `alive` | `sessionLabel`/`endDialogBody`/`removeDialogBody` were inline in `render/confirm.ts` before this unit's B7 split and had no test file at all (`render/confirm.test.ts` never existed); now isolated as pure, DOM-free decision logic in `features/actionscopy.ts` with zero DOM involved — squarely this role's job, not Playwright's |
| `render/settings.test.ts` | `initSettingsDialog`: close/open (incl. no-op on already-open/-closed), each theme/rail-activity radio's `change`→handler wiring (incl. ignoring an unchecked-radio event and an unrecognised value via the `isThemeChoice`/`isRailActivity` guards), the Updates section's toggle/checkBtn/applyBtn/restartBtn wiring, and `setChecked`'s INV-7 contract (checks exactly the matching radio, leaves every theme radio unchecked for an unrecognised stored theme — edge case 6) | New module (B9 split out of `features/settings.ts`); zero `document.createElement` calls (matches `render/confirm.ts`'s/`render/update.ts`'s `initRestartConfirm` shape exactly, which already get this treatment), so plain fakes suffice — no DOM-simulation needed |
| `render/launch.test.ts` | `renderLaunchFooter`: no-path em-dash state, path-with-no-branch, path-with-branch (" · branch"), and a stale-branch-to-nothing re-render transition | New module (B9 split out of `features/launch.ts`); this one builder among the four moved here only writes `textContent`/`hidden` on refs it's given — no `createElement`/`cloneNode` — so, unlike its three siblings, it needs no jsdom |

## Declined coverage (DOM construction, Playwright's job per docs/conventions.md)

No jsdom is configured (`web/vitest.config.ts`); every function below calls
`document.createElement`/`template.content.cloneNode` directly and was untested before
this unit's move (no prior test file touched it) — consistent with the existing
convention already applied to `render/crumbs.ts`'s `renderCrumbs`, `render/tiles.ts`'s
`buildTile`, and `terminal/surfaceswitch.ts`'s (now `render/surfaceseg.ts`'s)
`buildSurfaceSegment`. Not an implementation bug; moving them didn't create a new gap.

| Function | File | Why declined |
|---|---|---|
| `buildActionButton` | `render/actionbutton.ts` | Real DOM (`document.createElement`); B11 split, no prior test |
| `buildSessionOptions` | `render/issue.ts` | Real DOM; B9 split, no prior test (`renderIssueButton`, the DOM-trivial sibling, is covered above) |
| `renderRecentsList`/`buildRecentButton`, `renderBrowseListing`/`buildBrowseEntryButton`, `renderBrowseLoading` | `render/launch.ts` | Real DOM (`template.content.cloneNode`/`document.createElement`); B9 split, no prior test (`renderLaunchFooter`, the DOM-trivial sibling, is covered above) |
| `buildFrontmatterNode`/`buildFrontmatterTable`/`buildFrontmatterFallback` | `render/frontmatter.ts` | Real DOM; d-m4 split out of `reader/markdown.ts`, which itself had no test file (`reader/frontmatter.ts`'s own test file is the *pure* `splitFrontmatter` module — unrelated, pre-existing, not to be confused with this one) |

## Not mine to fix

- `TODO.md:263` still cites `render/focusrestore.ts` and `render/launchrestore.ts` (pre-move
  paths) — `dead-refs.py --all` flags both as missing. `TODO.md` is outside this unit's
  scope (web/ only); flagging to the team lead.

## Gate tails

```
$ npx tsc --noEmit
(0 errors)

$ make web-lint
cd web && npm run -s lint
Checked 240 files in 191ms. No fixes applied.

$ make web-test
cd web && npm test
 Test Files  69 passed (69)
      Tests  1852 passed (1852)

$ make web-build
✓ built in 1.68s
(pre-existing >500kB chunk-size warnings only, unrelated to this unit)

$ make gen-kb
kb: regenerated 2 file(s): .claude/rules/launch.md, docs/features/launch/INDEX.md

$ make check-kb
kb: 425 records, 23 features, 0 problem(s)
kb: all checks pass

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py --all
dead-refs: 3021 references checked, 2 missing (both TODO.md:263, out of web/ scope — see above)
```
