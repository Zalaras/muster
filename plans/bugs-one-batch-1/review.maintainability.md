# Maintainability review: bugs-one-batch-1

**Plan**: bugs-one-batch-1
**Verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 30429 words (budget 30000)
**Scope**: The delta `git diff fff8a527..HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'` is one file, `web/src/terminal/pane.ts` (+14, -6, commit fc3856c9; comment pass 0680c32a dropped its one added comment, so there is no source change from it). The whole branch is still 19 files (363+, 98-). The other 18 are byte-identical to what cycles 2 and 3 reviewed (approved), so their rows stand. Cycle 3 left no open agent-tagged issue, so there is no `## Delta` table of prior Minors.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/terminal/pane.ts | The `refit` callers: `features/focus.ts:241-257` (`mountTerminalSurface`: `mountSlotRoot`, then `surface.refit()`, then `renderSizenote(sizenoteEl, surface.geometry)`) and `features/tiles.ts:197-204` (`renderSurfaceTileBody`: same order, then `renderTileGeometry(..., surface?.geometry ?? null)`). The socket-`open` handler at `pane.ts:214-217` (`refit(true)`). Every `geometry` reader: those two, plus `render/tiles.ts:197-205` and `renderSizenote`, which both already render `null` as empty or hidden (`focusview.test.ts:47`). Every `focus()` caller: `features/surfaces.ts:243,320` and `terminal/dropwire.ts:65,93`. Every `canPasteNow()` caller: `dropwire.ts:47,87` and `pane.ts:274`. Also the `DropSurface` interface at `dropwire.ts:20-31`. `rg -n 'clientWidth\|clientHeight\|isConnected\|getBoundingClientRect' web/src --glob '!*.test.ts'` shows no existing "is this element laid out" helper. The only `clientWidth` check under `terminal/` is the new `pane.ts:324`. The rest are local measurements in `render/` and `features/` (`diagramdialog.ts:56`, `readerfind.ts:126`, `mainhead.ts:106`, …) that answer different questions. | yes (web-implementation.md Fix Attempt 3: one private `openIfLaidOut`, called from the one place that fits, `opened` written there only; reuse `rg` pasted; `reset()`/`clear()` and an external scroll-area refresh considered and dropped) | none (381 lines; `19-size.log` names no `web/src/terminal` file) | pass; notes 1-4 |
| (other 18 files) | unchanged since cycle 2 | as cycle 2 | as cycles 2-3: `manager.go` 632, `groups.ts` 507, `reader.ts` 707, reasons hold. `funlen` on the untouched `readerDocs` / `readerMermaidDocs` and on `manager_test.go`, which was already over on `main` | pass (cycle 2 rows stand) |

How the delta answers each question:

1. **Does this already exist?** No. `rg -n "term\.open\|new Terminal" web/src` → `pane.ts` only (the Decisions line pastes the same). The layout `rg` above finds no helper to reuse. `proposeDimensions()` cannot stand in for the new check, because it measures `term.element.parentElement`, and that element only exists after `open()`. So the code now tests layout in two places at two stages: `bodyEl.clientWidth/Height` before the first open, and `proposeDimensions()` on every fit after it (for example after an unmount). They are not duplicates. Both measure the same element, since FitAddon's parent is `bodyEl`.
2. **Does it match its siblings?** Yes. `openIfLaidOut(term: Terminal)` takes the narrowed `term` as a parameter, as `installShellInputHandlers(term: Terminal)` at `pane.ts:170` does. Its early-`return false` guards have the same shape as `refit`'s own guards. The callers did not change and do not need to know about the change. `focus.ts` and `tiles.ts` still call `mountSlotRoot` before `refit()`, so a mounted surface opens, fits and reads `geometry` within one pass. `geometry`'s `null` is a value both readers already handle (the dead-session path and `renderReaderTileBody` pass it today). The socket-`open` handler's `refit(true)` on a surface that has not opened yet returns before fitting, exactly as cycle 3's unfitted-send guard already did for a detached surface.
3. **Shared state.** `opened` is new state, written only at `pane.ts:326`, on the main thread. It goes from `false` to `true` once and is never reset. No interleaving exists: `refit`, the socket handlers and `focus()` all run on the one event loop. `dispose()` before an open calls `term.dispose()` on an unopened xterm, which is the same path a dead-on-arrival surface never reaches and a live one takes today. A `refit` after `dispose()` finds `root` removed, so `clientWidth` is 0 and it returns before touching xterm.
4. **Is a layer crossed?** No. The change stays inside `terminal/pane.ts`, which owns the xterm instance. No composition root is touched.
5. **Pattern by label.** None.
6. **Size.** No warning on this file.
7. **Seam explained.** `openIfLaidOut` is private, not a new seam, and it has a `design:` line anyway.
8. **Diagram.** No new module or dependency edge.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** About the dropped comment: does the name carry the reason (cycle-3 Note 1's question)? Only half of it. `openIfLaidOut` tells the reader *when* xterm opens. It does not say *why* opening on a detached body is wrong: xterm sizes its scroll area against the detached element and keeps that range after the later fit. A newcomer who wonders why this differs from every xterm example's constructor-time `open()` will find the answer only in web-implementation.md's Root cause. Unlike cycle 3's guard, though, this one is now pinned by a test. Shell-scroll's "reselect Shell after a background switch, slider = track, flick and reversed-notch frames" journey (3b782beb) fails if the open moves back into the constructor. The comment pass owns comments (docs/conventions.md § Comments; kb:adr/process-comment-pass-owns-code-comments) and its judge dropped this one, so I request no change.
2. **[note]** Three existing doc comments now describe the old preconditions. That is doc truth, so it belongs to `review-work` or the comment pass, not to me. `focus()`'s comment (`pane.ts:351-353`) still names "a dead session's surface (`term` is null …) and … a disposed surface" as its only no-op cases, but it now also does nothing before the first open. `DropSurface.hasTerminal`'s comment (`dropwire.ts:24-25`) and `hasTerminal()`'s comment (`pane.ts:258-259`) describe `canPasteNow` as "also requires the socket to be open", but it now also requires the terminal to have opened. `refit`'s comment (`pane.ts:290-296`) does not say that the first call on a laid-out body performs the open. Each is incomplete rather than false.
3. **[note]** Taste, no convention cited. Two fields now hold one lifecycle: `term !== null` (built) and `opened` (built and opened), with the unstated invariant `opened ⇒ term !== null`. The type does not express it, which is why `focus()` reads `this.opened` and then `this.term?.focus()`, and why `geometry` keeps a `!this.term` check. A single field for the state would let the type carry the invariant. That is more restructuring than one lazily called `open()` warrants, and the pair matches the existing `term` / `fitAddon` nullable pair next to it.
4. **[note]** Taste. The open happens inside `refit`'s guard expression (`pane.ts:298`, `!this.openIfLaidOut(this.term)` beside two pure null checks), so a reader skimming the guards may miss that the line has a side effect. No other guard in the file mutates anything. The `design:` line says this is the deliberate single call site, and the method name signals the effect, so no change.
