# Web Implementation: Session notes

**Plan**: session-notes
**Mode**: initial
**Pack**: kb: pack 37598 words (budget 30000) — kb: WARN pack exceeds budget of 30000 words

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol/session.ts` | edited | Session gains the required `note: string \| null`; a missing key or another type rejects the whole message (REQ-1, W1). |
| `web/src/api/http.ts` | edited | `requestEmpty`/`requestInit` take an optional `{ keepalive }` so the unload save stays inside the one fetch module. |
| `web/src/api/sessions.ts` | edited | `putNote(id, note, { keepalive? })` for `PUT /api/sessions/{id}/note` (REQ-2, REQ-9). |
| `web/src/storage.ts` | edited | `safeSessionStorage()` and `safeLocalStorage()` (moved out of `updaterestart.ts`, which was the only caller until notes became the second). |
| `web/src/features/updaterestart.ts` | edited | Imports `safeSessionStorage` from `storage.ts`; its private copy is gone. |
| `web/src/sessions/store.ts` | edited | `SessionStore.get(id)`. |
| `web/src/render/diagrams.ts` | edited | `mintDiagramInstance()` and `currentDiagramTheme()`, shared by the reader and the note renderings; the reader's private counter and theme read moved here. |
| `web/src/features/reader.ts` | edited | Uses the two shared helpers; no behaviour change. |
| `web/src/features/notes.ts` | created | The note controller: glyph, anchored and popped-out forms, edit mode, autosave wiring, unsaved status, browser-kept drafts, pop-out geometry and its per-tab persistence, Tiles hiding, focus following (REQ-7 to REQ-17, REQ-21, REQ-23). Render phase 11. |
| `web/src/features/notesgeometry.ts` | created | Pure `clampRect`, `defaultRect`, `dragRect`, `resizeRect` (REQ-13, REQ-14, W2). |
| `web/src/features/notesdrafts.ts` | created | Pure draft bookkeeping over a storage (W3, REQ-10). |
| `web/src/features/notessave.ts` | created | Pure save scheduler: debounce, flush, in-flight serialisation, failed set, outcome mapping (W4, W5, REQ-9, REQ-11). |
| `web/src/features/notesview.ts` | created | Pure `adoptIncoming` (W6) and `unsavedStatus` (W5). |
| `web/src/features/notespanelstate.ts` | created | Pure parse and load/save of the per-tab `{ popped, rect }` memory (REQ-16). |
| `web/src/render/notes.ts` | created | Note rendering through the reader's renderer (`renderNoteInto`), the empty line, the card/tile marker, the read-only hover tip (REQ-18 to REQ-20, REQ-22). |
| `web/src/render/notespanel.ts` | created | The panel DOM builder: header, status, three controls, view body, editor, eight resize handles, gesture wiring (REQ-7, REQ-12, REQ-13). |
| `web/src/render/mainhead.ts` | edited | `noteBtn`: class `ng` / `ng has` from `session.note` (REQ-6). Also `stackMeta` keeps a smaller natural `--loc-cap` (see Decisions). |
| `web/src/render/sessions.ts` | edited | Card marker slot written from `session.note`; marker hover attached once at build (REQ-18). |
| `web/src/render/tiles.ts` | edited | Tile header marker, `buildTile` takes the marker hover; the strip passes it to its cards (REQ-18). |
| `web/src/features/focus.ts` | edited | Looks up the glyph for `MainheadElements`. |
| `web/src/features/rail.ts`, `web/src/features/tiles.ts` | edited | Each creates its own marker hover from `app.store.get` and refreshes it in its render phase, as each already owns a `cardTip` (REQ-19). |
| `web/src/main.ts` | edited | One-line `initNotes(app)` after `initViews`; render-phase list renumbered. |
| `web/index.html` | edited | `#note-glyph` symbol, the glyph first in `.idrow`, the marker in the card and tile templates. |
| `web/src/style.css` | edited | Glyph, marker, `.r2` grid, panel in both forms, resize handles, rendered-note prose, 12-line cut with fade, hover tip width. Tokens only; `make contrast`: 54 pairs, 0 failures on every theme. |

## Decisions

REQs: REQ-1 to REQ-23 are all in Changes above. Not done by web: REQ-3, REQ-4, REQ-5 (daemon). REQ-17 and REQ-23 are behaviour of `features/notes.ts`; REQ-22 is `render/notes.ts`.

- Testable UI Elements: every row implemented as written. Marker: the `.mk` node stays in the template and keeps its hover listener; its visually hidden `Has a note` text is written only while `note` is non-null, because `getByText` counts a `hidden` node (first run: `Expected: 0 / Received: 1`), so a hidden-with-text marker failed E1 and E2.
- Glyph click on a popped-out panel moves focus into the panel and changes nothing else (the plan says only that the glyph does not close it). Opening the anchored form by glyph focuses the rendered body, so Escape and Tab work from the keyboard; opening by restore after a reload never takes focus.
- Escape inside the panel ends edit mode if editing, otherwise closes (REQ-8, REQ-12). It calls `preventDefault` and `stopPropagation`, so select mode's window Escape (`groupsselect.ts` checks `defaultPrevented`) is left alone. Nothing listens for Escape outside the panel (REQ-23, E10 green).
- A save counts as "cannot reach musterd" for any non-OK answer except `404 unknown_session` (network error, 5xx, `413`): the draft stays and the status shows (edge case 20). A `404` drops the draft silently, because the session is gone. A failed save is retried on the next edit and on every `snapshot` (reconnect), never on a timer, so a note over 20 MiB does not resend every few seconds.
- The unload and hidden flush is `keepalive`, except for text over 60,000 bytes, which goes as a plain request because a keepalive body over 64 KiB throws before sending and would show a false unsaved status. The kept draft covers it either way.
- Links in a rendered note open in a new tab with `rel="noopener noreferrer"` and a click on one does not enter edit mode (the reader's body has no such rule); otherwise a click on a pasted URL would navigate the dashboard away. The diagram enlarge button is not wired for notes (the dialog belongs to the reader's own root); a click on it enters edit mode.
- The popped-out rectangle is stored relative to the slot and clamped for display only (`effectiveRect`), so a short window never rewrites the remembered size. The slot is `.main` below the Focus header and effort strip and above the size note. Measured with a popped panel on a long title, header 80.4px: at 1440×900 `box` x 1056 y 150.4 w 360 h 300 in slot x 300 w 1140; at 800×600 x 416 w 360; at 640×500 x 300 w 340 (= slot w 340, flush, never over the rail); back at 1440×900 the same rectangle as the first reading.
- `stackMeta` (`render/mainhead.ts`) now sets `--loc-cap: min(var(--loc-floor), <the natural cap fitMainheadMeta just wrote>)` instead of `var(--loc-floor)`. The glyph's 25px moved the 700px header of an unmoved or ended session with names under the 8-character floor into the stacked branch, which had always overwritten the natural cap and left `.loc` 20.3px wider than its blocks (`render/card-location.spec.ts` "…under the 8-character floor keeps .loc no wider than what it shows" failed twice at 700px: `.loc 489.6-562.4 is 20.3px wider than its visible blocks and separators (ending at 542.1) while the title is ellipsized`). After the edit: `npx playwright test -c playwright.render.config.ts render/card-location.spec.ts` 75 passed; full `npm run render-test` 391 passed.
- Render-tick reuse: the glyph, the panel root, the header spans, the three controls, the rendered body and the editor are built once. A tick writes only on change: `renderNotePanel` compares text, class and `hidden`; the body re-renders only when `renderedText` differs from what is shown; the editor is mounted at edit start, removed at edit end, and never touched by a tick or an upsert (E-spec "the editor keeps focus, node identity and its text across render ticks and a session upsert": green). Memo keys: the body's key is the displayed text with blank folded to the empty line; the panel header's key covers title, status and form, which are every input to its text, class and the controls' `hidden`.
- Not retried on a timer and not cancelled on disconnect: the panel stays usable with the daemon down (plan States).
- `deviation:` none from the plan or the contract.

design: `features/notes.ts` — one controller, `init(app)` with closure state like `features/readerfind.ts` and `features/usage.ts`, registered in one line. Owner of the shared state (`form`, `editing`, `shownId`, `displayed`, `lastIncoming`, `renderedText`, `memory`): this closure alone writes it, from five synchronous callers on the one main thread (the `focusChanged`, `sessionRemoved`, `snapshot` and `themeChanged` handlers, the render phase, and the panel's own callbacks); the save scheduler's async continuations touch none of it and only call `app.render()`. It takes no deps from sibling controllers; the marker hovers live in `rail.ts` and `tiles.ts`, which is why `initNotes` registers after `initViews` and its phase runs after the focus phase (it must see the settled focused session; with the phase before focus, Remove of the focused session closed a popped panel instead of showing the next session's note). Size: 358 lines, no size warning.
design: `features/notesgeometry.ts`, `notesdrafts.ts`, `notessave.ts`, `notesview.ts`, `notespanelstate.ts` — pure logic beside the one controller that calls it, per docs/conventions.md § Composition roots, each taking its seams as parameters (a `StorageLike`, `send`, `setTimer`) so Vitest needs no DOM. `rg -n "function clamp|const clamp" web/src` found only `reader/find.ts` `clampIndex` and `reader/zoom.ts` `clampZoom` (different shapes), so `clampRect` is new. `rg -n "setTimeout|clearTimeout" web/src` found one private timer per owner (`usage.ts`, `readerfind.ts`, `terminal/pane.ts`) and no shared debounce, so the scheduler owns its own. `readJson`/`writeJson` from `storage.ts` (already used by `theme.ts`, `reader/memory.ts`, `updaterestart.ts`) are reused for the drafts (one local-storage key, read-modify-write per change so two windows never overwrite each other's other-session drafts) and the panel memory (one session-storage key).
design: `render/notes.ts` and `render/notespanel.ts` — the DOM half beside `render/reader.ts` and `render/locationpanel.ts`: builders take already-computed values and callbacks, listeners map to callbacks, the controller owns the math. `render/notes.ts` imports `../reader/markdown`, as `render/reader.ts` imports `../reader/*`. The hover tip is `createHoverTip` (`rg -n "createHoverTip" web/src` → `locationpanel.ts`, `grouppopover.ts`); `createNoteMarkerHover(noteOf)` returns the `attach(marker, id)` the card and tile builders call once at build, reading the live note through `noteOf` so a reused node never shows stale text. The pass guard for async diagrams is the minted instance number stamped in `dataset.noteInstance`, so a superseded render or a closed hover never writes into the body.
design: `Edge` is declared in `render/notespanel.ts` and imported (type only) by `features/notesgeometry.ts`, the direction features → render that every controller already has, rather than a render module importing a features type.
design: `mintDiagramInstance` and `currentDiagramTheme` moved into `render/diagrams.ts`: `rg -n "nextDiagramInstanceId|mermaidThemeFor" web/src` showed them private to `features/reader.ts` (4 and 2 uses). A second host minting from its own counter would have collided SVG ids (`muster-diagram-<instance>-<n>`).
design: `safeSessionStorage` / `safeLocalStorage` joined `storage.ts`, the one storage seam; `updaterestart.ts` had said "kept here — this is the one caller", and notes made it two.
design: pop-out drag and resize use pointer capture on the header and the eight handles (`rg -n "setPointerCapture" web/src` → `render/diagramdialog.ts`, the same idiom for its pan). Handles are inside the box (4px edges, 10px corners) and the header padding keeps the close control clear of the corner handle, so a panel pinned to a slot edge is never grabbed outside it.
design: plan Hints taken: the shared placement routine (`placeAnchored`) for the anchored form, the shared hover tip for the markers, `storage.ts` helpers with a guarded accessor, `fetch(..., { keepalive })` for unload. Dropped: none.

doc-delta: `docs/design/design-system.md` §5 Note panel — the header reads `Note`, then `· <title>`, the status and the controls (pop-out when anchored; pop-in then close when popped out); resize handles are 4px on the edges and 10px at the corners; the default popped-out rectangle is 360×300 inset 24px from the slot's top right, minimum 260×150.
doc-delta: `docs/features/notes/spec.md` — a click on a link in a rendered note opens it in a new tab and does not start editing; the glyph, pressed while the panel is popped out, moves focus into it; a failed save is retried on reconnect and on the next edit, and a save the daemon answers `404 unknown_session` drops its kept text.
doc-delta: `docs/features/notes/spec.md` and plan edge case 4 — an ended session keeps its note across Stop and Resume, but `kb:adr/lifecycle-ended-rows-swept-next-start` deletes the row (and the note) at the next daemon start; the plan's "Stop, resume and a daemon restart keep it" is true only for a live session across a restart (see Handoff).

## Handoff

**Build status**: `npx tsc --noEmit` fails on test files only and `npm run build` therefore fails at its `tsc` step; every error is a test file built before the contract added `note` or a fake DOM the new markup outgrew (listed below). `npx vite build` and `go build ./...` exit 0, and the smoke below ran against that build. `npx biome check .` clean (398 files), `make contrast` 0 failures, `make size-warn` none of my files.
**E2E smoke**: `npx playwright test e2e/notes.spec.ts` → `1 failed, 20 passed (22.7s)`. The one failure is the spec's second half, not the implementation: see below.

Test files needing changes (web-tests):
- Every literal `Session` gains `note: null` — tsc errors in `web/src/api/launch.test.ts`, `api/sessions.test.ts`, `features/actionscopy.test.ts`, `render/dead.test.ts` (2), `render/mainhead.test.ts`, `render/sessions.test.ts`, `render/tiles.test.ts`, `sessions/card.test.ts`, `sessions/live.test.ts`, `sessions/sort.test.ts`, `sessions/store.test.ts`, `sessions/testfixtures.ts`, `ws.test.ts`; at runtime `src/protocol/session.test.ts` (47 failures: a decoder fixture with no `note`, by design W1), `protocol/messages.test.ts` (5), `api/sessions.test.ts`, `api/launch.test.ts`, `ws.test.ts`. The plan also names `app.test.ts`, `sessions/rename.test.ts` and `render/mainhead.test.ts`; the first two raised no tsc or Vitest error in this run, so check them when the fixture is regenerated.
- `render/mainhead.test.ts`: the fake `MainheadElements` needs a `noteBtn` (`TypeError: Cannot read properties of undefined (reading 'className')`, 31 failures). The glyph is shipped as the real `<button>` the plan mandates.
- `render/sessions.test.ts` (37 failures) and `render/tiles.test.ts` (17): the fake card and tile templates need the `.mk` marker slot with a `.sr-only` child (`Error: missing required element: .mk`). The markup is the plan's; the stub cannot host it.
- New unit coverage owed: W1 to W6 on `features/notesgeometry.ts`, `notesdrafts.ts`, `notessave.ts`, `notesview.ts`.

Spec locator or plan mismatches for validate mode (leave the spec as it is):
- `e2e/notes.spec.ts:317` "a note survives a musterd restart, live and ended…": the live half passes; after the second restart the ended session is gone (`No sessions yet`), because `kb:adr/lifecycle-ended-rows-swept-next-start` sweeps an ended row at the next start, and `e2e/reconcile.spec.ts:23` is titled "…then a later restart sweeps it for good". The plan's E6 and edge case 3 and 4 promise a note on an ended session across a restart; the daemon cannot (REQ-4 says "a daemon restart keeps it"). This is a plan-versus-ADR conflict for the developer, not a web or daemon defect, and the daemon's note column is the same either way.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: correctness Major 1 (sends read back from the localStorage draft), browser Major 1 (header controls past the panel edge at 260px with the status), browser Minor 1 (re-clamp waits for the tick), maintainability Major 2 (shared one-key draft map), Minors 1 to 3 (`PutNoteOptions`, glyph owners, `stampPass`).

**Changes made**:

| File | What |
|------|------|
| `web/src/features/notesdrafts.ts` | Rewritten. One local-storage key per session (`muster.note-draft.<id>`); an in-memory `typed` map holds the latest text set in this window and is what `get`/`pending` return first, so a send never depends on the browser keeping the draft. A write that fails removes that session's key, so older text is never resurrected over newer. `pending()` is the union of storage-listed keys and `typed`. |
| `web/src/storage.ts` | `KeyedStorage` (`StorageLike` plus `length`/`key`); `safeLocalStorage`/`safeSessionStorage` return it (unavailable fallback: `length 0`); `writeJson` returns whether the write landed (other callers ignore it). |
| `web/src/features/notes.ts` | `slotWatch` ResizeObserver on `.main`, `#mainhead`, `#effort-strip`, `#sizenote` calls `layoutPopped()` while popped. `syncGlyph` now owns the glyph's class as well as `aria-expanded` and the click. |
| `web/src/render/mainhead.ts`, `web/src/features/focus.ts` | `noteBtn` removed from `MainheadElements`, its lookup and its class write; the glyph has one owner, `features/notes.ts`. |
| `web/src/style.css`, `web/src/render/notespanel.ts` | `.npanel .ph .st` shrinks (`flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis`), `.who` gives way first (`flex: 0 8 auto`); the status carries its full text as `title`. |
| `web/src/api/sessions.ts` | `putNote` takes `RequestOptions` from `api/http.ts`; `PutNoteOptions` deleted. |
| `web/src/render/notes.ts` | `rerenderNoteDiagrams` calls `stampPass`; the stamp and `isCurrent` are written once. |

**Evidence** (reviewer repros re-run, throwaway render spec, since deleted):
- Major 1 (browser): popped, 260px wide, status showing, pinned to the right edge: `{"panel":[1180,1440],"sw":258,"cw":258,"popIn":{"x0":1383,"x1":1403},"close":{"x0":1409,"x1":1429},"who":{"w":0},"st":{"w":143.3}}` (was sw 286 against cw 258, Close 1447-1467); `elementFromPoint` at Close's centre returns `Close note` (was `null`) and a click closes the panel.
- Minor 1: after `setViewportSize` and two animation frames, four rounds of 1440x900 to 800x600 and back: `800 {"panelTop":150.375,"slotTop":126.375,"panelRight":776,"mainRight":800}` / `1440 {"panelTop":119.375,"slotTop":95.375,"panelRight":1416,"mainRight":1440}`, panel inside the slot every time. With the observe loop disabled the same probe reads `800 {"panelTop":119.375,"slotTop":126.375,"panelRight":1416,"mainRight":800}` (panel over the header, outside the slot), so the probe goes red without the fix.
- Major 1 (correctness) and Major 2: a throwaway Vitest over the shipped `notessave.ts` and `notesdrafts.ts`: storage that throws on every call, `edit` then the debounce sends `["typed"]`; a stand-in quota of 8 characters sends `["short","a much longer text"]` (was `["short","short"]`); two stores over one storage, `a.set(1,"x")`, `b.set(2,"y")`, `b.acknowledge(2,"y")` leave `a.get(1) === "x"` and the key `muster.note-draft.1` untouched.
- Render tier `render/notes.spec.ts`, `focus-header.spec.ts`, `card-location.spec.ts`: 89 passed. `npx playwright test e2e/notes.spec.ts`: 21 passed (16.8s). `npx biome check src` clean.

**Decisions**:
- design: draft store guard. The state shared by two windows is the set of drafts. Each session's draft is its own key, so a window's write or removal touches only that session's key and cannot remove or overwrite another session's draft whatever another window's cached copy holds; the latest text typed in this window is also held in `typed` and returned by `get`, so a stale or unavailable storage cannot suppress or swap a send. Precedent: `reader/memory.ts` keys its storage per session (`keyFor(sessionId)`). New: `KeyedStorage` in `storage.ts`, because the draft store must list its keys (`rg -n "\.key\(|\.length" web/src --glob '!*.test.ts'` found no existing enumeration). Two windows editing the same session still follow last write wins (REQ-21).
- design: the glyph has one owner, `features/notes.ts` (lookup, class, `aria-expanded`, click). `focus.ts` and `render/mainhead.ts` no longer know it; the other `#mainhead` controls keep their focus-owned wiring because focus owns what they do.
- design: pop-out follow-up uses a ResizeObserver on the four boxes that bound the slot, the precedent being `features/focus.ts` (`new ResizeObserver(() => fitMainheadMeta(...))`); the panel is `position: fixed`, so repositioning it cannot change an observed box and cannot loop.
- deviation: none. The drafts ADR's "keyed by session" now holds literally (one key per session); `docs/adr/notes-unsaved-text-kept-in-browser-until-acknowledged.md` needs no wording change if it says only "keyed by session".
- doc-delta: `docs/design/design-system.md` §5 / kb:diagram/web-components: `localStorage` now holds note drafts under `muster.note-draft.<session id>` (not `muster.note-drafts`); the unsaved status shortens with an ellipsis at the panel's 260px minimum, its full text in `title`; the glyph's class is written by `features/notes.ts`, not the mainhead render.

**Handoff (wave 2)**: `npx tsc --noEmit` and `npm run build` fail on test files only, all caused by the sanctioned changes above:
- `web/src/storagefakes.ts`: `memoryStorage` and `throwingStorage` need `length` and `key(index)` to be `KeyedStorage` (tsc errors in `features/notesdrafts.test.ts` and `features/notessave.test.ts`).
- `web/src/features/notesdrafts.test.ts` (3 failures): "does not throw and keeps nothing when storage throws" (now `get` still returns the typed text, `pending` holds it), "ignores stored entries whose key is not a session id or whose value is not text" and "read-modify-write per change…" assume the single `muster.note-drafts` map; rewrite for per-session keys and add the cross-window case above.
- `web/src/render/mainhead.test.ts` (tsc at 277, 487, 505, 507 and 4 failures in "note glyph class"): `noteBtn` left `MainheadElements`; the class is now written by `features/notes.ts` and covered by render R1 (`render/notes.spec.ts`), so delete these cases and the fake's `noteBtn`.
- `web/src/features/notessave.test.ts`: add the Major 1 regression the review asks for (saver over `throwingStorage()` and over a storage whose `setItem` throws after the first write sends the latest text for the right id).
- Render test owed (review browser Minor 2): the 260px minimum with the status showing, controls inside the panel box; and a same-frame follow after a window resize.

## Fix Attempt 3 (review cycle 2)

**Failures addressed**: correctness Minor 2 (render `CLAUDE.md` omits the note builders and the `notes` feature); maintainability Minor 1 (`notesdrafts.ts` guards storage key listing itself).

**Changes made**:
- `web/src/storage.ts`: new `listKeys(storage)` beside `readJson`/`writeJson`/`removeItem`; walks `length`/`key(i)` inside one try/catch and returns `[]` when storage throws.
- `web/src/features/notesdrafts.ts`: `storedIds` is `listKeys(storage)` mapped through `idOf`; its own try/catch is gone. `rg -n "try \{" web/src/features/notesdrafts.ts` now finds nothing, so `storage.ts` is the only module with storage try blocks.
- `web/src/render/CLAUDE.md` (hand-written prose only): **Owns** names `notes.ts` and `notespanel.ts` as "the session note", still placed by `anchored.ts`; **Features** now `…launch, notes, rail…`. Four low-value words trimmed elsewhere to stay in the 400-word budget.

**Evidence**: `npx tsc --noEmit`, `npm run build`, `npm run -s lint` exit 0; `make check-kb`: `kb: all checks pass` (the render `CLAUDE.md` was 412 words after the first edit, 400 now); `npx vitest run src/features src/storage`: pass (summary above).

**Decisions**:
- design: key listing joins the other three storage helpers in `storage.ts` (`rg -l "try \{" --glob '!*.test.ts' web/src` loop over storage modules now names only `storage.ts`); `Pick<KeyedStorage, "length" | "key">` matches the helpers' `Pick<StorageLike, …>` shape. Behaviour unchanged: a throwing storage lists nothing.
- doc-delta: none.

**Handoff (wave 2)**: a unit case for `listKeys` (throwing storage returns `[]`; foreign keys returned unfiltered) belongs in a `storage` test; no existing test file is broken by this fix.

## Fix Attempt 4 (review cycle 3)

**Failures addressed**: review.cycle3.md browser Major 1 — with `window.localStorage` throwing, the theme `snapshot` listener threw inside `emit`, aborting the later `snapshot` listeners (notes' re-send, the terminal reopen); the same unguarded read in reader's `sessionRemoved` listener aborted notes' cleanup. Decision `review-cycle-exhaustion-theme-storage` (outcome A, dissent honoured: all six sites; bus unchanged).

**Changes made**:

| File | What |
|------|------|
| `web/src/theme.ts` | `writeThemeHint`'s default `storage` is `safeLocalStorage()`, not the bare `localStorage` global |
| `web/src/features/reader.ts` | `loadMemory`, `saveMemory`, `handleStorage`'s `loadMemory`, `forget` (the `sessionRemoved` listener) and the constructor's `loadMemory` take `safeLocalStorage()` instead of `window.localStorage`; imports it from `../storage` |

Every bare storage read in `web/src` outside tests: the six sites (`theme.ts:49`, `reader.ts` ctor, `commitMemory` x2, `handleStorage`, `sessionRemoved`) are all closed; `rg` after the edit:

```
$ rg -n '\blocalStorage\b|\bsessionStorage\b' web/src --glob '!*.test.ts'
web/src/storage.ts:1:  // comment
web/src/storage.ts:98:  return guardedStorage(() => sessionStorage);
web/src/storage.ts:102: return guardedStorage(() => localStorage);
web/src/features/updaterestart.ts:2:// `sessionStorage` handoff ... (comment; code uses safeSessionStorage())
```

The event bus is unchanged. Blast radius: `writeThemeHint` has one non-test caller (`features/theme.ts` `applyAttributes`); reader's storage calls are all inside `features/reader.ts`. `safeLocalStorage()` returns a live wrapper (not a cached snapshot), so a storage that is blocked at first read and available later is not pinned unavailable.

**Repro re-run** (throwaway `web/e2e/zz-blocked-storage.spec.ts`, deleted afterwards): init script defines `window.localStorage` and `window.sessionStorage` getters that throw `SecurityError`.
- Before the fix (source reverted, rebuilt): reconnect test — `noteStatus` stayed `unsaved, musterd unreachable` after the banner cleared (`toHaveText("")` timed out at 15000ms); remove test — `pageerror`s `["blocked","blocked"]`; `2 failed`.
- After the fix: reconnect test — banner hidden, status empty, `noteOnWire` becomes `typed while down` with no keystroke, pageerrors `[]`; remove test — `DELETE /api/sessions/{id}` with the session focused, rail empty, pageerrors `[]`; `2 passed`.

**Gates**: `npx tsc --noEmit` 0, `npm run build` 0, `npm run -s lint` clean, vitest `104 files, 2990 tests passed`. `make size-warn`: `features/reader.ts` 686 lines (filelen) — already over threshold before this fix; one import line added, not split here (the split is outside this fix's scope).

**Decisions**:
- design: no new helper — `safeLocalStorage()` is the existing seam (storage.ts, used by features/notes.ts); `rg -n 'window\.localStorage' web/src --glob '!*.test.ts'` now finds nothing. `reader.ts` calls it at each use rather than caching one instance in the class, so the storage is re-resolved each time, as `theme.ts`'s `writeThemeHint` default does (notes.ts and updaterestart.ts resolve once at init instead). _(Precedent corrected by the orchestrator, maintainability cycle-4 note 1.)_
- design: no listener isolation in the bus (decision's outcome); a throwing `snapshot` listener still aborts later ones, but none of the six storage sites can throw now.
- doc-delta: none.

## Handoff (Fix Attempt 4)

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.
**E2E smoke**: `npx playwright test e2e/notes.spec.ts` — `21 passed (15.2s)`.
Regression coverage is not in the tree: the decision asks for a remove-while-blocked assertion beside the reconnect journey; the throwaway spec I used is deleted, so web-tests / e2e-specs must add it (an init script that makes `window.localStorage` and `sessionStorage` getters throw; type while musterd is down, restart, assert the PUT with no keystroke; remove a session, assert no `pageerror`; plus a Vitest assertion that `writeThemeHint(hint)` with a throwing `localStorage` global does not throw). No test file is broken by this change.
