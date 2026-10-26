# Plan: remove-unread-right-click-1

**Status**: completed
**Shape**: feat
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: rail-menu.spec.ts daemon (the mark-unread journey asserts a persisted per-session flag change, like the file's other tests)
**Render fixtures**: rail-menu-cards, stop-resume-pair, notes
**Features**: rail, lifecycle, actions, focus, notes
**Touches**: groups, connection, surfaces, rename, theme, card-location
**Description**: The card menu gains Mark as read / Mark as unread (new `PUT /api/sessions/{id}/unread`) and offers Remove… on live sessions; the Focus header's Stop/Resume and Remove buttons give way to one ⋯ that opens the same card menu; a rail card's note marker no longer shows the repo-line native tooltip.

## Symptom

### e1 — Add mark unread right click option

> - [ ] **Add mark unread right click option** ([#103](https://github.com/Zalaras/muster/issues/103)) — There
>   is no right-click option to mark a session as unread or read. Expected: A right-click menu option
>   should let the user mark a session as unread or read.
>   Filed 2026-10-19 from musterd 0.23.0 / Claude Code 2.1.303, focus view, session idle.
>   Labels: enhancement, rail, ux.

### e2 — Add the remove option without me having to Stop

> - [ ] **Add the remove option without me having to Stop** ([#104](https://github.com/Zalaras/muster/issues/104)) — In
>   the right-click menu a session must be stopped before the Remove option becomes available.
>   Expected: The right-click menu should offer Remove directly, without requiring the session to be
>   stopped first.
>   Filed 2026-10-19 from musterd 0.23.0 / Claude Code 2.1.303, focus view, session idle.
>   Labels: enhancement, lifecycle, ux.

### e3 — Remove the Stop and Remove buttons from the Focus header

> - [ ] **Remove the Stop and Remove buttons from the Focus header** — filed by the developer
>   2026-10-26: "remove the Stop and Remove buttons from the top right in the focus header". Expected:
>   the header's top right holds no Stop, Resume or Remove button; a single always-visible ⋯ opens the
>   same menu as right-clicking the session's rail card.

No GitHub issue.

### e4 — Problem with overlap for new note

> - [ ] **Problem with overlap for new note** ([#106](https://github.com/Zalaras/muster/issues/106)) — Hovering
>   the note on a rail card shows it, then about a second later the file path and branch hover appears
>   and overlaps the top of the note. Expected: The file and branch hover should only trigger over the
>   file and branch, not over the note, or the note should be isolated from it.
>   Filed 2026-10-21 from musterd 0.25.1 / Claude Code 2.1.293, focus view, session idle.
>   Labels: bug, rail, ux.

## Findings

### e1
- No menu entry, client call or daemon route sets or clears `unread`
  (`grep -rniE "mark as (un)?read|markread|markunread" web/src internal docs/protocol.md` → exit 1).
  `unread` is daemon-owned (`internal/session/session.go:174`, persisted `internal/store/session.go`,
  wire `internal/server/sessionwire.go:51`). Set at turn close into idle with no terminal client
  (`internal/session/apply.go:94`), cleared on leaving idle (`session.go:321`) and by
  `Manager.MarkSeen` on attach (`internal/session/manager_rail.go:169`).
  kb:adr/rail-unread-inferred-from-live-terminal-client decided "no protocol endpoint is added".
- The developer kept e1 in this sweep despite the protocol change and **fixed the protocol delta at
  the stop** (research e1.md § Protocol delta, verbatim in Requirements below). Answers: two fixed
  items, "Mark as read" and "Mark as unread", always both shown on every card menu and on the
  several-selected menu, never greyed out by session state; the one that changes nothing is a
  no-op; `unread:true` on a non-idle session is a no-op (INV `unread ⇒ state == "idle"` holds);
  a hand-set unread on the focused session stays until its next attach ("Correct"); attach and
  leaving idle still clear it. No batch route: the selection menu calls the per-session route once
  per id. A new ADR amends (not reverses) the inference ADR.

### e2
- `web/src/features/railmenuitems.ts:65` pushes Remove only when `!session.alive`; `:90` the same
  for the selection menu. The unit test "a live session offers only Stop…" and the row
  `["all live", [LIVE, LIVE], ["Stop…"]]` pin that today (19/19 green).
- The daemon already removes a live session by ending it first
  (`TestRemove_EndsAnAliveSessionFirst…` PASS; `docs/protocol.md` kb:anchor/sessions.remove), the
  remove dialog already says "This ends the session first.", and kb:adr/actions-remove-allowed-on-live-session
  is accepted. The menu gate is a leftover of the superseded
  kb:adr/rail-card-right-click-menu-holds-session-actions.
- Answers: keep today's dialog copy; the selection menu offers Remove… when every selected session
  is live too; order Stop… then Remove…; a new ADR records it.

### e3
- `web/index.html:119-122` holds `.stop-resume` and the `danger` Remove inside `#mainhead .acts`;
  `web/src/features/focus.ts:116-117,157-163` captures and wires them; `web/src/render/mainhead.ts:20-21,131-136,197-198`
  types and renders them; `web/src/style.css` `.mainhead .acts .stop-resume` sizes the swap box.
  The `.acts` cluster stays: it holds the surface switch (kb:adr/focus-surface-switch-pinned-with-actions)
  and `onOneRow` measures it.
- Answers: Stop/Resume and Remove both leave the header; Resume is reached from the card menu on a
  stopped session (already true: `cardMenuItems` offers Resume when resumable) and the dead surface's
  own cap Resume, which stays. In their place one always-visible ⋯ icon button, accessible name
  "Session actions", after the surface switch, opening **the same menu as right-clicking the focused
  session's rail card**, through the same `railMenu.open` code, anchored to the button. The ended-age
  slot / reserved width needed only for the Stop↔Resume swap may be reclaimed. No keyboard shortcut.
  A superseding ADR replaces kb:adr/actions-mainhead-one-stop-resume-button and restates the switch's
  placement from kb:adr/focus-surface-switch-pinned-with-actions.

### e4
- Reproduced in a scratch render spec: hovering `.r2 .mk` on `notes-short` opens the note tip, and
  the nearest ancestor-or-self `title` is `"notes-short / main"` from `.r2`, which Chrome shows ~1 s
  later on top of the tip. Cause: `web/src/render/sessions.ts:89` `repo.title = vm.repoLine` on
  `.r2`, and the marker `.mk` is a child of `.r2` with no title of its own.
- Answer: option (a), the one-liner — the marker gets an empty `title` in `applyRepoBlocks`; `.r2`
  keeps its title.

## Requirements

### Must Have
- **REQ-1**: `PUT /api/sessions/{id}/unread` exists exactly as the Protocol delta below states:
  UI-cookie auth (401 `unauthorized`); body `{ "unread": <bool> }`, `unread` required boolean
  (else 400 `invalid_request`); unknown id → 404 `unknown_session`; `unread:true` sets `unread`
  iff `state == "idle"`; `unread:false` clears it in any state; a request that changes nothing
  (already in that state, or `true` on a non-idle session) → 204 with no write and no broadcast;
  a change → 204, persisted like the daemon-set flag, and exactly one `sessionUpsert` broadcast.
  Attach and leaving idle still clear it unchanged. (e1)
- **REQ-2**: Every single-card menu (Focus rail, Tiles strip, Focus header ⋯) and every
  several-selected menu shows both "Mark as read" and "Mark as unread", non-danger, enabled
  whatever the session state (disabled only by the menu-wide disconnected/busy rule, like Pin).
  On a single card they come after Pin/Unpin; on the selection menu after the Move to entries,
  behind a separator. Choosing one on a single card sends one `PUT …/{id}/unread` for that id;
  on the selection menu, one per selected id. (e1)
- **REQ-3**: A live session's single-card menu offers `Stop…` then `Remove…` (danger); a
  several-selected menu offers `Remove…` whenever the selection is non-empty, including all-live.
  Choosing it opens today's remove confirm ("This ends the session first." for a live session).
  (e2)
- **REQ-4**: The Focus header holds no Stop, Resume or Remove button for a live or an ended
  session. Its right cluster `.acts` holds the surface switch then one `⋯` button
  (`aria-label="Session actions"`, `aria-haspopup="menu"`, `aria-expanded` kept in step), always
  visible while a session is focused. (e3)
- **REQ-5**: Clicking the header ⋯ opens the same menu `railMenu.open` builds for a right-click
  on the focused session's rail card (same items, same label `Actions for <title>`), anchored to
  the button; choosing an item acts on the focused session. (e3)
- **REQ-6**: Hovering a rail or strip card's note marker inherits no native `title`: the marker
  carries `title=""`, and `.r2` keeps its `<repo> / <branch>` title. (e4)

### Protocol delta (settled at the stop — implement verbatim, nothing else)
- Route table, beside `PUT /api/sessions/{id}/pin`:
  `| PUT /api/sessions/{id}/unread | Mark a session read or unread (kb:anchor/sessions.unread) |`
- New section `<!-- kb:anchor sessions.unread -->` `### PUT /api/sessions/{id}/unread`, after
  `kb:anchor/sessions.pin`, modelled on it, saying what REQ-1 says.
- `unread` field wording (session-row comment and bullet list): add "or by
  `kb:anchor/sessions.unread`" to how it is set and cleared.
- No `protocolVersion` bump (additive, kb:adr/connection-protocol-bumps-only-on-shape-change).

## Affected Files
### Daemon (daemon-impl)
- `internal/session/manager_rail.go` — REQ-1: `SetUnread(ctx, id, unread)` beside `MarkSeen`:
  `ErrUnknownSession` for a missing id; no-op (no write, no broadcast) when unchanged or when
  setting on a non-idle session; else one `persistWholeRowLocked`.
- `internal/server/rail.go` — REQ-1: `PUT /api/sessions/{id}/unread` registered beside the pin
  route; `unreadSessionRequest{Unread *bool}`; errors shaped exactly as `handlePinSession`.
### Web (web-impl)
- `web/src/api/sessions.ts` — REQ-2: `setSessionUnread(id, unread)` beside `pinSession`.
- `web/src/sessions/card.ts` — REQ-2: `SessionAction` gains the two mark actions (or an
  equivalent the dispatcher routes).
- `web/src/features/actions.ts` — REQ-2: dispatch the mark actions to the api, single and per id
  for a selection.
- `web/src/features/railmenuitems.ts` — REQ-2, REQ-3: the two labels in `CARD_MENU_LABELS`;
  `cardMenuItems`/`selectionMenuItems` return them; Remove pushed unconditionally.
- `web/src/features/railmenu.ts` — REQ-2, REQ-5: the mark entries in `cardEntries` and the
  selection menu; `open` accepts an anchor without a pointer point (the header ⋯).
- `web/src/render/sessions.ts` — REQ-5 (`CardMenuRequest.at` optional if needed), REQ-6:
  `applyRepoBlocks` sets the marker's `title = ""`.
- `web/index.html` — REQ-4: `#mainhead .acts` drops the two buttons and holds
  `<button type="button" class="btn icon more" aria-label="Session actions" aria-haspopup="menu" aria-expanded="false" title="Session actions">⋯</button>`.
- `web/src/features/focus.ts` — REQ-4, REQ-5: drop the Stop/Resume and Remove capture and
  listeners; wire the ⋯ click to a `FocusDeps` method that opens the rail menu for the focused id
  (`railMenu` is constructed before `focus` in `main.ts`).
- `web/src/main.ts` — REQ-5: pass the rail menu into `initFocus`'s deps (one line).
- `web/src/render/mainhead.ts` — REQ-4: drop `stopResumeBtn`/`removeBtn`, `renderStopResume` and
  their writes and doc-comment lines.
- `web/src/style.css` — REQ-4: drop `.mainhead .acts .stop-resume` and the "Stop or Resume moves
  nothing" comments; the ⋯ reuses `.btn.icon`.
- `web/src/render/rename.ts` — comment naming the mainhead's Stop/Resume/Remove siblings.
### Existing tests this breaks
- `web/src/features/railmenuitems.test.ts`: live = only Stop…, all-live selection = only Stop… (web-tests).
- `web/src/render/mainhead.test.ts`: `fakeButton` fields and the Stop/Resume describe (web-tests).
- `web/render/rail.spec.ts`: exact menu label lists (:284, :318, :356) (render-tests).
- `web/render/focus.spec.ts` (:726 header Resume, :747 switch before Stop and Remove),
  `web/render/helpers/focus.ts` (`headerStopResume`, `headerButton`), `web/render/actions.spec.ts`
  (:31 dialogs opened from the header → open them from the card menu; :111 mainhead half),
  `web/render/theme.spec.ts` (:105-135 header enabled/disabled pair → another pair),
  `web/render/card-location.spec.ts:380-389`, `web/render/rename.spec.ts:39-79` (retarget to the
  `.acts` cluster), `web/render/rail.spec.ts:575-610` (keyboard round-trip on header Stop) (render-tests).
- `web/e2e/rail-menu.spec.ts:447` exact list; `web/e2e/focus-header.spec.ts` (Stop/Resume swap
  block), `web/e2e/helpers/focus-header.ts`, `web/e2e/effort-header.spec.ts`, `web/e2e/actions.spec.ts`,
  `web/e2e/rail-cards.spec.ts`, `web/e2e/terminal.spec.ts`, `web/e2e/resilience.spec.ts`,
  `web/e2e/focus-marker.spec.ts`, `web/e2e/groups.spec.ts`, `web/e2e/notes.spec.ts`: every use of
  a header Stop/Resume/Remove moves to the card menu (`cardMenuItem(page, "Stop…")`) or the API
  helpers; tests whose whole subject was the header button are deleted (e2e-specs).

## Proof

1. **daemon-tests** — `internal/session/rail_unread_test.go`, `TestSetUnread_*`: sets on idle and
   broadcasts one upsert; clearing works in any state; `true` on a non-idle session and an
   unchanged value neither write nor broadcast; unknown id → `ErrUnknownSession`; persisted across
   a store reload. `internal/server/rail_test.go`, `TestHandleUnreadSession_*`: 401 without cookie,
   400 on bad/missing body, 404 unknown, 204 + persisted on change, 204 + no broadcast on no-op.
   Red today: `SetUnread` / the route do not exist (compile failure / 404 from the mux). (e1, REQ-1)
2. **web-tests** — `web/src/features/railmenuitems.test.ts`: every card and every selection shows
   "Mark as read" and "Mark as unread" (non-danger, enabled when connected and not busy); "a live
   session offers Stop… then Remove…, Remove danger"
   (`[["Stop…","end",false],["Remove…","remove",true]]`); the all-live selection row becomes
   `["Stop…","Remove…"]`. Red today: received `[["Stop…","end",false]]` / no mark entries.
   Plus `web/src/api/http.test.ts` covering `setSessionUnread` beside `pinSession`. (e1 REQ-2, e2 REQ-3)
3. **render-tests** — `web/render/focus.spec.ts`, "the Focus header of a live and an ended session
   holds no Stop, Resume or Remove button — only the surface switch and the Session actions ⋯"
   (fixture `stop-resume-pair`): for each card, `#mainhead` buttons named Stop/Resume/Remove count 0,
   `#mainhead .acts .surfseg` count 1, `getByRole("button", {name: "Session actions"})` visible and
   last in `.acts`. And "the header ⋯ opens the focused card's own menu": click it → menu labelled
   `Actions for <title>` with the same item labels a right-click on the focused rail card gives.
   Red today: Stop count 1, no Session actions button. (e3, REQ-4, REQ-5)
4. **render-tests** — `web/render/notes.spec.ts`, "hovering a rail card's note marker shows only the
   note tip — the marker inherits no repo-line title (#106)" (fixture `notes`, `notes-short`): walk
   from the shown `.r2 .mk` to the first ancestor-or-self with a `title`, expect `""`; `.r2` still
   titled `notes-short / main`; note tip visible. Red today: received `"notes-short / main"`. (e4, REQ-6)
5. **e2e-specs** — `web/e2e/rail-menu.spec.ts`, "Mark as unread on an idle read card marks it
   unread, and Mark as read clears it": right-click → "Mark as unread" → card gains
   `data-unread="true"` and the daemon's `GET` state says `unread: true`; → "Mark as read" → the
   attribute is gone. Red today: no such menu item. Also the exact-list update at :447 and the
   header-button migrations listed above. (e1 REQ-1/REQ-2, e3 migrations)

## Edge Cases
1. `unread:true` on a working session → 204, nothing written or broadcast → D1.
2. Mark as unread on the session shown in Focus → stays unread until its next attach (no
   detach) → D1 (shared with edge case 1).
3. Selection menu Mark as unread over a mix of idle and working sessions → only the idle ones
   become unread (per-id no-op) → untested: the per-id daemon no-op is D1, and the loop over ids is W1.
4. The header ⋯ while Select mode holds the focused session in a selection → opens the selection
   menu, as a right-click on that card does → untested: same `railMenu.open` path, behaviour
   inherited unchanged.
5. The header ⋯ while disconnected → menu opens, items disabled as on a card → untested: the
   card menu's disconnected state is already covered by `rail-menu.spec.ts`'s daemon-down test.

## Acceptance Criteria
### Automated Checks
```checks
D1 go test -count=1 -run 'TestSetUnread|TestHandleUnreadSession' ./internal/session/ ./internal/server/
D2 go test -count=1 ./internal/session/ ./internal/server/
W1 cd web && npx vitest run src/features/railmenuitems.test.ts src/api/http.test.ts src/render/mainhead.test.ts
R1 cd web && npx playwright test -c playwright.render.config.ts render/focus.spec.ts render/notes.spec.ts render/rail.spec.ts render/actions.spec.ts render/theme.spec.ts render/card-location.spec.ts render/rename.spec.ts
E1 make e2e SPECS="rail-menu.spec.ts focus-header.spec.ts effort-header.spec.ts actions.spec.ts rail-cards.spec.ts terminal.spec.ts resilience.spec.ts focus-marker.spec.ts groups.spec.ts notes.spec.ts"
L1 make lint
```
### Reviewer-Verified
- `docs/protocol.md` § kb:anchor/sessions.unread matches the Protocol delta word for word in
  substance, and no other protocol text changed.
- The header ⋯ uses the existing menu builder through `railMenu.open`; no second menu list exists.

## Doc Delta
**rail** — becomes true: the card menu (single and several-selected) offers Mark as read and Mark as
unread always, and Remove… on live sessions too (after Stop…). Stops being true: "Stop or Resume and
Remove" offered by state; Remove only on ended cards.
**lifecycle** — becomes true: `unread` is also set/cleared by the developer through
`kb:anchor/sessions.unread`; a hand-set unread persists until the next attach or leaving idle.
**focus** — becomes true: the header's right cluster is the surface switch and one Session actions ⋯
that opens the focused card's menu. Stops being true: the one Stop/Resume button and Remove in the
header, "so Stop and Resume never move it", "the surface switch and the actions move together" (the
switch and the ⋯ move together).
**actions** — stops being true: "They live in the Focus mainhead …", "In the Focus mainhead Stop and
Resume are one button"; becomes true: Stop, Resume and Remove are reached from the card menu (rail,
strip, the Focus header ⋯), the tile footers and the dead surface's Resume; the menu opens at the
pointer, just under the card from the keyboard, or just under the header ⋯ when opened from it.
**notes** — no spec change (its marker section already describes only the note panel).
Also: `docs/protocol.md` per the Protocol delta; `docs/design/design-system.md:278-282` Focus
mainhead sentence. ADRs (proposed on this branch): one amending
kb:adr/rail-unread-inferred-from-live-terminal-client (explicit mark route); one for the menu
offering Remove… on live sessions (applies kb:adr/actions-remove-allowed-on-live-session, supersedes
the menu-contents part of kb:adr/rail-card-menu-on-selected-card-acts-on-selection); one superseding
kb:adr/actions-mainhead-one-stop-resume-button and kb:adr/focus-surface-switch-pinned-with-actions
(header holds the switch and a ⋯, placement restated).

## Out of scope
- A batch `unread` route (the developer: per-session route called per id).
- A keyboard shortcut for the header ⋯ or for mark read/unread.
