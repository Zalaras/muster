# E2E Test Specs: Rail Card Improvements 2

**Plan**: rail-card-improvements-2
**Mode**: fix (attempt 1, review cycle 1, wave 3)
**Pack**: `go run ./tools/kb pack --plan rail-card-improvements-2 --role e2e-specs` — 17840 words (over the 8000 budget; features rail, surfaces, update, settings — sections rules 841 · features 4969 · decisions 7668 · facts 99 · lessons 3613 · runbooks 644)
**Verdict**: pass
**Tests created**: 12 new tests across 3 files, plus 1 pre-existing test's assertion updated for REQ-11 (authoring); validate repaired 1 locator defect and 11 sanctioned-breakage assertions across 4 files (see Repairs); fix wave 3 reworded one file-header comment only, no test change
**Live run**: 428/428 passing (`make e2e`, full suite); rail-layout.spec.ts, shell-activity.spec.ts, update.spec.ts and shell.spec.ts each soaked 10× clean (`make e2e-soak`)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/rail-layout.spec.ts | a long activity line clamps to three lines in comfortable density and runs past three lines in expanded (E1, REQ-1) | REQ-1, REQ-2, E1 | Comfortable clamps a long reply to 3 line-heights, expanded runs past it; the line's `title` carries the full text in both densities |
| web/e2e/rail-layout.spec.ts | card height is never greater in comfortable than in expanded, for a short and a long activity line (E2, INV-1) | REQ-1, E2, INV-1 | Two sessions (short/long reply) — card height compact ≤ comfortable ≤ expanded holds for both |
| web/e2e/rail-layout.spec.ts | a compact card renders a visible context gauge track when context is known (E3) | REQ-3, E3 | `.r3 .ctx` is visible with non-zero width in compact once context is known |
| web/e2e/rail-layout.spec.ts | a compact card with unknown context renders the word and no gauge track (E6) | REQ-3, E6 | `.r3.unk` shows "unknown"; no `.ctx` element exists at all |
| web/e2e/rail-layout.spec.ts | a card with no activity text renders no activity line in compact or expanded, and compact drops a populated one too (E4) | REQ-1, E4 | Compact hides a populated activity line; a line with no text stays hidden in compact and in expanded |
| web/e2e/rail-layout.spec.ts | the title renders above the state row on a rail card and on a Tiles strip card (E5, INV-4) | REQ-4, E5, INV-4 | `.r1`'s rendered top is above `.r0`'s, on both the rail card and the Tiles strip card (shared template) |
| web/e2e/shell-activity.spec.ts | the shell busy/done indicator computes a square while busy and a tick wider than tall once done, on the Focus mainhead (E7, E8, INV-3) | REQ-6, E7, E8, INV-3 | Mainhead `span.shellact`'s own (pre-transform) computed width/height: equal while busy, width > height once done |
| web/e2e/shell-activity.spec.ts | the shell busy/done indicator computes the same shapes in a tile footer (E7, E8, INV-3) | REQ-6, E7, E8, INV-3 | Same geometry assertions against the tile-footer's own `.tfoot .surfseg .shellact` size override |
| web/e2e/update.spec.ts | pressing Check now with a newer release published shows that version in the Available readout and badges the Settings button (E9) | REQ-7, REQ-9, REQ-10, E9 | A manual check (no automatic check having found anything yet) discovers a release published after startup and badges Settings |
| web/e2e/update.spec.ts | with daily checking off from startup, the Available readout reads not checked yet, and pressing Check now replaces it with a checked age (E10) | REQ-8, REQ-11, E10 | Pref off across a restart leaves `checkedAt` null at load; a manual check runs anyway and the readout gains a checked-age suffix |
| web/e2e/update.spec.ts | pressing Check now against a stopped release host shows a reason in the status line while the Available readout keeps its previous value (E11) | REQ-12, E11 | Stopping the fake release host makes the manual check fail; the status line shows a reason and the Available readout is untouched |
| web/e2e/update.spec.ts | Check now is disabled on a daemon started with an empty update base URL (E12) | REQ-9, REQ-10, E12 | `canCheck` false (empty `-update-base-url`, the default for every other scratch daemon) disables the button |

**Pre-existing test updated** (not counted above): `web/e2e/update.spec.ts` — "unchecking the toggle clears the badge and available version; rechecking triggers an immediate check" (line ~167, the old plan's E3). REQ-11 deletes the `availableText` "checking disabled" branch entirely (W7's grep check names this exact test as one of three literal owners, alongside `web/src/render/update.ts` and `web/src/render/update.test.ts`, both web-impl/web-tests'). Updated the post-uncheck assertion from `toHaveText("checking disabled")` to `toHaveText("not checked yet")` — the same "no data yet" state a session that has never checked now shows, per the plan's States section. Title annotated to cite the new REQ.

## Fixture Changes

- `web/e2e/helpers/railcards.ts`: added `cardTitleRow(card)` — `.r1`, REQ-4's title row, now leading `.card-in` ahead of `cardStateRow`'s `.r0`.
- `web/e2e/helpers/update.ts`: added `updateCheckButton(dialog)` — `#update-check-button`, accessible name "Check now" (REQ-7/REQ-10's new button).
- No new payload builders were needed: `envelopedSessionStart`/`rawUserPromptSubmit`/`rawStop`/`envelopedStatusLineFull` (existing, from `helpers/payloads.ts`, captures already established by rail-activity.spec.ts and gauges.spec.ts) cover every fixture this plan's rail tests need. The update tests reuse `helpers/releases.ts`'s `FakeReleaseServer` unchanged — per the plan's own Affected Files note, `fakeServer.stop()` is the sanctioned way to make `/latest` fail for E11, needing no new `TamperKind`.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | E1, E2, E4 |
| REQ-2 | E1 (title attribute on the activity line, per Edge Case 1's own "→ E1, W11" mapping) |
| REQ-3 | E3, E6 |
| REQ-4 | E5 |
| REQ-6 | E7 (mainhead), E7/E8 (tile footer) |
| REQ-7, REQ-9, REQ-10 | E9, E12 |
| REQ-8, REQ-11 | E10, plus the updated pre-existing "unchecking the toggle…" test |
| REQ-12 | E11 |
| INV-1 | E2 |
| INV-3 | both shell-activity geometry tests |
| INV-4 | E5 |

REQ-5 (density margin rhythm) and REQ-13 (Check now disabled during its own request) are Reviewer-Verified/W-criteria per the plan's own Acceptance Criteria section, not e2e's. INV-2 is D11 (daemon-tests'). INV-5 (no dashboard code path reaches the release host) has no dedicated E number in the plan and is Reviewer-Verified.

## Regression pins run live at authoring

Two of the six new rail-layout.spec.ts tests turned out, on inspection, to assert only behaviour that already holds on `main` (REQ-1's "compact still drops the line" clause is explicitly unchanged, and the unknown-context "no track" behaviour predates this plan). Per the authoring-mode rule, both were run live against `make web-build build`'s current tree rather than assumed:

```
$ npx playwright test e2e/rail-layout.spec.ts -g "E4\)$"
✓ a card with no activity text renders no activity line in compact or expanded, and compact drops a populated one too (E4) (2.6s)
1 passed (3.3s)

$ npx playwright test e2e/rail-layout.spec.ts -g "E6\)$"
✓ a compact card with unknown context renders the word and no gauge track (E6) (746ms)
1 passed (1.4s)
```

Both green, for the right reason (compact's unconditional `.activity { display: none }` and `render/context.ts`'s unknown branch are both untouched by this plan's Affected Files).

Every other new test asserts genuinely new behaviour and stayed collection-only, but each was also **run once** during authoring (not to make it pass — to catch a locator/fixture defect in my own spec before handing it off, per the mode's "collection is not validation" caution). Every one failed for the plan's own reported defect, not a mistake in the test:

- **E1**: my first draft used an exact `toHaveText` match against an unbounded-length reply and failed on a truncation mismatch — `internal/claudecode` truncates the reply text at 200 characters the same way it truncates `lastPrompt` (pre-existing, unrelated to this plan). Fixed by shortening the fixture message to 192 chars. Re-run then failed correctly: `comfortableHeight` 94.5 vs. the expected ≤55.1 (today's base `.activity` rule has no clamp at all).
- **E2/INV-1**: failed on the exact reported inversion — `comfortable.long` (221.25) > `expanded.long` (174).
- **E3**: failed with the track found but `hidden` (today's `body[data-rail-density="compact"] .r3 .ctx { display: none }`).
- **E5**: failed with the rail card's title row measured *below* the state row (today's `.r0`-then-`.r1` order).
- **Both shell-activity geometry tests**: my first draft measured `getBoundingClientRect()` post-`transform`, which is mathematically always square at exactly 45° regardless of the pre-transform box's own aspect ratio (`cos45 == sin45`, so `bbox.width == bbox.height` for *any* w×h) — confirmed empirically (a debug print showed 9.899505 vs. 9.899475, a floating-point wash, not a real shape). Fixed by reading `getComputedStyle(el).width`/`.height` instead — exactly what the plan's Implementation Notes specifies ("the tick is computed `width` against computed `height`"). Re-run then failed correctly: mainhead 9 vs. 9, tile footer 7 vs. 7 (today's `.shellact[data-act="done"]` is square in both hosts).
- **update.spec.ts E9/E10/E11/E12**: all four failed on the missing `#update-check-button` (E9/E11 timed out on the click; E12 timed out on `toBeDisabled`; E10 failed on the still-present "checking disabled" string), confirming none of REQ-7/REQ-9/REQ-10/REQ-11 has landed yet.

`npx playwright test --list` (428 tests, 38 files), `web/scripts/e2e-lint.sh`, `npx tsc --noEmit` and `npx biome check` all pass clean on the final tree.

## Notes

- Two `E7`/`E8` acceptance numbers are shared by the plan across the mainhead and the tile footer (INV-3 explicitly requires asserting both hosts), so both new shell-activity.spec.ts tests carry the same `(E7, E8, INV-3)` tag — matching the plan's own Acceptance Criteria table, not a duplicate-numbering mistake.
- E9's fixture deliberately never calls `fakeServer.setLatest(...)` before `startDaemon` — the daemon's own immediate on-listen check then finds no release at all (`/latest` 404s) and leaves `checkedAt` null, so the version shown after the click can only have come from the button's own request, not a race with the automatic check.
- E10 mirrors the pre-existing "pref persisted off across a daemon restart" test's own pattern (uncheck, confirm the broadcast landed, then restart) so the pref is genuinely off *at boot* for the second lifetime, not merely toggled off mid-session.
- No `interface-probe` is needed: every payload shape used (`SessionStart`, `UserPromptSubmit`, `Stop`, the full status line) is unchanged from already-measured fact records: `kb:fact/hook-payload-fields`, `kb:fact/status-line-keys`, `kb:fact/context-window-shape`.
- `docs/facts/` and `docs/lessons/` are otherwise unaffected — nothing in this pass needed a new fact record.

## Validate Attempt 1

Both implementations and both unit-test tracks had landed and committed; the wave-2 gate
(`make test`, `make lint`, `make web-test`, `make web-build`, `make web-lint`, `make
contrast`) was reported green before this step. Rebuilt with `make web-build build`
(binary-embeds-dashboard order) before running anything, per the mode's own rule.

### Run 1 — `npx playwright test e2e/rail-layout.spec.ts e2e/shell-activity.spec.ts
e2e/update.spec.ts`

10 failed out of 41. `shell-activity.spec.ts` was clean (all 9 pass first try — REQ-6's
geometry work needed no repair). Two distinct failure classes in the other two files, both
diagnosed and fixed per the "my defect vs. theirs" test in one pass (no back-and-forth):

1. **rail-layout.spec.ts, E5/INV-4** — `stripCard(page, "row-order-e5")` never resolved.
   My defect: the test launched exactly one session, which stays a *live tile* at the
   default 2×2 Tiles density — live tiles render the actual live terminal, not
   `#session-card-template`, so INV-4's "the rail card and the Tiles strip card share one
   template" was never actually exercised by a single-session fixture. `tiles.spec.ts`'s
   own "switching density" test (E8) launches 5 sessions at 2×2 and reads back which one
   landed in the strip the same way — copied that shape.
2. **update.spec.ts, 10 tests** — exact-equality mismatches on `#update-available`, all of
   the shape `Expected: "v0.2.0"` / `Received: "v0.2.0 · checked now"`. Their defect where
   the readout is theirs to produce, but the discrepancy is REQ-11's *approved* delta, not
   a bug: `render/update.ts`'s `availableText` now appends the age of the last successful
   check to every non-null `checkedAt`, exactly as the plan's Doc Delta and Testable UI
   Elements table specify ("The Available readout carries the age... `up to date · checked
   2m ago`"). 8 of the 10 were pre-existing tests from the `auto-update` plan asserting the
   pre-REQ-11 string; 2 (`E9`, `E11`) were my own authoring-time tests that guessed the
   string wrong before the implementation existed (test-specs.md's authoring log already
   flagged E9/E11 as failing on the missing button, not on this string — the suffix bug was
   never exercised live at authoring time since those runs never got past the click).

### Run 2 — same three files after the fixes below

41/41 passed.

### Full-suite sweep — `make e2e`

427/428 passed. The one failure, `shell.spec.ts:48` ("GET /api/state returns exactly the
M0 snapshot object once authenticated"), is the same REQ-9 sanctioned-breakage class as the
update.spec.ts repairs above: the plan's Protocol Contract adds `canCheck` to
`kb:anchor/ws.update`'s `update` object (and therefore to `GET /api/state`'s snapshot,
which carries the same object), and this test's `toEqual` pins the *entire* object
verbatim. Added `canCheck: false` (this scratch daemon's `install` is `"dev"`, one of the
two `canCheck`-false conditions) at the correct position (between `remedy` and
`available`, matching the Protocol Contract's own field order). Re-ran `make e2e`: 428/428.

### Soak — `make e2e-soak N=10` on every file this attempt touched

- `rail-layout.spec.ts`: 120/120 (12 tests × 10)
- `shell-activity.spec.ts`: 100/100 (10 tests × 10) — untouched by this attempt, soaked
  anyway per the mode's "every spec this plan authored or changed" rule
- `update.spec.ts`: 190/190 (19 tests × 10)
- `shell.spec.ts`: 40/40 (4 tests × 10)

### Collection

`npx playwright test --list` re-run after every edit and after the final one: 428 tests,
38 files, no error — no duplicate titles introduced.

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | rail-layout.spec.ts: "the title renders above the state row on a rail card and on a Tiles strip card (E5, INV-4)" | `stripCard(page, "row-order-e5")` timed out, element never found | Test launched one session, which stays a live tile (not the shared `#session-card-template`) at the default 2×2 Tiles grid — the strip only ever holds sessions demoted out of the grid, so a single-session fixture can never produce a strip card at all | Launch 5 sessions (`tiles.spec.ts` E8's own pattern); after switching to Tiles, wait for `liveTile(page, titles[0])` to render, then scan the 5 titles for the one whose `liveTile(...).count()` is 0 and use that as the strip target | REQ-4/E5/INV-4 unchanged: still asserts `.r1`'s top < `.r0`'s top on both a rail card and an actual Tiles-strip card (now a real one, where the pre-fix version never reached a strip card at all) |
| 2 | update.spec.ts: 10 tests — "a strictly newer release badges Settings…" (E1), "unchecking the toggle…" (E3/REQ-11), "Update and restart brings back…" (E5, both readouts), "a binary staged under $HOMEBREW_PREFIX…" (E9), "fake latest equal to running, then older…" (E10, both readouts), "a binary staged inside a scratch git tree…" (E13), "Restart now after a plain Update…" (E15), "pressing Check now with a newer release…" (my E9), "pressing Check now against a stopped release host…" (my E11, both readouts) | `toHaveText` exact-match failures: `Expected: "v0.2.0"` (or `"up to date"`), `Received: "v0.2.0 · checked now"` | REQ-11's approved delta (plan Doc Delta, Testable UI Elements table): every successful check now appends `· checked <age>` to the Available readout. 8 of these are pre-existing `auto-update`-plan tests written before REQ-11 existed; 2 are my own tests from this plan's authoring pass, guessed wrong before the implementation landed | Appended `· checked now` (checks in this harness complete well under the "now" bucket's 60s window) to each expected string, one call site at a time, with a comment citing REQ-11 | REQ-11/E9/E10/E11 and every pre-existing E1/E3/E5/E9/E10/E13/E15 assertion's *version or up-to-date* content is unchanged and still checked — only the suffix, which REQ-11 requires, was added. None weakened. |
| 3 | shell.spec.ts: "GET /api/state returns exactly the M0 snapshot object once authenticated" | `toEqual` deep-equality failure: received object has an extra `canCheck: false` key the expected object didn't have | REQ-9's approved delta adds `canCheck` to `kb:anchor/ws.update`'s `update` object; this pre-existing M0 test pins the *whole* snapshot object verbatim and predates REQ-9 | Added `canCheck: false` to the expected `update` object, positioned between `remedy` and `available` per the Protocol Contract's field order, with a comment following the file's own precedent style for prior protocol-delta updates to this same assertion | The test still pins the *entire* snapshot object byte-for-byte (`toEqual`, not a partial match) — strictly the same coverage plus the one field REQ-9 adds |

No assertion was deleted, skipped, or weakened.

## E2E Implementation Bugs

None. Every failure in this attempt was either my own spec defect (repair #1) or the
plan's own sanctioned protocol/UI delta not yet reflected in pre-existing or
authoring-time-guessed assertions (repairs #2, #3) — never a contradiction between the
plan and what daemon-impl/web-impl built.

## Fix Attempt 1 (review cycle 1, wave 3)

**Issue addressed**: review.md § Issues → Major, `[e2e-specs]` — `web/e2e/helpers/railcards.ts:1-4`'s
file header still described the pre-REQ-4 row order ("a state row first, then a wrapping title"),
contradicting the same file's own `cardTitleRow` doc comment (`:55`, title `.r1` leads `.r0`) and
the shipped template. A false comment about behaviour this plan itself shipped.

**Fix**: reworded the header comment (`web/e2e/helpers/railcards.ts:1-7`) to lead with the title
row, then the state row, and cite `rail-card-improvements-2` REQ-4 for the reorder alongside the
original `rail-card-improvements` plan it still credits for the rest of the template. Comment-only
change — no locator, fixture, or assertion touched.

**Blast radius**: grepped the rest of the file and the plan's other e2e helpers for the same stale
"state row first" framing (`grep -rn "state row first\|state row, then" web/e2e/`) — this header was
the only hit; `cardTitleRow`'s own doc comment already stated the corrected order, so nothing else
needed changing.

**Fix-attempt sections read**: `daemon-implementation.md`'s `## Fix Attempt 1 (review cycle 1)` is a
Go doc-comment rewording in `internal/server/update.go` (disambiguating two plans' REQ/D numbering)
— no new user-facing behaviour, nothing for a test to cover. `web-implementation.md` has no `## Fix
Attempt` section this cycle. Confirmed rather than assumed: nothing new to assert.

**Verification**:
- `npx playwright test --list` (web/): 428 tests, 38 files, no error — collection unaffected by a
  comment-only edit.
- Rebuilt first: `make web-build build` (project root) — exit 0, binary embeds the current dashboard.
- Live run, foreground, the five specs importing `helpers/railcards.ts`
  (`rail-layout.spec.ts`, `rail-activity.spec.ts`, `rail-unread.spec.ts`, `rename.spec.ts`,
  `tiles-launch.spec.ts`): 45/45 passed.
- Full suite, foreground (`make e2e`, project root): 428/428 passed (2.7m).
- Soak (`make e2e-soak N=10`, project root) on every spec file this plan authored or changed:
  `rail-layout.spec.ts` 120/120, `shell-activity.spec.ts` 100/100, `shell.spec.ts` 40/40,
  `update.spec.ts` 190/190 — all clean, no new flake introduced.

**Repairs**: none — this wave made no locator, fixture, or assertion change, only a doc-comment
reword. No assertion was deleted, skipped, or weakened.

**Verdict**: pass.
