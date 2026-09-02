# Web Tests: terminal-focus

**Plan**: terminal-focus
**Verdict**: pass

## Summary

Tests created: 0 | Passing: 653 (pre-existing suite, unchanged) | Failing: 0

No new test files were written. This plan's entire diff (`web/src/terminal/pane.ts`,
`web/src/render/sessions.ts`, `web/src/main.ts`) is DOM/socket-tangled glue code with no
new pure-logic module — see "Why no new tests" below. All three gates (`tsc --noEmit`,
`npm test`, `npm run build`) are green against the plan branch as handed off by web-impl.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| — | — | no new test file was warranted (see rationale) | — |

## Why no new tests

I read all three modified files (`plans/terminal-focus/web-implementation.md` Changes
table) and checked each change against what this codebase already treats as
Vitest-testable logic vs. Playwright-only DOM/interaction territory
(`docs/conventions.md`: "Unit-test logic (protocol decoding, state derivation,
formatting) with Vitest; interaction and rendering are Playwright's job").

1. **`terminal/pane.ts`'s new `focus()` method (REQ-3, W1-W3).**
   ```ts
   focus(): void {
     if (this.disposed || !this.term) return;
     this.term.focus();
   }
   ```
   This is a two-field guard on `TerminalSurface`, a class whose constructor creates a
   real `@xterm/xterm` `Terminal`, opens a real `WebSocket`, and calls
   `document.createElement`/`getComputedStyle`. `TerminalSurface` has never had direct
   Vitest coverage in this codebase — I confirmed no `pane.test.ts` exists among the 22
   existing `*.test.ts` files, despite the class having grown several other methods
   (`refit`, `applyTheme`, `reattachIfDisconnected`) across earlier plans, none of which
   got direct unit tests either. The one piece of `pane.ts` logic that *is* Vitest-tested
   is `terminal/overlay.ts` (`overlayForCloseCode`/`overlayText`) — and its own header
   comment explains why: "Kept separate from pane.ts's DOM/socket code so it's
   Vitest-testable without a real WebSocket." That's the established convention this
   plan's `focus()` addition doesn't fit: there is no pure predicate to extract — the
   guard reads two private instance fields (`disposed`, `term`) that only exist because
   the constructor did real DOM/socket work, and the only way to prove delegation
   ("does it actually call `Terminal.focus()`?") is to construct a real or heavily-mocked
   xterm instance, which is exactly the DOM-simulation harness my instructions say to
   flag rather than build. The plan's own Reviewer-Verified section anticipated this
   ("W1–W5: read `terminal/pane.ts`... W4/W5 are read, not unit-tested; E1/E7 are their
   behavioural twins") and e2e-specs' authored suite covers the behavioural contract:
   E1/E2/E3 (REQ-1/REQ-2, live delegation actually moves focus + the typed round trip)
   and E5 (REQ-6, the dead-session no-op case — clicking an ended card leaves
   `document.activeElement` on the card, never in a terminal, which is only possible if
   `surfaces.get(id)` is `undefined` for a dead session, i.e. `focus()` was never even
   reached — REQ-6's design note in the plan confirms this is "for free" from
   `surfaces.get(id)` being `undefined`, not from `focus()`'s own guard). W2/W3's precise
   no-throw claims (dead surface, disposed surface) are narrow enough, and downstream of
   enough real xterm/DOM construction, that they're correctly Reviewer-Verified-by-reading
   rather than unit-tested — consistent with how this exact class has always been treated.

2. **`render/sessions.ts`'s widened `onClick` signature (REQ-8, W4/W5).** The only
   behavioural change is which string literal (`"pointer"` vs `"keyboard"`) the existing
   `click`/`keydown` listeners pass to the callback. `sessions.test.ts`'s own
   `FakeDomNode.addEventListener` is a documented no-op ("Not exercised — reconcileCards's
   own tests never simulate a click/keydown, only the reconciliation contract (Playwright
   drives real events; e2e/actions.spec.ts)"), and the plan's Reviewer-Verified list says
   the same explicitly: "the Vitest suite runs against a `FakeDomNode` shim with no event
   dispatch, so W4/W5 are read, not unit-tested; E1/E7 are their behavioural twins." I
   confirmed by reading `buildSessionCardElement` (web/src/render/sessions.ts:220-247)
   that the `click` listener passes `"pointer"` and the `keydown` Enter/Space branch
   passes `"keyboard"`, matching W4/W5 exactly — no fixture work needed to add a
   dispatch capability to `FakeDomNode` only for this one assertion pair when E1 (pointer)
   and E7 (keyboard) already prove the exact same fact behaviourally end to end.

3. **`main.ts`'s rail callback (REQ-1/REQ-2/REQ-4/REQ-6).** Three lines inside the
   `render()` closure, reading/writing module-level `focusedId` and the `surfaces` Map of
   live `TerminalSurface` instances — `main.ts` is the bootstrap module wiring the real
   WS client, real DOM containers and real surfaces together; it has no exported
   testable unit for this callback in isolation, and per the plan's own design note
   ("Where the call lives, and why not in `renderFocusView`") the deliberate reason
   `focus()` is called outside `render()`'s idempotent pass — not inside a pure
   function — is exactly the thing that makes it a DOM-glue call site, not a logic
   module. This is E2E's territory by construction; the authored suite's E1 (fresh
   selection), E3 (re-click), E4 (pin never triggers it), E6 (drag never triggers it), E7
   (Enter never triggers it), and E8 (render tick never triggers it) between them cover
   every branch REQ-4/INV-1 name.

No implementation bug was found — the absence of a Vitest target here is a fit with this
codebase's long-standing DOM/logic split (confirmed against `pane.ts`'s history and
`overlay.ts`'s explicit extraction rationale), not a gap the plan's own author or
web-impl introduced. I did not add a jsdom environment, an xterm mock, or an
event-dispatching `FakeDomNode` variant to manufacture coverage here — conventions and
my own instructions are explicit that doing so would just be Playwright's job wearing a
Vitest costume.

## Test Run Output

```
$ npx tsc --noEmit
(exit 0, no output)

$ npm test
> muster-web@0.0.0 test
> vitest run

 Test Files  22 passed (22)
      Tests  653 passed (653)
   Start at  20:00:01
   Duration  1.21s (transform 1.90s, setup 0ms, import 2.81s, tests 420ms, environment 3ms)

$ npm run build
> muster-web@0.0.0 build
> tsc --noEmit && vite build

vite v8.2.1 building client environment for production...
✓ 36 modules transformed.
../internal/webui/assets/index.html                  14.14 kB │ gzip:   3.45 kB
../internal/webui/assets/assets/index-DRt4N1w_.css   27.25 kB │ gzip:   5.79 kB
../internal/webui/assets/assets/index-A3elleg9.js   387.49 kB │ gzip: 100.25 kB │ map: 993.60 kB
✓ built in 216ms
```
