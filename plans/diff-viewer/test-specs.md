# E2E Test Specs: Code diff viewing

**Plan**: diff-viewer
**Mode**: validate (attempt 1)
**Pack**: kb: pack 29965 words (budget 30000)
**Verdict**: pass (soak caveat: one load-sensitive test, see Notes)
**Tests created**: 39 (diff.spec.ts 26, diff-review.spec.ts 13)
**Live run**: 39/39 passing (`npm run e2e -- e2e/diff.spec.ts e2e/diff-review.spec.ts`, 1.3m); soaks below

No regression pin exists in this plan's delta: every test asserts new behaviour and fails today on a named assertion (the summary/diff/review endpoints answer 404 and no button or viewer exists), so none was run live. The one test that reads as an absence, E2 (no button outside a git repo), fails first on `polls.answered(session.id)` never rising and then on `getDiffSummary`, since `GET …/diff/summary` does not exist yet.

## Tests

All rows were `collection-only` at authoring; validate-mode live results are in the last column of the soak summary below (every test passed its live run).

| File | Test Name | Requirement | What It Verifies | Run |
|------|-----------|-------------|------------------|-----|
| web/e2e/diff.spec.ts | changing a file in the launch checkout shows the diff button with its counts and reverting it removes the button, with no reload | E1, REQ-1, REQ-9 | real `git`/file edits in the launch checkout → button with exact counts text appears and disappears; page never reloaded | collection-only |
| web/e2e/diff.spec.ts | a session launched outside any git repository never shows the button after a file in its directory changes | E2, REQ-9, edge 2 | plain directory, file written, dashboard answered twice more, no button; summary `repo:false` | collection-only |
| web/e2e/diff.spec.ts | while Claude reports another checkout with its own changes, the button and the viewer show the launch checkout's only | E3, edge 1 | sibling worktree with its own changes, `cwd` move hook, button and viewer still the launch checkout's; later launch-checkout change moves the counts | collection-only |
| web/e2e/diff.spec.ts | clicking the button shows the viewer in place of the pane listing the changed files, and the button ends Close diff × with no surface selected | E4, REQ-2, REQ-10 | viewer region replaces the terminal, `aria-pressed`, five files listed incl. rename `old → new`, no segment pressed, hover title carries both scopes' counts | collection-only |
| web/e2e/diff.spec.ts | the button, Close diff viewer and Escape each close the viewer and return to the {claude,shell,docs} surface it was opened from | E5, REQ-2, INV-2 | three tests, each closes by all three routes and the original surface and segment are back | collection-only |
| web/e2e/diff.spec.ts | choosing a surface segment while the viewer is open closes it and shows that surface, each in turn | E6, REQ-2, INV-2 | shell, docs, claude chosen from the open viewer | collection-only |
| web/e2e/diff.spec.ts | Uncommitted lists a modified, an untracked added, a deleted, a git mv renamed and a binary file as the daemon reads them | E7, REQ-3, REQ-11 | daemon's own diff read is the oracle; toolbar summary equals the counts and `HEAD (sha)`; per-file counts, rename, `Binary file not shown` | collection-only |
| web/e2e/diff.spec.ts | Branch additionally lists a file changed only in a commit since main, against the merge base | E8, REQ-3 | `Branch` pressed, committed-only file listed, `main @ <merge-base sha>` | collection-only |
| web/e2e/diff.spec.ts | a checkout whose only difference is a commit since main reads branch · counts and the viewer opens on Branch, with Uncommitted reading No changes | REQ-3, REQ-9, REQ-11 | `branch · …` button, opens on Branch, clean scope reads `No changes` | collection-only |
| web/e2e/diff.spec.ts | with the {Unified,Split,Review} view open, a changed checkout shows the bar naming what changed and the lines on screen stay put apart from the bar's height | E9, REQ-4, INV-1 | three tests: exact bar text `1 new file, 1 file changed`, shown lines identical, an anchor moves by the bar's height | collection-only |
| web/e2e/diff.spec.ts | the bar leaves the shown diff alone while a comment box holds text, a change is flipped to before and a file is folded | E9, REQ-4, INV-1 | busy source state survives the bar: text, focus, flip, fold | collection-only |
| web/e2e/diff.spec.ts | a commit made while the viewer is open names the files that are no longer changed | E9, REQ-4, edge 19 | `5 files no longer changed`, shown diff unchanged | collection-only |
| web/e2e/diff.spec.ts | the bar stays in view while the diff scrolls, and Refresh shows the new diff, keeps ticks, comments and place, and removes the bar | E10, REQ-4 | wheel scroll, bar pinned (viewport and box), Refresh keeps the tick, the comment and the scrolled-to line | collection-only |
| web/e2e/diff.spec.ts | with the viewer open across a daemon restart and no change to the checkout, no bar appears and the diff stays | E11, REQ-4, edge 16 | restart, two answered polls, fingerprint equal, no bar, shown lines equal | collection-only |
| web/e2e/diff.spec.ts | an ended session still shows the button and opens its diff with its comments, with no surface selected | E14, REQ-1, REQ-8, INV-2 | `/end`, button with `💬 1`, viewer, comment card, Escape back to the dead surface | collection-only |
| web/e2e/diff.spec.ts | the {claude,shell} terminal refits to tmux's geometry with no clipped last row and no page scrollbar as the button appears, the viewer opens and closes, and the button goes | E16, REQ-22 | sizenote equals tmux `window_width/height` (both re-read in the retry), fit oracle at each step | collection-only |
| web/e2e/diff.spec.ts | a session left on the viewer shows its live terminal in its tile with no diff button anywhere, and the viewer again back in Focus | E17, REQ-23 | tile terminal live (socket tracker), no button/viewer in Tiles, viewer restored in Focus | collection-only |
| web/e2e/diff.spec.ts | the dashboard asks for counts only for the focused session and only in Focus, and switching sessions shows only the focused one's diff | REQ-27, INV-5 | request counts per session id, 6.5 s hold in Tiles asks nobody, each session's own files | collection-only |
| web/e2e/diff.spec.ts | with musterd stopped the button keeps its counts and Refresh reads Couldn't read the diff: musterd unreachable, then works again once it is back | REQ-28, edge 8 | killed daemon (connection-level failure), then restart and Refresh | collection-only |
| web/e2e/diff.spec.ts | the viewer's toolbar and side-panel controls keep focus and node identity across a real key press and a render tick | REQ-2 (focus lesson) | Split, Branch, Comments, Files, Refresh, a file fold: tag, focus, Enter/Space, >1 s tick | collection-only |
| web/e2e/diff.spec.ts | the Review controls keep focus and node identity across a real key press and a render tick | REQ-15 (focus lesson) | file tick box (Space) and Reset (Enter) | collection-only |
| web/e2e/diff-review.spec.ts | a comment saved on one line is kept across a reload, a daemon restart and a second window | E12, REQ-5, REQ-17, REQ-18 | hover, `+`, box, type, Save; daemon's review read as oracle; kept three ways | collection-only |
| web/e2e/diff-review.spec.ts | a range comment made by dragging from a line's plus saves as Lines 2–4 and is kept across a reload, a daemon restart and a second window | E12, REQ-5, REQ-17, REQ-18 | real pointer drag, `Lines 2–4`, quote of three rows | collection-only |
| web/e2e/diff-review.spec.ts | clicking a line number then shift-clicking another selects a range whose comment saves as one | E12, REQ-17 | number click and shift-click, Cancel saves nothing, second range saves | collection-only |
| web/e2e/diff-review.spec.ts | editing a comment keeps its new text across a reload, a daemon restart and a second window | E12, REQ-5, REQ-18 | Edit through the UI on a seeded comment | collection-only |
| web/e2e/diff-review.spec.ts | resolving a comment folds it to a Resolved row that is kept … and drops the open counts | E12, REQ-5, REQ-18, REQ-19, INV-3 | Resolve; `Comments (0)` and the button's `💬` go | collection-only |
| web/e2e/diff-review.spec.ts | reopening a resolved comment brings its card back and is kept … | E12, REQ-5, REQ-18 | Reopen on a seeded resolved comment | collection-only |
| web/e2e/diff-review.spec.ts | deleting a resolved comment removes it for good, across … | E12, REQ-5, REQ-18 | expand the Resolved row, Delete | collection-only |
| web/e2e/diff-review.spec.ts | changes ticked one by one are kept … and a change whose lines then change reads unticked | E13, REQ-6, REQ-15 | two of three changes ticked, mixed file tick `2/3`, kept three ways, then an edit and Refresh reads `1 / 3` | collection-only |
| web/e2e/diff-review.spec.ts | a file ticked as a whole is kept … and Reset unticks every change for good | E13, REQ-6, REQ-15 | file tick `3 / 3` kept three ways, Reset `0 / 3` kept across a reload | collection-only |
| web/e2e/diff-review.spec.ts | after the commented line moves and the diff is refreshed the comment sits on its new line, and once the line is gone it is listed outdated with its line quoted | E15, REQ-7 | card on `Line 5` between its neighbours (box geometry), then `outdated` list entry with the quote | collection-only |
| web/e2e/diff-review.spec.ts | comments and ticks stay with an ended session, survive resume and a daemon restart, and are deleted with the row by Remove | E14, REQ-8, INV-7 | End, Resume, restart, Remove; `session.diff_review` and the row via sqlite, review route 404 | collection-only |
| web/e2e/diff-review.spec.ts | a comment that cannot be saved keeps its box and text and reads Not saved, musterd unreachable, and saves once musterd is back | REQ-28, edge 9 | killed daemon, Save, then restart and Save | collection-only |
| web/e2e/diff-review.spec.ts | with two sessions, opening, ticking, commenting and closing on one never changes the other's comments, ticks or viewer | INV-5, REQ-27 | multi-session variant; daemon reads per session as oracle | collection-only |

## Deleted Tests

None.

## Fixture Changes

New `web/e2e/helpers/diff.ts` (additive): scratch checkouts built on `scratchRepo`/`git` from `helpers/card-location.ts` (`cleanRepo`, `branchOnlyRepo`, `standardRepo`, `commentRepo`, `tickRepo`, `bigRepo`, `siblingWorktree`), expected-text builders for the button and toolbar, the plan's locators, `SummaryPolls` (what the dashboard asks the daemon), daemon-read oracles (`getDiffSummary`, `getDiffBody`, `getReview`, `seedComment`, the `session.diff_review` column), `expectKeptEverywhere` (reload, restart, second window) and `terminalFitProblems`. No Claude Code payload is synthesized beyond the existing `envelopedSessionStart` and `rawUserPromptSubmit` (via `hookMover`), both from measured captures; the diff has no Claude Code source.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 / E1, E2, E3, E14 | button follows the checkout; outside a repo; other checkout; ended session |
| REQ-2 / E4, E5, E6 | open, three closes per surface, segment choice |
| REQ-3 / E7, E8 | scopes, branch-only opens on Branch |
| REQ-4 / E9, E10, E11 | bar (Unified, Split, Review, busy, commit), scroll and Refresh, restart |
| REQ-5 / E12 | seven comment tests |
| REQ-6 / E13 | two tick tests |
| REQ-7 / E15 | follows the code, outdated |
| REQ-8 / E14 | ended session; lifetime test |
| REQ-9 | E1, E2, branch-only |
| REQ-10 | E4, E5, E6, E14, E17 (no segment selected) |
| REQ-11 | E7, branch-only (`No changes`) |
| REQ-22 / E16 | two refit tests |
| REQ-23 / E17 | tile test |
| REQ-27 | polling test, two-session review test |
| REQ-28 | read failure (daemon killed), save failure (daemon killed) |
| REQ-12, 13, 14, 16, 17 (display), 18, 19 (display), 20, 21, 24, 25, 26 | not E2E: render tests R*, unit/daemon tests D*, W*, V* (REQ-17's pointer paths and REQ-18 are exercised by the E12 journeys) |

## Handoff

- Plan defect, none found. Locators the Testable UI Elements table does not pin are flexible and were never run, so validate-mode repairs are expected there: the file section (`fileHeader` is the fold control's parent, where counts are read), a line row (`getByText(exact)` of an all-added fixture line), a line-number cell (`getByText(n, exact)`), the first `Mark … reviewed` checkbox as the header's and the last as the Files row's, `button[aria-expanded]` as the file fold control.
- Not pinned by the plan and therefore not asserted: the status badge text of a file section (added/modified/deleted). E7 cross-checks status against the daemon's own diff read and asserts counts, rename and the binary note in the UI. If the status label should be an asserted element, the plan's table needs a row for it.
- The plan does not say whether Escape closes the viewer when focus is on the diff button the developer just clicked. E5 presses Escape right after a click-open, with no focus move, as REQ-2 states it with no precondition.
- REQ-22 (E16): on the Claude and shell surfaces the size row already holds the size note, so it never appears or disappears under a live terminal there; E16 therefore asserts the terminal's refit at each button and viewer transition. If the row can appear under a live terminal elsewhere, say where and the test follows.
- `docs/features/diff/spec.md` frontmatter `e2e:` glob (`web/e2e/diff*.spec.ts`, `web/e2e/helpers/diff*.ts`) is staged for the orchestrator; the three new files match it.
- No `/interface-probe` needed: no Claude Code wire shape is involved.
- No change needed to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`.

## Test Run Output

```
npx playwright test --list            -> Total: 730 tests in 64 files
npx playwright test --list diff*.spec -> Total: 39 tests in 2 files
npx tsc --noEmit                      -> clean
npx biome check e2e/diff*.ts helpers  -> No fixes applied
sh scripts/e2e-lint.sh                -> e2e-lint: clean
```

## Notes

- Every test builds its own checkout and daemon; titles are unique within each file (`--list` collects).
- The comment journeys use an untracked all-added `review.txt` so every new line number and line text is unique on screen; ticks use a file with three separated edits; Review scroll uses a 400-line file with four 40-line changes.
- Seeding a comment through `PUT …/diff/comments/{id}` builds a starting state only; every step a journey proves is made through the UI, and the daemon's `GET …/diff/review` is read back as the oracle for what was stored.


## Validate Attempt 1

Rebuilt (`make web-build build`), then `npm run e2e -- e2e/diff.spec.ts e2e/diff-review.spec.ts`: first run 35 passed, 4 failed (the four web-impl named); after repairs 39/39.

### Verification of web-impl's four named failures (each checked against the plan)

1. **E5 (docs) / E6, region locator** - spec defect. Plan Testable UI Elements pins `region` / `Diff` (`<section aria-label="Diff">`); Playwright's `name` is a substring match, so it also matched the docs reader's `Reader: diff-e5-docs`. Fixed with `exact: true`. Evidence: `34 x locator resolved to 1 element` with the viewer closed and docs surface shown.
2. **REQ-27 test** - spec defect. The plan says nothing about an API launch moving focus (`launchSession` is a plain `POST /api/sessions`); the test assumed it. Fixed by clicking B's card first.
3. **INV-5 (diff-review)** - spec defect. Viewers are per session (plan INV-5, and this test's own line "Back on A: its viewer is where it was left"); B's viewer was opened earlier, so back on B the button reads `Close diff ×`. Fixed by asserting B's viewer is still open with its two comments, instead of re-clicking.
4. Found by the soak, not by web-impl: **focus test, `fold-app after a tick`** (see Repairs 5).

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | button/Close/Escape close the viewer (docs surface, E5); choosing a surface segment (E6) | `getByRole('region', {name:'Diff'})` count 1 when 0 expected | substring name match picked up `Reader: diff-e5-docs` | `viewer()` in `helpers/diff.ts` now `{ name: "Diff", exact: true }` | REQ-2, INV-2: viewer absent after close/segment choice; the same locator is used everywhere, still resolves the viewer when open (all 39 pass) |
| 2 | dashboard asks for counts only for the focused session (REQ-27, INV-5) | B's button never visible | assumed an API launch focuses the new session | click B's card, then assert B's counts; added: B polled twice while A's request count stays unchanged | REQ-27, INV-5: stronger than before (adds the "A is not asked while B is focused" assertion its comment claimed) |
| 3 | with two sessions ... (INV-5, REQ-27) | final `openDiff` on B timed out waiting for `View diff >` | B's viewer was left open (per-session viewer) | assert `viewer` visible and `Comments (2)` on B, then Review view, `0 / 1 changes reviewed` | INV-5: B's ticks unchanged by A's tick; added the Comments (2) check |
| 4 | REQ-27 test (comment only) | comment said "A's viewer", it is the focused one's | stale comment | comment reworded | none (comment) |
| 5 | viewer's toolbar and side-panel controls keep focus ... | soak: `fold-app after a tick` focused element BODY (about 3 of 24 under load, 12 of 24 with a loaded host); mechanism measured | the test moved on after pressing Branch and Refresh without waiting for their reads to answer; `load()` redraws the whole body when the read lands (by design, kb:adr/diff-open-view-never-redraws: Refresh is the redraw), replacing the next control's node under test | per-control `redrawn` wait: after Branch, `fileFold(app)` visible; for Refresh, tag the app fold `pre-refresh` first and wait until the node no longer carries it; every assertion kept, none removed | REQ-2 focus lesson: every control still asserts tag + node identity after the key and after a >1 s tick; stronger, since Refresh's own redraw is now inside the window. Not an absence-assertion repair beyond the wait. Soak after: 24/24 twice (also at `--workers=10`, where it was 3/24 before) |

No assertion was deleted, skipped, or weakened.

## Soaks (`make e2e-soak-run`, each shard of a file run separately because a full N=10 exceeds the 600 s foreground limit; the host was shared with other sessions' builds and e2e runs, load average 50-250)

| File | Run | Result |
|------|-----|--------|
| web/e2e/diff.spec.ts | `--shard=1/2 N=10` | 130 passed |
| web/e2e/diff.spec.ts | `--shard=2/2 N=10` | 129 passed, 1 failed: E9 busy-source test (bar not shown within 15 s) |
| web/e2e/diff.spec.ts | focus test alone, N=24 x3 | 24/24, 24/24, 24/24 (after repair 5) |
| web/e2e/diff.spec.ts | E9 busy-source test alone | N=30: 27/30; N=40 `--workers=10`: 29/40; N=20: 19/20; N=20 `--workers=2`: 20/20 |
| web/e2e/diff-review.spec.ts | `--shard=1/2 N=10` | 65 passed |
| web/e2e/diff-review.spec.ts | `--shard=2/2 N=10` | 64 passed, 1 failed: E15 (second `changedBar` visible failed, detail lost to a later run's cleanup); E15 alone N=20: 20/20 |

## E2E Implementation Bugs

None.

## Handoff

- **Load-sensitive tests (not repaired, root cause is the host, not the spec or product):** the E9 busy-source test (`diff.spec.ts` "the bar leaves the shown diff alone ...") and, once, E15 (`diff-review.spec.ts`) fail to show the changed bar inside the config's 15 s when the host load average is 100-250 (other sessions' go builds, render fixtures and e2e runs were running). Measured with a probe on the failing runs: the summary poll (5 s cadence, skipped while one is in flight) itself took about 5 s to answer, then the `GET .../diff?scope=uncommitted` read had not answered by 12 s; the daemon's git reads are what is slow under load. At `--workers=2` the E9 test was 20/20. The plan budgets 15 s for this path (E9) and I may not raise it; the orchestrator should run the scoped gate when the host is quiet, and if it still reds, route to web-impl/daemon-impl as a slow `diff/summary` or `diff` read, with this evidence.
- No change needed to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`.
- Plan note (not a defect): the plan's Testable UI Elements row for the viewer is correct as a region named `Diff`; the locator needs `exact: true` because the docs reader region is named `Reader: <title>`.

## Test Run Output

```
npm run e2e -- e2e/diff.spec.ts e2e/diff-review.spec.ts  -> 39 passed (1.3m)   (after repairs)
npx playwright test --list                               -> Total: 730 tests in 64 files
npx tsc --noEmit                                         -> clean
npx biome check e2e/diff.spec.ts e2e/diff-review.spec.ts e2e/helpers/diff.ts -> No fixes applied
```

## Notes

- Probe spec files used to diagnose the flakes were scratch copies, removed before commit (`git status` shows only the three e2e files and this log).
