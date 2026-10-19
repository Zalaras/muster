# Web Implementation: shell-pane-fixes

**Plan**: shell-pane-fixes
**Mode**: initial
**Pack**: kb: pack 17119 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/terminal/shellkeys.ts` | edited | REQ-1: exported pure `accumulateWheelDelta(accumDeltaY, eventDeltaY) => { accumDeltaY, lines }`; `PIXELS_PER_LINE` made module-private (its only consumer left `pane.ts`) |
| `web/src/terminal/pane.ts` | edited | REQ-1: `flushWheelScroll` calls the pure step and stores what it returns; the wheel handler now fills `wheelPendingDeltaY`, flush folds it into `wheelAccumDeltaY` |
| `web/src/style.css` | edited | REQ-2: `@media (prefers-reduced-motion: reduce) { .shellact[data-act="busy"] { animation: none; } }`, placed after the tile-footer `.shellact` rules |

## Decisions

- design: `accumulateWheelDelta` sits beside `wheelDeltaToScrollLines` in `shellkeys.ts` (the existing pure wheel module) and reuses it; no sibling accumulator exists (`rg "wheelAccum|PIXELS_PER_LINE" web/src` showed only `pane.ts` and `shellkeys.ts`).
- design: two private fields in `TerminalSurface` — `wheelPendingDeltaY` (written only by the wheel handler, zeroed by flush) and `wheelAccumDeltaY` (written only by flush from the pure step's result) — so the pure function's `eventDeltaY` parameter carries the frame's wheel sum and `pane.ts` holds no arithmetic beyond the handler's `+=` of the raw event.
- design: one rule in the `@media` block rather than a per-surface rule; the mainhead and tile footer share `.shellact[data-act="busy"]`, and the tile rule only sets size, so the single rule covers both. Selector specificity ties with the base rule and the block comes later.
- Transitions (120 ms) left alone, per the plan's Findings.
- doc-delta: none beyond the plan's Doc Delta.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0; `npm run -s lint` clean; `make contrast` 0 failures; `make size-warn` only pre-existing file-length warnings, none on touched files.
**E2E smoke**: `npx playwright test shell-activity.spec.ts shell-scroll.spec.ts` — 19 passed (7.9m, most of it queued on the gate lock held by other worktrees). Unit: `npx vitest run src/terminal/shellkeys.test.ts` — 23 passed.
None
