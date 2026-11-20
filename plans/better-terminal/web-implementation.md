# Web Implementation: better-terminal

**Plan**: better-terminal
**Mode**: initial
**Pack**: kb: pack 38838 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol/terminals.ts` | created | `TerminalInfo`, `terminals` message and `snapshot.terminals` parsers (REQ-6, 17) |
| `web/src/protocol/messages.ts` | edited | parse `terminals` / `snapshot.terminals`; `shellActivity` and `shellsBusy` removed |
| `web/src/ws.ts`, `wsapp.ts`, `app.ts`, `doc.ts` | edited | `onTerminals` handler and `terminals` app event replace the `shellActivity` ones |
| `web/src/api/sessions.ts` | edited | `createShell` result gains `n`; `createTerminal`, `renameTerminal`, `closeTerminal` |
| `web/src/terminal/terminals.ts` | created | pure per-session terminal-list state, any-busy reading (W2, W3) |
| `web/src/terminal/surfaceswitch.ts` | edited | `shellRunning` becomes `shell: number \| null` (last shown); `terminalsChanged` fallback reducer replaces `shellEnded`/`setShellRunning`; surface keys carry `n` (REQ-3, 6, W1, INV-5) |
| `web/src/terminal/shellactivity.ts` | edited | comments only; fed by the any-terminal-busy reading |
| `web/src/terminal/pane.ts` | edited | shell socket targets `/ws/shell/{id}/{n}`; `onShellEnded` removed (the list is the one source for a terminal ending) |
| `web/src/features/surfaces.ts` | edited | owns terminal lists, shown terminal, activity from any-busy, snapshot re-sync; `select` always asks `POST …/shell`; new/rename/close actions (REQ-1–6, 13, W4) |
| `web/src/features/terminalspanel.ts` | created | Terminals panel controller: open from either ▾, live update per render pass, close on daemon down, busy-close confirm |
| `web/src/render/terminalspanel.ts` | created | panel DOM: rows reused by `n`, rename field, New terminal (REQ-11, 17, 18, 19) |
| `web/src/render/popover.ts` | created | popover part extracted from the menu builder, shared (REQ-15) |
| `web/src/render/menu.ts` | edited | now built on `popover.ts`; behaviour unchanged |
| `web/src/render/surfaceseg.ts` | edited | ▾ opener, `span.shellcount`, `shell` title, disabled while down (REQ-8, 9, 10, 14) |
| `web/src/render/mainhead.ts`, `render/tiles.ts`, `features/focus.ts`, `features/tiles.ts`, `main.ts` | edited | plumb the terminals view and the ▾ opener to both hosts |
| `web/src/render/confirm.ts`, `web/index.html` | edited | close-terminal confirm dialog (REQ-5) |
| `web/src/style.css` | edited | opener, count, panel, rename field |

## Decisions

- REQ-16 (tile footer fit at 3x2): CSS trims the ▾ and count padding in `.tfoot`; not measured in a browser by me, the render spec R2 and browser review decide.
- REQ-18: the list holds nine rows by `max-height: calc(9 * var(--trow-h))` and scrolls; New terminal sits outside the scroll. Not measured by me; R3.
- Testable UI row "Rename button ✎ visible on hover": hidden with `opacity: 0` (not `visibility`) so the button stays in the accessibility tree and the tab order; `visibility: hidden` made the e2e helper's role count read 0 rows.
- `select('shell')` always calls `POST …/shell` even with a last-shown terminal, then shows the last-shown one if the list still holds it, else the response's `n`: a terminal killed outside Muster whose `terminals` message has not arrived must not be shown (E3 spec starts one when none runs).
- The panel stays open behind the close-confirm modal; popover ignores pointerdowns inside an open `dialog` so a Confirm click is not an outside click.
- A terminal ending is learned only from the `terminals` list, not from its socket's `4001` (pane.ts no longer reports it): one source for the fallback.
- A background shell mounted under `docs` (old `desiredSurfaceEntries` branch) is gone: the list now carries ends, so no hidden socket is needed.
- `snapshot.terminals` parses as optional (absent = `{}`), like the other present-only snapshot fields, so older fixtures round-trip.

design: `terminal/terminals.ts` — pure immutable Map of lists, `setTerminals` identity when unchanged; shape matches `shellactivity.ts` (`rg "ReadonlyMap" web/src/terminal` found that precedent, nothing reusable for lists). Owner: `features/surfaces.ts`, mutated only from its `terminals` and `snapshot` handlers.
design: `SessionSurfaceState.shell` replaces `shellRunning` — one number carries last-shown and running; `terminalsChanged` keeps it inside the daemon list (INV-5) in the same step that reverts `selected`, as `shellEnded` did.
design: `render/popover.ts` extracted from `menu.ts` (`rg "pointerdown" web/src/render` — `menu.ts` was the only holder of the anchor/outside-click/Esc/focus-return logic; `restart.ts` and `grouppopover.ts` hand-roll theirs and were left alone). Panel uses `onViewportChange: "reposition"` because a scroll event from a terminal behind it would otherwise close a live-updating panel; menus keep `"close"`.
design: `features/terminalspanel.ts` is its own controller, not inside `surfaces.ts` (no controller imports a sibling): `main.ts` wires `{ surfaces }` as deps and gives focus/tiles a `getTerminalsPanel` thunk, like `getReader`. Its `app.onRender` phase follows `restart.ts`'s (close when disconnected, else repaint in place).
design: `render/terminalspanel.ts` rows are reused by terminal number and written only on change; a row being renamed keeps its field and focus across updates; reorder restores focus like `keyedreorder.ts` (that helper is keyed by session id, so not reusable).
design: `render/confirm.ts` `wireDialog` made generic over its target so the close-terminal dialog (target `{id, n}`) reuses it; Stop/Remove adapt through `wireIdsDialog`.
design: no size warning on a touched file beyond pre-existing ones (groups.ts 507 is not mine).

doc-delta: `docs/design/design-system.md` (plan Affected Files lists it; I do not write `docs/`): the surface switch reads `claude | shell | ▾ | docs` with a count pill after `shell`, and gains a Terminals panel component entry (a `role="dialog"` on the Menu tokens, sharing the popover part, ✎ at opacity 0 until row hover or focus-within).
doc-delta: protocol anchor `ws.shell-activity` still names the terminal list message in `docs/protocol.md`; code cites it as the `terminals` anchor.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` fail on sanctioned test files only — the type check covers tests and the symbols they use changed (`shellRunning`→`shell`, `shellEnded`/`setShellRunning` removed, `updateSurfaceSegment`/`renderMainhead`/`buildSurfaceSegment`/`buildTile` gained arguments, `Snapshot.shellsBusy` gone). `npm run -s lint` exit 0; `make check-kb` exit 0; no non-test source error.
**E2E smoke**: `npx playwright test e2e/terminals.spec.ts` → `1 failed, 27 passed` (the failure is a spec defect, below); `e2e/shell.spec.ts e2e/plain-shell.spec.ts e2e/shell-activity.spec.ts` → `29 passed`. Built with `make build` after `npx vite build` (the `make web-build` target stops at the test type errors).

Test files needing changes (not mine to make):
- `web/src/terminal/surfaceswitch.test.ts` (26 errors), `web/src/render/surfaceseg.test.ts` (21), `web/src/render/mainhead.test.ts` (23), `web/src/render/tiles.test.ts` (1), `web/src/features/surfaces.test.ts` (2), `web/render/surfaces.spec.ts` (3, `shellsBusy`), plus `shellactivity.test.ts`, `api/sessions.test.ts`, `api/http.test.ts`, protocol message tests that name `shellActivity`/`shellsBusy`/`createShell` results: new signatures above (`SessionSurfaceState {selected, shell}`, `terminalsChanged`, `showTerminal`, `updateSurfaceSegment(..., terminals)`, `renderMainhead(..., activity, terminals, ...)`, `buildSurfaceSegment(onSelect, onOpenTerminals)`, `buildTile(..., onSurfaceSelect, onOpenTerminals, noteHover?)`).
- Spec defect for validate mode: `web/e2e/terminals.spec.ts:686` ("ending one terminal leaves a sibling attached in another window and the Claude pane untouched"): window B is loaded with `claude` selected, so it attaches the Claude pane and supersedes window A's Claude socket (A's overlay reads "live view opened in another window", measured: A's `/ws/terminal/1` closes the moment B's page loads, before any DELETE). `claudeSockets.liveCount` is 0 at :729 by the one-live-client law, not by a bug. The test needs B to avoid the Claude surface (or A to be the shell window).
- Daemon-side: nothing found.

## Fix Attempt 1 (pre-review fix)

**Failures addressed**: features-inventory: `terminalspanel.ts` not named in `web/src/features/CLAUDE.md`.
**Changes made**: named `terminalspanel.ts` in `web/src/features/CLAUDE.md`; named `terminalspanel.ts`/`popover.ts` in `web/src/render/CLAUDE.md` and `terminals.ts` in `web/src/terminal/CLAUDE.md`. `web/src/protocol/` keeps no CLAUDE.md, so `protocol/terminals.ts` needs no entry.
**Decisions**: none.

## Fix Attempt 2 (review cycle 1)

**Failures addressed**: maintainability Major 1 (panel `position()` duplicated `reconcileKeyedOrder`), maintainability Minor 1 (third inline rename field, no grep), correctness Minor 1 (popover extraction changed every menu's outside-click and scroll behaviour). Correctness Major 4 is docs, left to the orchestrator.
**Changes made**:
- `web/src/render/terminalspanel.ts`: `position()` now calls `reconcileKeyedOrder(list, entries, null)` with entries `{ id: terminal.n, root }`; only the panel's own focus restore stays local, beside the call. Only reorder loop in the panel; `rg insertBefore web/src` non-test now hits only `keyedreorder.ts`.
- `web/src/render/popover.ts`: new `PopoverOptions.ignoreOpenDialogs` and `keepOnInnerScroll`, both default off, so `createMenu()` is back to closing on any outside pointerdown (including inside a `dialog[open]`) and on any scroll. `web/src/features/terminalspanel.ts` is the only caller setting them (consumers of `createPopover`: `menu.ts` and `features/terminalspanel.ts`, via `rg createPopover`).
**Decisions**:
- design: `render/terminalspanel.ts` row reorder reuses `render/keyedreorder.ts` (`KeyedReorderEntry` id is `number | string`, already used with file-path keys at `reader.ts` and section keys in `railsections.ts`); the earlier "keyed by session id" reason was wrong.
- design: `startRename`/`endRename` stays local. `rg -n "name-edit|replaceWith\(.*(btn|Btn)|maxLength" web/src/render` finds `rename.ts` `attachRenameEditor` (bound to `Session`/`titleCommand`, blur commits, swaps its `button.rename` container child) and `railsections.ts` `openNameField` (controller-owned `NameEditor` state, blur commits, group names). The terminal field differs in the load-bearing way: blur cancels (the panel stays open and a stray blur must not rename), Enter and Escape stop propagation so the popover's Esc handler does not also close the panel, and Enter returns focus to the ✎ button. Generalising either would add a commit/cancel-on-blur mode to both sessions' and groups' editors for one caller.
**Evidence**: `npx tsc --noEmit` and `npm run build` exit 0; `npm run -s lint` clean; `npx vitest run` 3367 passed (114 files); `make web-build build` then `npx playwright test e2e/terminals.spec.ts` `28 passed (50.6s)`. Reviewer's repro for Minor 1 was a code reading, not a measured chain; closed by the option gating above.

## Handoff (fix attempt 2)

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0
**E2E smoke**: `28 passed (50.6s)` (terminals.spec.ts)
No sanctioned test breakage. No unit test exists for the two new popover options; web-tests may add one for default-off menu behaviour.
