# Render Tests: diff-viewer

**Plan**: diff-viewer
**Verdict**: implementation-bug
**Pack**: kb: pack 22013 words (budget 30000)

## Summary

Tests created: 42 | Passing: 40 | Failing: 2 (both the one implementation bug below)

Full `make render-test`: 541 passed, 2 failed (the two R2 tests).

## Tests

All in `web/render/diff.spec.ts` (helpers `web/render/helpers/diff.ts`).

| Test (title carries criterion and REQ) | Criterion | Status |
|------|-----------|--------|
| diff / diff-branch-only / diff-pair read their specified button text | R1 | pass |
| a clean checkout and a non-repo session show no button | R1 | pass |
| button flush right, no taller than the note, swept 1440 to 700 px | R2 | **fail** (bug) |
| row same height with and without the button | R2 | **fail** (bug) |
| Focus header holds no diff control, boxes equal focus-header-long's | R3 | pass |
| docs surface and ended session: row holds only the button | R4 | pass |
| no surface segment pressed or styled selected while open | R5 | pass |
| status, path, counts, rename, binary note, fold, Files jump | R6 | pass |
| clean scope reads No changes; opens on Branch | R7 | pass |
| Unified numbers and token backgrounds | R8 | pass |
| Split old left, new right, rows level | R9 | pass |
| Unified default, view kept over reload | R10 | pass |
| del/ins in Unified, Split, Review | R11 | pass |
| after/before flip, placeholders | R12 | pass |
| change tick folds, row reopens | R13 | pass |
| file tick unchecked/mixed/checked, tick all/untick all; one-by-one | R14 | pass |
| progress readout and Reset | R15 | pass |
| change map marks, states, comment mark, click scrolls | R16 | pass |
| hover plus (opacity 0 then 1), drag, shift-click, Review selection flips nothing | R17 | pass |
| comment card, gutter bar token, Resolve, Reopen, Delete | R18 | pass |
| Comments list, Resolved closed, entry unfolds folded change | R19 | pass |
| outdated entry, no card | R20 | pass |
| j/k, Space, x, Shift+X | R21 | pass |
| keys inert in the text field | R22 | pass |
| Escape order | R23 | pass |
| five markings distinct and readable, light and dark | R24 | pass |
| Unified and Split row height and line-height equal | R25 | pass |
| failed save keeps box and text | R26 | pass |
| no tile diff button | R27 | pass |
| pair: own counts, viewer, comment per session | R28 | pass |
| failed read says so with Refresh | R29 | pass |
| failed tick stays shown with the failure by progress | R30 | pass |

## Fixtures used

- `diff`: modified/renamed/deleted/added/binary files, word change, four comments, two ticks.
- `diff-branch-only`, `diff-clean`, `diff-pair`, `diff-light`, `diff-dark`, `diff-ended`, `diff-long-header`, `diff-tiles`, plus `focus-header-long` as the R3 baseline.

## Implementation Bugs

| Bug | File | Expected (per plan) | Actual |
|-----|------|---------------------|--------|
| The size row is taller when the button reads `💬 n` | `web/src/style.css` (`.diffbtn`, `.sizerow`) | REQ-9: the row is no taller for the button; its height is the note's | measured `#sizerow` 31 px with the button (button 18 px, the emoji's fallback font enlarges its line box) against 26 px for note alone (note 13 px); `diff-branch-only` (no emoji) 26 px. Fails `row is the same height with and without the button` (Expected 26, Received 31) and `button no taller than the note` (Expected <= 14, Received 18). A fixed `line-height` on `.diffbtn` would settle it. |

## Handoff

- web-impl: fix the bug above.
- The harness (`web/render/helpers/harness.ts`) does not serve the fixture's `diff` recording, although the plan's Affected Files give it to web-impl. `helpers/diff.ts` serves the three GETs and the three writes from the recording itself, registered after `dashboard.open` and then nudging the poll with `settleFor`. If web-impl moves that into the harness, `openDiff` shrinks to `dashboard.open`.
- Registering `web/render/diff*.spec.ts` and `web/render/helpers/diff*.ts` in the diff feature globs is the orchestrator's (pre-commit guard may refuse on that alone).
- `diff-clean`'s second session (outside any repository) has no recorded summary, so its button is absent by an unanswered 404, not by a `repo: false` answer. needs-scenario: none blocking; a recorded `repo:false` summary would make that check exact.

## Notes

- Existing render specs (`focus.spec.ts`, `surfaces.spec.ts`) did not locate `#sizenote` as the row; whole run green apart from the two above.
- Not render-level (left to E2E): staleness bar, restart, second window, refit.

## Test Run Output

```
2 failed
  render/diff.spec.ts:67 the button sits flush ... (R2, REQ-9)   Expected <= 14, Received 18
  render/diff.spec.ts:95 the row is the same height with and without the button (R2, REQ-9)   Expected 26, Received 31
541 passed (4.2m)
```


## Fix Attempt 1 (pre-review fix)

`openDiff` in `web/render/helpers/diff.ts` shrunk: the three GET routes, `Recording` and `recordings()` dropped (the harness serves the fixture's `diff` recording); `failReads` override and the 204 write route kept. Rebuilt (`make web-build build`), `make render-test`: 543 passed, 0 failed. Verdict: pass.

## Fix Wave (review cycle 1)

**Verdict**: pass. `make render-test`: 550 passed (was 543 before this wave: +7 tests).

Added to `web/render/diff.spec.ts` (helper `serveManyChanges` in `helpers/diff.ts`):
- R9 (REQ-12): Split stacks the file sections (one left edge, increasing tops) and each `.dv-srow` spans the scroll body, cells at least half-width, at 1440/1100/900/700 px (browser Major 3 / Critical 1).
- R25 (REQ-12): the 110-character praise line wraps to at most 3 lines in Split, first cell over 300 px (a squashed column would wrap far more).
- R16 (REQ-16): 200 changes in Review, every `.dv-mark` inside `.dv-map`, a real mouse click on mark 200 brings its change into view (Major 1). The 200-change file is a diff read served through `page.route` (same wire shape, not a snapshot); no recorded scenario holds one.
- R21 (REQ-15, REQ-20): `j j x` folds the reached change, `x` again unfolds it (Major 2). Note: `j` onto a folded change reopens it, so the baseline fold count is taken after `j j`.
- R5 (REQ-10): Reset, Refresh, Save, Cancel carry no `aria-pressed`; Unified/Split/Review do.
- R18 (REQ-18, REQ-28): a comment PUT held open across a Refresh ends with exactly one card (never two; the Refresh keeps the local list while the write is in flight, so the card may appear only on release; Comments (4) after). A Resolve held across a Refresh lands on the shown card (folded Resolved row, no open card).

Handoff: None (the Refresh-keeps-local-list behaviour is the documented tradeoff in web-implementation.md Fix Attempt 2; the coordinator's "card already present on Refresh" does not hold by design). The `diff.spec.ts` TS2532 at lines 286-288 is fixed.

## Fix Wave (review cycle 3)

**Verdict**: pass. `make render-test`: 561 passed, 0 failed (after the merge of main: R5 fixed, three tests added).

Changed in `web/render/diff.spec.ts` (no helper change):
- R5 (REQ-10) "no surface segment looks selected while the viewer is open": now expects the four `.surfseg` buttons (claude, shell, Terminals, docs), claude/shell/docs `aria-pressed="false"` and not the selected ground, the Terminals opener carrying no `aria-pressed`, and all four sharing one unselected ground that differs from the selected one.
- Added R5 (REQ-10): opening the Terminals menu and pressing Escape leaves the viewer open, "Close diff ×" pressed, no segment pressed.
- Added R5 (REQ-10): New terminal from the menu (POST `/api/sessions/N/shells` stubbed, as `terminals.spec.ts` stubs the shell POST) closes the viewer once it answers: viewer gone, `shell` pressed, button back to "View diff ›", `#sizerow` visible.
- Added R18 (REQ-15, REQ-28): hold the diff read, click Refresh, wait for the review read, tick `src/legacy.ts`, wait for the tick POST, release: progress stays "3 / 5 changes reviewed" (was 2 / 5 before the tick) and stays after a settle.

Fixture facts: `diff*.json` hold `terminals: {}` (no terminal list), so the menu shows only New terminal.

## Handoff

- needs-scenario: `diff-terminals` — a diff scenario (a dirty checkout so the "View diff ›" button shows, with a recorded review as in `diff`) whose session also holds two terminals (`shell 1` idle and `build`, as `terminals-two`). Needed for: with the viewer open, picking another terminal from the menu closes the viewer and shows it (size row back); renaming or closing a terminal from the menu leaves the viewer open. Not testable from `diff*` (no rows) or `terminals-two` (no diff). Will be a few tests in `diff.spec.ts` once it exists.
- (e) from web-impl's list, the `shell` count badge staying shown while the viewer is open, rides the same scenario.

## Fix Wave 2 (review cycle 3, after needs-scenario diff-terminals)

**Verdict**: pass. `make render-test`: 564 passed, 0 failed (561 + 3).

Added to `web/render/diff.spec.ts` against `diff-terminals` (imports `shellCount`, `terminalRow` from helpers/terminals):
- R5 (REQ-10): picking `build` from the Terminals menu closes the viewer, `shell` pressed, button back to "View diff ›", `#sizerow` and `#sizenote` visible with text different from the viewer-open state.
- R5 (REQ-10): renaming `build` (PUT stubbed) and closing `shell 1` (DELETE stubbed) leave the viewer open, "Close diff ×" pressed, claude/shell/docs unpressed.
- R5 (REQ-10): the `shell` count badge reads 2, visible, opacity 1 before and while the viewer is open.

Note: the size row itself is visible with the viewer open (it holds the diff button), so "size row back" is asserted on `#sizenote`.

Handoff: None (the earlier needs-scenario is answered).

## Fix Wave 3 (review cycle 3, Minor wave 2)

**Verdict**: pass. `make render-test`: 565 passed, 0 failed.

- Correctness Minor 2: in `diff.spec.ts` "renaming and closing a terminal…", the dead confirm branch is gone; the test now awaits `page.waitForRequest` for `DELETE …/shells/1` before `stillOpen()`.
- New test (R5, REQ-10) "Escape closes the open Terminals menu first, then the viewer", on `diff-terminals`: menu open, × on `shell 1` (DELETE awaited), focus blurred to `<body>` (asserted), first Escape closes the menu and the button still reads "Close diff ×", second Escape closes the viewer ("View diff ›").
- Fails without the fix: built `871e8623` (git archive into the scratchpad, this tree untouched) with this spec: `expect(terminalsPanel).toHaveCount(0)` received 1 at the first Escape (the viewer took it, the menu stayed). Passes on 9733b859.
