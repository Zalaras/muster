# Render Tests: Popped-out note enhancements

**Plan**: popped-out-note-enhance
**Verdict**: pass
**Pack**: kb: pack 14288 words (budget 30000)

## Summary

Tests created: 9 new + 3 updated | Passing: 438 of 438 (whole render suite) | Failing: 0

## Tests

| File | Test Name | Criterion | What It Verifies | Status |
|------|-----------|-----------|------------------|--------|
| `notes-places.spec.ts` | popped-out sessions show their own panel at their own rectangle and an unpopped session shows none (R1, REQ-1, REQ-2) | R1 | notes-short/long popped at different rects; plain shows no panel; each returns at its own rect | pass |
| `notes-places.spec.ts` | popping one session in leaves the other popped out ... (R2, REQ-4) | R2 | Pop in keeps the other popped; pop out again returns to the kept rect | pass |
| `notes-places.spec.ts` | closing a popped panel with Close or Escape ... (R3, REQ-4) | R3 | Close and Escape leave the other session at its rect | pass |
| `notes-places.spec.ts` | a popped panel dragged over the rail, the masthead and the Focus header ... (R5, REQ-5) | R5 | overlaps each surface, inside window, elementFromPoint at header centre is the panel | pass |
| `notes-places.spec.ts` | Escape pressed outside the popped panel ... (R6, REQ-5) | R6 | with the terminal focused and the panel over the rail, Escape leaves it open and unmoved | pass |
| `notes-places.spec.ts` | at 260px wide with the unsaved status showing, every control of both forms lies inside its panel (R7, REQ-7) | R7 | Pop out/Pop in, Open note in window, Close note inside a 260px panel, both forms | pass |
| `notes-places.spec.ts` | with browser storage blocked ... (R8, REQ-13) | R8 | both storages throw; pop-out, focus switching, Close work; no pageerror | pass |
| `notes-places.spec.ts` | Close on the anchored panel ... (R11, REQ-6) | R11 | focus lands in the terminal; on the ended session on the glyph | pass |
| `notes-window.spec.ts` | the note window shows its session's header ... (R9, REQ-9, REQ-12) | R9 | header, document title, rendered note, no visible controls; unknown id shows removed notice | pass |
| `notes-window.spec.ts` | in the note window one click ... (R12, REQ-9) | R12 | click edits, Escape leaves edit mode, note still shown | pass |
| `notes-window.spec.ts` | the note window reads connecting… until its socket's first hello (R13, REQ-11) | R13 | silent socket: status `connecting…`, document title `Note` | pass |
| `notes.spec.ts` (updated) | popped panel stays inside the window ... (R4, REQ-5); back inside the window within two frames (R4, REQ-5); 260x150 minimum test now also checks Open note in window and window-edge pinning (R7) | R4, R7 | oracle moved from the main slot to the viewport | pass |

R10 (Tiles hides, Focus restores the same rectangle) is carried by the existing `notes.spec.ts` test "switching to Tiles with the panel popped out hides it ..." which is unchanged and passes against the new per-session code.

## Fixtures used

- `notes` — notes-plain (no note), notes-short, notes-long (frontmatter + mermaid), notes-ended.
- `notes-tiles` — its recorded prefs frame, via the existing R10 test.

## Implementation Bugs

None.

## Handoff

None. (web-impl's note on `web/e2e/notes.spec.ts:1184` pagehide flush is e2e's, unchanged by this work.)

## Notes

- The anchored panel is a fixed 400px wide (max window less 16px), so "260px wide" anchored is reached with a 276px window, not by narrowing the header.
- Pop in leaves the anchored panel open for that session (asserted as `Pop out note` visible), not closed.
- `mainSlot` in `helpers/notes.ts` is now unused by specs; left in place.
- A first run overlapped a second `make render-test` and failed on a vanished bundle; the clean rerun is the output below.

## Test Run Output

```
438 passed (2.2m)
```

## Fix Attempt (review cycle 2, wave 2)

Three tests added to `web/render/notes-places.spec.ts` (R5, REQ-5), no fixture or harness change:
- banner: popped panel dragged to 0,0, then reload against a `/ws` route that sends hello + snapshot and closes (the real daemon-down state, banner reads `musterd unreachable`); `elementFromPoint` at the banner's centre height inside the overlap is `#banner`.
- readout: panel placed so `#connection-status` lies under it; `elementFromPoint` at the readout's centre is `#connection-status`.
- drag across Pop in: pointer down on the header, Pop in by keyboard Enter, then move + up; after focus away and back no panel shows, and popping out again returns to the pre-drag rectangle.

Pre-fix proof (`git archive 2a55004f~1` built in a scratch dir, same spec): all three fail.
- banner: `Error: banner text is the hit, not the panel  Expected: true Received: false` (notes-places.spec.ts:486)
- readout: `Expected: true Received: false` at the `#connection-status` hit assertion (:506)
- Pop in drag: `expect(locator).toHaveCount(0)` Expected 0, Received 1 at `await focusSession(page, LONG)` follow-up (:532)

Post-fix: `make render-test` 445 passed, exit 0. Harness could produce the daemon-down state (route override + reload), so no DOM forcing.
