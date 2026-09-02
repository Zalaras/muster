# E2E Test Specs: terminal-focus

**Plan**: terminal-focus
**Mode**: validate (attempt 1)
**Verdict**: pass
**Tests created**: 11
**Live run**: 203/203 passing (full suite)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/terminal.spec.ts | clicking a rail card in Focus moves keyboard focus into its terminal with no second click, and the typed round trip proves it end to end (E1, E2, E9, REQ-1, REQ-4) | REQ-1, REQ-4, E1, E2, E9 | Two live sessions A(focused)/B; click B's card → `activeElement` inside `Terminal: B`; exactly one live terminal exists; typing with no click on the region echoes `stub-echo:hello` |
| web/e2e/terminal.spec.ts | re-clicking the already-focused session's card returns keyboard focus to its terminal after focus moved elsewhere (E3, REQ-2) | REQ-2, E3 | Focus moved to the rail-sort select, then a re-click on the current card returns focus to its terminal |
| web/e2e/terminal.spec.ts | clicking a card's pin button pins the session, leaves the live pane unchanged, and never moves focus into a terminal (E4, REQ-5, INV-3) | REQ-5, INV-3 (pin), E4 | Pin click pins B, mainhead stays A, `activeElement` outside every terminal |
| web/e2e/terminal.spec.ts | clicking a live card's End button opens the confirm dialog without selecting the session or moving focus into a terminal (REQ-5, INV-3) | REQ-5, INV-3 (End on a live card) | End click on a non-focused live card opens the dialog, doesn't select, doesn't focus a terminal |
| web/e2e/terminal.spec.ts | clicking Resume or Remove on an ended card never selects the session or moves focus into a terminal (REQ-5, INV-3) | REQ-5, INV-3 (Resume/Remove on an ended card) | Remove (dialog) and Resume (no dialog) on an ended card never select it or move focus into a terminal |
| web/e2e/terminal.spec.ts | clicking an ended session's card shows the dead surface and leaves keyboard focus on that card, never in a terminal (E5, REQ-6) | REQ-6, E5 | Clicking a dead card shows `#dead-surface`, no `Terminal:` container mounts, `activeElement` is the card itself |
| web/e2e/terminal.spec.ts | dragging a rail card onto another in manual mode reorders the rail without changing focusedId or stealing focus from the terminal (E6, REQ-7, INV-4 source state (i)) | REQ-7, INV-4(i), E6 | Drag C onto A reorders to [C,A,B], live pane stays A, focus (started inside the terminal) ends up outside every terminal |
| web/e2e/terminal.spec.ts | dragging a rail card leaves focus untouched whether it started on an uninvolved card or the rail-sort select (INV-4 source states (ii), (iii)) | INV-4(ii), INV-4(iii) | Two sequential drags, focus starting on an uninvolved card and then on the rail-sort select, both leave focus outside every terminal |
| web/e2e/terminal.spec.ts | Enter on a keyboard-focused rail card selects the session but leaves focus on the card (E7, REQ-8) | REQ-8, E7 | Card `.focus()` + real `Enter` keypress selects B, focus stays on B's card, never in a terminal |
| web/e2e/terminal.spec.ts | a 1s render tick never moves focus into a terminal when it starts outside one, and never steals it once inside (E8, INV-1 source state (a)) | REQ-4, INV-1(a), E8 | Both directions: pre-click, 2.5s of ticks never pull focus in; post-click, 2.5s of ticks leave the exact same tagged DOM node focused |
| web/e2e/terminal.spec.ts | a sessionUpsert for the focused session doesn't move keyboard focus into its terminal (INV-1 source state (b)) | REQ-4, INV-1(b) | Focus on the rail-sort select; a turn-activity hook for the focused session's own id changes its badge (proves a render happened) but the select stays focused |
| web/e2e/terminal.spec.ts | a rail reorder from a state change in attention mode doesn't move keyboard focus into a terminal (INV-1 source state (c)) | REQ-4, INV-1(c) | Attention mode; a needs-input hook chain for C reorders the rail to [C,A,B] with focus (on the select) untouched |

## Fixture Changes

No new hook/status-line payload shapes. Reused existing `envelopedSessionStart`, `rawUserPromptSubmit`, `rawNotification` from `web/e2e/helpers/payloads.ts` (already synthesized per `spikes/canary-fields.md` for the m1-sessions/order-sidebar suites) exactly as `rail-order.spec.ts`'s `makeNeedsInput` does — no new wire shapes introduced.

Two new helpers added to `web/e2e/helpers/terminal.ts` (both pure `page.evaluate` wrappers around the plan's named focus oracle, "`document.activeElement` is a descendant of the container carrying `aria-label=\"Terminal: <title>\"`"):

- `activeElementInsideTerminal(page, title): Promise<boolean>` — scoped to one session's terminal container, per the plan's suggested helper shape.
- `activeElementInsideAnyTerminal(page): Promise<boolean>` — unscoped, for the INV-3/INV-4 assertions that only need "not inside ANY terminal" regardless of which session's.

No `web/playwright.config.ts` change needed or made.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | "clicking a rail card in Focus moves keyboard focus into its terminal with no second click…" (E1/E2/E9) |
| REQ-2 | "re-clicking the already-focused session's card returns keyboard focus…" (E3) |
| REQ-3 | Not E2E — Vitest-only per plan's Reviewer-Verified list (`focus()` no-throw on dead/disposed surface has no DOM event dispatch in the Vitest `FakeDomNode` shim) |
| REQ-4 | render-tick test (E8/INV-1a), sessionUpsert test (INV-1b), attention-reorder test (INV-1c), drag tests (INV-4), pin test (INV-3), Enter test (E7) — every one of REQ-4's named non-triggering paths except "view switch" (out of INV-1's named source-state list; Tiles is explicitly out of scope per the plan's Scope decisions and UI Specifications) |
| REQ-5 | pin test (E4), End-on-live-card test, Resume/Remove-on-ended-card test — all four INV-3 source states |
| REQ-6 | "clicking an ended session's card shows the dead surface…" (E5) |
| REQ-7 | "dragging a rail card onto another in manual mode reorders the rail…" (E6) |
| REQ-8 | "Enter on a keyboard-focused rail card…" (E7) |
| REQ-9 | Not E2E — a `docs/design/ux-flows.md` prose line, orchestrator doc-upkeep item, not a testable UI element |
| INV-1 | E8 (a, both directions), sessionUpsert test (b), attention-reorder test (c), pin test (f), drag test (d), Enter test (e) — all six named source states |
| INV-2 | E1/E9 test's "exactly one `[aria-label^=\"Terminal: \"]`" assertion, plus the pre-existing REQ-7 card-swap test in this same file |
| INV-3 | pin/End/Resume/Remove tests — all four named source states |
| INV-4 | drag-focus-inside test (i), drag-focus-elsewhere test (ii, iii) — all three named source states |

## Repairs

N/A — authoring mode, no prior run to repair against.

## E2E Implementation Bugs

N/A — authoring mode.

## Test Run Output

Not run. Collection gate only, from `web/`:

```
$ npx playwright test --list
...
Total: 203 tests in 17 files
```

Exit 0, no error. `terminal.spec.ts` alone now lists 20 tests (9 pre-existing m2-terminal tests + 11 new terminal-focus tests). `npx tsc --noEmit -p .` also passes clean over the whole `web/` tree.

## Validate Attempt 1

Rebuilt in the plan's mandated order (`make web-build build` — web assets embedded
before the Go binary compiles) from the project root, then ran the target file live from
`web/`:

```
npm run e2e -- e2e/terminal.spec.ts
```

Run 1: 19/20 passed, 1 failed —
`clicking a card's pin button pins the session, leaves the live pane unchanged, and never
moves focus into a terminal (E4, REQ-5, INV-3)`:

```
Error: expect(locator).toHaveText(expected) failed
Locator:  locator('#sessions').getByTestId('session-card').filter({ hasText: 'focus-e4-b' }).getByRole('button', { name: /^(Pin|Unpin)$/ })
Expected: "Pin"
Received: ""
  14 × locator resolved to <button class="pin" data-id="2" type="button" aria-label="Pin" data-action="pin" title="Pin to top" aria-pressed="false"></button>
```

Diagnosed as my own locator defect, not an implementation defect: the pin button is
icon-only — its accessible name lives in `aria-label` (which `pinButton`'s
`getByRole('button', {name: /^(Pin|Unpin)$/})` correctly matches by accessible name), but
it carries no text content, so `toHaveText("Pin")` can never pass regardless of state.
`rail-order.spec.ts`'s own pin-state assertions (e.g. line 535) never use `toHaveText` on
this button either — they assert `aria-pressed` plus the accessible-name change via
`getByRole`'s name filter, which is the established, correct pattern for this exact
control. Repaired to follow it (see Repairs table).

Run 2 (after the repair): 20/20 passed.

Re-ran `npx playwright test --list` from `web/`: `Total: 203 tests in 17 files`, exit 0,
no duplicate-title or collection error.

Swept the full suite (`make e2e` from the project root, per Validate Mode step 5): this
plan carries **no protocol delta** (Protocol Contract: "No protocol changes"), so any
pre-existing spec failure would have to be a genuine implementation-bug, not sanctioned
breakage. Result: **203/203 passed** — no pre-existing spec broke, confirming the plan's
own Affected Files note that `views.spec.ts:110` and `rail-order.spec.ts`'s ⌘1-after-click
tests stay green now that focus lands inside xterm after a card click.

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | "clicking a card's pin button pins the session, leaves the live pane unchanged, and never moves focus into a terminal (E4, REQ-5, INV-3)" | `toHaveText("Pin")` timed out — received `""` | The pin button is icon-only: its accessible name is `aria-label`, not text content, so no state of this button ever satisfies `toHaveText`. My locator guessed a text-content assertion the markup cannot carry. | Replaced with `toHaveAttribute("aria-pressed", "false")` before the click and, after the click, `cardB.getByRole("button", { name: "Unpin" })` (proving the accessible name flipped) `toHaveAttribute("aria-pressed", "true")` — the same pattern `rail-order.spec.ts:535` already uses for this control. | REQ-5 / INV-3: still proves the pin state actually flipped (both the accessible-name change and `aria-pressed`) and, unchanged from before, that the live pane stays on A and focus never lands in any terminal. |

`No assertion was deleted, skipped, or weakened.`

## E2E Implementation Bugs

N/A — verdict is `pass`; no implementation defect found.

## Test Run Output

```
$ npm run e2e -- e2e/terminal.spec.ts   (after repair)
Running 20 tests using 6 workers
  ... (20 lines, all ✓)
  20 passed (13.0s)

$ npx playwright test --list
Total: 203 tests in 17 files

$ make e2e   (project root; full sweep)
Running 203 tests using 6 workers
  ... (203 lines, all ✓)
  203 passed (50.7s)
```

## Notes

- **Locator choice**: used `railCard` (scoped to `#sessions`) from `web/e2e/helpers/railorder.ts` rather than the unscoped `sessionCard` the plan's Testable UI Elements table also names — Focus-view tests never switch to Tiles, so the ambiguity `stripCard`'s header comment warns about doesn't actually bite here (the Tiles strip is never populated while `view === "focus"`, since `renderTilesView`/`renderStrip` are simply never called), but `railCard` is the more defensive, already-established choice for rail-only specs and matches what `rail-order.spec.ts` uses throughout.
- **No fixture drift risk**: every hook payload used (`envelopedSessionStart`, `rawUserPromptSubmit`, `rawNotification`) is an existing, already-measured-against-the-captures builder reused verbatim — no new shape was invented, so there is nothing here that needs an `/interface-probe`.
- **Scope discipline**: deliberately did NOT add a view-switch (Focus→Tiles→Focus) focus test. REQ-4's prose mentions "a view switch" among paths that must never call `focus()`, but the Invariants section's INV-1 only lists six *named* source states (a–f) to assert from, and a view switch isn't one of them — Tiles is out of scope per the plan's own Scope decisions and UI Specifications ("Tiles view — unchanged… the strip's promote click is out of scope"). Adding it would have been scope creep beyond what the plan pins.
- **REQ-3 and REQ-9 are not E2E requirements.** REQ-3 (`TerminalSurface.focus()`'s no-throw behavior on a dead/disposed surface) is explicitly Reviewer-Verified/Vitest territory per the plan's own Acceptance Criteria section (the Vitest `FakeDomNode` shim dispatches no real events), and REQ-9 is a one-line doc change with no DOM surface. Neither needed a Playwright test; this is deliberate, not an oversight.
- **Resume-on-ended-card test triggers a real async relaunch** (the daemon actually starts resuming session B via the `-claude-bin` stub after the click). The test only asserts the synchronous "did not select / did not focus a terminal" outcome immediately after the click and does not wait for or verify the relaunch's completion — that behavior (E7 of plan m4-reconcile) is already covered by `actions.spec.ts`. `ScratchDaemon.teardown()` tears down the whole tmux server regardless, so this leaves nothing orphaned.
- **Two new helpers were added additively** to `web/e2e/helpers/terminal.ts` (`activeElementInsideTerminal`, `activeElementInsideAnyTerminal`), exactly the shape the plan's Affected Files section names as e2e-specs' call to make.
