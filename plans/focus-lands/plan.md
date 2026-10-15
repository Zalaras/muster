# Plan: focus-lands

**Status**: completed
**Shape**: fix
**Work Type**: web
**E2E Scope**: new-specs
**Fixture plan**: rail-cards.spec.ts fileDaemon (the new test is title-scoped, as every test in the file); plain-shell.spec.ts daemon (each test launches the only session and relies on Focus auto-focusing it); update.spec.ts startDaemon (computed release-server options, as every test in the file)
**Features**: surfaces, update, usage
**Touches**: rail, tiles, focus, reader, connection
**Description**: Keyboard focus lands where the developer expects — a rail card selects on one click, a surface switch moves focus into the surface switched to, and Check now keeps focus (#69, #76).

## Symptom

From `TODO.md` § Issues, "Together — focus lands where the developer expects (#69, #76)":

- **Focus click bug** ([#69](https://github.com/Zalaras/muster/issues/69)) — after typing in a
  session's terminal, clicking a rail card takes two clicks; sometimes also when only switching
  between rail cards. One click should always select a card, whatever holds focus.
- **Loss of focus swapping between tabs** ([#76](https://github.com/Zalaras/muster/issues/76)) — switching
  a session between its Claude, Shell and Docs tabs leaves keyboard focus dangling in the UI. The
  tab switched to should take focus.
- **Switching a session to its shell leaves keyboard focus on the `shell` button** — typing
  goes nowhere until the terminal is clicked. Same on `main` before the cleanup. From
  `plans/maintainability-cleanup/`.
- **Keyboard focus drops to the page body after Check now** — pressing Check now by
  keyboard loses focus; it should stay on the button. From `plans/settings-update-failures/`.

## Findings

Measured with a throwaway Playwright spec against a scratch daemon (deleted after research):

- **#69 held, with a different cause.** A single click after typing in A's terminal selected B
  every time (`mousedown card=2 / mouseup card=2 / click card=2`, B `aria-current=true`, focus in
  B's terminal). The real mechanism: Chrome fires no `click` when the element pressed is
  replaced before the release — measured on a bare page, `replaced inner: []`. The card's
  context row is exactly such an element: `renderContextRow` (`web/src/render/context.ts:51`)
  builds a new track, percent and token span and `replaceChildren`s them on every render pass,
  27 element removals inside one card's `.r3` in ~3.3 s with two live sessions. A press that
  lands on the context row while a render runs (at least once a second) is swallowed, so the
  developer clicks again. The same builder renders the tile header's `.ctxinfo`. The developer
  scoped the fix to this rebuild only (2026-10-14); a card re-inserted by a reorder mid-press
  also drops the click (measured), and is out of scope.
- **#76 and the shell entry held as written; one cause.** After clicking `shell`, `docs`, then
  `claude` in the Focus header, `document.activeElement` was the pressed `BUTTON [shell]`,
  `[docs]`, `[claude]` each time; Enter on a focused segment the same. `select()` in
  `web/src/features/surfaces.ts:129` changes the selection and renders, and nothing moves focus.
  The Tiles footer switch calls the same `select()` (`web/src/features/tiles.ts:269`).
- **Check now held as written.** Focus `#update-check-button`, press Enter: during the check the
  button is `disabled`; after it settles `activeElement` is `BODY`, and the next Tab lands on
  `#settings-close-button`. `renderUpdateSection` writes `checkBtn.disabled = !vm.checkEnabled`
  (`web/src/render/update.ts:64`), and `checkEnabled` is false while the window's own check is in
  flight; Chrome drops focus from a disabled button. `check()` already ignores a second press
  while in flight (`web/src/features/update.ts:60`).

## Requirements

### Must Have

- **REQ-1**: A render pass leaves a known context row's elements in place — the rail card's
  `.r3` and the tile header's `.ctxinfo` update their track fill, percent, token text and
  compaction counter on the existing nodes, so a press on the row is never swallowed by a
  render. What the row shows is unchanged, unknown context included.
- **REQ-2**: Switching a session's surface by the Focus header switch or a tile footer switch,
  by pointer or keyboard, moves keyboard focus into the surface switched to: the terminal for
  `claude` and `shell` (once the shell is up), the reader's rendered body (`article.md`) for
  `docs`.
  *Amended* (decisions/docs-focus-ring): the focused reader body keeps Chrome's default focus
  ring; no `.md:focus-visible` rule.
- **REQ-3**: Pressing Check now, by keyboard or pointer, leaves keyboard focus on the Check now
  button through the check and after it settles. While the check is in flight the button still
  reads as unavailable (`aria-disabled="true"`, `aria-busy="true"`) and a press does nothing;
  a daemon that cannot check (`canCheck` false) still disables it outright.

## Affected Files

### Web (web-impl)

- `web/src/render/context.ts` — REQ-1: update the known branch's nodes in place instead of
  rebuilding them; build them only when absent or after an unknown render.
- `web/src/features/surfaces.ts` — REQ-2: move focus into the selected surface after a switch
  (the shell's after its spawn resolves).
- `web/src/features/reader.ts` — REQ-2: expose focusing a session's rendered body, if
  `surfaces.ts` needs it to reach `article.md`.
- `web/src/features/focus.ts`, `web/src/features/tiles.ts` — REQ-2: only if the focus call
  belongs at their `select` call sites.
- `web/src/render/update.ts` — REQ-3: an in-flight check sets `aria-disabled` instead of
  `disabled`; `canCheck` false keeps `disabled`.

### Existing tests this breaks

- none expected. `web/src/render/update.test.ts` "REQ-10: writes checkBtn.disabled from
  checkEnabled" drives `canCheck`, which still disables; `update.spec.ts`'s e-note-4 asserts
  `isDisabled()` in flight, which Playwright also reads from `aria-disabled`.

## Proof

Written by **e2e-specs**, red on today's tree:

1. `web/e2e/rail-cards.spec.ts`, a new test "a status line that changes a card's context
   percent updates its context row in place, so the row's track is the same element (REQ-1,
   E1)": launch a session, post an enveloped status line at 40%, tag the card's `.r3 .ctx`
   element (a JS property), post one at 41%, wait for `41%`, and assert the element under
   `.r3 .ctx` still carries the tag. Red today: the tag is gone (`expected true, received
   false`).
2. `web/e2e/plain-shell.spec.ts`, new tests "switching the Focus header to shell, docs and back
   to claude moves keyboard focus into each surface (REQ-2, E2)" — after each click, the active
   element is inside the shell terminal, then is the reader's `article.md`, then is inside the
   Claude terminal; a keyboard Enter on the `shell` segment the same — and "switching a tile's
   footer to shell moves keyboard focus into that tile's shell terminal (REQ-2, E3)". Red today:
   the active element is the pressed segment button.
3. `web/e2e/update.spec.ts`, a new test "pressing Check now by keyboard keeps focus on it
   through the check and after it settles (REQ-3, E4)": focus the button, press Enter, hold the
   fake release server, assert the button is focused and `aria-busy`, release, wait for the
   status line, assert the button is still focused. Red today: after settling the active
   element is `BODY`.

## Edge Cases

1. Context goes unknown → known → unknown (a `/clear`) → E1 covers known→known; the existing
   `web/src/render/context.test.ts` honesty-rule tests cover unknown, and W2 runs them.
2. The compaction counter appears on a later render → W2 (web-tests adds a `context.test.ts`
   case if the impl log names one; the review asks otherwise).
3. Switching to `claude` on a dead session (no terminal) → untested: there is no terminal to
   focus; focus stays where it was, as today.
4. A shell spawn fails → untested: the notice shows and focus stays where it was, as today.
5. The developer moves focus elsewhere while a shell spawn is in flight → untested: the
   resolved spawn moves focus only while it is still on the switch or the page body, so it
   never steals focus from a field the developer moved to (R1).
6. A rail card click still moves focus into the terminal; keyboard activation of a card still
   only selects (kb:adr/focus-rail-click-focuses-terminal) → E5 (the existing
   `terminal.spec.ts` tests).

## Acceptance Criteria

### Automated Checks

```checks
E1 cd web && npx playwright test rail-cards.spec.ts plain-shell.spec.ts update.spec.ts -g 'in place|moves keyboard focus into|keeps focus on it'
W1 make web-lint
W2 make web-test
W3 make web-build
E5 make e2e
```

### Reviewer-Verified

- **R1**: a shell spawn that resolves moves focus only if focus is still on the switch segment
  or the page body.
- **R2**: the in-place context row writes every field the rebuild wrote (class `hot`, fill
  width, percent, tokens, compaction counter added and removed), and an unknown render followed
  by a known one rebuilds cleanly.
- **R3**: `#update-check-button` is a real `disabled` only when `canCheck` is false; in flight
  it is `aria-disabled` and `check()`'s in-flight guard is what ignores the press.

## Doc Delta

**surfaces** — becomes true: switching a session's surface from the Focus header or a tile
footer, by pointer or keyboard, moves keyboard focus into the surface switched to — the
terminal for claude and shell, the reader's body for docs.

**update** — becomes true: Check now keeps keyboard focus through a check; while one is in
flight it reads as unavailable and ignores a press, without being disabled.

## Out of scope

- A rail card re-inserted by a reorder while the pointer is pressed still drops that click
  (measured in research; the developer scoped #69 to the context row, 2026-10-14).
