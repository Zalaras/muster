# Web Implementation: Popped-out note enhancements

**Plan**: popped-out-note-enhance
**Mode**: initial
**Pack**: kb: pack 24084 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/features/notes.ts` | rewritten | Dashboard controller: popped-out is derived per focused session from the places memory; Close on the anchored form; Open in window; rectangles in viewport coordinates clamped to the window; Remove and a snapshot forget places (REQ-1..8, 13, 14) |
| `web/src/features/notespanelstate.ts` | rewritten | Per-tab memory `Map<id, {popped, rect}>` under the new key `muster.note-places`; the old key is never read (REQ-3, W1-W3, W5) |
| `web/src/features/notesgeometry.ts` | edited | `defaultPlacement(slot, viewport)`: first pop-out default relative to the slot, clamped to the window (REQ-5). `clampRect`/`dragRect`/`resizeRect` unchanged, now fed the viewport size |
| `web/src/features/notesedit.ts` | created | The shared editing state machine (`createNoteEditor`) and the drafts + saver + hide-flush wiring (`createNoteSaving`), extracted from `notes.ts` so the panel and the note window share one owner |
| `web/src/features/noteswindows.ts` | created | `createNoteWindows(open)`: open-or-focus decision per session with an injected opener; `noteWindowUrl`, `parseNoteQuery` (REQ-8, W6, W7) |
| `web/src/features/notespage.ts` | created | `mountNotePage`: the note window's controller: header/status, connecting…, removed notice, editing via the shared editor (REQ-9..12) |
| `web/src/render/notespanel.ts` | edited | Open in window control, Close in both forms, `window` form, split `NotePanelHandlers` / `NotePanelControls`, status kind, `showRemovedNotice` (REQ-7, 9, 12) |
| `web/src/note.ts`, `web/note.html` | created | Third Vite page and its composition root, matching `doc.ts`/`doc.html` (REQ-9, 11) |
| `web/src/wsapp.ts`, `web/src/app.ts`, `web/src/features/actions.ts` | edited | `noteWindowWsHandlers` (pop-out set + `sessionRemoved`); `applyRemoved(app, id)` is the one store-remove + emit + render, now used by `actions.handleRemoved` too (REQ-12) |
| `web/vite.config.ts` | edited | Third build entry `note` |
| `web/src/style.css` | edited | `info` status kind, `.note-host`, `.npanel.window`, `.npanel .removed`; the popped panel's existing `z-index: 55` already sits above rail/masthead/header |
| `docs/design/design-system.md` | edited | Note panel paragraph: per-session pop-out, window bounds, three controls per form, the note window (V6) |

## Decisions

- design: **`notesedit.ts`** — `createNoteEditor(deps)` owns `shownId`, `editing`, `displayed`, `lastIncoming`, `renderedText` for whichever host built it (dashboard panel, note window); `createNoteSaving(app)` builds the draft store + saver and installs the pagehide/visibilitychange flush. Reason: the note window must edit and save exactly as the panel (REQ-9); duplicating the state machine would be two owners of one rule. Precedent grep: `rg -n "createNoteSaver|createDraftStore" web/src` found only `notes.ts` as a caller; this generalises that block. Render-tick rule kept: the body is written only when `renderedText` changes, the editor node is untouched while editing.
- design: **`noteswindows.ts`** (W6 seam) — `createNoteWindows(open)` takes the opener as a parameter (`window.open` in `notes.ts`) so web-tests drive "blocked → false, panel unchanged" and "open window → focus, no second open" without a browser. It holds the per-session handle map (the only state); the named target `muster-note-<id>` covers the dashboard-reload case. `window.open` is called without `noopener` (the handle is needed).
- design: **`notespage.ts`** — takes the shape of `mountStandaloneReader` (`mount…(app, target)`), called from `note.ts` with `parseNoteQuery`. `note.ts` only wires (V2): theme, update-restart, mount, tick, connection state, `WsClient`. Precedent grep: `rg -n "popoutWsHandlers|parseStandaloneQuery" web/src` → `doc.ts`, `reader.ts`, `wsapp.ts`; `note.ts` copies the `doc.ts` order exactly.
- design: **`NotePanelHandlers` split** — body handlers every host needs vs `NotePanelControls` (pop, open window, close, gestures) the dashboard passes; the note window passes none, so no no-op handlers and no gesture wiring. State owner of the places memory: `notes.ts` `places` (writers: `remember`, and the gesture's `update` which defers the storage write to `end`).
- design: **Popped state is derived, not held** — `form` is closed/anchored/popped for the one shared panel; the render phase opens it popped when the focused session `isPopped` in Focus and closes it otherwise (`stillWanted`). This removes `restorePending`: a reload restores through the same path as a focus switch. Focus change closes the panel at once (`focusChanged`), flushing the shown session's text first (INV-3).
- design: **`applyRemoved` in `app.ts`** — three-line store-remove/emit/render existed in `actions.handleRemoved`; generalised rather than copied (`rg -n 'emit\("sessionRemoved"' web/src` → only `actions.ts` before, only `app.ts` after).
- Rectangles are stored unrounded (as the drag computed them) in viewport coordinates; E2's oracle looks for `Math.floor(width)`/`height` substrings, which an unrounded number contains.
- A hidden-attribute companion exists for every `hidden` element touched: `.npanel .ph .ctl[hidden]` covers the new Open in window and the Close in the window form (hidden there); `.npanel[hidden]` kept though nothing toggles it now.
- The `connecting…` status is `--fg-dim` via `data-kind="info"` (no `●` dot), `--warn` stays for the unsaved status (plan States: "not `--warn`").
- Note window keeps its last known title in the header and document title after removal; before the first snapshot the header reads `Note` and the document title `Note`.
- Open in window while the popup is blocked: `openOrFocus` returns false, nothing else runs (panel and state unchanged). On success the panel closes through `closeByUser` (text flushed, popped flag cleared, rectangle kept, focus returned to the terminal).
- Testable UI Elements: every row implemented as written; none flagged.
- REQ-1..REQ-14 all in Changes above (REQ-5 geometry/CSS, REQ-13 every storage access through `safeSessionStorage()`/`safeLocalStorage()`, V5).
- Size warnings: none new on touched files (`size-warn` lists no `notes*.ts`, `notespanel.ts`).
- doc-delta: the notes spec sentence "Closing by Escape, the popped panel's close control or the glyph returns focus…" should now read "its Close control" for both forms. `web/src/features/CLAUDE.md` lists the pure notes modules; `notesedit.ts`, `noteswindows.ts` and `notespage.ts` join that list (pure/page controller beside `notes.ts`).

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` fail on one sanctioned test file only: `web/src/features/notespanelstate.test.ts` (imports `loadPanelMemory`/`savePanelMemory`; the stored shape and API changed per the plan). The Vite build itself and `npm run -s lint` pass; for the smoke I ran `npx vite build` then `make build`.
**E2E smoke**: `npx playwright test e2e/notes.spec.ts` → `1 failed, 35 passed (54.9s)`.
- Spec defect for validate mode: `notes.spec.ts:1184` ("text a note window could not save survives a reload ... network failure") asserts `noteOnWire(...)` is `null` right after `win.reload()`. The unload flush (`pagehide`/`visibilitychange` → keepalive PUT, required by REQ-9 "saving at once when the page hides") is not intercepted by `context.route(...abort)` and reaches the daemon. Measured: with the pagehide and visibilitychange flush temporarily disabled the test passes (`1 passed (7.3s)`); with only pagehide disabled it still failed (the visibilitychange flush fires on reload too). Restored afterwards; the shipped code keeps both. The spec's null assertion after the reload needs to go (or use a fetch-level abort that covers keepalive).
**Test files needing changes (not mine to edit)**:
- `web/src/features/notespanelstate.test.ts` — rewrite for `loadPlaces`/`savePlaces`/`withPlace`/`withoutPlace`/`withoutAbsent`/`isPopped`/`rectOf` and the `muster.note-places` key (W1-W3, W5). 17 vitest failures, all in this file.
- `web/src/features/notesgeometry.test.ts` — still passes; add `defaultPlacement` (W4).
- `web/src/features/noteswindows.ts` seam: W6/W7 are new tests (`createNoteWindows`, `parseNoteQuery`).
- `web/render/notes.spec.ts:299` (R7) fails as the plan predicted ("left 0 < 300": the panel now goes to the window edge); the rest of the file passes (22 of 23), including the 260×150 header test. New R1-R13 are render-tests'.
- Scratch check (deleted) of `note.html` in the render harness: `Note · notes-long` document title, panel fills 320×240 and 1200×900 with the body scrolling at 320×240 and no document scroll, all four controls `display: none`, unknown id and `session=abc` both show the removed notice, one click edits and Escape returns to the rendered note.
- Orchestrator: `make check-kb` reports `web/src/note.ts: owned by no feature` until `web/note.html` and `web/src/note.ts` are added to the notes spec's `web:` globs (as arranged).

## Fix Attempt 1 (pre-review fix)

**Failures addressed**: wave-1 gate `features-inventory`: `notesedit.ts`, `notespage.ts`, `noteswindows.ts` not named in `web/src/features/CLAUDE.md`.
**Changes made**: `web/src/features/CLAUDE.md` hand-written part only: `noteswindows.ts` joins the notes pure-module list; `notes.ts`'s entry now names `notesedit.ts` (editing and saving shared with the note window) and `notespage.ts` (the note window's controller). The GENERATED trailer is untouched.
**Decisions**: none new. This resolves the `doc-delta:` line about the CLAUDE.md module list above.

## Fix Attempt 2 (review cycle 1)

**Failures addressed**: Browser Critical 1 (note window silent on daemon-down), Browser Major 1 (card menu under the popped panel), Maintainability Major 1 (stale gesture writes `places`), Major 2 (duplicate `?session=` parse), Minor 1-3.
**Changes made**:
- `web/src/features/notesview.ts`: `windowStatus(connection, saveFailed)` is the note window's one status derivation; `UNREACHABLE_TEXT` (`musterd unreachable`), `UNSAVED_TEXT` built from it, `REMOVED_NOTICE_TEXT` moved here from the render module. `notespage.ts` `statusFor` calls it and returns the exported `WindowStatus` (kind typed `StatusKind`).
- `web/src/features/connectionhealth.ts`: exports `CONNECTING_WORD`; the note window takes it from there, no third literal.
- `web/src/render/notespanel.ts`: `showRemovedNotice(refs, text)` takes the string; `wireGesture` ends the surface's previous gesture on a new pointerdown (a drag cut short by a detach no longer leaves a live listener on the reused surface).
- `web/src/features/notes.ts`: `liveGesture` declared beside `places`; `beginGesture` returns a no-op unless popped, `update`/`end` write only while `liveGesture === gesture`, `close()` clears it.
- `web/src/reader/query.ts` (new): `parseSessionParam(params)`; `parseStandaloneQuery` and `parseNoteQuery` both call it. (reader's CLAUDE.md left unedited: it is 4 words from its 400-word budget.)
- `web/src/style.css`: `.npanel` `z-index` 55 → 45.
**Decisions**:
- Composition: `unsaved, musterd unreachable` (failed save) wins over `musterd unreachable` (socket reconnecting) over `connecting…` (before first hello); all three in one pure function so the order is tested in one place. Both unreachable forms are `--warn`; `connecting…` stays `info`. The note stays readable and editable while reconnecting (nothing else changes).
- z-index order (style.css survey; no custom z tokens exist): `<dialog>` modals (launch, confirm, groups, settings, issue, diagram) in the top layer, above everything; `.pop`/`.cardtip` hover popovers 55; `.menu` 50; `.npanel` (popped and anchored) 45; in-flow stacking inside panels/rail (`.find` 1, `.card .chk` 1, sticky tree head 2, `.npanel .rz` 1 inside the panel) lower still. Nothing else is `position: fixed`. Measured: popped panel dragged over the rail (card 15,267–375,567), card menu 149,181–339,408; `elementFromPoint` at the centre of every item (Mark as unread, Stop…, Remove…, Pin, New group…, No group) returned `.menu` (before the change the reviewer measured Pin/New group…/No group returning the panel).
- Measured daemon-down repro: `daemon.kill()` with no edit → window status `musterd unreachable`, colour rgb(232,207,90) (`--warn` dark); typing → `unsaved, musterd unreachable`; after `daemon.restart()` → status empty. (Temporary e2e spec, deleted after the run.)
- design: `query.ts` in `reader/` (owned by reader's `web/src/reader/**` glob, pure, below `features/`), because a root-level module would be unowned by any feature and `features/reader.ts` is too heavy for `noteswindows.ts` to import. Precedent grep: `rg -n URLSearchParams web/src` → only `reader.ts`, `noteswindows.ts`, `api/launch.ts` (builder, not a parse).
- design: the removed notice string and the new unreachable word live in `notesview.ts`, beside `UNSAVED_TEXT`, matching `render/reader.ts` taking `UNKNOWN_SESSION_TEXT` from a pure module; the builder takes the text as a parameter because render must not import `features/`.
- design: the gesture guard is a `liveGesture` identity (not a boolean) so a stale gesture of the same session after close+reopen also stays silent; `places` and `liveGesture` are declared together.
- Not changed: reader's `UNREACHABLE_TEXT` long form and `connection.ts`'s banner text (different sentence); reader's `"connecting…"` copy (optional per review).
- doc-delta: the notes spec's daemon-down line for the note window should say the status reads `musterd unreachable` while reconnecting (already in the plan amendment and the ADR); design-system §6 / the note panel paragraph may mention the popped panel sitting below menus and popovers (z-index 45).

**User-visible behaviour added** (for render tests): the note window's status shows `musterd unreachable` in `--warn` while its socket reconnects; popped/anchored panel now draws below `.menu` and `.pop`/`.cardtip`, so a menu opened over it is fully clickable.
**Sanctioned test breakage**: none (`vitest run` 3070 passed, `tsc --noEmit` exit 0). New unit tests wanted in wave 2: `windowStatus` order, `parseSessionParam`, `liveGesture` (stale gesture silent after close).

## Fix Attempt 3 (review cycle 1, wave 1: window status stuck after the other host re-sends first)

**Failures addressed**: `web/e2e/notes.spec.ts` "text a note window could not save survives a reload of that window and reaches the daemon on reconnect (E6, REQ-11, network failure)": status stayed `unsaved, musterd unreachable` for 15 s.

**Cause, measured**: a throwaway Vitest (deleted) with two `createDraftStore` over one storage: store A sends and fails (`failed(1)` true), store B drops the key as the other tab's ack would, then `A.resend(1)`. Output: `MEASURE failed after outage true`, then `MEASURE draft undefined failed after other host acked + resend true`. `pump` returned at `text === undefined` before reaching `setFailed`, and nothing else clears `failedIds`.

**Paths enumerated** (every saver host and both re-send orderings):
- Note window, window re-sends first: window's pump saves, acknowledges, clears. Already worked.
- Note window, dashboard first (the failing test): draft gone from shared storage before the window's pump; pump returned early. Closed by `failed()` deriving from draft presence and by `pump` clearing on no draft.
- Dashboard panel, window first (the mirror): the dashboard's snapshot handler iterates `drafts.pending()`, which is empty once the window dropped the key, so `pump` never runs on the dashboard and the pump fix alone would not clear it. Closed by `failed()` deriving from draft presence (read by `applyView` each render).
- Dashboard panel, dashboard first: its own pump saves and clears. Already worked.
- Unload flush (`flushAll` from `pagehide`/`visibilitychange`): goes through `pump`, reads no status; the early-return clear applies to it too and cannot hide text, since it only fires when no draft is kept anywhere in this host.
- A host that still holds the text in its in-memory `typed` map keeps `drafts.get` defined, so its status stays `unsaved` until its own re-send lands (kb:adr/notes-unsaved-text-kept-in-browser-until-acknowledged).

**Changes made**: `web/src/features/notessave.ts` — `pump` clears the failed flag (repainting through `onChange`) when no draft remains; `failed(id)` is `stillFailed`, which reports true only while a draft is still kept and prunes a stale entry so a later edit does not inherit it.

**Decisions**:
- design: no new module or type; `stillFailed` is a private function in the existing saver, sharing `failedIds` with `setFailed`. Precedent: `rg 'failedIds'` finds only `notessave.ts`; status is read through `saver.failed` by `notes.ts` and `notespage.ts` unchanged.

**Evidence** (after `make web-build build`):
- `npx playwright test e2e/notes.spec.ts -g "reaches the daemon on reconnect"` was red before the change (Expected `""`, Received `unsaved, musterd unreachable`, 15 s).
- `npx playwright test e2e/notes.spec.ts`: `36 passed (26.6s)`.
- `npx vitest run src/features`: `Tests 646 passed (646)`; `npx tsc --noEmit` exit 0; `npm run -s lint` clean.

## Handoff (fix attempt 3)

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.
**E2E smoke**: `36 passed (26.6s)` for `web/e2e/notes.spec.ts`.
Unit tests for web-tests to add in `web/src/features/notessave.test.ts` (no existing test edited): (1) a saver whose send is `unreachable` has `failed(id)` true; after another `createDraftStore` over the same fake storage drops the key, `failed(id)` is false with no `resend` (dashboard-mirror path), and a following `edit(id, ...)` does not report failed before the next send outcome; (2) the same after `resend(id)` — pump with no draft clears the flag and calls `onChange` once; (3) while the saver's own store still holds the text in its in-memory typed map (key dropped from storage), `failed(id)` stays true.

## Fix Attempt 4 (review cycle 2, wave 1)

**Failures addressed**: browser Major 1 (panel covers the daemon-down banner), maintainability Minor 1 (`liveGesture` outlives `popIn`).

**Changes made**:
- `web/src/style.css`: `.banner` gains `position: relative; z-index: 46`; `#connection-status` (already `position: relative`) gains `z-index: 46`. Panel 45 < banner/readout 46 < menu 50 < `.pop`/`.cardtip` 55. Consumers of `.banner` (`rg -n 'class="banner|\.banner|#banner' web/index.html web/src`): the one `#banner` element, written by `features/connection.ts` in both variants (daemon-down/updating, and `.banner.neutral` for the post-restart confirmation), so the neutral variant shares the rule. `.action-error` is a separate rule and is not raised (not a daemon-down surface; left as is).
- `web/src/features/notes.ts`: new `setForm(next)` is the single writer of `form`; it clears `liveGesture` whenever `next !== "popped"`. The four former assignments (`open`, `close`, `popOut`, `popIn`) go through it, and `close()`'s own `liveGesture = null` is removed.

**Paths out of the popped form, all closed by `setForm`**: pop-in (`popIn`: `setForm("anchored")`); close (`close` → `setForm("closed")`), reached by Escape/glyph/Close (`closeByUser`), Open in window (`openInWindow` → `closeByUser`), focus change (`focusChanged` → `close(false)`), Tiles/view switch and session removal (`renderPhase` → `stillWanted` false → `close(false)`). `gesture.update`/`end` already return unless `liveGesture === gesture`, so a gesture running across any of these no longer writes `popped: true` or calls `layoutPopped`.

**Decisions**:
- design: no new module; `setForm` is a private function in `createNotes`, the one place `form` and `liveGesture` are both declared. Precedent: `rg -n 'form = ' web/src/features/notes.ts` found only these four assignments; no shared state-transition helper exists in `features/` (`rg 'setForm|transition' web/src/features` finds none).
- z-order recorded in kb:adr/notes-banner-above-popped-panel: top-layer dialogs, hover popovers (55), menus (50), banner and connection readout (46), popped panel (45). Literal z-indexes match the file's existing literals (45/50/55).

**Evidence** (`make web-build`, built bundle, 1440x900, panel placed at 0,0, banner at 0,46 1440x32, scratch render spec since deleted; banner text forced visible in the DOM because the harness has no daemon-down state):
- Before (HEAD CSS): `elementFromPoint` over banner text left (40,62) → `TH` (panel table header), right (300,62) → `TD`; panel moved to x=1310 over the readout (1410,15.5,14x14) → `who` (panel).
- After: banner left → `banner`, right → `banner`; readout centre → `connection-status`; point below the banner (100,83) → `TH` (panel still drawn there); identical for `.banner` and `.banner.neutral`.
- `npx tsc --noEmit`, `npm run build`, `npm run -s lint` exit 0.

**User-visible behaviour added**: while the banner is shown (daemon down, updating, or the neutral post-restart confirmation) it draws over a popped panel placed under it; the masthead connection dot draws over a panel placed under it. Panel header under the banner is unreachable by pointer for the outage (Escape/glyph still close it).

## Handoff (fix attempt 4)

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.
Tests broken: none expected. Render tests for wave 2: (1) banner text and connection readout are the `elementFromPoint` hit target over a popped panel placed under each (both `.banner` variants; the harness needs the banner visible, e.g. a down state or a `claudeCode`/restart frame); (2) a drag in progress across Pop in writes nothing afterwards (`places` stays `popped: false`, panel not re-laid out when popped again from the stale gesture).
