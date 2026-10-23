# Maintainability review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 30429 words (budget 30000)
**Scope**: The delta `git diff 04502c70..HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` is one file, `web/src/terminal/pane.ts` (+2, commit 9c014e8e). The whole branch is still 19 files (349+, 92-). The other 18 are byte-identical to what cycle 2 reviewed (approved), so their cycle-2 rows stand. Cycle 2 left no open agent-tagged issue, so there is no `## Delta` table of prior Minors.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/terminal/pane.ts | `attach()`'s socket-`open` handler (`pane.ts:214-217`, `refit(true)`); the `refit` callers `features/focus.ts:240-257` (`mountTerminalSurface`: `mountSlotRoot`, then `surface.refit()`, then reads `surface.geometry`) and `features/tiles.ts:197-204` (`renderSurfaceTileBody`, same order); `@xterm/addon-fit` 0.11.0 `FitAddon.ts:36-66` (`fit()` and `proposeDimensions()`). `rg -n 'refit\(\|proposeDimensions\|fitAddon\.fit' web/src --glob '!*.test.ts'` gives `pane.ts:216,297,300,302`, `tiles.ts:201`, `focus.ts:255` and comments only in `render/focusview.ts:29,32`. | yes (web-implementation.md Fix Attempt 2: the guard sits in `refit()`, the one place a fit becomes a `resize` frame; reuses `FitAddon.proposeDimensions()`; two alternatives named and dropped) | none (373 lines; `19-size.log` names no `web/src/terminal` file) | pass; notes 1, 2 |
| (other 18 files) | unchanged since cycle 2 | as cycle 2 | as cycle 2: `manager.go` 632, `groups.ts` 507, `reader.ts` 707, reasons hold; `funlen` on the untouched `readerDocs` / `readerMermaidDocs` and on `manager_test.go`, which was already over on `main` | pass (cycle 2 rows stand) |

Per-question read of the delta:

1. **Does this already exist?** No. No earlier `proposeDimensions` call exists in `web/src`, and `refit` is still the only code that turns a fit into a `resize` frame. The guard calls xterm's own check rather than writing a second one.
2. **Does it match its siblings?** Yes. The guard has the same early-`return` shape as the `!this.term || !this.fitAddon` and `cols <= 0 || rows <= 0` guards on either side of it. It is also the same test `fit()` makes before it runs (`FitAddon.ts:37`: `!dims || … isNaN(dims.cols) || isNaN(dims.rows)`). The callers did not change. `focus.ts` and `tiles.ts` still call `mountSlotRoot` before `refit()`, so a mounted surface fits and sends as it did before. On the open handler's `refit(true)`, a detached surface now sends nothing. Its first send then comes from the next caller, debounced, after `attach()` has set `lastSentCols/Rows` to 0.
3. **Shared state.** There is no new state. `refit` runs on the main thread, and its `resizeTimer` / `lastSent*` handling is unchanged.
4. **Is a layer crossed?** No. The change stays inside `terminal/`, which already owns the FitAddon.
5. **Pattern by label.** None.
6. **Size.** No warning on this file.
7. **Seam explained.** No new type or seam. The behaviour change has a `design:` line.
8. **Diagram.** No new module or dependency edge.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Taste, no convention cited. `fit()` makes the same check internally and silently returns when it fails (`FitAddon.ts:36-39`). So a newcomer reading `pane.ts:300-301` will likely think the new guard is redundant and delete it, and that would bring back the unfitted send. What makes the guard load-bearing is that `fit()` returns quietly and the code then reads `term.cols/rows`, which for a never-laid-out surface still hold the constructor's 80x2. That reason lives only in web-implementation.md's Root cause. The existing `catch` comment ("container not yet laid out (zero size) — nothing to fit") reads as covering the `throw` path only. One clause near the guard, or in `refit`'s docstring, would keep it from being removed. That is the comment pass's call, not a requested change.
2. **[note]** `proposeDimensions()` now runs twice per `refit` on a mounted surface: once in the guard and once inside `fit()`. That is two `getComputedStyle` pairs. `refit` is documented as "safe to call on every render pass", but it only runs for the surfaces `focus.ts` / `tiles.ts` mount, at most a handful per pass. The cost is negligible, and reproducing `fit()` by hand to save one call would mean copying its private-API `_renderService.clear()` line. No change requested.
