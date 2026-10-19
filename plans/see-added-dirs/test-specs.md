# E2E Test Specs: See added directories

**Plan**: see-added-dirs
**Mode**: fix (attempt 1, review cycle 1 wave 3; validate attempt 1 below)
**Pack**: kb: pack 30452 words (budget 30000)
**Verdict**: pass
**Tests created**: 26 in `web/e2e/added-dirs.spec.ts` (20 from authoring, 6 in Fix Attempt 1); 2 existing tests in `web/e2e/card-location.spec.ts` adapted to the plan's delta
**Live run**: `added-dirs.spec.ts` 26/26 passing, soaked 10x (260 passed); validate attempt 1 ran 108/108 with `card-location.spec.ts`

## Tests

All rows are `collection-only` in the sense that matters: each asserts new behaviour and is red today. I ran `npm run e2e -- e2e/added-dirs.spec.ts` after `make web-build build` to look for regression pins; summary line `20 failed`, each on the first new-behaviour assertion (`element(s) not found` for the `+N` span or the tooltip, `session N has no addedDirs array on the wire`, `expect(locator).not.toHaveAttribute() failed` for the still-present `.loc` title). No test passed, so there is no pin to keep green.

| File | Test Name (short) | Requirement | What It Verifies | Live run |
|------|-------------------|-------------|------------------|----------|
| web/e2e/added-dirs.spec.ts | a status post with two added git directories shows +2 ... (E1) | E1, REQ-1, REQ-5, REQ-6, REQ-8, INV-3 | `+2` last-child span of `.repo .rf`, folder line ends in `+2`, computed colour equals the live `--fg-muted`; wire `addedDirs` equals the checkouts' own branches in reported order; rail card folder is exactly `<repo> /` with no span and unchanged `.r2` title; tile `.wh` text and title unchanged | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | a status post whose list is only the launch directory, under any spelling ... (D1, D3, INV-2) | REQ-1, REQ-2, INV-2, INV-3 | four launch-only spellings (`/tmp`-typed, resolved, each with trailing slash) each follow a `+1` post, so the absence is the post taking effect; wire `[]`; launch entry with trailing slash ahead of a real directory still yields `+1` | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | a post with no added_dirs key leaves the suffix and the list ... (D2) | REQ-1, edge case 1 | keyless post (proved read by its new `session_name`) leaves `+2`; later shorter list lowers to `+1` | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | a relative entry resolves against the launch directory and a symlinked duplicate collapses ... (D4) | REQ-2, edge cases 4, 5 | wire directories `[<launch>/relative-dir, <target>]`; panel rows for both | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | hovering the header readout opens a tooltip listing Location then Added directories · 2 ... (E2) | E2, REQ-7, REQ-9, W2 | `.loc` has no `title`; tooltip text is one anchored pattern (heading, launch row, sub-heading, rows in wire order, folder · branch over path); closes on leave; `pointer-events: none`; child of `document.body` | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | a session that has reported no directories has no suffix and a panel showing Location alone ... | REQ-7, W2, States | no span, folder line `<repo> /`, no `title`, panel is Location only | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | while Claude is in an added checkout the panel lists the ↳ row and the added list together | REQ-7, W3 | `↳` row plus Added section | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | an added plain directory counts in +N and shows as its folder and path with no branch ... (E7) | E7, REQ-5, REQ-5a, edge case 17 | `repo: null` row has no branch; becomes a checkout and gains `· main`; detached HEAD drops it again; count stays `+2` throughout | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | a checkout of a new branch in an added directory shows in the panel within one repo-poll tick (E5) | E5, REQ-5 | real `git checkout -b`, wire then panel show it | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | an added directory removed under a live session stays listed with its last-known branch ... (D9) | REQ-5, edge case 12 | vanished directory keeps its reading while a neighbour's new branch proves a later tick | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | stopping the session removes the suffix and the panel's Added section (E3) | E3, REQ-3, INV-1 | suffix gone, wire `[]`, panel Location only | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | stopping one of two sessions ... a straggler status post cannot refill the dead session | E3, D5, D7, INV-1 | multi-session variant: neighbour's list and `+2` untouched; late status post for the dead session leaves `[]` (stays-unchanged hold) | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | a pane that dies without a SessionEnd empties the list through liveness ... | REQ-3, D5, INV-1 | tmux window killed, list emptied, neighbour untouched | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | a pane that is gone when the daemon starts is ended by reconcile with an empty list | REQ-3, D5, INV-1 | kill daemon, kill window, restart, reload: `[]`, no suffix | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | a resumed session starts with no directories until its first status post ... | REQ-3, D5, edge case 9 | end, resume: `[]` and no suffix until the next post | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | restarting the daemon while the session is alive keeps +2 and the branches in the panel (E4) | E4, REQ-4, D8 | restart then `page.reload()` (no status post sent after), `+2`, wire and panel rows with branches | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | a /clear pair applied SessionEnd first ... / SessionStart first ... (two titles) | REQ-4, D6, edge cases 6, 7 | list kept through the pair in either order; new id's post re-reports and can change it | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | a long folder name ellipsizes before the +N suffix ... (W4) | W4, REQ-6 | widths 1280 to 360: suffix inside viewport and folder line and hit-test at its centre and right edge; `mainheadFitProblems` empty; folder name really ellipsized at the narrowest | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/added-dirs.spec.ts | with the daemon down the panel still opens on hover with the last-known directories and branches (W5) | W5, REQ-7, edge case 16 | daemon killed, banner shown, panel opens with the last-known rows | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/card-location.spec.ts | the Focus header's location hover carries the repo, the directory and, while moved, where Claude is ... (E4) | REQ-7 (replaces the `.loc` title assertions, lines 419 and 432) | `.loc` has no `title`; the unmoved and moved facts are panel rows; rail `.r2`, `.r2c` and tile `.wh` title assertions unchanged | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |
| web/e2e/card-location.spec.ts | a move outside any checkout shows the folder name alone with no branch line, and a three-line hover | REQ-7 (replaces the `.loc` title assertion, line 476) | `↳` panel row is folder over path with no branch; `.r2c` title unchanged | ran-green at validate attempt 1, soaked 10x (200 and 880 passed) |

## Deleted Tests

None. Two existing tests were edited in place, titles unchanged (see Fixture Changes).

## Fixture Changes

- New `web/e2e/helpers/added-dirs.ts`, additive: `statusWithWorkspace` / `postWorkspace` (a full status body from `envelopedStatusLineFull` whose `workspace` is replaced by the measured `{added_dirs, current_dir, project_dir}` of kb:fact/added-dirs-in-status-line / capture-0.jsonl; `project_dir` and `current_dir` are the resolved launch directory, the first `added_dirs` entry is the launch directory as typed, `/tmp/…` for `/private/tmp/…`; each post is sent as a close pair per kb:fact/status-posts-arrive-in-pairs), `wireAddedDirs` (reads `addedDirs` from `GET /api/state`, throws while the key is missing), `typedSpelling`, `scratchSymlinkTo`, `makeSubdirectory`, the `+N` locators and `expectLocationPanel` (hovers with a real pointer, retries the whole hover, compares the tooltip's text to one anchored pattern).
- `web/e2e/card-location.spec.ts`: the plan lists lines 400-433 as broken by REQ-7; **line 476 (`a move outside any checkout ...`) asserts the `.loc` title too and is not in the plan's list**. Both were adapted the way the plan's delta requires: each `toHaveAttribute("title", ...)` on `.loc` became `not.toHaveAttribute("title")` plus `expectLocationPanel(...)` carrying the same facts (launch row, `↳` row with its branch or none). The rail `.r2` / `.r2c` and tile `.wh` title assertions in those tests are untouched. The now-unused `unmoved` and `hover` locals were dropped; the `moved.split("\n")).toHaveLength(4)` check on the tile text stays, the 3-line `hover` length check went with the `.loc` title it described (the panel's `↳` row asserts the same shape: no branch between folder and path).
- No change to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts`, `e2e-lint.sh` or `payloads.ts`.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | E1; launch-only spellings; keyless post; relative and symlinked entries |
| REQ-2 | launch-only spellings (typed `/tmp` spelling, trailing slash); relative and symlinked entries |
| REQ-3 | stopping the session (E3); two-session stop with straggler; liveness death; reconcile at start; resume |
| REQ-4 | restarting the daemon (E4); both `/clear` orders |
| REQ-5 | E1 wire; E5 branch change; plain directory (E7); vanished directory |
| REQ-5a | plain directory (E7): row without branch, gains and loses `· main`, count never changes |
| REQ-6 | E1 (suffix, colour); long folder (W4); stopping (suffix removed) |
| REQ-7 | hover tooltip (E2); Location-alone; `↳` plus added; both adapted card-location tests; daemon-down (W5) |
| REQ-8 | E1 (rail card and tile header unchanged); adapted card-location tests keep their `.r2` / `.r2c` / `.wh` title assertions |
| REQ-9 | hover tooltip (E2): `pointer-events: none`, parent is `document.body`. The hover delay value is not asserted (see Notes) |
| INV-1 | stopping; two-session stop; liveness; reconcile; resume |
| INV-2 | launch-only spellings |
| INV-3 | E1; launch-only spellings; keyless post |
| E1 / E2 / E3 / E4 / E5 / E7 | one named test each, as above |

## Handoff

- **Plan ambiguity, folder-line text.** The plan says the folder line's `textContent` reads `muster+2` with no space, but today's header `.rf` reads `<repo> /` (card.ts `folder: \`${repo.name} /\``, asserted as `toHaveText(\`${repo.name} /\`)` in several specs). The spec cannot tell whether the slash stays. It pins what the plan states unambiguously: the suffix is the last-child `span` of `.repo .rf`, with text `+N`, and the folder line matches `^<repo>[ /]*\+N$` (name, optionally ` /`, then the suffix at the very end). With N = 0 it asserts the existing `<repo> /`. If web-impl drops the slash only while a suffix is shown, that is consistent with this spec.
- **Plan defect, an unlisted existing test.** `web/e2e/card-location.spec.ts` line 476 also asserts the `.loc` title; the plan's "Existing tests this breaks" names only 400-433. Adapted as above.
- **Panel markup is not pinned beyond role and text.** The spec locates the panel by `getByRole("tooltip")` and reads its whole text; it does not use the mockup's `.pop .dr .df .dp` classes, so web-impl may choose its markup. The pattern needs: the `Location` heading text first, each row's folder, ` · <branch>` when it has one, then the path (no separator needed between folder line and path), the `↳` glyph before the moved row's folder, and `Added directories · N` before the added rows.
- **Wire shapes asserted from the plan, not measured on a real post.** (1) A status post whose `workspace` has no `added_dirs` key (the keyless test) and (2) a relative `added_dirs` entry (the relative test). kb:fact/added-dirs-in-status-line measured only absolute entries, and says every post carries the key; both shapes are the plan's REQ-1 / REQ-2 stated behaviour and the fixtures omit an optional field or use the plan's shape, adding nothing the status line is not known to send. If the developer wants them measured, an `/interface-probe` of `--add-dir ./relative` and of an older version's post would settle it.
- Nothing needed from web-impl's gate-integrity files.

## Test Run Output

```
npm run e2e -- e2e/added-dirs.spec.ts   (against bin/musterd built from this tree, no implementation yet)
  20 failed
  first assertions: element(s) not found (the +N span, the tooltip); "session N has no addedDirs array on the wire";
  expect(locator).not.toHaveAttribute() failed (the .loc title is still there)
npx playwright test --list: Total: 981 tests in 60 files
sh scripts/e2e-lint.sh: e2e-lint: clean
npx tsc --noEmit and npx biome check e2e/: clean
```

## Notes

- No pin: every new test is red against today's tree, so none is marked `ran-green-at-authoring`. The `a session that has reported no directories ...` test is mostly absences (no suffix), but its `not.toHaveAttribute("title")` and the tooltip content fail today, observed in the run above.
- REQ-9's delay ("the same hover delay as the group popover", 350 ms) is not asserted: without controlling the page clock there is no deterministic oracle for "not open yet" that does not race, and installing a fake clock would also freeze the app's WebSocket-driven timers. The hover-open, leave-close, `pointer-events: none` and body-append halves are covered.
- The `/clear` test posts the new id's `SessionStart(source:"clear")` after a closed turn, the pattern in `gauges.spec.ts`; the straggler-after-rebind case (edge case 7) is the post made under the new id with the same list.
- The two-session stop test's last step (a late status post for the dead session) ends in a `settleFor(1_000)` hold, the one sanctioned fixed wait: a dead session routes no status post, so there is nothing to wait for.
- W4 sweeps widths 1280, 1024, 768, 480 and 360 and requires the folder name to be ellipsized at 360, so the suffix checks cannot pass vacuously on a name that fits.

## Validate attempt 1

Rebuilt with `make web-build build` (ok), then `MUSTER_GATELOCK_WAIT=9m npm run e2e -- e2e/added-dirs.spec.ts e2e/card-location.spec.ts` (the lock was busy behind other worktrees' sweeps; exit 75 twice before it ran): `108 passed (6.9m)`, lock wait included. `npx playwright test --list`: `Total: 981 tests in 60 files`.

Soaks: `make e2e-soak SPEC=e2e/added-dirs.spec.ts N=10`: `200 passed (3.0m)`. `make e2e-soak SPEC=e2e/card-location.spec.ts N=10`: `880 passed (8.0m)`.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | a long folder name ellipsizes before the +N suffix ... (W4, REQ-6) | web-impl's smoke run: fails at 480 (`mainheadFitProblems`: Stop 459.8-518.5 and Remove 523.5-582.1 outside the 480x800 viewport) and at 360 (`the suffix 354.6-368.2 is outside the viewport`) | The sweep went below the 600 px floor every existing header sweep stops at (`sweepWidths()` default `to = 600`; the focus-header E3 sweep is documented "2000 px down to 600 px"). Below it the header overflows with no suffix at all (web-impl measured the same Stop/Remove overflow and `model right 510.4 is past 480` with the `report` post removed), so the overflow is the header's existing minimum width, not the suffix and not a product defect the plan pins. The plan's W4 says "at the readout's floor". | `widths = [1280, 1024, 768, 600]` (was `[1280, 1024, 768, 480, 360]`), with a comment naming the floor; the test's range text says 1280 to 600 | W4 and REQ-6: at every width swept, `suffixProblems` (inside viewport and own folder line, hit-test at centre and right edge) and `mainheadFitProblems` are both empty, and `ellipsizedAtNarrowest` is still required true, now at 600 px (the 60-character folder name is ellipsized there, so the checks are not vacuous: the run passed with that assertion in place). No check was removed or loosened; only widths below the supported floor were dropped. |

No assertion was deleted, skipped, or weakened. The swept range narrowed from 360 to 600 px, declared above; a narrower supported floor would be a header-layout plan, since the existing specs pin 600.

### Checks of the implementation log's claims

- web-impl said `card-location.spec.ts` "still asserts the header `.loc` title at the lines the plan names". It does not: lines 422, 437 and 481 are `not.toHaveAttribute("title")` on `mainheadLoc` plus `expectLocationPanel` (commit 1c422092), and the only remaining `toHaveAttribute("title", ...)` assertions in the file are on `.r2`, `.r2c`, the tile `.wh` and the rename button. The adapted tests pass in the 108/108 run.

### Handoff (validate)

None new. The authoring handoff items stand (unlisted line 476, unmeasured keyless and relative shapes). web-impl resolved the folder-line slash by dropping ` /` while N > 0, which the spec's `^<repo>[ /]*\+N$` pattern accepts.

## Fix Attempt 1 (review cycle 1, wave 3)

**Mode**: fix (attempt 1)
**Pack**: kb: pack 30452 words (budget 30000; over budget by 452, WARN printed)
**Verdict**: pass
**Tests created**: 6 new in `web/e2e/added-dirs.spec.ts` (26 in the file now); one helper (`panelGeometry`, additive) in `web/e2e/helpers/added-dirs.ts`
**Live run**: `make web-build build`, then `npm run e2e -- e2e/added-dirs.spec.ts`: `26 passed (21.1s)`. `npx playwright test --list`: `Total: 987 tests in 60 files`. `tsc --noEmit`, `biome check e2e/`, `e2e-lint.sh`: clean.
**Soak**: `make e2e-soak SPEC=e2e/added-dirs.spec.ts N=10`: `260 passed (3.1m)`.

No review issue was tagged `[e2e-specs]`; this wave is the coverage the fix wave's added behaviour and edge case 15 called for. No earlier test was edited.

### Tests

| File | Test (short) | Requirement | What It Verifies | Live run |
|------|--------------|-------------|------------------|----------|
| web/e2e/added-dirs.spec.ts | with the mouse resting on the readout an added directory's new branch shows in the open panel without reopening it | REQ-5, REQ-7, browser Minor 1 | panel opened once (mouse never moved again), real `git checkout -b while-open` in the first added directory; the same open panel's whole text becomes the anchored pattern with `· while-open` on that row and `· main` on the other, one panel node, `+2` unchanged | ran-green, soaked 10x |
| web/e2e/added-dirs.spec.ts | with the mouse resting on the readout the session ending drops the open panel's Added directories section and keeps the Location row | REQ-3, REQ-7, INV-1, browser Minor 1 | panel open, `POST /api/sessions/{id}/end`, no re-hover; the open panel's text is `Location` + the launch row alone (anchored pattern, plus `not.toContainText("Added directories")`), one panel, header suffix gone, wire `[]` | ran-green, soaked 10x |
| web/e2e/added-dirs.spec.ts | an added subdirectory of an ordinary checkout reads isWorktree false and one inside a linked worktree reads true ... | correctness Major 1, REQ-5 | wire `addedDirs` for an ordinary checkout, its `pkg` subdirectory, a `.claude/worktrees/linked-wt` linked worktree and its `pkg` subdirectory: `isWorktree` false, false, true, true, each `name` the checkout's top level and `branch` its own; oracle: `git rev-parse --git-dir` differs from `--git-common-dir` in the linked worktree | ran-green, soaked 10x |
| web/e2e/added-dirs.spec.ts | a few added directories fit below the readout, so the panel sits under it inside the viewport | edge case 15, REQ-7 | 3 directories at 1280x800: readout.bottom + 4 + panel height <= 800 - 8 (so it fits), panel top >= readout bottom, every row inside the viewport, all rows listed | ran-green, soaked 10x |
| web/e2e/added-dirs.spec.ts | fifteen added directories do not fit below the readout, so the panel moves to the top ... | edge case 15, REQ-7, kb:adr/focus-location-panel-lists-every-row | 15 directories at 1280x800: readout.bottom + 4 + panel height > 800 - 8 (it does not fit, so the flip is real), panel top is 8 and above the readout top, panel bottom and all 16 rows inside the viewport, the text is the anchored 15-row pattern, 16 `.dr`, no `+K more` | ran-green, soaked 10x |
| web/e2e/added-dirs.spec.ts | twenty-two added directories are all listed in the panel, none capped and no +K more line | edge case 15, kb:adr/focus-location-panel-lists-every-row | 22 directories: the panel text is the anchored 22-row pattern in wire order, 23 `.dr`, no `+K more`; the lower rows being off-screen is the recorded limit and is not asserted | ran-green, soaked 10x |

Counts follow the browser reviewer's measurement (15 long-path rows flip at 800 px tall, 22 spill). Measured here at 1280x800 with plain-directory rows whose paths wrap to two lines: 3 directories give panel 89.4-315.4 under a readout 55-85.4; 15 give 8-726; 22 give 8-1013 (past the viewport, as decided).

### Proven red against the defects

Each defect-pinning test was run with its defect put back, then the tree restored (`git status --short` shows only the two spec files):

- `locationPanel.refresh();` commented out in `web/src/features/focus.ts` (rebuilt): both resting-mouse tests fail at the open panel's `toHaveText` after 15 s (the branch test received `... muster-e2e-loc-u7JCFx · main ...` where `· while-open` was expected; the stop test still received `Added directories · 2` with both rows).
- `gitutil.isWorktree` put back to comparing git's two printed lines (`strings.TrimSpace(lines[0]) != strings.TrimSpace(lines[1])`, rebuilt): the worktree-flag test fails with `- "isWorktree": false` / `+ "isWorktree": true` on the ordinary checkout's `pkg` subdirectory, the exact review defect.
- The overflow tests have no single line of product code to break: the row-count and anchored-text assertions go red on any cap or `+K more` line, and the two geometry inequalities are computed from the live measurements (the fit test fails if the panel sat over the readout, the flip test fails if the panel stayed below or ran off the bottom). I did not break `placeAnchored` to watch them go red.

### Repairs

None: no existing assertion was touched. No assertion was deleted, skipped, or weakened.

### Handoff (fix wave)

None. The panel's placement is measured through `getBoundingClientRect` on the real nodes; no new wire shape was needed (the worktree test reads the `isWorktree` key the `ws.session` contract already carries).
