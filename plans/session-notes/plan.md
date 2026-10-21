# Plan: Session notes

**Created**: 2026-10-20
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: notes.spec.ts daemon (tests restart and stop the daemon, and one asserts what a second window sees of the same session)
**Render fixtures**: new: notes (four sessions — no note; a short note; a long note with frontmatter and a mermaid fence; an ended session with a note — the short-note session focused), new: notes-tiles (the same four sessions with `prefs.view` `tiles`, density 2x2), new: notes-strip (six idle sessions at `tiles` 2x2, two past the grid on the strip, one of each noted — added pre-review at render-tests' needs-scenario)
**Features**: notes, focus, tiles
**Touches**: rail, lifecycle, connection, reader, actions, rename, issue, update, theme, groups, launch
**Description**: A persistent, markdown-rendered note per session, edited from the Focus header and peeked from the rail card and tile header (closes #95).

## Overview

The developer can attach a note to any session: what they are doing, what to ask next. It is
separate from the title and from the rail's activity line, and it is never sent to Claude Code. The
note is a Muster-owned field on the session row, like the title override
(kb:adr/rename-muster-owned-title-override-wins). It rides the whole Session object on every
`sessionUpsert` and in the snapshot, so every window has every note. It is set by one new endpoint
that replaces the whole text.

In the Focus header a notebook glyph sits before the session title: muted while the note is
empty, foreground once it has text. It opens a panel anchored under it. The panel shows the note
rendered as the docs reader renders markdown (frontmatter and mermaid included); one click edits
the raw text, and saving is automatic. A control pops the panel out into a free-floating,
draggable, resizable panel over the main slot that stays open while the developer types in the
terminal. The rail card (and the Tiles strip card, the same component), and the tile header, carry
a small marker while the note has text. Hovering the marker shows the note, read-only and cut off.

Text is never lost. Unsaved text is kept in the browser until musterd confirms it, and is sent
again after a reload, a reconnect or a daemon restart. An "unsaved" status shows while musterd is
unreachable. Two windows editing the same note: last write wins.

Design authority: `plans/session-notes/mockups/header-options.html` option **A** (bare glyph before
the title), `plans/session-notes/mockups/marker-options.html` option **C** (end of the repo line;
before the context readout on a tile), and `plans/session-notes/mockups/panel.html` (both panel
forms). Two deliberate deviations from the mockups' colours, both required by the design system:
the "unsaved" status uses the `--warn` family, never amber (kb:adr/theme-warn-tokens-not-amber,
design-system §3); the editing textarea is a standard form field on `--well` with a 1px `--edge`
border (design-system §5 "Form fields"), not the teal outline drawn in the mockup.

## Requirements

### Must Have
- [ ] REQ-1: Each session has a note, persisted by the daemon, carried on the Session object as
  `note` (string, or null when empty) in the snapshot and every `sessionUpsert`.
- [ ] REQ-2: `PUT /api/sessions/{id}/note` replaces the whole note. Text that is empty or only
  whitespace clears it to null. Any other text is stored exactly as sent, whitespace included.
  It works on a dead session.
- [ ] REQ-3: The note changes only through REQ-2. No hook, status post, transcript scan, `/clear`
  rebind, resume, reconcile or liveness change writes it (INV-1).
- [ ] REQ-4: Remove deletes the note with the session. Stop, resume and a daemon restart keep it.
- [ ] REQ-5: The note never appears in an issue snapshot.
- [ ] REQ-6 (property): The Focus header shows a notebook glyph button immediately before the
  session title, on live and dead sessions. It is muted (`--fg-dim` at reduced opacity, as drawn)
  while `note` is null and in `--fg` while it is non-null. The glyph never gives way as the header
  narrows. It is fixed-width, and the title's give-way (kb:adr/focus-header-give-way-order-title-last)
  is unchanged with the glyph's width added before it.
- [ ] REQ-7 (journey): Clicking the glyph (or Enter or Space on it) opens the **anchored panel**
  under it. The panel header reads `Note · <title>` with a pop-out control at the top right, over
  the rendered note. For an empty note it shows `No note yet. Click to write one (markdown).`
  Clicking the glyph again, a pointerdown outside the panel, or Escape while focus is inside the
  panel and not editing closes it.
- [ ] REQ-8 (journey): One click on the rendered note, or Enter while it has focus, switches to a
  textarea holding the raw text, focused. Escape in the textarea, or a pointerdown outside it but
  inside the panel, renders the note again with the panel left open. The textarea's native editing
  (undo and redo, selection, newline on Enter) is untouched.
- [ ] REQ-9 (journey): Saving is automatic. Text is sent to musterd within about a second of the
  last keystroke. Any pending text is also flushed immediately when edit mode ends, the panel
  closes, focus moves to another session, or the page is hidden or unloads. Pending text always
  goes to the session it was typed for (INV-4).
- [ ] REQ-10 (journey): Unsaved text survives a reload, a browser close and a daemon outage. Text
  not yet acknowledged by musterd is kept in the browser (local storage, per session) and sent
  again on the next load or reconnect. It is dropped once musterd acknowledges it, or when the
  session is removed.
- [ ] REQ-11 (property): While a save of the shown note cannot reach musterd, the panel header
  shows `unsaved, musterd unreachable` in the `--warn` family. A successful save clears it. Nothing
  shows while a save is merely in flight.
- [ ] REQ-12 (journey): The pop-out control turns the anchored panel into the **popped-out panel**.
  It floats over the main slot, with pop-in and close controls at its top right. Only those two
  controls, and Escape while focus is inside the panel and not editing, close it. Click-away and the
  glyph do not, so the terminal keeps the keyboard with the panel open. Pop-in returns it to the
  anchored form.
- [ ] REQ-13 (journey): The popped-out panel drags by its header and resizes from every edge and
  corner, down to a minimum that still shows its header controls and about four lines.
- [ ] REQ-14 (property): The popped-out panel's rectangle stays inside the main slot (below the
  Focus header, right of the rail, below the masthead) after a drag, a resize, a window resize and
  a return to Focus (INV-5).
- [ ] REQ-15 (journey): Focusing another session closes an anchored panel. A popped-out panel stays
  where it is and shows the newly focused session's note. With no session focused, it closes.
- [ ] REQ-16 (journey): Whether the panel is popped out, and its position and size, persist for
  the browser tab across reloads (session storage). A new tab starts anchored at the default size.
- [ ] REQ-17 (property): In Tiles view the popped-out panel is not shown. Switching back to Focus
  shows it again where it was.
- [ ] REQ-18 (property): A rail card, and a Tiles strip card, show a note marker at the end of the
  repo line only while `note` is non-null. A tile header shows the marker before the context
  readout only while `note` is non-null. Nothing on either edits the note.
- [ ] REQ-19 (journey): Hovering a marker for 350 ms opens a read-only `role="tooltip"` panel with
  the note rendered, following the shared hover-tip rules (kb:adr/rail-timer-tinted-wherever-cache-warmth-known).
- [ ] REQ-20 (property): The hover panel's rendered note is cut off after 12 lines with a fade at
  the bottom. The anchored panel's body scrolls inside a height capped to the viewport. The
  popped-out panel's body scrolls inside its chosen size.
- [ ] REQ-21 (journey): A note update from another window replaces the shown text in place when
  this window's panel is not in edit mode. While editing, the window keeps its own text, and its
  next save wins (last write wins, no merge, no prompt).
- [ ] REQ-22 (property): The note renders through the docs reader's renderer: markdown, the
  frontmatter block and mermaid fences, with the reader's failure display for malformed input. A
  rendering failure never blocks editing.

### Should Have
- [ ] REQ-23: Escape typed while focus is outside the note panel (the terminal, the rail) never
  closes or changes the panel and reaches its own target (INV-2).

### Nice to Have
- none.

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval; `docs/features/<f>/contract.md` regenerates).

### HTTP: PUT /api/sessions/{id}/note
Anchor `sessions.note` (new, `docs/protocol-anchors.tsv` 3.30), listed in the endpoint table as
"Set or clear a session's note (`kb:anchor/sessions.note`)".

**Auth**: UI cookie (401 `unauthorized` without it).
**Request:**
```json
{ "note": "## Where I am\nPlan written…" }
```
`note` is **required**, a string or `null`. An absent key is `400`, not a clear (decoded as
`json.RawMessage`, kb:adr/connection-absent-vs-null-json-fields-decode-as-raw-message). A string
that is empty or all whitespace (Unicode `TrimSpace`) is stored as `null`, the same as an explicit
`null`. Any other string is stored **verbatim**, with no trimming. There is no length limit on the note.
The request body as a whole is bounded at 20 MiB, the ingest ceiling, as a transport guard (`413`).

**Response 204:** no body. Every UI socket receives one `sessionUpsert` iff the stored note
changed. A request that leaves it as it was is a `204` with no broadcast. The session's `alive`
flag is not consulted, so a dead session's note can be set. Concurrent writes: the last request the
daemon applies wins.

**Errors** (envelope per `kb:anchor/transport`):
- 400 `invalid_request` — body not JSON, `note` key missing, `note` neither string nor null:
  `{"error": {"code": "invalid_request", "message": "note must be a string or null"}}`
- 404 `unknown_session`: `{"error": {"code": "unknown_session", "message": "unknown session id"}}`
- 413 `request_too_large` — body over 20 MiB:
  `{"error": {"code": "request_too_large", "message": "note is too large to save"}}`

### WS: daemon→UI `sessionUpsert` / `snapshot` — Session object gains `note`
```json
{ "note": "string | null — required key. The session's note as the developer last saved it via kb:anchor/sessions.note; null = no note (never an empty or whitespace-only string). Muster-owned and display-only: never read or written by the state machine, the status path, ingest, rebinds (/clear), resume, reconcile or liveness. Deleted with the row by Remove." }
```
Sent whole on every `sessionUpsert` like every other field (kb:adr/connection-whole-object-session-upserts),
so every upsert carries the full note text. The protocol version does not bump: a field is added and
no existing field changes shape (kb:adr/connection-protocol-bumps-only-on-shape-change).

### HTTP: POST /api/issue/captures — unchanged shape
`note` joins the **Never** list in `kb:anchor/issue.captures`. The allowlist is unchanged.

## Schema Changes

Migration `internal/store/migrations/0018_note.sql`, forward-only:

```sql
ALTER TABLE session ADD COLUMN note TEXT;   -- NULL = no note; never an empty or whitespace-only string
```

Removing a session deletes its row, and the note with it. No other table changes.
kb:diagram/store-schema and kb:diagram/domain-model gain the column and field (orchestrator's Doc upkeep).

## Diagrams

No new diagram. The two record deltas are one-line additions:

- delta of kb:diagram/store-schema — `session` gains `TEXT note "NULL = none"`; the caption's
  migration range becomes 0001-0018.
- delta of kb:diagram/domain-model — Session gains `note`, the developer's own text, Muster-owned.

## UI Specifications

Binding: design-system §5 "Focus mainhead", "Rail card", "Tile", "Popover", "Buttons", "Form
fields"; §3 (state colour is meaning: the glyph, marker and panel use neutral tokens only, and the
unsaved status uses `--warn`); ux-flows §3.1 "Shape — Focus", §3.3 "Rail card", §3.7 "Shape — Tiles".
Mockups: header option A, marker option C, `panel.html`.

### Views
- **Focus mainhead** — a notebook glyph `<button>` is the first child of `.idrow`, before the
  `h2.name`. It has a 13px icon, no border, `aria-expanded` reflecting whether it opened the
  anchored panel, and `aria-haspopup="dialog"`.
- **Anchored note panel** — appended to `body`, placed by the shared placement routine below the
  glyph. It is about 400px wide, its height is capped to the viewport and its body scrolls. Header:
  the uppercase mono label `Note`, then `· <title>` in `--fg-dim` (ellipsized), the status, then
  the pop-out control.
- **Popped-out note panel** — the same panel absolutely positioned over the main slot, with a grab
  cursor on the header and resize handles on every edge and corner. Header controls, left to
  right: pop-in, close.
- **Panel body** — view mode: the rendered note (reader prose, compact), or the empty-note line;
  the body is focusable and clickable to edit. Edit mode: a `<textarea>` filling the body.
- **Rail card / Tiles strip card** — a note marker (the same glyph at 11px, `--fg-muted`) right-
  aligned at the end of the repo line (`.r2`) while the note is non-null. The repo text keeps its
  end ellipsis before the marker.
- **Tile header** — the same marker before the context readout while the note is non-null.
- **Marker hover** — the shared hover tip (`render/hovertip.ts`), `role="tooltip"`, `pointer-events:
  none`, header `Note` with `read-only` at the right, then the rendered note, cut at 12 lines with
  a fade.

### User Flows
1. Glyph → anchored panel (rendered) → click note → edit → type (autosaves) → Escape → rendered
   → click outside → closed. The glyph is now foreground and the rail marker shows.
2. Anchored panel → pop-out → popped panel → click the terminal and type: the panel stays → drag
   and resize → focus another session: the panel shows its note → pop-in or close.
3. Rail card marker hover → tooltip with the note → pointer leaves → tooltip closes.
4. musterd down → type → `unsaved, musterd unreachable` → musterd back → the status clears without
   any action.

### States
- No data yet: a session with `note: null` shows the muted glyph and no marker. The anchored panel
  shows `No note yet. Click to write one (markdown).`
- Data: the foreground glyph, the marker, the rendered note.
- Daemon down: the panel stays usable. Editing continues, the unsaved status shows once a save
  fails, and the last-known note renders. Markers and hovers keep the last-known note.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Header note glyph | `button` | `Note` | native `<button>` with `aria-label="Note"`, always this name; empty vs non-empty is a render property (REQ-6), with `aria-expanded` |
| Anchored or popped-out panel | `dialog` | `Note` | mandated `role="dialog"` + `aria-label="Note"`, non-modal |
| Panel header session label | — | `· <title>` | text node after the `Note` label; `textContent` of the header row has no space between `Note` and `·` |
| Pop-out control | `button` | `Pop out note` | anchored form only |
| Pop-in control | `button` | `Pop in note` | popped-out form only |
| Close control | `button` | `Close note` | popped-out form only |
| Note editor | `textbox` | `Note text` | `<textarea aria-label="Note text">`, present only in edit mode |
| Empty-note line | — | `No note yet. Click to write one (markdown).` | view mode, note null |
| Unsaved status | `status` | `unsaved, musterd unreachable` | mandated `role="status"`; empty text otherwise |
| Rail / strip card note marker | — | — | carries visually hidden text `Has a note`; locator strategy is e2e-specs' call |
| Tile header note marker | — | — | same marker as the card |
| Marker hover panel | `tooltip` | starts with `Note` | the shared hover tip; contains the rendered note |

#### Invariants

- **INV-1**: `note` changes only through `kb:anchor/sessions.note`. Asserted from every reachable
  source state (live and idle, needs-input, failed, dead, after a `/clear` rebind, after resume, after
  reconcile at daemon start, after a status post, hook, transcript scan and liveness tick), with a
  second session present whose note must stay untouched by every one of them. → D4
- **INV-2**: Escape pressed while focus is outside the note panel never closes, pops in or changes
  the panel. With the popped-out panel open and the terminal focused, Escape reaches the terminal.
  → E10
- **INV-3**: The glyph is foreground iff `note` is non-null, and a marker is shown iff `note` is
  non-null. This holds on every hosting surface: the Focus header, the rail card, the Tiles strip
  card and the tile header, for live and ended sessions. → R1, R3, R4
- **INV-4**: Text typed into the editor is only ever saved to the session it was typed for. This
  holds when focus moves to another session, the session is removed, the socket reconnects, or
  another window's update arrives. → W4, E5
- **INV-5**: The popped-out panel's rectangle lies inside the main slot's rectangle after every
  drag, resize, window resize and return from Tiles. → R7, W2

#### Carried-over measurements

- The 20 MiB body bound is carried from the ingest cap (plan `daemon-internals-fixes`). It was
  chosen there as a transport guard for a JSON body on the same server, not measured against Claude
  Code. Re-checked: still valid because this endpoint's body is the developer's own text on the
  same localhost server, and no product cap is implied (the spec rules caps out).
- The 350 ms hover delay is carried from the cache-timer panel (`POPOVER_DELAY_MS`). The same
  component in the same rail, so it still holds.

## Affected Files

The planner's impact read, not a fence: existing files by path, new code by feature glob; REQs and behaviour, never shape.

### Daemon (daemon-impl)
- new `internal/store/migrations/0018_note.sql` — REQ-1: the column.
- `internal/store/session.go` — REQ-1, REQ-4: the session row reads and writes `note`.
- `internal/session/session.go`, `internal/session/row.go` — REQ-1, REQ-3: the Session carries
  the note through clone, persist and reload; nothing but the note mutation writes it.
- new under `internal/session/note*.go` — REQ-2, REQ-3: the set-note mutation under the session
  lock, persisting and broadcasting iff the stored note changed.
- new under `internal/server/note*.go` — REQ-2: `PUT /api/sessions/{id}/note` (decode, the
  blank-to-null rule, the 20 MiB bound, error envelopes).
- `internal/server/server.go` — one-line registration of the note handler.
- `internal/server/sessionwire.go` — REQ-1: `note` on the wire Session object.
- `internal/server/issuesnapshot.go` — REQ-5: confirm nothing copies the note (an allowlist, so
  likely no change). The key-set test stays the guard.
- new under `internal/server/renderfix_scenarios_notes.go` — the `notes` and `notes-tiles` render
  scenarios (sessions given notes through the new endpoint, one ended).

### Web (web-impl)
- `web/src/protocol/session.ts` — REQ-1: decode the required `note` key (string or null).
- `web/src/api/sessions.ts` — REQ-2: the set-note request, including a variant that survives page
  unload.
- new under `web/src/features/notes*.ts` — REQ-7 to REQ-17, REQ-21, REQ-23: the note controller
  (glyph, both panel forms, edit mode, autosave and flush, unsaved status, browser-kept drafts,
  pop-out geometry and its session-storage persistence, Tiles hiding, focus following), plus its
  DOM-free logic (geometry clamp, save scheduling, draft bookkeeping) beside it.
- new under `web/src/render/notes*.ts` — REQ-7, REQ-12, REQ-18 to REQ-20: the panel's and the
  marker's DOM builders, and the hover tip's content.
- `web/src/render/mainhead.ts` — REQ-6: the glyph's place before the title, and its muted or
  foreground state.
- `web/src/render/sessions.ts` — REQ-18: the card marker at the end of the repo line.
- `web/src/render/tiles.ts` — REQ-18: the tile header marker before the context readout.
- `web/src/features/rail.ts`, `web/src/features/tiles.ts` — REQ-19: wire the marker hover to the
  shared hover tip.
- `web/src/reader/markdown.ts`, `web/src/render/diagrams.ts` — REQ-22: reused as they are. Listed
  in case a call site needs an export. No reader behaviour changes.
- `web/index.html` — REQ-6, REQ-18: the glyph in the mainhead template, and marker slots in the card
  and tile templates.
- `web/src/style.css` — REQ-6, REQ-11, REQ-14, REQ-18, REQ-20: glyph, marker, panel, editor, the
  unsaved status and the cut-off fade.
- `web/src/main.ts` — one-line registration of the notes feature.

### Existing tests this breaks
- web-tests: every literal `Session` build gains `note: null`. Found: `web/src/app.test.ts`,
  `web/src/ws.test.ts`, `web/src/features/actionscopy.test.ts`, `web/src/render/tiles.test.ts`,
  `web/src/render/dead.test.ts` (2), `web/src/render/sessions.test.ts`,
  `web/src/render/mainhead.test.ts`, `web/src/protocol/messages.test.ts` (2),
  `web/src/sessions/store.test.ts`, `web/src/protocol/session.test.ts` (6),
  `web/src/sessions/testfixtures.ts`, `web/src/sessions/card.test.ts`,
  `web/src/sessions/rename.test.ts` (2), `web/src/sessions/sort.test.ts`,
  `web/src/sessions/live.test.ts`, `web/src/api/sessions.test.ts`, `web/src/api/launch.test.ts`.
- e2e-specs: `web/e2e/helpers/session.ts:130` — the wire Session type gains `note`.
- daemon-tests: every Go fixture that builds a whole wire Session or compares a persisted row gains
  `note`. The impl log's `## Handoff` lists them.
- render-tests: every existing fixture regenerates with `"note": null` on each session (`make
  gen-render-fixtures`, run by daemon-impl with its scenario change). No render spec asserts on it.

## Edge Cases

1. A hook, status post, transcript scan or liveness tick arrives for a session with a note: the
   note is untouched. → D4
2. `/clear` mints a new `session_id` in the same pane. SessionEnd-then-SessionStart, the reverse
   order, and a straggler hook from the previous turn after the rebind each leave the note as it
   was. → D4 (shared with edge case 1)
3. Daemon restart mid-session: the note reloads from the row. → D5, E6
4. tmux pane death without `SessionEnd`: the ended session keeps its note, readable and editable.
   → E6
5. Hook loss: irrelevant, since the note has no Claude Code source. → untested: no input path exists to drive
6. A whitespace-only save (`"  \n"`) clears to null: the glyph goes muted and the markers disappear.
   → D2, E2
7. The same text saved twice gives a `204` and no broadcast. → D1
8. A focus switch with pending text saves it to the original session first, then the popped panel
   shows the new session's note. → W4, E5
9. Remove while the panel is open: an anchored panel closes. A popped panel shows the next focused
   session's note, or closes if none. Any kept draft for the removed session is dropped. → W3, E11
10. Reload or browser close straight after typing: the pending text is flushed on unload, and kept
    in the browser until acknowledged, then re-sent on the next load. → E4, W3
11. musterd down while typing: the unsaved status shows, the text is kept, and the save happens on
    reconnect without action. → E8, R8
12. Another window's update arrives while editing: the editor keeps its own text. When not
    editing, the panel updates in place. → W6, E7
13. A draft kept from a closed window is re-sent after another window saved newer text: the older
    draft wins (last write wins, accepted at planning). → untested: accepted behaviour, nothing to falsify beyond W3's resend
14. A very long note: the anchored panel scrolls within the viewport cap, the hover cuts at 12
    lines, and the popped panel scrolls within its size. → R5, R6
15. Malformed frontmatter or a broken mermaid fence renders as the reader shows it, and clicking
    still enters edit mode. → R9
16. A narrow header (640px and narrower): the glyph stays visible and the action cluster stays in
    view. → R2
17. A window resize that shrinks the main slot below the popped panel's rectangle: the panel is
    clamped back inside, shrinking to its minimum if needed. → R7, W2
18. Switching to Tiles with the panel popped out hides it; returning to Focus shows it where it was.
    → R10
19. Escape in the terminal with the popped panel open reaches Claude, and the panel stays open. → E10
20. A body over 20 MiB returns `413` with the envelope, and the editor shows unsaved. → D3
21. A note PUT for an unknown session returns `404 unknown_session`. → D3 (shared with edge case 20)
22. A reconnecting window's snapshot carries every note, so no stale note shows. → E7

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon logic, `W*` web logic, `R*` render (what
the display shows, no daemon), `E*` e2e (a journey across the live daemon). One clause per
criterion; never mix a runnable command with a judgement call in one item.

### Daemon
- **D1**: A note PUT that changes the stored note persists it and broadcasts exactly one `sessionUpsert`; the same text again returns `204` with no broadcast.
- **D2**: A note PUT of `""`, of whitespace only, or of `null` stores `null`, and any other string is stored byte-for-byte, leading and trailing whitespace included.
- **D3**: The note endpoint returns `400 invalid_request` for a missing key, a non-JSON body and a non-string non-null value; `404 unknown_session` for an unknown id; and `413 request_too_large` for a body over 20 MiB; each in the error envelope.
- **D4**: INV-1 holds: from every source state INV-1 names, every non-note input leaves both the target session's and a second session's `note` unchanged.
- **D5**: A session's note survives a store reload (daemon restart) and a resume.
- **D6**: A dead session's note can be set.
- **D7**: An issue snapshot captured on a session with a note contains none of the note's text.
- **D8**: Every Session object in the snapshot and in `sessionUpsert` carries the `note` key, `null` when there is no note.

### Web
- **W1**: The Session decoder accepts `note` as a string or null and rejects a message whose `note` key is missing or of another type.
- **W2**: The geometry clamp keeps any requested panel rectangle inside a given main-slot rectangle and never below the minimum size, shrinking to fit when the slot is smaller than the rectangle.
- **W3**: The draft bookkeeping keeps unacknowledged text per session, clears it only on an acknowledgement of that same text, yields it for re-send on load and reconnect, and drops it when the session is removed.
- **W4**: The save scheduler sends at most about one second after the last edit, flushes immediately on edit end, close, focus change and page hide, and always addresses the session the text was typed for.
- **W5**: The panel's unsaved status is derived as shown iff the latest save of the shown session failed to reach musterd and no later save succeeded.
- **W6**: An incoming note for the shown session replaces the displayed text iff the panel is not in edit mode.

### Render
- **R1**: In `notes`, the Focus header glyph computes `--fg` for the noted focused session and the muted treatment for a note-less one (re-focused), on live and ended sessions.
- **R2**: In `notes`, at header widths of 1280, 900, 640 and 360px, the glyph is fully visible immediately before the title, and the action cluster stays in view.
- **R3**: In `notes`, exactly the noted rail cards show the marker, at the end of the repo line, the repo text ellipsizing before it.
- **R4**: In `notes-tiles`, exactly the noted tiles show the marker before the context readout, and exactly the noted strip cards show it on their repo line.
- **R5**: In `notes`, hovering a marker for 350 ms opens a `tooltip` whose rendered note shows the long note's frontmatter block and diagram, cut at 12 lines with a fade.
- **R6**: In `notes`, the anchored panel on the long note keeps its whole box inside the viewport at 900 and 640px window heights, its body scrolling.
- **R7**: In `notes`, the popped-out panel stays inside the main slot after a drag past each edge, a resize past each edge and corner, and a window resize from 1440×900 to 800×600.
- **R8**: In `notes`, a note save answered by a network failure shows `unsaved, musterd unreachable` in the `--warn` colour, and a later successful save clears it.
- **R9**: In `notes`, a note with malformed frontmatter and a broken mermaid fence renders as the reader renders the same text, and a click on it still opens the editor.
- **R10**: In `notes`, switching to Tiles with the panel popped out hides it, and switching back shows it at the same rectangle.
- **R11**: In `notes`, Escape in the editor leaves edit mode with the panel open, and Escape in view mode closes the anchored panel.
- **R12**: In `notes`, undo and redo in the editor reverse and reapply typed text.
- **R13**: In `notes`, the glyph opens the panel on Enter and on Space from keyboard focus.

### E2E
- **E1**: Typing a note and leaving edit mode turns the glyph foreground and shows the rail marker, and after a reload the panel shows the same text rendered.
- **E2**: Clearing a note's text to whitespace turns the glyph muted and removes the rail marker, and `GET /api/state` shows `note: null`.
- **E3**: Typing without leaving edit mode puts the text in `GET /api/state` within two seconds.
- **E4**: Typing and reloading at once keeps every character after the reload.
- **E5**: With the panel popped out, typing and then focusing another session saves the text to the first session, and the panel then shows the second session's note.
- **E6**: A note survives Stop, Resume and a musterd restart, staying readable and editable on the ended session.
  *Amended (orchestrator, pre-review, measured at web-impl's smoke run of `notes.spec.ts:317`):* a
  restart keeps the note of every row reconcile keeps — a live session, and one whose pane died
  while musterd was down; an already-ended row is swept at the next start and its note with it
  (kb:adr/lifecycle-reconcile-converges-with-the-socket, kb:adr/notes-ended-row-sweep-takes-its-note).
- **E7**: An edit saved in one window shows without a reload in a second window whose panel is open and not editing.
- **E8**: With musterd stopped, typing shows the unsaved status and keeps the text, and after musterd restarts the note saves without any action and a reload shows it.
- **E9**: With the panel popped out, clicking the terminal and typing leaves the panel open, and the typed text reaches the pane.
- **E10**: With the panel popped out and the terminal focused, Escape leaves the panel open (INV-2).
- **E11**: Removing a session whose note panel is popped out shows the next focused session's note, and the removed session's note is gone from `GET /api/state`.
- **E12**: A popped-out panel reloads popped out at the same position and size.

### Automated Checks

Every line below is `<ID> <single-line shell command>`, run from the project root. A check passes
iff its command exits 0.

```checks
D9 make test
D10 make lint
D11 go build ./...
D12 make check-render-fixtures
W7 make web-test
W8 make web-build
W9 make web-lint
W10 make contrast
R14 make render-test
E13 make e2e
K1 make check-kb
```

### Reviewer-Verified

- **V1**: No `any` types in new web code.
- **V2**: The glyph, the marker, the panel and the hover use neutral tokens only. The sole
  exception is the unsaved status, which uses the `--warn` family, never `--amber`.
- **V3**: The header, the markers and both panel forms match the chosen mockups (header option A,
  marker option C, `panel.html`), except for the two colour deviations named in the Overview.
- **V4**: No path sends any part of a note to Claude Code: no hook reply, no `--name`, no launch
  argument.
- **V5**: The note is rendered through the reader's sanitizing renderer and never inserted as raw
  HTML.

## Doc Delta

**notes** — becomes true:
- `docs/features/notes/spec.md` (new, authored at approval) states REQ-1 to REQ-23 as present-tense
  product truth: the note field and its endpoint, the glyph and both panel forms, autosave and
  browser-kept drafts, the unsaved status, pop-out geometry and per-tab persistence, Tiles hiding,
  the markers and their hover, lifetime and privacy.

**notes** — stops being true: nothing (new feature).

**focus** — becomes true:
- `docs/features/focus/spec.md` says the mainhead's first item is a notebook glyph before the
  session name, muted while the session's note is empty, that opens the note panel (kb:spec/notes),
  and that it never gives way as the header narrows.

**focus** — stops being true:
- "Above the pane sits the mainhead: the session name with its inline rename trigger" becomes
  "Above the pane sits the mainhead: the note glyph (kb:spec/notes), then the session name with its
  inline rename trigger".

**rail** — no sentence changes. The rail spec is at 792 of its 800 words, so the card's marker and
its hover are stated in `docs/features/notes/spec.md` § "The marker and its hover", which the rail
card's code already cites through kb:spec/notes. Rail is under **Touches** for that reason: its files
change, and the behaviour they gain is the notes feature's.

**tiles** — becomes true:
- `docs/features/tiles/spec.md`: "A tile with a note shows the note marker before its context
  readout (kb:spec/notes)."

**tiles** — stops being true: nothing.

**protocol** — `docs/protocol.md` gains the `sessions.note` section and its endpoint-table row,
the Session object's `note` key, and `note` on the issue capture's **Never** list (merged at approval).

**design-system** (orchestrator's Doc-Upkeep Backstop) — `docs/design/design-system.md` §5 "Focus
mainhead" gains the glyph before the name; "Rail card" and "Tile" gain the marker; a new **Note
panel** component paragraph describes both forms.

## Out of scope

- Notes not tied to a session (global notes), and notes on a group.
- Searching or exporting notes.
- A keyboard chord for the note.
- Sending any part of a note to Claude Code, or a note derived from the session's content.
- Any size cap on a note.
- Merging concurrent edits from two windows (last write wins).

## Implementation Notes

**Hints (non-binding):**
- The title override is the whole daemon precedent: `internal/server/rename.go` (RawMessage decode
  for absent vs null), `internal/session/title.go` (`SetTitle`: lock, compare, `persistWholeRowLocked`,
  broadcast iff changed), migration `0007_title_override.sql`. The note needs none of the title's
  Claude-delivery machinery (`titledelivery.go`).
- The body bound: `internal/server/ingest.go:323` wraps the body with `http.MaxBytesReader` at
  `maxIngestBodyBytes`. Reuse that constant rather than a second 20 MiB literal.
- Rendering: `web/src/reader/markdown.ts`'s `renderMarkdown(text)` returns the sanitized body (and
  frontmatter), and `web/src/render/diagrams.ts`'s `renderDiagrams(body, opts)` runs the mermaid
  pass (mermaid is lazy-loaded by `render/mermaid.ts`). `features/reader.ts` shows the call order
  and the theme option.
- Panels: `render/`'s shared anchored-placement routine places the anchored form, and its shared
  hover tip (the one the cache timer and the location panel use) is the marker hover.
- Browser storage: the dashboard already has one localStorage seam with safe JSON helpers, and the
  update-restart feature shows a guarded `sessionStorage` accessor. Wrap every read and write.
- Unload: `fetch(..., { keepalive: true })` supports `PUT` but caps in-flight keepalive bodies at
  64 KiB. The browser-kept draft (REQ-10) is what covers a larger note.

**Decisions (proposed ADRs written at approval):**
- kb:adr/notes-muster-owned-session-field-whole-text — the note is a nullable session-row field
  carried whole on the Session object, set only by a whole-text PUT, blank meaning none, last write
  wins.
- kb:adr/notes-request-bounded-at-ingest-ceiling — no product cap; the request body is bounded at
  the 20 MiB ingest ceiling as a transport guard.
- kb:adr/notes-unsaved-text-kept-in-browser-until-acknowledged — unacknowledged text lives in local
  storage per session and is re-sent on load and reconnect, accepting that an older kept draft can
  overwrite a newer save.
- kb:adr/notes-escape-only-from-inside-the-panel — the panel reacts to Escape only with focus inside
  it, so the terminal keeps Escape.
- kb:adr/notes-popout-hidden-in-tiles-geometry-per-tab — the popped-out panel hides in Tiles; its
  form and rectangle persist per tab in session storage.
- kb:adr/notes-glyph-before-title-marker-on-repo-line — the header glyph leads the title and never
  gives way; the card's marker ends the repo line, and the tile's sits before the context readout.

**Doc upkeep (orchestrator):** `docs/features/notes/spec.md` (authored at approval), the focus,
rail and tiles spec sentences in the Doc Delta, `docs/design/design-system.md` §5,
kb:diagram/store-schema and kb:diagram/domain-model, `TODO.md` #95 ticked and moved to
`docs/history/todo-done.md` at Completion.
