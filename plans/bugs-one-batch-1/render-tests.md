# Render Tests: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: pass
**Pack**: kb: pack 28201 words (budget 30000)

## Summary

Tests created: 8 (5 red-first, now green; 3 added this pass) | Passing: 8 | Failing: 0

## Tests

| File | Test Name | Criterion | What It Verifies | Status |
|------|-----------|-----------|------------------|--------|
| `notes.spec.ts` | Escape / popped Escape / Close button return focus to the Claude terminal (R1, REQ-5) | R1 | focus lands in the terminal | pass |
| `notes.spec.ts` | closing on an ended session lands on the glyph (R1, REQ-5) | R1 | glyph fallback | pass |
| `notes.spec.ts` | closing the note with Docs the selected surface lands on the note glyph (R1, REQ-5) | R1 | glyph fallback when Docs is selected | pass |
| `reader.spec.ts` | reading position survives Claude then Docs / reload / switching session card and back (R2, REQ-6) | R2 | restore at 600px; the session-switch leg now runs (fixture present) | pass |
| `reader.spec.ts` | a wheel on the body after the restore moves the position and nothing jumps it back (R2, REQ-6) | R2 | user input is not fought by a re-apply | pass |
| `reader.spec.ts` | no stored position opens at top; nav click returns to a stored one (R2, REQ-6) | R2 | restore policy on every opener with the loading cue | pass |

## Fixtures used

- `notes`: sessions with and without notes, ended; Docs button reachable with an empty listing.
- `reader-docs-large`: 30-heading `0-outline.md` plus 20 short files.
- `reader-docs-large-pair`: two sessions, `reader-large-a` / `reader-large-b`.

## Implementation Bugs

None.

## Handoff

None

## Notes

The "wheel drops a *pending* restore" race (a wheel landing between the click and the diagram pass) cannot be timed deterministically at render level with no daemon latency; the test pins the settled property instead: after a wheel the position stays where the reader put it and does not jump back.

## Test Run Output

```
65 passed (40.5s)   # npx playwright test -c playwright.render.config.ts render/notes.spec.ts render/reader.spec.ts
```

## Fix wave 2 (review cycle 1)

- Added `notes.spec.ts` "a second click on the note glyph closes the anchored panel and returns keyboard focus to the Claude terminal (R1, REQ-5)". It passes against the current tree, since wave 1 already returns focus on the glyph path.
- The five existing note tests and their log rows now name REQ-5, not REQ-8.
- Removed the `test.skip(!pairFixtureExists, ...)` guard and its unused imports from `reader.spec.ts`. The session-switch leg of REQ-6 now fails if `reader-docs-large-pair` is missing.
- Run: `render:lint` clean; notes + reader specs 66 passed.
