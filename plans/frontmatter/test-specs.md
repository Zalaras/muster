# E2E Test Specs: Frontmatter

**Plan**: frontmatter
**Mode**: fix (review cycle 1)
**Pack**: kb: pack 8049 words (budget 8000) — sections: rules 841 · features 2408 · diagrams 0 · decisions 2465 · proposed 0 · facts 2 · lessons 2325 · runbooks 2 (WARN: pack exceeds budget of 8000)
**Verdict**: pass
**Tests created**: 4 new, 2 rewritten (6 total touched); 4 existing tests run live as E6 regression pins
**Live run**: 53/53 passing in reader.spec.ts (fix cycle 1); full suite 432/432; soak 530/530 — see Fix Attempt 1 below

## Tests

| File | Test Name | Requirement | Status | What It Verifies |
|------|-----------|-------------|--------|------------------|
| web/e2e/reader.spec.ts | after a /clear pair naming a planless transcript, the plan slot still shows the pre-clear plan and its badge (plan frontmatter E1, rewrites markdown-viewing E5, REQ-8, edge case 1) | REQ-8, E1 | collection-only | A planless-scan SessionStart after `/clear` keeps the pre-clear plan (badge, filename, path) instead of clearing to "no plan yet" — the reversal REQ-8 makes |
| web/e2e/reader.spec.ts | after a /clear pair naming a planless transcript, a straggler Write hook from the pre-clear id leaves the plan slot showing the retained plan (plan frontmatter E2, rewrites markdown-viewing E29, REQ-8, REQ-9, edge case 5) | REQ-8, REQ-9, E2 | collection-only | REQ-9's straggler gate (hook whose Claude session id the session has left) still holds against the retained plan — nothing moves it after the rebind |
| web/e2e/reader.spec.ts | opening a file with flat frontmatter shows a Frontmatter table as the body's first element with one row per key, and the outline's first entry is the document's first real heading (plan frontmatter E3, REQ-1, REQ-2, REQ-5, REQ-6, edge case 20) | REQ-1, REQ-2, REQ-5, REQ-6, E3 | collection-only | Flat `key: value` block renders as `table[aria-label="Frontmatter"]`, one row per key verbatim, is the body's first child, and contributes no outline entry; a frontmatter-only file (edge case 20) still renders the table with an empty outline |
| web/e2e/reader.spec.ts | a frontmatter value carrying `<img onerror>` and `<script>` shows as literal text and no img or script element exists in the body (plan frontmatter E4, REQ-2, REQ-5, edge case 21) | REQ-2, REQ-5, E4 | collection-only | A value carrying HTML/script markup renders as literal `textContent`, produces no `img`/`script`/`[onerror]` element, and never executes |
| web/e2e/reader.spec.ts | opening a file with nested-YAML frontmatter shows the raw block verbatim in pre.frontmatter and no body heading or outline entry contains frontmatter text (plan frontmatter E5, REQ-3, REQ-6, edge case 22, edge case 23) | REQ-3, REQ-6, E5 | collection-only | A block-list/`\|`-scalar block falls back to `pre.frontmatter` with the inner text preserved byte-for-byte (via raw `textContent()`, not the whitespace-normalizing `toHaveText`), and a `#`-prefixed line inside it never becomes a heading or outline entry |
| web/e2e/reader.spec.ts | a file with a GFM table, task list and fenced code renders a table, disabled checkboxes and a code block (E15, REQ-5) | REQ-7, E6 | ran-green-at-authoring | Regression pin for E6: an existing file with no leading frontmatter still renders GFM (table/checkboxes/code) exactly as before — proves `markdown.ts`'s call to `splitFrontmatter` before `marked` doesn't regress ordinary markdown rendering |
| web/e2e/reader.spec.ts | a file containing a script element, an onerror attribute and a javascript: link renders with none of them present (E16, REQ-22) | REQ-7, E6 | ran-green-at-authoring | Regression pin for E6: DOMPurify sanitization of a non-frontmatter file is unaffected by the new splitter sitting ahead of it in the pipeline |
| web/e2e/reader.spec.ts | the outline lists the file's headings, clicking one scrolls the body, and scrolling moves aria-current (E17, REQ-14) | REQ-7, E6 | ran-green-at-authoring | Regression pin for E6: the outline walk (now run before the frontmatter table is prepended, per plan.md's Affected Files) still lists every heading and scroll-spy still works on a file with no frontmatter |
| web/e2e/reader.spec.ts | a repeated heading gets deduplicated ids so each outline entry scrolls to its own heading (edge case 26, REQ-14) | REQ-6, REQ-7, E6 | ran-green-at-authoring | Regression pin for E6/REQ-6: heading-id dedup (`#notes`, `#notes-2`) is computed the same way once frontmatter is spliced in ahead of the outline walk |
| web/e2e/reader.spec.ts | a long frontmatter key never forces article.md to scroll horizontally in a 3x2 tile with the file explorer open (correctness review cycle 1 coverage, REQ-10, W16, kb:adr/reader-frontmatter-key-column-may-break) | REQ-10, W16 | ran-green (fix cycle 1) | Fix-cycle-1 coverage task (no tagged issue): web-impl's browser-Major-1 fix (`table-layout: fixed`, key `th { width: 40% }`, `overflow-wrap: anywhere`) never lets `article.md` scroll horizontally, in a 3×2 tile with the file explorer open, for a 28-char fact-shaped key and a 60-char key (the review's own repro values) |

E6 ("a file with no frontmatter renders exactly as before") needed no *new* test — the four rows
above are the existing tests that exercise markdown rendering and the outline on a file with no
leading `---`, the surface `markdown.ts`'s change could regress even though REQ-7 doesn't touch
it. They were run live against the current tree (`make web-build build`, then a filtered
`playwright test`) rather than merely inspected, per "regression pins run live at authoring" —
summary line in Test Run Output.

## Fixture Changes

No fixture-shape/payload changes. `helpers/reader.ts` gained pure DOM locators for the new markup only (no wire payload involved — frontmatter is client-side rendering of file bytes the daemon already served unmodified, kb:adr/reader-markdown-rendered-in-browser):

- `frontmatterTable(region)` — `table[aria-label="Frontmatter"]` inside `article.md` (Testable UI Elements: role `table`, name `Frontmatter`).
- `frontmatterKeyCells(region)` — every row's `th[scope="row"]` (role `rowheader`), for row-count assertions.
- `frontmatterKeyCell(region, key)` / `frontmatterValueCell(region, key)` — a specific row's key/value cells, scoped via a `tr.filter({has: …rowheader…})` so duplicate keys (W8, not exercised at E2E) each keep their own row.
- `frontmatterFallback(region)` — `pre.frontmatter` (Testable UI Elements: no implicit role, plain CSS locator per the reader spec's `<details><summary>` precedent).
- `outlineEntries(region)` — every outline button in document order, for "first entry is X" / "exactly N entries" assertions (REQ-6's "no outline entry" oracle needed a way to name the *whole* list, not just probe individual absent names).

`writeFakeTranscript`, `envelopedSessionStart`, `rawSessionEnd`, `rawPostToolUse` and `envelopeOpts` are reused unchanged from the existing suite — the rewritten E1/E2 tests are the same `/clear`-pair and straggler-hook wire sequence markdown-viewing's old E5/E29 already built, just asserting the opposite outcome.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | plan frontmatter E3 |
| REQ-2 | plan frontmatter E3, plan frontmatter E4 |
| REQ-3 | plan frontmatter E5 |
| REQ-4 | not e2e (no rendered output when the block is empty — unit-only, W7) |
| REQ-5 | plan frontmatter E3, plan frontmatter E4 |
| REQ-6 | plan frontmatter E3, plan frontmatter E5 |
| REQ-7 | E6 regression pins: E15, E16, E17, edge case 26 (ran-green-at-authoring; W1/W2 are unit-only) |
| REQ-8 | plan frontmatter E1, plan frontmatter E2 |
| REQ-9 | plan frontmatter E2 (collection-only — see Notes for why no independent pin exists) |
| REQ-10 | Was Reviewer-Verified (W16) only; fix cycle 1 adds a live pin — "a long frontmatter key never forces article.md to scroll horizontally..." — since browser review Major 1 found web-impl's original CSS violated it and this coverage task closes that gap |

## Repairs (validate / fix modes only)

Not applicable — authoring mode.

## Test Run Output

Collection for the 5 new/rewritten tests (authoring mode; the implementation does not exist
yet — every one asserts new behaviour, none is a regression pin: see Notes below), plus a live
run of the 4 E6 regression pins against the current tree.

```
$ npx playwright test --list e2e/reader.spec.ts
Total: 52 tests in 1 file
(0 errors; the 5 frontmatter-plan tests all listed at their expected line numbers)

$ npx playwright test --list
Total: 431 tests in 38 files
(0 errors, no duplicate titles across the suite)

$ npx tsc --noEmit
(clean)

$ npx biome check e2e/reader.spec.ts e2e/helpers/reader.ts
Checked 2 files in 57ms. No fixes applied.

$ bash scripts/e2e-lint.sh
e2e-lint: clean

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py web/e2e/reader.spec.ts web/e2e/helpers/reader.ts
dead-refs: 2 references checked, 0 missing

$ make web-build build   # from project root — binary embeds the dashboard, build before run
✓ built in 1.96s
go build -ldflags "-X main.version=v0.16.0-23-g5d7aeff-dirty" -o bin/musterd ./cmd/musterd

$ npx playwright test e2e/reader.spec.ts -g "(renders a table, disabled checkboxes and a code block|renders with none of them present|clicking one scrolls the body, and scrolling moves aria-current|gets deduplicated ids so each outline entry scrolls to its own heading)"
Running 4 tests using 4 workers

  ✓  2 [chromium] › e2e/reader.spec.ts:580:1 › a file containing a script element, an onerror attribute and a javascript: link renders with none of them present (E16, REQ-22) (3.0s)
  ✓  4 [chromium] › e2e/reader.spec.ts:656:1 › a repeated heading gets deduplicated ids so each outline entry scrolls to its own heading (edge case 26, REQ-14) (3.0s)
  ✓  1 [chromium] › e2e/reader.spec.ts:540:1 › a file with a GFM table, task list and fenced code renders a table, disabled checkboxes and a code block (E15, REQ-5) (3.1s)
  ✓  3 [chromium] › e2e/reader.spec.ts:618:1 › the outline lists the file's headings, clicking one scrolls the body, and scrolling moves aria-current (E17, REQ-14) (3.1s)

  4 passed (4.4s)
```

## Notes

**Regression-pin check.** The 5 new/rewritten tests all assert behaviour that does not hold on
the current tree, so none is a pin and none was run live:

- The two rewritten tests (frontmatter E1/E2) assert the *opposite* of what markdown-viewing's
  old E5/E29 asserted (plan retained vs. plan cleared) — under today's `scanPlan`, a planless
  scan still sets `plan: null`, so `barFileName`/`barPath` would read empty and `noPlanText`
  would show "no plan yet" today; these tests would fail red against the current tree.
- The three new tests (frontmatter E3/E4/E5) depend on `web/src/reader/frontmatter.ts`, which
  does not exist yet — today `markdown.ts` hands the whole file (frontmatter block included) to
  `marked`, so a leading `---`/`key: value`/`---` block renders as a setext `<h2>` heading blob
  (the exact bug REQ-1..REQ-5 fix), not a `table[aria-label="Frontmatter"]` or a `pre.frontmatter`.

The plan also names two requirements that are explicitly *unchanged* by this plan (REQ-7's "file
whose first line is not `---`... renders exactly as today", and E6's acceptance criterion built
on it): those pins are testable right now, against a `make web-build build` of the current tree,
so they were run live rather than only asserted collection-clean — see the Tests table's four
`ran-green-at-authoring` rows and the run summary above. All four are pre-existing tests (E15,
E16, E17, edge case 26's dedup test); no new file was written for them, since the point is that
`markdown.ts`'s change (routing the file through `splitFrontmatter` before `marked`, per Affected
Files) must not disturb the ordinary-markdown, sanitization and outline paths a file with no
frontmatter still runs today.

**REQ-9 (straggler gate unchanged) has no separable regression pin.** REQ-9 says the plan-scan
straggler gate (`kb:adr/reader-plan-located-by-transcript-scan`, unmodified by this plan) still
holds. The only place reader.spec.ts exercises it for the plan slot is the E29 test — now
rewritten as frontmatter E2, because REQ-9's effect (nothing moves the plan) is observationally
identical whether "nothing" leaves the slot cleared (old behaviour) or leaves it retained (REQ-8's
new behaviour): the straggler assertion is the same either way, only the *setup and final value*
differ. Splitting E2 into "retain, then confirm-with-straggler" (this file) plus a second,
independently-runnable straggler-only pin would need its own /clear-pair-plus-straggler fixture
that does not first depend on REQ-8 landing, and there is no existing test to reuse for that split
— building one is possible but out of proportion to what the coordinator asked for here. Recorded
so the reviewer/orchestrator can decide whether it's worth a follow-up; not treated as a gap I
silently closed by asserting less.

**W8 (duplicate keys) is unit-only.** `frontmatterRow`'s doc comment notes it can match more
than one `<tr>` for a repeated key, but no E2E test exercises duplicates — `web/src/reader/
frontmatter.test.ts` (web-tests) is the more precise oracle for exact per-row ordering, per the
plan's Affected Files/Tests split.

**`toHaveText` vs raw `textContent()` for REQ-3's "verbatim".** `expect(locator).toHaveText()`
normalizes whitespace (collapses runs, trims), which would silently pass even if an
implementation collapsed the raw block's newlines — exactly the defect REQ-3 rules out. The E5
test instead polls `locator.textContent()` and compares it by exact string equality against the
fixture's own known inner text, constructed once and reused for both the file and the
expectation so there is no risk of the two drifting apart.

**No harness/fixture-plan change.** This plan's Fixture plan header says the file's existing
`daemon` fixture is unchanged and gives the reason (every new/rewritten test still asserts
per-session/daemon-global state — the plan slot, a straggler hook gate). No edit was needed to
`playwright.config.ts` or `helpers/fixtures.ts`, and none was made.

**Nothing was deleted.** No existing reader.spec.ts test was removed; the two markdown-viewing
tests whose assertions this plan's REQ-8 reverses were rewritten in place (same session/plan
setup, same straggler-hook wire sequence), not deleted and replaced — their coverage of the
`/clear`-pair and straggler-hook *scenarios* is preserved, only the expected outcome changed,
which is exactly what an approved protocol-contract delta (REQ-8, `kb:adr/reader-plan-sticky-
once-named`) sanctions.

## Validate Attempt 1

**Trigger**: web-impl's handoff (`plans/frontmatter/web-implementation.md` § Handoff) reported
E3 and E4 failing against the real implementation on a locator defect in my own
`frontmatterRow()` helper — its `.filter({ has: ... })` inner locator was chained off `table`
instead of off `page`/`region`. Verified this myself rather than taking it on trust (see
Repairs below); the web-impl handoff's isolated repro and accessibility-snapshot evidence both
checked out.

### 1. Rebuild

`make web-build build` from the project root — binary embeds the dashboard, so this runs before
any spec execution. Exit 0.

### 2. Repair and live run of my own file

Fixed `frontmatterRow()` (see Repairs table). Reran collection (`npx playwright test --list
e2e/reader.spec.ts` — 52 tests, no errors) then the full file live:

```
$ npm run e2e -- e2e/reader.spec.ts
e2e-lint: clean
Running 52 tests using 4 workers
  ... (all 52 lines ✓)
  52 passed (18.5s)
```

E3 (`opening a file with flat frontmatter...`) and E4 (`a frontmatter value carrying <img
onerror>...`) both pass, along with every other test in the file (the 45 pre-existing tests, the
rewritten E1/E2, and E5).

### 3. Suite-wide collection re-check

`npx playwright test --list` (no path filter) — `Total: 431 tests in 38 files`, 0 errors, no
duplicate titles.

### 4. Full suite sweep

`make e2e` (project root, foreground, `timeout: 600000`) — `431 passed (2.8m)`, exit code 0. No
failures outside `reader.spec.ts`, so no sanctioned-delta repair or implementation-bug routing
was needed for any other spec file.

### 5. Soak

`make e2e-soak SPEC=e2e/reader.spec.ts N=10` (project root, foreground, `timeout: 600000`) —
`520 passed (2.9m)` (52 × 10, zero failures). `reader.spec.ts` is the only spec file this plan
authored or changed, so this is the full soak obligation.

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | plan frontmatter E3 (`opening a file with flat frontmatter...`), plan frontmatter E4 (`a frontmatter value carrying <img onerror>...`) | `frontmatterKeyCell`/`frontmatterValueCell` calls timed out — the row lookup never resolved to an element, even though the accessibility snapshot in the failure's own `error-context.md` showed the real `<table>`, `<tr>`, `<th rowheader>` and `<td cell>` rendered exactly as REQ-1/REQ-2/REQ-5 require | `frontmatterRow()`'s `.filter({ has: table.getByRole(...) })` chained its inner `has` locator off `table` (the outer locator itself). Playwright's `filter({has})` re-applies the inner locator's full selector chain scoped to each `<tr>` candidate; chained off `table`, the reapplied chain looks for a nested `<table>` *inside* the `<tr>`, which never exists, so the filter matches zero rows regardless of what's rendered (confirmed independently by web-impl's isolated `page.setContent` repro in its Handoff, and by me rerunning the fixed version below) | Changed the inner locator to `region.page().getByRole("rowheader", { name: key, exact: true })` — rooted at the page instead of at `table`, so the reapplied chain has no spurious `table` prefix and directly matches the `<th>` inside the `<tr>` | REQ-2 ("one row per key... value verbatim") and REQ-5 (table is the body's first child) — both E3 and E4 assert real row/value text via this locator, and both now pass against the built implementation with the table/rows genuinely present (not vacuously, since `frontmatterKeyCells(region)).toHaveCount(3)` and the accessibility-snapshot evidence already independently confirmed 3 real rows exist before this fix; the fix only repairs the *per-key lookup*, not what it asserts) |

This is not an absence-assertion repair (`toHaveCount(0)`, `not.toContainText`, etc.) — the
broken locator was a positive lookup that resolved to zero elements (a timeout/failure), not a
negative assertion that could pass vacuously. No deliberate-breakage proof was needed; the
before/after run against the same built tree (failing per web-impl's handoff, passing after the
one-line fix, in the same session, without any product change) is the direct evidence.

No assertion was deleted, skipped, or weakened.

## Test Run Output (Validate Attempt 1)

```
$ npx playwright test --list e2e/reader.spec.ts
Total: 52 tests in 1 file

$ make web-build build
✓ built in 1.64s
go build -ldflags "-X main.version=v0.17.0-26-gc4ced26-dirty" -o bin/musterd ./cmd/musterd

$ npm run e2e -- e2e/reader.spec.ts
e2e-lint: clean
Running 52 tests using 4 workers
  52 passed (18.5s)

$ npx playwright test --list
Total: 431 tests in 38 files

$ make e2e   # project root, foreground, timeout 600000
431 passed (2.8m)
[exited with code 0]

$ make e2e-soak SPEC=e2e/reader.spec.ts N=10   # project root, foreground, timeout 600000
520 passed (2.9m)

$ npx tsc --noEmit
(clean)

$ npx biome check e2e/helpers/reader.ts
Checked 1 file in 17ms. No fixes applied.

$ bash scripts/e2e-lint.sh
e2e-lint: clean

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py web/e2e/helpers/reader.ts
dead-refs: 2 references checked, 0 missing
```

`git diff --stat`: `web/e2e/helpers/reader.ts | 7 +++++--` — the only file this attempt touched.

## Notes (Validate Attempt 1)

- `orchestration-state.json` was left untouched, per instructions.
- No harness file (`playwright.config.ts`, `helpers/fixtures.ts`, `e2e-lint.sh`) needed a
  change; the defect and its fix were entirely inside my own `helpers/reader.ts`.
- Confirmed the fix is theory-matched, not cargo-culted: Playwright's `filter({has})` re-applies
  the inner locator's selector chain scoped to each candidate, so an inner locator must be
  rooted at `page` (or any ancestor-free locator), never at the same outer locator being
  filtered — `helpers/session.ts`'s and `helpers/terminal.ts`'s existing `filter({hasText})`
  calls don't hit this because `hasText` is a plain string match, not a chained locator, so
  there was no existing in-repo pattern to copy for this specific `has`-locator case.

## Fix Attempt 1 (review cycle 1)

**Issue assigned**: correctness Major 4 (`[e2e-specs]`) — `helpers/reader.ts`'s `frontmatterRow`
doc comment claimed the `has` locator "must be rooted at `page` (or `region`) rather than at
`table`". The reviewer measured (`page.setContent` of the row markup, `table.locator("tr").filter({has:
X}).count()`) that `page`-rooted gives 1, `region`-rooted gives 0, `table`-rooted gives 0 — the
"(or `region`)" half is false, for the same reapplied-selector-chain reason the comment itself
already gives, and would reintroduce the Repairs-row-1 defect if a future author followed it.

**Fix**: reworded the comment to say the inner locator must be rooted at `page` and that any
locator whose chain includes an ancestor of the `tr` — `region` or `table` alike — fails, rather
than singling out `table`. The implementation (`region.page().getByRole(...)`) was already
correct; only the comment was wrong, so no locator or assertion changed.

**Coverage task** (no tagged issue): this cycle's `web-implementation.md` § Fix Attempt 1 (item 2)
fixed browser review Major 1 — `article.md` forced horizontal scroll in a 3×2 tile with the file
explorer open, for frontmatter keys real files carry (a 28-char fact-shaped key gave `scrollWidth
286 > clientWidth 233`; a 60-char key gave `525 > 233`). The fix (`.md table.frontmatter {
table-layout: fixed }`, key `th { width: 40%; overflow-wrap: anywhere }`) is new user-facing
behaviour this plan's implementation added with no tagged review issue naming it, so per the fix-
mode coverage instruction I added a test for it: "a long frontmatter key never forces article.md
to scroll horizontally in a 3x2 tile with the file explorer open" (`web/e2e/reader.spec.ts`).

- Fixture: a single `wide-key.md` with two frontmatter keys — `verified_claude_code_version`
  (28 chars, the browser review's own `fact.md` example) and a 60-char key (the review's Major 1
  repro value) — mapping directly onto the review's measurements, no fixture invented.
- Host: launches into Tiles at 3×2 density before opening the docs surface, so the reader instance
  mounts compact with `navCollapsedDefault` true (matches E27's own mount-time contract in
  `web/src/features/reader.ts`'s `initReader`); `navToggle(region).click()` then opens the file
  explorer, reproducing the review's 233px-wide `article.md` host exactly.
- Oracle: polls `article.md`'s `scrollWidth <= clientWidth` inside `expect.poll` (both values
  re-read together on every attempt, so a still-narrowing layout can't pass on a stale read) —
  the same `article.md` element and the same scroll-vs-client comparison the browser review used,
  not a proxy.
- Proved non-vacuous before logging it as a repair-adjacent gain (not a Repairs-table row, since
  nothing pre-existing was weakened, but the same "was this ever red" bar applies to a new
  overflow assertion): temporarily added `page.addStyleTag` right after `page.goto` in the test,
  reinstating the pre-fix CSS (`table-layout: auto`, key `th { width: 1%; white-space: nowrap }`)
  entirely inside the browser — no product file was touched. Reran: the test failed with
  `Expected: "fits" / Received: "overflows"` (15s poll timeout). Removed the `addStyleTag` call and
  reran: passes again. This is the same tree, same build, only a page-level style override toggled
  on and off, so the assertion is confirmed capable of catching the exact defect browser review
  Major 1 found.

### Rebuild and live runs

`make web-build build` from the project root (binary embeds the dashboard) — exit 0.

```
$ npx playwright test --list          # web/, before edits and again after
Total: 432 tests in 38 files          # no duplicate titles, no collection errors

$ npx playwright test e2e/reader.spec.ts -g "a long frontmatter key never forces article.md to scroll horizontally"
1 passed (2.8s)

$ bash scripts/e2e-lint.sh
e2e-lint: clean

$ npx playwright test e2e/reader.spec.ts
53 passed (17.7s)
```

### Suite-wide sweep and soak

`make e2e` (project root, foreground, `timeout: 600000`):

```
432 passed (2.7m)
[exited with code 0]
```

No failures outside `reader.spec.ts`'s new test — no sanctioned-delta repair or
implementation-bug routing needed.

`make e2e-soak SPEC=e2e/reader.spec.ts N=10` (project root, foreground, `timeout: 600000`):

```
530 passed (3.0m)     # 53 tests × 10 runs, zero failures
```

`reader.spec.ts` is still the only spec file this plan has authored or changed across every
cycle (`git log --oneline main..HEAD -- web/e2e/`), so this is the full soak obligation.

`python3 .claude/skills/orchestrate/scripts/dead-refs.py`: `611 references checked, 0 missing`.

`git diff --stat -- web/e2e/`:
```
web/e2e/helpers/reader.ts |  4 ++--
web/e2e/reader.spec.ts    | 69 ++++++++++++++++++++++++++++++++++++++++++++++
```
Only the two files this attempt touched; no product file (`web/src/`, `internal/`, `cmd/`) was
changed, and the temporary `addStyleTag` verification line never reached the committed diff.

## Repairs (Fix Attempt 1)

No spec-file repair in this cycle — Major 4's fix is a doc-comment correction, not a locator,
assertion or fixture change (the `frontmatterRow` implementation itself was already correct from
validate attempt 1's Repairs row 1). The new coverage test above is an addition, not a repair of
an existing assertion.

No assertion was deleted, skipped, or weakened.

## Notes (Fix Attempt 1)

- `plans/frontmatter/orchestration-state.json` and `plans/frontmatter/plan.md` were left
  untouched, per instructions.
- Line numbers in `review.md` were stale relative to this cycle's implementation edits, per the
  task's own warning; Major 4 was located by grepping `frontmatterRow` in `helpers/reader.ts`
  rather than trusting the cited line.

### Post-handback: wave-3 gate red on `make web-lint`

The coordinator reported `make web-lint` (which also formats `web/e2e/`, unlike `e2e-lint.sh`
alone) wanted `web/e2e/reader.spec.ts` ~L2363's `toHaveAttribute("aria-pressed", "true")` call
collapsed to one line — biome's formatter, not e2e-lint, and not something my original run
checked. Ran `cd web && npx biome format --write e2e/reader.spec.ts` — one file formatted, one
fix applied, `git diff` shows exactly that one call reflowed onto a single line, no assertion or
locator changed. Then:

```
$ make web-lint
cd web && npm run -s lint
Checked 179 files in 178ms. No fixes applied.
EXIT: 0
```

Re-ran collection (`npx playwright test --list` — 432 tests in 38 files, unchanged) and the
affected test live (`npx playwright test e2e/reader.spec.ts -g "a long frontmatter key never
forces article.md to scroll horizontally"` — 1 passed) to confirm the reformat changed nothing
observable. `orchestration-state.json` left untouched.
