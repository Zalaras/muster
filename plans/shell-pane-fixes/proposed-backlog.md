# Proposed backlog — shell-pane-fixes

### A hard wheel flick stores unbounded scroll that eats the next wheel-ups

- **Summary**: A shell wheel flick past 200 lines carries all of it, so the next reverse wheel is swallowed.
- **Source**: `review.browser.cycle1.md` Note 1; `review.code.md` (cycle 2) Note.
- **Change requested**: no — a `[note]`: "The old code behaves the same, so this is not a regression; whether it becomes a backlog item is your call."
- **Suggested section**: Fixes — Shell pane.
- **Pre-existing**: yes; this branch moves the arithmetic into `accumulateWheelDelta` and pins the carry in a unit test, which a cap would change.

### Tile footer keeps a frozen busy spinner while musterd is down

- **Summary**: With musterd down, a tile footer keeps showing busy while the Focus header shows no indicator.
- **Source**: `review.browser.cycle1.md` Note 2.
- **Change requested**: no — a `[note]`, left out of this plan's scope by the reviewer.
- **Suggested section**: Fixes — While musterd is down and when it comes back.
- **Pre-existing**: yes; this branch does not touch the indicator's state handling.

## Decisions (the developer, 2026-10-19)

- **A hard wheel flick stores unbounded scroll that eats the next wheel-ups** — filed: TODO.md § Shell pane, "A hard wheel flick swallows the next wheel the other way".
- **Tile footer keeps a frozen busy spinner while musterd is down** — not doing.
