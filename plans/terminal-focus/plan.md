# Plan: terminal-focus

**Created**: 2026-09-02
**Status**: completed
**Work Type**: web
**E2E Scope**: new-specs
**Closes**: #11
**Description**: Clicking a rail card in Focus puts keyboard focus in that session's terminal, so typing works without a second click.

## Overview

Issue [#11](https://github.com/Zalaras/muster/issues/11): clicking a session in the sidebar
selects it — the live pane swaps to that session — but keyboard focus stays on the card
you clicked, so the terminal needs a second click before typing lands. M2's REQ-7
("clicking a rail card moves focus") meant the *live surface*: the old socket closes and
the new one opens. Nothing ever asks xterm for DOM focus.

The mechanism, verified in the code: a rail card is a focusable `<article tabindex="0">`
(`render/sessions.ts`, `buildSessionCardElement`). Its click listener calls `main.ts`'s
rail callback, which sets `focusedId` and calls `render()`. `renderFocusView` then mounts
the new `TerminalSurface`'s root into `#main-terminal-slot` and re-fits it — and stops.
`TerminalSurface` (`terminal/pane.ts`) exposes no `focus()`; the only way xterm's hidden
textarea ever gains focus today is a direct click on the pane.

The fix is web-only and deliberately narrow: `TerminalSurface` gains a `focus()` method
wrapping xterm's own `Terminal.focus()`, and the rail callback calls it exactly once,
after `render()` has mounted the surface, and only when the selection came from a pointer
click. Nothing on the render tick, the reconcile paths, the drag-reorder path, the
keyboard-activation path (Enter/Space on a card), the ⌘1–9 shortcut, or the Tiles strip
touches focus — three of those were offered and declined at planning (see Scope
decisions), and the drag path is explicitly protected.

### Scope decisions (settled 2026-09-02 with Damian — do not widen)

1. **Rail card pointer click only.** ⌘1–9 (`focusNth`), Enter/Space on a focused card,
   and a Tiles strip-card click keep their current behaviour: they select/promote and
   leave keyboard focus where it is. The TODO.md argument that "focus session *n*" and
   "click session *n*" ought to agree was considered and declined for this plan.
2. **Dead session: focus stays put.** Clicking the card of an ended session shows the dead
   surface as today; keyboard focus remains on the card. Nothing moves it to the dead
   surface's Resume button.
3. **Separate from `shortcut-fixes`, and runs first.** The approved, unstarted
   `shortcut-fixes` plan edits the same `main.ts` keydown block. The two pipelines must
   **not** run concurrently on `main.ts`; this one lands first. `shortcut-fixes` is
   unaffected: this plan does not touch `focusNth` or the keydown listener.

## Requirements

### Must Have

- [ ] **REQ-1**: Clicking a rail card in Focus whose session is `alive` leaves keyboard
  focus inside that session's live terminal — `document.activeElement` is a descendant of
  the container carrying `aria-label="Terminal: <title>"` — so the next keystroke is sent
  to that session without any further click.
- [ ] **REQ-2**: REQ-1 holds when the clicked card is already the focused session (a
  re-click on the current card puts the cursor back in its terminal).
- [ ] **REQ-3**: `TerminalSurface` gains a public `focus(): void` that delegates to
  xterm's `Terminal.focus()`. It is a silent no-op for a surface with no terminal (a dead
  session's surface — `term` is null) and for a disposed surface. It never opens, closes
  or touches the socket.
- [ ] **REQ-4**: Keyboard focus is moved into the terminal **only** on the pointer-click
  selection path. The 1s render tick, a `snapshot`/`sessionUpsert`/`prefs` re-render, a
  rail reorder, a view switch and a drag-reorder drop never call `focus()` on a surface.
- [ ] **REQ-5**: Clicking a card's own controls — the pin button and any `.acts-row`
  action button (End / Resume / Remove) — does **not** select the session and does not
  move focus into a terminal. (Existing behaviour via `stopPropagation`; this requirement
  pins it against regression, since the click path now has a side effect worth guarding.)
- [ ] **REQ-6**: Clicking the card of a session that is **not** `alive` shows the dead
  surface exactly as today and leaves keyboard focus where the click put it (on the card).
  No focus is moved to the dead surface or its Resume button.
- [ ] **REQ-7**: Drag-to-reorder in the rail (manual mode) is unaffected: a drag from card
  C dropped on card A reorders exactly as before, does not change `focusedId`, and does
  not move keyboard focus into any terminal. The pre-blur focus snapshot / restore
  contract from plan order-sidebar REQ-16 (`pendingRailFocus`) is unchanged.
- [ ] **REQ-8**: Enter or Space on a keyboard-focused rail card still selects the session
  (live pane swaps) but does **not** move focus into the terminal; focus stays on the
  card. The card's click callback therefore has to know whether it was invoked by a
  pointer click or by keyboard activation.

### Should Have

- [ ] **REQ-9**: `docs/design/ux-flows.md` §3.1 (Focus shape) states, in one line, that
  clicking a rail card puts the cursor in the pane.

### Nice to Have

- None. The scope is deliberately the reported bug.

## Protocol Contract

**No protocol changes**, so nothing is merged into `docs/protocol.md` on approval. This is
entirely client-side DOM focus management: no WS message, no HTTP endpoint, no `prefs`
field. The daemon never learns where the browser's keyboard focus is.

## Schema Changes

No schema changes required.

## UI Specifications

### Views

- **Focus view** — the rail (`aside[aria-label="Sessions"]`, `#sessions`) and the main
  pane (`#main-terminal-slot`). No new element. The one visible change: after a card
  click, the card's `:focus` ring disappears and xterm's cursor becomes active (xterm adds
  its `focus` class to the terminal and renders the block cursor solid rather than hollow).
- **Tiles view** — unchanged. The rail is `hidden` in Tiles, so the rail click path cannot
  fire there; the strip's promote click is out of scope (Scope decision 1).

### User Flows

1. **Switch and type.** Two live sessions A (focused) and B. User clicks B's rail card →
   B's terminal mounts and receives DOM focus → user types → bytes reach B's pane. No
   second click.
2. **Return to the current one.** Session A focused, user has clicked somewhere else
   (the rail-sort select, say). User clicks A's card → A's terminal (already mounted)
   receives DOM focus → typing lands in A.
3. **Card controls stay controls.** User clicks the pin button on B's card → B is pinned,
   the live pane does not change, and focus is on the pin button (a plain `<button>`
   click), not in any terminal. Same for End / Resume / Remove.
4. **Dead card.** User clicks the card of an ended session → dead surface shows; focus is
   on the card. Pressing Tab moves through the dead surface's controls as today.
5. **Drag.** Rail in manual mode. User drags card C onto card A → the rail reorders,
   `focusedId` is unchanged, the live pane is unchanged, and focus is not in a terminal.
6. **Keyboard activation.** User Tabs to a card and presses Enter → the live pane swaps to
   that session, focus stays on the card (unchanged behaviour, REQ-8).

### States

- **No data yet**: with an empty store there is no card to click; `#main-empty` shows as
  today. Nothing in this plan renders.
- **Data**: as the flows above.
- **Daemon down**: the WS is down, so a live surface shows its "disconnected" overlay
  (`terminal/pane.ts` `overlayForCloseCode`). Clicking a card still selects it and still
  moves DOM focus into its surface; keystrokes are dropped by the existing `readyState`
  guard in `onData`, exactly as they are today when the pane is clicked directly. No new
  state, no new message.

### Implementation shape (for web-impl; no framework)

- `terminal/pane.ts`: add

  ```ts
  /** Moves DOM focus into xterm's input. Called by main.ts only on a pointer selection,
   * never from a render pass. No-op for a dead (no terminal) or disposed surface. */
  focus(): void {
    if (this.disposed || !this.term) return;
    this.term.focus();
  }
  ```

- `render/sessions.ts`: the card callback type becomes
  `(id: number, source: "pointer" | "keyboard") => void`. The card's `click` listener
  passes `"pointer"`; the Enter/Space `keydown` branch passes `"keyboard"`. Every existing
  `(id: number) => void` caller (the strip's `onPromote`, tests) still type-checks — a
  function with fewer parameters is assignable — so `render/tiles.ts` needs no change.
- `main.ts`: the rail callback passed to `renderSessions` inside `render()` becomes

  ```ts
  (id, source) => {
    focusedId = id;
    render();
    if (source === "pointer") surfaces.get(id)?.focus();
  }
  ```

  `render()` is synchronous and mounts the surface before returning, so the surface's
  root is in the DOM when `focus()` runs. `surfaces.get(id)` is `undefined` for a dead
  session (REQ-13 of m2-terminal: only alive sessions have a surface), which gives REQ-6
  for free. Nothing else in `main.ts` changes — in particular not `focusNth`, not the
  `keydown` listener, not `renderFocusView`, not `reconcileTilesGrid`.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Rail card | `article` | `<session title>` | Existing. `<article class="card" data-testid="session-card">` with `aria-label` = title (`render/sessions.ts` `updateSessionCardContent`). Existing helpers `sessionCard(page, title)` / `railCard(page, title)`. |
| Live terminal container | — | `aria-label="Terminal: <title>"` | Existing (`terminal/pane.ts` constructor). Existing helper `terminalRegion(page, title)`. **The focus oracle is "`document.activeElement` is a descendant of this container"** — assert via `page.evaluate`, not by locating xterm's textarea. M2's rule stands: locate the container, never xterm internals. |
| Card pin button | `button` | `Pin` / `Unpin` | Existing `aria-label`, toggles with `pinned`. Existing helper `pinButton(card)`. |
| Card End button | `button` | `End` | Existing (`buildActionButton`). Live cards only. |
| Rail sort select | `combobox` | `Sort` | Existing `#rail-sort`, `aria-label="Sort"`. Used as the "focus is somewhere else first" starting point in E2E. |

Behavioural proof, in addition to the focus oracle: the E2E stub echoes typed input
(`terminal.spec.ts` E2: type `hello`, region shows `stub-echo:hello`). A test that clicks
a card, then calls `page.keyboard.type(...)` **without** clicking the region, and sees the
echo in that session's region has proved the whole path end to end.

## Invariants

Named rules that hold at all times. Each is asserted from **every** listed source state,
not the convenient one (m1-sessions lesson).

- **INV-1 (focus moves only on pointer selection)**: no code path other than the rail
  card's pointer-click callback ever calls `TerminalSurface.focus()`. Source states to
  assert from, each with keyboard focus deliberately *outside* any terminal beforehand:
  (a) a 1s render tick passing; (b) a `sessionUpsert` for the focused session arriving;
  (c) a rail reorder caused by a state change in attention mode; (d) a manual-mode drag
  drop (REQ-7); (e) Enter on a focused card (REQ-8); (f) a pin click (REQ-5). In every
  one, `document.activeElement` is not inside a `Terminal:` container afterwards.
- **INV-2 (one live surface, unchanged)**: m2-terminal INV-2 still holds — after a card
  click exactly one `Terminal:` container exists in Focus, and it is the clicked
  session's. This plan adds a side effect to the click path and must not disturb the swap.
- **INV-3 (card controls never select)**: a click on any `<button>` inside a card never
  changes `focusedId` and never moves focus into a terminal. Source states: pin button on
  a live card, End on a live card, Resume and Remove on an ended card.
- **INV-4 (drag never focuses a terminal)**: from a manual-mode rail with N ≥ 2 cards and
  focus (i) in the live terminal, (ii) on a card, (iii) on the rail-sort select, a
  `dragTo` from one card onto another leaves `document.activeElement` outside every
  `Terminal:` container and leaves the live pane's session unchanged.

## Affected Files

### Web

- `web/src/terminal/pane.ts` — add `focus(): void` (REQ-3). Nothing else in the class
  changes.
- `web/src/render/sessions.ts` — `buildSessionCardElement` / `reconcileCards` /
  `renderSessions`: the `onClick` parameter type gains the `source` argument; the click
  listener passes `"pointer"`, the Enter/Space branch passes `"keyboard"` (REQ-8). Update
  the two doc comments that describe `onClick` ("REQ-7's clicking a rail card moves
  focus") to say the callback now also learns its source.
- `web/src/main.ts` — the rail callback inside `render()` (currently
  `(id) => { focusedId = id; render(); }`) becomes the three-line version above (REQ-1,
  REQ-2, REQ-4, REQ-6). No other edit.
- `docs/design/ux-flows.md` — §3.1's **Main** bullet (line ~176: "Clicking a rail card
  swaps which session is live.") gains "…and puts the cursor in the pane." (REQ-9).

`web/src/render/tiles.ts` is **not** affected: `renderStrip`'s `onPromote: (id: number)
=> void` remains assignable to the widened callback type. If web-impl finds a type error
there, the widening was done wrong (a required second parameter on the *consumer* side is
fine; the *producer* callers must keep compiling unchanged).

### E2E (owned by e2e-specs, listed for locating the seams)

- `web/e2e/terminal.spec.ts` — the natural home (it already holds REQ-7's card-swap test
  and the stub-echo typing test). New specs E1–E8 below.
- `web/e2e/helpers/terminal.ts` — may gain a small helper such as
  `activeElementInsideTerminal(page, title): Promise<boolean>` built on `page.evaluate` +
  `closest('[aria-label="Terminal: <title>"]')`. Harness edits are e2e-specs' call.
- Existing specs that click a card and then press ⌘1 (`web/e2e/views.spec.ts:110`,
  `web/e2e/rail-order.spec.ts:613–720`) now run with focus inside xterm after the click.
  **Verified at planning** (`@xterm/xterm` 6.0.0, `src/browser/CoreBrowserTerminal.ts`
  line 1066): an event xterm does not map to a key (`!result.key`, which is every bare
  ⌘-digit on macOS) returns without `cancel`, so the keydown bubbles to `main.ts`'s window
  listener unchanged. Those specs should stay green; e2e-specs' full sweep confirms it.

`SPEC.md` and `TODO.md` are **not** listed under an impl track — see Implementation Notes
→ Doc upkeep.

## Edge Cases

1. **Re-clicking the already-focused card.** `render()`'s surface diff is a no-op; the
   existing surface is already mounted; `focus()` puts the cursor back in it (REQ-2). This
   is the "I clicked away, bring me back" gesture and must work.
2. **Click on a dead card.** `surfaces.get(id)` is undefined → no call → focus stays on
   the card (REQ-6). Do not "fix" this by focusing the dead surface.
3. **Click on the pin / End / Resume / Remove button.** `stopPropagation()` in
   `buildActionButton` and the pin listener runs before the card's click listener, so the
   callback never fires (REQ-5). Playwright's `click()` on the button proves it.
4. **Drag-reorder in manual mode.** Browsers do not dispatch `click` on the source element
   once `dragstart` has fired, so a completed or aborted drag never reaches the callback.
   The drag's initiating `mousedown` still blurs whatever was focused (a terminal
   included) — that is the browser's default and is unchanged. `dragreorder.ts`'s pre-blur
   snapshot (`focusedBeforeDrag`) deliberately ignores xterm's textarea
   (`render/focus.ts`: "anything else inside the container … is deliberately not
   captured"), so after a drag that started with the terminal focused, focus ends on the
   dropped card or `<body>` — never re-thrown into the terminal (REQ-7, INV-4).
5. **Click-then-drag that never crosses the drag threshold.** A tiny mouse movement with
   no `dragstart` is a click → the session is selected and focused. Correct.
6. **Enter/Space on a focused card.** Selects; focus stays on the card (REQ-8). Note the
   card's `keydown` guard (`event.target !== card`) already keeps nested buttons' Enter
   from reaching this branch — unchanged.
7. **Fresh surface, socket not yet open.** A card click for a session with no mounted
   surface constructs one; its `/ws/terminal/{id}` socket opens asynchronously. Keystrokes
   typed in the gap are dropped by `onData`'s `readyState` guard. This is the existing
   behaviour when a user clicks a freshly mounted pane directly, not new to this plan;
   queueing input is out of scope.
8. **Overlay showing (disconnected / superseded).** Focus lands in the textarea beneath
   the overlay; typing is dropped (socket closed). Clicking the overlay still reclaims a
   superseded surface as today. No change.
9. **Second browser window.** Clicking a card in window A supersedes window B's surface
   for that session (m2-terminal INV-1). A's terminal is focused; B shows the superseded
   overlay. Unchanged.
10. **Render tick between click and focus.** Impossible: `render()` and the `focus()` call
    are synchronous in the same event handler; the 1s `setInterval` cannot interleave.
11. **The clicked card moves during its own render.** In attention mode a click doesn't
    change state, so the card doesn't move. Even if a concurrent state change reordered
    it, `reconcileCards`' capture/restore re-focuses the *card* during `render()`, and
    then `focus()` moves focus to the terminal afterwards — the terminal wins, as
    intended, because it runs last.
12. **`focus()` on a not-yet-laid-out surface.** `Terminal.focus()` is
    `textarea.focus()`; on an element that is in the DOM this works regardless of whether
    the first `fit()` has run. `renderFocusView` mounts and re-fits before returning, so
    the root is connected by the time `focus()` runs. A detached textarea's `focus()` is a
    silent no-op — no throw path.
13. **Safari.** `HTMLElement.focus({ preventScroll })`, which xterm uses, is supported.
    No browser-specific code.

## Acceptance Criteria

IDs unique across the section — `W*` web, `E*` e2e (no daemon track). One clause per
criterion.

### Web

- **W1**: `TerminalSurface` has a public `focus(): void` method.
- **W2**: `TerminalSurface.focus()` does not throw when called on a surface constructed
  for a session with `alive: false`.
- **W3**: `TerminalSurface.focus()` does not throw when called after `dispose()`.
- **W4**: the rail card's `click` listener invokes the callback with `source === "pointer"`.
- **W5**: the rail card's Enter/Space `keydown` branch invokes the callback with
  `source === "keyboard"`.
- **W6**: `render/tiles.ts` is unchanged by this plan.
- **W7**: `focusNth` and the window `keydown` listener in `main.ts` are unchanged by this
  plan (so `shortcut-fixes` applies cleanly afterwards).
- **W8**: no `any` types in new web code.
- **W9**: `ux-flows.md` §3.1 carries the one-line click-puts-cursor-in-pane statement
  (REQ-9).

### E2E

- **E1**: with two live sessions A (focused) and B, clicking B's rail card leaves
  `document.activeElement` inside the `Terminal: B` container (REQ-1).
- **E2**: after E1's click, `page.keyboard.type("hello")` with **no** click on the region
  produces `stub-echo:hello` in the `Terminal: B` container (REQ-1, behavioural proof).
- **E3**: with one live session focused and keyboard focus first placed on the rail-sort
  select, clicking that session's card leaves `document.activeElement` inside its
  `Terminal:` container (REQ-2).
- **E4**: clicking a live card's pin button pins the session and leaves
  `document.activeElement` outside every `Terminal:` container, and the live pane's
  session is unchanged (REQ-5, INV-3).
- **E5**: clicking an ended session's card shows the dead surface and leaves
  `document.activeElement` on that card, outside every `Terminal:` container (REQ-6).
- **E6**: in manual mode with cards A, B, C and focus inside the live terminal, `dragTo`
  from C onto A reorders the rail to C, A, B, leaves the live pane's session unchanged,
  and leaves `document.activeElement` outside every `Terminal:` container (REQ-7, INV-4).
- **E7**: Tabbing to (or programmatically focusing) B's card and pressing Enter swaps the
  live pane to B and leaves `document.activeElement` on B's card (REQ-8).
- **E8**: after E1's click, waiting past two full render ticks (≥ 2.5 s) leaves
  `document.activeElement` still inside the `Terminal: B` container (INV-1(a): the tick
  neither steals nor re-asserts focus — same node, same place).
- **E9**: after E1's click, exactly one `[aria-label^="Terminal: "]` element exists
  (INV-2).

### Automated Checks

Every line is `<ID> <single-line shell command>`, run from the project root; a check passes
iff its command exits 0. W10–W12 and E10 are build/suite gates with no prose twin,
numbered clear of the prose criteria. W6 and W7 are the two negative-change gates; they
compare against `main` and are honest only while this plan's branch is the only unmerged
work touching those files — which Scope decision 3 guarantees.

Dry-run note (rule 2): the two `git diff` checks name paths, not string patterns, so the
plan's own prose cannot trip them. Rule 3: run from a clean checkout of the plan branch
they exit 0 before any work starts, as expected for "unchanged" gates.

```checks
W6 git diff --quiet main -- web/src/render/tiles.ts
W7 test "$(git diff main -- web/src/main.ts | grep -c -E '^[-+].*(focusNth|addEventListener\("keydown")')" -eq 0
W10 make web-build
W11 make web-test
W12 make lint
E10 make e2e
```

### Reviewer-Verified

- **W1–W5**: read `terminal/pane.ts`, `render/sessions.ts` and `main.ts`. The Vitest
  suite runs against a `FakeDomNode` shim with no event dispatch, so W4/W5 are read, not
  unit-tested; E1/E7 are their behavioural twins.
- **W8**: no `any` types in new web code.
- **W9**: the `ux-flows.md` line exists and is accurate.
- **REQ-4 / INV-1**: `TerminalSurface.focus()` has exactly one call site in `web/src/`,
  inside the rail callback in `main.ts`, guarded by `source === "pointer"`. Not a grep
  gate because the word `focus` is everywhere in this codebase (`focusedId`, `focusNth`,
  `render/focus.ts`); the reviewer confirms the call-site count by reading.
- **Scope decisions 1–2**: no focus call was added to `focusNth`, the strip's promote
  path, or the dead-surface path.

## Implementation Notes

### Why the source discriminator

Damian scoped this to the pointer click (Scope decision 1). The card's click and
Enter/Space listeners share one callback today, so honouring that scope means the callback
has to be told which fired. A second parameter is the smallest honest change — no second
callback, no DOM flag. If the scope is later widened to keyboard activation, delete the
`source` check in `main.ts`; the plumbing stays.

### Where the call lives, and why not in `renderFocusView`

`render()` is the single idempotent pass, called from the tick and from every message
handler. Putting `focus()` anywhere inside it — even behind a one-shot flag — invites the
exact class of bug the m4-reconcile review chased for four cycles (focus moved by a render
pass). The call sits *after* `render()` returns, in the one handler that represents a
user's deliberate pointer selection. REQ-4 and INV-1 are the review's checklist for this.

### Measurements carried forward (re-checked against this plan's decisions)

- **xterm passes unmapped ⌘-chords through** (`CoreBrowserTerminal.ts:1066`,
  `@xterm/xterm` 6.0.0): still valid — this plan changes *where focus is*, not xterm's
  options; `customKeyEventHandler` is not set. Consequence: existing specs that click a
  card then press ⌘1 keep working with focus now inside xterm.
- **`insertBefore` blurs a focused descendant on detach** (`render/focus.ts` header,
  m4-reconcile cycles 3–4): still valid and still irrelevant to the terminal — the
  focused textarea lives in `#main-terminal-slot`, which no reconciler reorders.
  `renderFocusView`'s `replaceChildren(surface.root)` only runs when the mounted root
  differs, i.e. on a genuine surface swap, never on a steady tick.
- **A drag's `mousedown` blurs the focused control before `dragstart`**
  (`dragreorder.ts` header, plan move-tiles): still valid; it is why edge case 4 ends with
  focus on the card/body and why the terminal is never re-focused after a drop.

### Doc upkeep (orchestrator, not an impl track)

- `TODO.md` — tick "Sidebar click doesn't move focus into the terminal (#11)". Amend the
  sentence suggesting `shortcut-fixes` "could absorb this": it was planned separately
  (Scope decision 3) and lands first.
- `SPEC.md` §11 — one changelog line: rail pointer click moves keyboard focus into the
  terminal; keyboard activation, ⌘1–9 and the Tiles strip deliberately do not; a dead
  session's card leaves focus in place.
