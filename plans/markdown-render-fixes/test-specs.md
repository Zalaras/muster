# E2E Test Specs: Markdown Render Fixes

**Plan**: markdown-render-fixes
**Mode**: fix (attempt 1, review cycle 1)
**Pack**: kb: pack 5742 words (features: reader; decisions, lessons, conventions §Testing)
**Verdict**: pass
**Tests created**: 13 new tests in `web/e2e/reader.spec.ts` total (12 from validate attempt 1,
plus 1 added in this fix wave), 6 existing tests edited (5 from validate attempt 1, plus E23
edited in this fix wave) for the single-button/loading-cue design
**Live run**: 49/49 passing in `web/e2e/reader.spec.ts`; 351/351 passing in the full suite
(`make e2e`) — see Fix Attempt 1 below.

## Tests

Most tests below assert an element the single-button/loading-cue implementation hasn't built yet
(`navToggle`, `planHeaderRow` hidden, `aria-busy`, `loading <basename>…`) and are genuinely
`collection-only`. Three assert only behaviour this plan leaves unchanged — a negative ("no cue
exists"/"no `aria-busy`") alongside pre-existing content-replacement behaviour — and were run live
against the current tree per the send-back; all three are green (`ran-green-at-authoring`).

| File | Test Name | Requirement | What It Verifies | Status |
|------|-----------|-------------|------------------|--------|
| web/e2e/reader.spec.ts | the Files and Outline header toggles fold independently, and the nav toggle hides and restores the whole nav (E18, REQ-14, REQ-4; markdown-render-fixes REQ-1..REQ-3) | REQ-1, REQ-2, REQ-3 | Single `navToggle` button's `aria-expanded`/glyph track nav state; nav still hides/restores | collection-only |
| web/e2e/reader.spec.ts | on an ended session the plan block and the nav's plan header row are absent, opening a tree file still renders it, and the nav toggle still hides/restores the nav (E22, REQ-3; markdown-render-fixes E5, REQ-6) | REQ-6, E5 | `[data-role="plan-header"]` hidden on a dead session; nav toggle unaffected by liveness | collection-only |
| web/e2e/reader.spec.ts | opening a file over 10 MiB clears the loading cue and the grey-out, shows the too_large message, and leaves the body unchanged (E26, REQ-6; markdown-render-fixes E12, REQ-6/REQ-8/REQ-14) | E12, REQ-8, REQ-14 | Held response shows `loading big.md…` + `aria-busy`; release clears both, too-large message shown, prior render kept | collection-only |
| web/e2e/reader.spec.ts | in Tiles at 3x2 the reader nav starts collapsed and the bar has no path, with the nav toggle still present and flush right; at 2x2 it starts open (E27, REQ-15; markdown-render-fixes E1, REQ-1/REQ-2, INV-ONE-ARROW, edge case 8) | E1 (partial, tile), edge case 8 | Toggle present, exactly one `.arr`, flush right against the docbar's padded edge in a compact 3×2 tile | collection-only |
| web/e2e/reader.spec.ts | keyboard-activating the nav toggle leaves focus on it, in both directions, on the Focus host and on the pop-out (E2, REQ-4) | E2, REQ-4 | Replaces the deleted two-arrow focus-restore test; single button keeps focus across both toggle directions, Focus + pop-out | collection-only |
| web/e2e/reader.spec.ts | the reader has exactly one nav-toggle button, never hidden, whose right edge is unchanged between the nav open and collapsed (E1, REQ-1, REQ-2, INV-ONE-ARROW, INV-ARROW-FIXED) | E1, REQ-1, REQ-2 | Exactly one `.arr`; boundingBox right edge identical open vs collapsed (Focus) | collection-only |
| web/e2e/reader.spec.ts | the nav toggle's right edge is unchanged after the first routed write makes the freshness cue appear (E4, REQ-5, INV-ARROW-FIXED) | E4, REQ-5 | boundingBox right edge unchanged before/after `.chg` appears | collection-only |
| web/e2e/reader.spec.ts | with the file response held, selecting a tree file moves aria-current and the bar filename immediately, shows the loading status and greys the body, and releasing renders the new content and clears both (E6, E7, E8, E16, REQ-7, REQ-8, REQ-14) | E6, E7, E8, E16 | Synchronous bar/aria-current move before fetch resolves; `loading <basename>…` + `aria-busy` while held; both clear and body replaces on release | collection-only |
| web/e2e/reader.spec.ts | with the listing response held, the body reads loading… and the tree shows one loading… row (E9, REQ-9, REQ-10) | E9, REQ-9, REQ-10 | Body placeholder and tree row both read `loading…` while the listing is held; toggle still visible | collection-only |
| web/e2e/reader.spec.ts | a window focus event on an open plan and a routed write for an open tree file each re-render silently, never showing a loading cue or article.md carrying aria-busy (E10, REQ-11) | E10, REQ-11 | Window-`focus` refetch of the open **plan** (REQ-19 gating, unchanged) and a `docChanged` refetch of a plain tree file, both held: no status-line text, no `aria-busy`, at any point | **ran-green-at-authoring** |
| web/e2e/reader.spec.ts | a pop-out opened with no path query settles its body on nothing open — pick a file (E11, REQ-9) | E11, REQ-9 | Direct `/doc.html?session=<id>` navigation (no `path`) settles on the "nothing open" placeholder, never `loading…` | **ran-green-at-authoring** |
| web/e2e/reader.spec.ts | a reader whose remembered open path was deleted before mount settles its body on nothing open — pick a file, never on loading… (E14, edge case 3) | E14, edge case 3 | Remembered path deleted before reload; body settles on "nothing open", not stuck loading | **ran-green-at-authoring** |
| web/e2e/reader.spec.ts | stopping the daemon mid-load shows the unreachable text and leaves no loading cue once it is restarted (E13, REQ-15) | E13, REQ-15 | Held request released against a dead daemon (network error); unreachable wins status line; cue/`aria-busy` gone, stay gone after restart | collection-only |
| web/e2e/reader.spec.ts | with two tiles on docs, holding one tile's file response shows the loading cue in that tile only, leaving the other tile's status line hidden (E15, INV-CUES-PER-INSTANCE) | E15, INV-CUES-PER-INSTANCE | Two live tiles; held fetch in one shows cue/`aria-busy` there only, bystander untouched | collection-only |
| web/e2e/reader.spec.ts | a first open on a plan-less session, held, shows loading… in the body and never nothing open — pick a file (REQ-9; review markdown-render-fixes cycle 1 Major 1) | REQ-9 | Fix Attempt 1: nothing rendered yet, file response held on a plan-less/memory-less session — body shows `bodyLoadingPlaceholder`, never `bodyPlaceholder`, with `aria-busy` | fix-wave-3, ran live |
| web/e2e/reader.spec.ts | on an ended session whose directory was removed, the status line shows the directory_missing message and the tree's loading row clears (E23, edge case 12; markdown-render-fixes edge case 2) | REQ-10, edge case 2 | Fix Attempt 1: added `treeLoadingRow` count-0 assertion once the `directory_missing` status line settles | fix-wave-3, ran live |

Acceptance-ID coverage against this plan's own list: E1-E16 all have at least one test above
(E3 is covered by the E18 update's `aria-expanded`/glyph assertions rather than a standalone
test — it's the same render pass E18 already exercises).

## Fixture Changes

No new fixture builders. All new tests reuse `buildMarkdownFixtureTree` and
`buildConfinementFixtures`'s sibling files (`docs/adr/x.md` for a nested open target). Two new
helper shapes added to `web/e2e/helpers/reader.ts`, both synthesizing nothing on the wire — they
hold the *real* HTTP responses behind a promise gate, copying `web/e2e/actions.spec.ts:703-756`'s
shape per the plan's own Implementation Notes:

- `holdReaderFileResponse(page, id)` — holds `GET /api/sessions/{id}/reader/file`.
- `holdReaderListingResponse(page, id)` — holds `GET /api/sessions/{id}/reader`.

Both are scoped by session id via a `RegExp` (not a glob) so two tiles' fetches can be held
independently (E15) without also catching the sibling endpoint (`/reader` vs `/reader/file`).

Locator changes in `web/e2e/helpers/reader.ts`:

- Removed `navArrowHide`, `navArrowShow`, `navArrowOpenNode`, `navArrowCollapsedNode` — the
  two-button pair this plan deletes.
- Added `navToggle(region)` — the single `aria-label="File explorer"` button.
- Added `planHeaderRow(region)` — `[data-role="plan-header"]`, asserted with `.toBeHidden()`
  (the codebase's `.hidden =` idiom), never `.toHaveCount(0)`.
- Added `bodyLoadingPlaceholder(region)` — `article.md`'s `loading…` text, alongside the
  existing `bodyPlaceholder` (`nothing open — pick a file`).
- Added `treeLoadingRow(region)` — the tree's own `loading…` row.
- `renderedBody(region)` (already existed) is reused directly as the `aria-busy` oracle per the
  plan's Testable UI Elements note — no new locator needed for the grey-out itself.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1, REQ-2, REQ-3 | E18 update, "exactly one nav-toggle button…" (E1), E27 update (tile) |
| REQ-4 | "keyboard-activating the nav toggle…" (E2) |
| REQ-5 | "the nav toggle's right edge is unchanged after the first routed write…" (E4) |
| REQ-6 | E22 update (E5) |
| REQ-7 | "with the file response held, selecting a tree file…" (E6) |
| REQ-8 | same test (E7), E26 update (E12) |
| REQ-9 | "with the listing response held…" (E9), E11 pop-out-no-path, E14 remembered-deleted, "a first open on a plan-less session…" (Fix Attempt 1, Major 1) |
| REQ-10 | "with the listing response held…" (E9), E23 (Fix Attempt 1, Major 2 — listing-failure path) |
| REQ-11 | "a window focus event on an open plan and a routed write for an open tree file…" (E10) |
| REQ-12 | E26 update (release path), E13 daemon-down test (network-error path) |
| REQ-13 | not directly E2E-tested — `paths.ts` is Vitest-only per the plan (W7); no DOM import to assert against |
| REQ-14 | "with the file response held…" (E7/E16), E26 update (E12) |
| REQ-15 | E13 daemon-down test |
| REQ-16 | "with two tiles on docs, holding one tile's file response…" (E15) — the bystander tile's hidden status line and absent `aria-busy` while the held tile shows both, is exactly the per-instance assertion REQ-16 asks for (correction, fix wave 3: the row above previously said "not directly E2E-tested", conflating this with REQ-15's precedence rule; the coverage was real, only the row was wrong) |
| REQ-17 | not E2E-testable — dead-CSS-rule removal is a `rg` grep (Automated Checks `W5`), not a DOM assertion |
| INV-ONE-ARROW | E1 test (Focus, open/collapsed), E27 update (3×2 tile), E9 test (listing pending), E22 update (dead session) |
| INV-ARROW-FIXED | E1 test, E4 test |
| INV-NO-STRANDED-BODY | E26 update, E13 test, E11/E14 (settled-placeholder assertions) |
| INV-REFETCH-NEVER-BLANKS | E10 test |
| INV-DIM-ALWAYS-LIFTS | "with the file response held…" test, E26 update, E13 test |
| INV-CUES-PER-INSTANCE | E15 test |

## Repairs

Not applicable — authoring mode.

## Test Run Output

```
$ npx playwright test --list
Total: 350 tests in 30 files
(reader.spec.ts alone: Total: 48 tests in 1 file)
```

No collection errors, no duplicate titles. `npx tsc --noEmit -p .` clean. `npx biome check
e2e/reader.spec.ts e2e/helpers/reader.ts` clean (one formatting fix applied and re-verified).
`sh scripts/e2e-lint.sh` → `e2e-lint: clean`. `dead-refs.py` on both touched files → `0 missing`.

Regression pins, run live against the current tree after `make web-build build` (per the
send-back — three of the new tests assert only pre-existing behaviour):

```
$ npx playwright test e2e/reader.spec.ts -g "E10, REQ-11"
  ✓  a window focus event on an open plan and a routed write for an open tree file each
     re-render silently, never showing a loading cue or article.md carrying aria-busy
     (E10, REQ-11) (3.3s)
  1 passed (4.2s)

$ npx playwright test e2e/reader.spec.ts -g "E11, REQ-9"
  ✓  a pop-out opened with no path query settles its body on nothing open — pick a file
     (E11, REQ-9) (554ms)
  1 passed (1.3s)

$ npx playwright test e2e/reader.spec.ts -g "E14, edge case 3"
  ✓  a reader whose remembered open path was deleted before mount settles its body on
     nothing open — pick a file, never on loading… (E14, edge case 3) (839ms)
  1 passed (1.6s)
```

Collection re-verified clean after the E10 fix (48/350 totals unchanged, see above).

## Notes

- **Correction (send-back): three tests were genuine regression pins, and I had not run them.**
  My first pass argued the whole file was collection-only because every *edited* test (E18, E22,
  E26, E27, and the cycle-4 replacement) asserts a new element. That's true for those five, but I
  wrongly generalized it to three *new* tests — E10, E11, E14 — whose assertions are either a
  negative ("no `aria-busy`", "no loading cue text") that holds vacuously because the cue system
  doesn't exist yet, or a final settled state (`nothing open — pick a file`) that current code
  already produces (`features/reader.ts`'s constructor already sets that exact placeholder, and
  `openFile`'s failure path never overwrites it — confirmed by reading the source, not assumed).
  Reading `web/src/features/reader.ts` before writing this correction also surfaced a real defect
  in my own E10 draft: `handleWindowFocus` only re-fetches when the *open file is the plan*
  (existing REQ-19 gating, unchanged by this plan) — my original test used a plain tree file
  (TODO.md) for the window-focus half, which would never have triggered a re-fetch at all, live
  or not. Fixed by opening the plan (via a transcript, same shape as the "opens it automatically"
  test above) for that half, and kept a plain tree file for the docChanged half, which has no such
  gating. All three now ran green against the current tree post-fix (`make web-build build` first,
  per the harness rule that `npm run e2e`/`playwright test` alone serves a stale binary) — see Test
  Run Output. This is exactly `kb:lesson/authored-tests-never-run-before-validate`'s failure mode:
  a locator/gating defect (here, the wrong open-file target) that a live run at authoring finds for
  free and a validate cycle finds the expensive way.
- **Why the other tests stay collection-only.** Every edited test (E18, E22, E26, E27, the E2
  replacement) and every remaining new test (E1, E4, E6/E7/E8/E16, E9, E12/E26, E13, E15) asserts
  at least one element the single-button/loading-cue implementation hasn't built yet —
  `navToggle`, `planHeaderRow` hidden, `aria-busy`, `loading <basename>…` text, or the tree's
  `loading…` row — so each genuinely cannot pass against the current tree. I did not weaken or
  split any of them to manufacture a pin.
- **The cycle-4 arrow-focus test is deleted, not adapted-in-place**, along with its
  `assertArrowFocusSurvivesToggle` helper and the "also assert the negative" trailing comment.
  The plan's own Overview explains why: the defect class that test existed for
  (`prepareNavArrowFocusRestore`'s hide/rebuild dance between two arrows) is deleted by this
  plan, and a single never-hidden button cannot reach that state. The plan's Implementation
  Notes says explicitly: "The reviewer should read the deletion as intended, not as a lost fix —
  E2 is its replacement." I replaced it with a same-shaped, simpler test
  (`assertNavToggleKeepsFocus`) covering the plan's own E2/REQ-4, on both the Focus host and the
  pop-out, same as the test it replaces. No coverage this deletion removes is outside the plan's
  delta — it was coverage *of* the two-arrow design this plan removes.
- **REQ-13 and REQ-17 have no dedicated E2E test** — flagged in Coverage above with the reason
  each time (Vitest-only pure function, and a grep-only dead-code check respectively). Neither
  has a Testable UI Element or acceptance ID (E1-E16) assigned to it in the plan, so neither was
  expected to. (REQ-16 was wrongly listed alongside these in an earlier revision of this file —
  see the Coverage table row above; it is in fact covered by E15.)
- **E11's direct `/doc.html?session=<id>` navigation** (no `path` query) doesn't go through the
  `pop out ↗` link, unlike every other pop-out test in this file. I checked why the existing
  pop-out tests insist on the real link (`internal/server/auth.go`'s `handleAuth`/
  `requireCookie`): auth is a `muster_auth` cookie set once via `/auth?token=`, scoped to the
  browser context, not a per-navigation query param `doc.ts` reads — so a direct navigation on a
  page/context that already visited `daemon.dashboardUrl` carries the cookie fine. The "must go
  through the real link" constraint on the *other* pop-out tests is about REQ-8's own
  `popOutHref`-must-exist requirement (there is no link to click when nothing is open, which is
  exactly E11's scenario), not about auth being dropped by hand-building a URL.
- **No `[interface-probe]`-worthy gap found.** Every wire shape this plan's tests touch
  (`docChanged`, hook payloads, the reader/listing responses) is unchanged by this plan — it
  adds no protocol delta — so no new fact record is needed; existing captures already back
  every payload builder used (`envelopedSessionStart`, `rawPostToolUse`).
- The two held-response helpers are new but narrow; if `web-impl`'s eventual implementation
  serves `/reader/file` with a materially different query-string shape (e.g. path not in a
  query param), `holdReaderFileResponse`'s regex will need adjusting at validate — flagging this
  since it's the one place this file guesses at a URL shape not yet pinned by a fact record
  (the Protocol Contract only pins the JSON body, not literal query syntax).

## Validate Attempt 1

Rebuilt (`make web-build build` from the project root) against `ab3f4c4`/`1d43e2b`, then ran the
plan's spec file live from `web/`.

### 1. Own spec file

```
$ npx playwright test e2e/reader.spec.ts
Running 48 tests using 4 workers
...
  48 passed (16.6s)
```

All 48 tests passed on the first run — every collection-only test from authoring (the two-arrow
locators, `navToggle`, `planHeaderRow`, `aria-busy`, `loading <basename>…`, the tree loading row,
the E1/E2/E4/E6-E9/E12/E13/E15/E26/E27 group) went green against the implementation exactly as
authored. No locator, wait, regex or fixture in `web/e2e/reader.spec.ts` or
`web/e2e/helpers/reader.ts` needed changing — the guessed `/reader/file` query-string shape
(flagged in the authoring Notes above) matched what `web-impl` actually shipped, so
`holdReaderFileResponse`'s regex needed no adjustment.

### 2. Collection re-check

```
$ npx playwright test --list
Total: 350 tests in 30 files
```

Clean, no duplicate titles.

### 3. Full-suite sweep

```
$ make e2e
...
  350 passed (1.8m)
```

Every pre-existing spec file also passed — no plan-superseded expectation needed updating, since
this plan changes no wire shape (Protocol Contract: none).

## Repairs

None. No test file, locator, wait, or fixture needed changing.

No assertion was deleted, skipped, or weakened.

## Test Run Output (Validate Attempt 1)

```
$ npx playwright test e2e/reader.spec.ts
Running 48 tests using 4 workers
  48 passed (16.6s)

$ npx playwright test --list
Total: 350 tests in 30 files

$ make e2e
  350 passed (1.8m)
```

## Fix Attempt 1 (review cycle 1)

**Issue addressed**: review.md Major 3 (`[e2e-specs]`) — Majors 1 and 2 (`[web-impl]`) shipped in
`d744f7b` with no test pinning either behaviour: the authored E14 exercises a deleted remembered
path, not a listing failure, so the one test that does fail a listing (E23) asserted only the
status line and let the stranded tree row pass unnoticed; and no test opened a file while
`bodyRendered` was still false.

**Changes made**, both in `web/e2e/reader.spec.ts`:

- **New test** — "a first open on a plan-less session, held, shows loading… in the body and
  never nothing open — pick a file (REQ-9; review markdown-render-fixes cycle 1 Major 1)".
  Launches a session with no hook posted (no plan, no remembered `openPath`, so
  `decideInitialOpen` settles the body on the placeholder before anything is clicked — the exact
  starting state issue #25 and Major 1 describe), confirms that starting placeholder, holds
  `GET …/reader/file`, clicks a tree entry, and asserts the body shows `bodyLoadingPlaceholder`
  (never `bodyPlaceholder`) and `aria-busy="true"` while held, with the status line still hidden
  (REQ-9's suppression while `bodyRendered === false` is unchanged); releasing renders the file
  and clears both cues.
- **Edited E23** — "on an ended session whose directory was removed, the status line shows the
  directory_missing message **and the tree's loading row clears**". Added one assertion after
  the existing status-line check: `await expect(treeLoadingRow(region)).toHaveCount(0, {
  timeout: 15_000 })`, with a comment tying it to Major 2 / plan edge case 2. Retitled to name
  the new behaviour it now covers, and the title now also cites "markdown-render-fixes edge case
  2" alongside its pre-existing "E23, edge case 12" (base plan) citation, per the review's own
  mapping of edge case 2 to the listing-failure scenario.

**Coverage correction (review [note] 3, not a routed issue)**: the Coverage table's REQ-16 row
and the Notes bullet listing REQ-13/16/17 as untested both said REQ-16 was "not directly
E2E-tested". The reviewer is right that this was wrong — the E15 two-tiles test
("with two tiles on docs, holding one tile's file response…") already asserts exactly REQ-16:
the bystander tile's `readerStatusLine` stays hidden and `renderedBody` never carries `aria-busy`
while the held tile shows both. Both places in this file are corrected above.

**Proving the two assertions are real regression guards, not vacuous**: per Fix Mode rule 3 (an
absence assertion must be shown to go red before it's logged), I reverse-applied `d744f7b`'s
`web/src/features/reader.ts` hunk only (`git show d744f7b -- web/src/features/reader.ts | git
apply -R -`), rebuilt (`make web-build build`), and ran both tests in isolation:

```
$ npx playwright test e2e/reader.spec.ts -g "a first open on a plan-less session"
  ✘ … Expected: visible … Error: element(s) not found
    (bodyLoadingPlaceholder never appears — the pre-fix code leaves the body on the
    "nothing open" placeholder, exactly Major 1's bug)
  1 failed

$ npx playwright test e2e/reader.spec.ts -g "tree's loading row clears"
  ✘ … Expected: 0 … Received: 1 (unexpected value "1")
    (treeLoadingRow never clears — exactly Major 2's bug)
  1 failed
```

Then restored the implementation (`git checkout -- web/src/features/reader.ts`, `git diff
--stat` on that file empty) and rebuilt again before the real run below.

**Blast radius**: only `web/e2e/reader.spec.ts` touched (one new test, one edited test) and
`plans/markdown-render-fixes/test-specs.md` (this file). No fixture/helper module, no
`playwright.config.ts`, no other spec file.

### Live run

Rebuilt first (`make web-build build`, in that order), then from `web/`:

```
$ npx playwright test e2e/reader.spec.ts
  49 passed (16.9s)

$ npx playwright test --list
Total: 351 tests in 30 files
```

Full-suite sweep:

```
$ make e2e
  351 passed (1.8m)
```

`e2e-lint.sh` → clean. `npx tsc --noEmit -p .` clean. `npx biome check e2e/reader.spec.ts` clean.
`dead-refs.py` (default scope, diff against main) → `523 references checked, 0 missing`.

## Repairs (Fix Attempt 1)

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|------------------------|-----|------------------------|
| 1 | E23 (listing failure) | Suite was green despite Major 2 because no test read the tree row after a listing failure settled | The test asserted only the status line, never the tree | Added `expect(treeLoadingRow(region)).toHaveCount(0, { timeout: 15_000 })` after the status-line assertion | REQ-10 / plan edge case 2 — proven red against the pre-fix tree (see above: `Received: "1"`), green against the fix |
| 2 (new test, not a repair to an existing one) | "a first open on a plan-less session…" | No test opened a file while `bodyRendered` was still false — the common first-open case from issue #25 | Missing coverage, not a defect in an existing test | New held-response test asserting `bodyLoadingPlaceholder` visible / `bodyPlaceholder` absent / `aria-busy` during the hold | REQ-9 (plan § The loading cues table, row 2) — proven red against the pre-fix tree (see above: `element(s) not found`), green against the fix |

No assertion was deleted, skipped, or weakened.

## Test Run Output (Fix Attempt 1)

```
$ npx playwright test e2e/reader.spec.ts
Running 49 tests using 4 workers
  49 passed (16.9s)

$ npx playwright test --list
Total: 351 tests in 30 files

$ make e2e
  351 passed (1.8m)
```
