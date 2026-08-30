# Plan: order-sidebar

**Created**: 2026-08-30
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Description**: The Focus rail (and Tiles strip) get a persisted, user-owned order — sessions sit in the order they were opened, drag-to-reorder by card, a pin control that lifts a session into a pinned block at the top — with a rail-head toggle between this manual order and the existing §3.4 attention sort.

## Overview

Today the rail re-sorts itself by attention priority on every render (`web/src/sessions/sort.ts`,
ux-flows §3.4, SPEC §2.1): a session that goes `needs_input` jumps to the top and back down
again when answered. With 4–6 long-lived sessions Damian wants muscle memory instead
(TODO.md "Pre-v1 Cleanup", first bullet): cards stay where they were opened, he can drag
them into the order he wants, and a pin lifts the ones he keeps returning to into a block at
the top. Decided at planning (2026-08-30): the attention sort is **not** removed — it becomes
one of two rail sort modes, selectable from the rail head and persisted as a pref, because
"where am I needed" and "where did I put things" are both wanted at different moments.

Unlike `move-tiles` (per-window, ephemeral), rail order and pinned state are **daemon-owned,
per-session fields** (`pinned`, `railPos` on the Session object; two new session columns), so
the order survives reloads and daemon restarts and stays in sync across windows through the
ordinary `sessionUpsert` broadcast. The daemon owns the *invariants* of the order (every
pinned session precedes every unpinned one; `railPos` is unique) but never orders for
display — the client still sorts, exactly as protocol §5.2 says. The UI sends one of two
mutations: `PUT /api/sessions/{id}/pin` (the pin control) or `PUT /api/sessions/order` (a
drop), the daemon re-derives positions, persists, and broadcasts every session whose
`pinned`/`railPos` changed.

Drag semantics follow `move-tiles`: insert-and-shift, drop on a card. The whole card is the
drag handle (a card has no header bar; a click still focuses because a drag needs movement).
Drop position decides pin state: dropping onto a pinned card pins the dragged session there,
dropping onto an unpinned card unpins it. Ended (`alive:false`) sessions keep their slot in
manual mode (the rail "never reorders itself"); the attention mode keeps m4-reconcile's
ended-last rule. The Tiles strip follows the same order (minus live tiles), so there is one
order across both views; the Tiles grid order (`tilesLive`) is untouched. Amends SPEC §2.1 /
ux-flows §3.4's "sorted with Needs-Input first" from *the* rail order to the rail's
*attention mode* — the orchestrator records it (Doc upkeep).

## Requirements

### Must Have
- [ ] REQ-1: **Per-session order fields.** Every Session object carries `pinned: boolean`
      and `railPos: number` (integer). A newly created session gets `pinned:false` and a
      `railPos` strictly greater than every existing session's (opened order = bottom of the
      unpinned block). Existing rows are backfilled `railPos = id`.
- [ ] REQ-2: **Order invariants (INV-1, INV-2 below).** After every mutation the daemon
      applies (create, pin, unpin, order, remove, resume), `railPos` is unique across all
      sessions and every `pinned:true` session has a smaller `railPos` than every
      `pinned:false` one.
- [ ] REQ-3: **Pin.** `PUT /api/sessions/{id}/pin` `{"pinned":true}` moves the session to
      the **bottom of the pinned block** (pinned in order of pinning); `{"pinned":false}`
      moves it to the **top of the unpinned block**. A no-op when the flag already matches
      (204, nothing broadcast). Every session whose `pinned` or `railPos` changed is
      broadcast as a `sessionUpsert`; unchanged sessions are not.
- [ ] REQ-4: **Order.** `PUT /api/sessions/order` `{"ids":[…],"pinnedCount":n}` sets the
      full rail order: the first `n` ids become pinned, the rest unpinned, `railPos` =
      index. Ids not listed keep their flag and follow the listed ones in their existing
      relative order (tolerates a concurrent launch). An unknown id or `pinnedCount` out of
      `[0, len(ids)]` → 400, nothing changes. Only changed sessions are broadcast.
- [ ] REQ-5: **Rail sort pref.** `prefs.railSort` ∈ `"manual" | "attention"`, default
      `"manual"`, via the existing `PUT /api/prefs` (persisted, broadcast, defaulted when
      missing — same rules as `usageModel`).
- [ ] REQ-6: **Client order function.** `orderRail(sessions, mode)` in
      `web/src/sessions/sort.ts`, pure: `manual` → pinned first (by `railPos`), then
      unpinned by `railPos`, `id` as the final tiebreak; `attention` → pinned first (by
      `railPos`), then the unpinned by the existing `sortSessions` order (which already
      sorts ended sessions last). Never mutates its input. The rail, the Tiles strip and
      the default-focus pick (`main.ts`'s `focusedId` fallback) all use it.
      *Amended 2026-08-30 (review cycle 1, issue 1; `decisions/cmd-n-ordering`)*: ⌘1–9
      (`focusNth`) is a fourth consumer — the shortcut selects the nth card in the rail's
      displayed order, not the attention rank.
- [ ] REQ-7: **A state change never moves a card in manual mode.** With `railSort:manual`,
      a state transition (e.g. a `Notification` making a session `needs_input`, or a
      session ending) leaves every card in its DOM slot; only chrome (stripe/badge/timer)
      updates.
- [ ] REQ-8: **Pin control on every card.** Each rail/strip card's `.r1` gains a
      `<button class="pin" type="button">` with `aria-label` `Pin` (unpinned) / `Unpin`
      (pinned) and `aria-pressed` mirroring `pinned`. Clicking it calls REQ-3's endpoint
      and does not change focus (`stopPropagation`, like the action row). The button is
      always visible on a pinned card; on an unpinned card it is visible on card hover /
      `focus-within` (same reveal rule as `.card .acts-row`).
- [ ] REQ-9: **Pinned block visual.** A pinned card carries class `pinned`; the last pinned
      card carries class `pinned-last` and a 1px bottom rule in `--line2` separating the
      block from the unpinned cards (neutral token, never a state colour — design-system §3).
- [ ] REQ-10: **Drag to reorder (manual mode only).** In `manual` mode every rail card is
      `draggable="true"`; in `attention` mode none is (`draggable="false"`, no drag starts).
      Dropping a card on another card computes the new order with `moveCard` (REQ-11) and
      sends REQ-4's request; the rail re-renders from the resulting upserts (no optimistic
      reorder). Dropping anywhere else or pressing Escape is a no-op. Visual feedback
      classes `dragging` / `drop-target` and the inset `--line2` outline as `move-tiles`
      REQ-6.
- [ ] REQ-11: **Pure drop math.** `moveCard(ordered, draggedId, targetId)` in
      `web/src/sessions/railorder.ts`: given the currently displayed manual order (sessions
      with `pinned`), removes the dragged session, re-inserts it at the target's index
      (insert-and-shift, either direction) **with the target's `pinned` value**, and returns
      `{ ids, pinnedCount }` — `pinnedCount` = number of pinned entries in the result.
      Returns `null` when `draggedId === targetId` or either id is absent.
- [ ] REQ-12: **Sort toggle in the rail head.** A `<select id="rail-sort" aria-label="Sort">`
      with options `Manual` (value `manual`) and `Attention` (value `attention`) sits in
      `.railhead`; changing it calls `PUT /api/prefs {railSort}`; its value follows the
      `prefs` broadcast (a second window updates).
- [ ] REQ-13: **Strip follows the rail order.** The Tiles strip renders
      `orderRail(sessions minus tilesLive, mode)`. The strip has no pin control activation
      difference — its cards carry the same pin button (shared template/reconciler) but are
      never draggable (the strip is a promote surface; `tilesLive` order is `move-tiles`'s).
- [ ] REQ-14: **Remove/resume keep the invariants.** Removing a pinned or unpinned session
      leaves the others' order unchanged (gaps in `railPos` are allowed). Resume changes
      neither `pinned` nor `railPos`.
- [ ] REQ-15: **Daemon down.** With the WS disconnected the toggle, pin button and drag are
      still rendered; a pin click or drop whose request fails changes nothing on screen
      (no optimistic state) — the banner already explains why.

### Should Have
- [ ] REQ-16: **Focus survives a drop / pin.** A focused card or in-card button (any card)
      is still focused after the reorder's DOM moves — the existing
      `captureFocusedControl`/`restoreFocusedControl` path in `reconcileCards` covers it;
      pre-drag capture on `mousedown` as `tiledrag.ts` does (its header comment explains
      why a live capture at drop time finds nothing).
- [ ] REQ-17: **Pin button title.** `title="Pin to top"` / `title="Unpin"` so the glyph is
      explained on hover.

### Nice to Have
- (none — keyboard reorder deferred, same as `move-tiles`.)

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval).

### §5.3 Session object — two new fields (on every Session object, never null)

```jsonc
{ /* …existing fields… */
  "pinned": false,     // boolean — user pinned it into the rail's top block
  "railPos": 12        // integer ≥ 0 — manual rail position; unique across all sessions
                       //   (gaps allowed). INV: every pinned session's railPos < every
                       //   unpinned one's. New sessions get max(railPos)+1, pinned:false.
                       //   The client sorts by it (prefs.railSort = "manual"); the daemon
                       //   never orders for display (§5.2 unchanged).
}
```

Changes to `pinned`/`railPos` are broadcast as ordinary `sessionUpsert`s — one per session
whose value changed, in no particular order. Snapshot semantics unchanged.

### §3.3 `PUT /api/prefs` — new optional field

```jsonc
{ "railSort": "manual" }   // optional: "manual" | "attention" — the rail's sort mode
```

Default before any PUT: `"manual"`. Full default prefs object becomes
`{"view":"focus","density":"2x2","usageModel":"Fable","railSort":"manual"}`. 400
`invalid_request` for any other value. `prefs` broadcast and kv persistence as before.

### §3.10 `PUT /api/sessions/{id}/pin` (Pre-v1 — order-sidebar)
**Auth**: UI cookie (401 `unauthorized`).
**Request:**
```json
{ "pinned": true }
```
`pinned` is required (boolean).
**Response 204**, no body. Effect: `pinned:true` → the session takes `railPos` = (largest
pinned `railPos`) + 1 … but strictly below the smallest unpinned one — the daemon renumbers
whatever is needed to keep the invariant (typically it renumbers the unpinned block up by
one). `pinned:false` → the session moves to the top of the unpinned block (immediately
after the last pinned session), renumbering as needed. Already in the requested state → 204
and no broadcast. Otherwise every session whose `pinned` or `railPos` changed is broadcast
as `sessionUpsert`.
**Errors:**
- 400 `invalid_request` — body not JSON or `pinned` missing / not a boolean.
- 404 `unknown_session` — no such id.

### §3.11 `PUT /api/sessions/order` (Pre-v1 — order-sidebar)
**Auth**: UI cookie (401 `unauthorized`).
**Request:**
```json
{ "ids": [4, 9, 2, 7], "pinnedCount": 1 }
```
`ids`: array of session ids, no duplicates, each must exist. `pinnedCount`: integer in
`[0, len(ids)]` — the first `pinnedCount` ids become `pinned:true`, the rest `pinned:false`;
`railPos` = index in `ids`. Sessions that exist but are not listed keep their `pinned` flag
and are placed after the listed ones in their existing relative `railPos` order — then, if
any of them is pinned, the daemon still enforces the invariant by placing them at the end
of the pinned block instead (renumbering the unpinned listed ones). Empty `ids` is valid
(a no-op that still validates `pinnedCount == 0`).
**Response 204**, no body; every session whose `pinned` or `railPos` changed is broadcast
as `sessionUpsert` (none if nothing changed).
**Errors:**
- 400 `invalid_request` — body not JSON, `ids` missing / not an array of integers /
  contains a duplicate or an unknown id, or `pinnedCount` missing / outside `[0, len(ids)]`.
  Nothing changes on a 400.

Route registration in `internal/server/server.go`: `PUT /api/sessions/order` must be
registered so it is not shadowed by `/api/sessions/{id}/…` patterns (Go 1.22 mux: a
literal segment wins over a wildcard, so `PUT /api/sessions/order` and
`PUT /api/sessions/{id}/pin` coexist).

## Schema Changes

`internal/store/migrations/0006_rail_order.sql` (forward-only, embedded like the others):

```sql
-- Pre-v1 (plan order-sidebar, 2026-08-30): user-owned rail order. Display-only fields;
-- never read by the state machine. pinned rows always have a smaller rail_pos than
-- unpinned rows (invariant enforced in internal/session, not by the schema).
ALTER TABLE session ADD COLUMN pinned   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE session ADD COLUMN rail_pos INTEGER NOT NULL DEFAULT 0;
UPDATE session SET rail_pos = id;   -- backfill: opened order
```

`SessionRow` gains `Pinned bool` / `RailPos int64`; `UpdateSession` writes both;
`InsertSessionParams` gains `RailPos` (the manager computes max+1 under its lock before
inserting). No new tables. Don't test what SQLite guarantees.

## UI Specifications

Design authority: design-system §3 (tokens; a state colour may only mean that state) and §5
(card anatomy). No mockup exists for the pin control or the toggle — semantic markup,
neutral tokens, consistent with the existing `.railhead` and `.card` rules.

### Views
- **Focus → rail** — cards in `orderRail` order; pinned block with a bottom rule; per-card
  pin button; cards draggable in manual mode; `#rail-sort` select in the rail head.
- **Tiles → strip** — same order minus live tiles; same pin button; not draggable.
- **Tiles → grid** — unchanged.

### DOM
- `web/index.html` `.railhead`: after `#rail-count`, add
  `<select id="rail-sort" class="sel" aria-label="Sort"><option value="manual">Manual</option><option value="attention">Attention</option></select>`
  (reuse the masthead's usage-model `<select>` styling class if one exists; otherwise the
  minimal `.railhead .sel` rule below).
- `session-card-template` `.r1`: append `<button class="pin" type="button" aria-label="Pin" aria-pressed="false" title="Pin to top"></button>`.
  The glyph is CSS (`.pin::before { content: "⚲" }` or an inline-SVG background — impl's
  choice; **no state colours**, `--fg-muted` idle / `--fg` when pinned or hovered).
- Runtime attributes/classes on `article.card`: `draggable` (`"true"` in manual mode on
  rail cards; `"false"` otherwise), `pinned`, `pinned-last`, `dragging`, `drop-target`.
- CSS: `.card.pinned-last { border-bottom: 1px solid var(--line2); padding-bottom: … }` (or a
  margin + rule on the block, impl's choice — the observable is a 1px `--line2` rule below
  the last pinned card); `.card[draggable="true"] { cursor: grab }`;
  `.card.dragging { opacity: .6 }`; `.card.drop-target { outline: 1px solid var(--line2); outline-offset: -1px }`;
  `.card .pin` hidden (`opacity:0`) unless `.card.pinned`, `.card:hover`, `.card:focus-within`.
- `web/src/sessions/card.ts` `CardViewModel` gains `pinned: boolean`; `render/sessions.ts`'s
  build/update set the pin button's `aria-label`/`aria-pressed`/`title` and the card's
  `pinned` class from it; `reconcileCards` (or its callers) sets `pinned-last` on the last
  pinned card in the container and clears it elsewhere. `onAction` grows a fourth action:
  `SessionAction = "end" | "resume" | "remove" | "pin"` — `main.ts`'s dispatcher calls
  `pinSession(id, !session.pinned)`.
- Drag wiring: generalise `web/src/render/tiledrag.ts` into
  `web/src/render/dragreorder.ts` exporting
  `installDragReorder(container, { itemSelector, handleSelector?, onMove })` (delegated
  listeners; `handleSelector` restricts `dragstart` to a descendant match — the tiles pass
  `".thead"`, the rail passes none so the whole card is the handle; items with
  `draggable="false"` never start a drag because the browser never fires `dragstart` for
  them). `tiledrag.ts` keeps its `installTileDrag` export as a thin wrapper
  (`tiledrag.test.ts` must keep compiling and passing unchanged). `main.ts` installs it once
  on `#sessions`; `onMove` → `moveCard(orderRail(sessions,"manual"), from, to)` →
  `putSessionOrder(...)`; the `focusedBeforeDrag` snapshot is threaded to the next render's
  restore exactly as the tiles path does.
- `web/src/api.ts`: `pinSession(id, pinned)` and `putSessionOrder(ids, pinnedCount)`
  (both `ApiResult<null>`, 204). `PrefsRequest` gains `railSort?`.
- `web/src/protocol.ts`: `Session` gains `pinned`/`railPos`; `Prefs` gains
  `railSort: RailSort` with `parsePrefs` defaulting a missing key to `"manual"` (same
  pattern as `usageModel`); `parseSession` (if there is one) defaults are **not** added —
  the daemon always sends both fields.

### User Flows
1. Rail, manual mode, ≥3 unpinned cards. Press on a card, drag over another (it gains the
   `drop-target` outline), release → after the upserts arrive the dragged card sits at the
   target's position; cards between shift by one; focus unchanged.
2. Hover an unpinned card → pin button appears; click → the card moves to the bottom of the
   pinned block (top of rail if none pinned), gains the `pinned` class, button reads Unpin
   (`aria-pressed=true`); the focused session does not change.
3. Click Unpin on the top pinned card → it becomes the first unpinned card.
4. Drag an unpinned card onto a pinned card → it is inserted there **and pinned**; the
   reverse unpins.
5. A card's session goes `needs_input` in manual mode → stripe/badge change in place.
6. Switch `#rail-sort` to Attention → unpinned cards re-sort by §3.4 (needs-input first,
   ended last); pinned block stays on top in its manual order; cards are no longer
   draggable; reload → still Attention (pref persisted).
7. Tiles view: strip cards are in the same order as the rail would be, minus live tiles.

### States
- No sessions: unchanged honest empty state ("No sessions yet"); the `#rail-sort` select
  is still rendered and usable.
- Data: as above.
- Daemon down: banner; toggle/pin/drag rendered; failed requests change nothing (REQ-15).

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Rail sort select | `combobox` | `Sort` | `<select id="rail-sort" aria-label="Sort">`; options `Manual` / `Attention` |
| Pin button (unpinned card) | `button` | `Pin` | `aria-pressed="false"`, inside `[data-testid="session-card"] .r1` |
| Pin button (pinned card) | `button` | `Unpin` | `aria-pressed="true"` |
| Rail card | — | `[data-testid="session-card"]` in `#sessions` | order asserted via `data-session-id` sequence; `draggable` attribute; classes `pinned` / `pinned-last` |
| Strip card | — | `[data-testid="session-card"]` in `#tiles-strip` | same template; never `draggable="true"` |
| Drop-target card | — | `.card.drop-target` | during drag only |

### Invariants

- **INV-1 (pinned-before-unpinned)**: at all times, for every pair of sessions, `a.pinned
  && !b.pinned ⇒ a.railPos < b.railPos`. Asserted after **every** mutation from **every**
  starting configuration: no sessions; all unpinned; all pinned; mixed; the mutated session
  at the top / middle / bottom of its block; with bystanders present (other sessions must
  be untouched unless renumbering requires it).
- **INV-2 (unique railPos)**: no two sessions share a `railPos`, after every mutation.
- **INV-3 (manual mode is state-independent)**: `orderRail(s, "manual")` depends only on
  `(pinned, railPos, id)` — asserted by permuting `state`/`alive`/`attention`/`stateSince`
  across every state and checking the order is identical.
- **INV-4 (pinned block precedes in both modes)**: in `attention` mode every pinned session
  still precedes every unpinned one, from every state mix (a pinned `idle` above an
  unpinned `needs_input`).
- **INV-5 (broadcast minimality)**: a pin/order call broadcasts exactly the set of sessions
  whose `pinned` or `railPos` changed — a no-op call broadcasts nothing.

### Carried-over measurements
- `tiledrag.ts`'s `mousedown`-time focus capture (E2E-validated in `move-tiles`) is carried
  into the generalised module. Re-checked against this plan's decision (whole card as
  handle, rail container): the mechanism is the browser's default blur on the drag's
  initiating mousedown, independent of which element is the handle → still valid.
- `reconcileCards`'s in-place `insertBefore` reorder + focus restore (m4-reconcile cycle-3)
  is what re-renders after upserts; unchanged.

## Affected Files

### Daemon
- `internal/store/migrations/0006_rail_order.sql` — new (above).
- `internal/store/session.go` — `SessionRow.Pinned/RailPos`; read/write in Insert/Update/
  Get/List; `InsertSessionParams.RailPos`; a `MaxRailPos(ctx)` helper or compute in the
  manager from its in-memory set (manager already holds all sessions — prefer that).
- `internal/session/session.go` — `Session.Pinned bool`, `Session.RailPos int64`; `Clone`,
  `sessionToRow`/row→session mapping.
- `internal/session/railorder.go` — new, **pure**: `applyPin(sessions, id, pinned)` and
  `applyOrder(sessions, ids, pinnedCount)` returning the list of changed sessions (pure over
  a slice of `(id,pinned,railPos)` so unit tests need no store); `ErrUnknownSession` /
  `ErrInvalidOrder`.
- `internal/session/manager.go` — `CreateSession` assigns `RailPos = max+1` under the lock;
  `SetPinned(ctx,id,pinned)` and `SetOrder(ctx,ids,pinnedCount)` apply the pure functions,
  persist each changed row (`UpdateSession`), broadcast each changed session.
- `internal/server/sessionwire.go` — `pinned`, `railPos` on `sessionWire`; `toWireSession`.
- `internal/server/sessions.go` — `handlePinSession`, `handleSetOrder`.
- `internal/server/server.go` — two routes.
- `internal/server/prefs.go`, `internal/server/state.go` — `RailSort` on `PrefsInfo`,
  `prefsRequest`, validation, default `"manual"`.

### Web
- `web/index.html` — `#rail-sort` select; pin button in `session-card-template`.
- `web/src/protocol.ts` — `Session.pinned/railPos`; `RailSort`; `Prefs.railSort` (+ parse default).
- `web/src/api.ts` — `pinSession`, `putSessionOrder`; `PrefsRequest.railSort`.
- `web/src/sessions/sort.ts` — `orderRail(sessions, mode)` (keeps `sortSessions` as is).
- `web/src/sessions/railorder.ts` — new, pure `moveCard`.
- `web/src/sessions/card.ts` — `pinned` in the view-model.
- `web/src/render/sessions.ts` — pin button wiring, `pinned`/`pinned-last`/`draggable`
  attributes per card; `SessionAction` gains `"pin"`.
- `web/src/render/dragreorder.ts` — new generalised drag module; `web/src/render/tiledrag.ts`
  becomes a wrapper (public API unchanged).
- `web/src/render/tiles.ts` — `renderStrip` callers pass `orderRail`ed sessions (strip cards
  `draggable="false"`).
- `web/src/main.ts` — `railSort` state from prefs; `orderRail` at the three call sites
  (rail, strip, default focus); `installDragReorder` on `#sessions`; `#rail-sort`
  change handler; `pin` action dispatch.
- `web/src/style.css` — pin button, pinned block rule, drag feedback on `.card`.

### E2E (authored by e2e-specs; harness edits if needed are web-impl's — none expected)
- `web/e2e/rail-order.spec.ts` — new.

## Edge Cases

1. **Pin/order request while a `sessionUpsert` is in flight** — the client sends ids from
   its current render; the daemon applies against its truth. Unlisted new sessions are
   appended (REQ-4); a removed id in the list → 400, the UI ignores the error and the next
   snapshot/upserts stand. No optimistic reorder, so there is nothing to roll back.
2. **Drop on itself / drop outside any card / Escape** — no request (`moveCard` → `null`;
   `drop` never fires for a non-card target).
3. **Foreign drag** (a file, text from another app) over the rail — `dragover` is only
   claimed while a card drag from this container is in progress (as `tiledrag`).
4. **Drag in attention mode** — cards carry `draggable="false"`; no `dragstart` fires. If a
   drag started in manual mode and the pref flips to attention mid-drag (second window),
   the drop still sends the order the user saw; the daemon applies it; the attention view
   simply shows it in §3.4 order. Acceptable.
5. **Remove a pinned session** — it disappears; the rest keep their `railPos` (gaps are
   fine); `pinned-last` moves to the new last pinned card or disappears.
6. **Remove the focused card via a drag-free path** — unchanged (`focusedId` falls through
   to `orderRail(...)[0]`, which is now the top of the manual/attention order, not §3.4
   necessarily).
7. **Daemon restart** — `pinned`/`railPos` are rows; the snapshot carries them; order is
   identical after reconnect.
8. **Old daemon / new client mismatch during dev** — `parsePrefs` defaults `railSort`;
   `Session.pinned/railPos` are required on the wire (both ship together in this plan).
9. **Two windows** — window B sees the same order after A's drag through the upserts;
   B's `#rail-sort` follows A's toggle through the `prefs` broadcast.
10. **Ended session in manual mode** — stays put (REQ-7); can still be pinned/dragged;
    Resume leaves its slot alone (REQ-14).
11. **Hook loss / duplication / reordering, `/clear` rebinding, pane death** — none of these
    touch `pinned`/`railPos` (display-only columns, never read or written by the state
    machine or the status path — m3-gauges INV-1 style). Listed to record that the standing
    cases were considered and are orthogonal.
12. **`pinnedCount` larger than the listed pinned intent** — the request defines truth: the
    first `n` ids *become* pinned whatever they were; that is exactly how a drop across the
    boundary pins/unpins (REQ-11 computes `pinnedCount` from the result).
13. **Strip + pin** — pinning from the strip works the same (shared button/dispatcher); the
    strip re-sorts on the upsert; the grid is untouched.
14. **Click vs drag on a card** — a click (no movement) still fires the card's focus
    handler; a drag fires `dragstart` and not `click` in Chromium. E2E uses a real
    `dragTo`.

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e. One clause per
criterion.

### Daemon
- **D1**: `make test` passes.
- **D2**: `go build ./...` passes.
- **D3**: `make lint` passes.
- **D4**: migration `0006_rail_order.sql` adds `pinned` and `rail_pos` and backfills `rail_pos = id`.
- **D5**: a newly created session has `pinned=false` and `railPos` greater than every existing session's.
- **D6**: `PUT /api/sessions/{id}/pin {"pinned":true}` places the session at the bottom of the pinned block.
- **D7**: `PUT /api/sessions/{id}/pin {"pinned":false}` places the session at the top of the unpinned block.
- **D8**: a pin call that matches the current flag returns 204 and broadcasts nothing (INV-5).
- **D9**: `PUT /api/sessions/order` applies `ids`/`pinnedCount` as positions and flags.
- **D10**: `PUT /api/sessions/order` with an unknown or duplicate id returns 400 `invalid_request` and changes nothing.
- **D11**: `PUT /api/sessions/order` with `pinnedCount` outside `[0,len(ids)]` returns 400 and changes nothing.
- **D12**: sessions omitted from `ids` keep their flag and follow the listed ones in existing relative order.
- **D13**: INV-1 holds after every mutation from every starting configuration in the Invariants table (unit table test over `applyPin`/`applyOrder`, including bystanders).
- **D14**: INV-2 holds after every mutation in the same table.
- **D15**: only sessions whose `pinned` or `railPos` changed are broadcast on a pin/order call (INV-5).
- **D16**: `prefs.railSort` defaults to `"manual"`, accepts `manual|attention`, rejects anything else with 400.
- **D17**: `pinned`/`railPos` are never written by the state machine (`Apply`/`ApplyStatus`) — reviewer reads the code paths.
- **D18**: Remove leaves the remaining sessions' `pinned`/`railPos` unchanged.

### Web
- **W1**: `make web-build` passes.
- **W2**: `make web-test` passes.
- **W3**: `orderRail(_, "manual")` orders by `pinned` desc, `railPos` asc, `id` asc.
- **W4**: `orderRail(_, "manual")` is invariant under any change of `state`/`alive`/`attention`/`stateSince` (INV-3, every state).
- **W5**: `orderRail(_, "attention")` keeps every pinned session before every unpinned one from every state mix (INV-4).
- **W6**: `orderRail(_, "attention")` orders the unpinned group exactly as `sortSessions` does.
- **W7**: `moveCard` inserts the dragged session at the target's index with the target's `pinned` value, forward and backward, and returns the correct `pinnedCount`.
- **W8**: `moveCard` returns `null` for a self-drop or an absent id.
- **W9**: `orderRail` and `moveCard` never mutate their inputs.
- **W10**: no `any` types in new web code.
- **W11**: `dragreorder.ts` has no `Session`/store import (DOM-only, like `tiledrag.ts`).
- **W12**: `tiledrag.test.ts` passes unchanged.
- **W13**: the pin button's `aria-label`/`aria-pressed`/`title` follow `pinned` on build and on update.
- **W14**: the last pinned card in a container carries `pinned-last` and no other card does.
- **W15**: rail cards carry `draggable="true"` in manual mode and `draggable="false"` in attention mode.
- **W16**: strip cards never carry `draggable="true"`.
- **W17**: the pin button's click does not invoke the card's focus/promote handler.
- **W18**: the pin button and drop-target styling use only neutral tokens (no state colour) — reviewer reads `style.css`.

### E2E
- **E1**: `make e2e` passes.
- **E2**: three launched sessions appear in the rail in creation order (`data-session-id` ascending) with `Manual` selected.
- **E3**: dragging the third card onto the first card puts it first and shifts the others down.
- **E4**: after a reload the dragged order persists.
- **E5**: clicking `Pin` on a card moves it to the top, its button becomes `Unpin` with `aria-pressed=true`, and the card has class `pinned` and `pinned-last`.
- **E6**: pinning a second card places it below the first pinned card and moves `pinned-last` to it.
- **E7**: clicking `Unpin` on the first pinned card places it immediately after the remaining pinned card.
- **E8**: dragging an unpinned card onto a pinned card pins it at that position.
- **E9**: in manual mode a synthesized `Notification` making the bottom card `needs_input` leaves the rail order unchanged.
- **E10**: selecting `Attention` moves that `needs_input` card to the top of the unpinned group while pinned cards stay above it.
- **E11**: in attention mode rail cards have `draggable="false"`.
- **E12**: the `Attention` selection persists across a reload.
- **E13**: a second page sees the first page's pin and reorder without a reload.
- **E14**: in Tiles view the strip order matches the rail order minus live tiles.
- **E15**: clicking `Pin` does not change the focused session (the main terminal slot's session id is unchanged).
- **E16**: with the daemon stopped, a `Pin` click leaves the card unpinned and the rail order unchanged.

### Automated Checks

```checks
D1 make test
D2 go build ./...
D3 make lint
D4 rg -q "rail_pos" internal/store/migrations/0006_rail_order.sql
W1 make web-build
W2 make web-test
W11 ! rg -n "from \"../protocol\"|sessions/store" web/src/render/dragreorder.ts
E1 make e2e
```

Scope note for W11: the negative grep targets a single new file; no test file is in its net.
Dry run against this plan: the pattern `from "../protocol"` does not appear elsewhere in
this document in a form an agent would copy into `dragreorder.ts`.

### Reviewer-Verified

- **D5–D18** (behavioural; verified through the Go unit tests' presence and by reading
  `railorder.go`, `manager.go`, `prefs.go`).
- **W3–W10, W12–W18** (Vitest presence + reading `sort.ts`, `railorder.ts`,
  `render/sessions.ts`, `style.css`).
- **E2–E16** (Playwright spec presence, and `make e2e` green covers them).

## Implementation Notes

- **Authority / boundaries.** No Claude-Code-format knowledge is involved; nothing here
  reads terminal output. `pinned`/`railPos` are display-only columns — the state machine
  and status path must not touch them (D17), mirroring m3-gauges INV-1's discipline.
- **Daemon: compute order in the manager, not SQL.** The manager already holds every
  session in memory under `m.mu`; `applyPin`/`applyOrder` are pure functions over
  `[]struct{ID int64; Pinned bool; RailPos int64}` so the invariant table test (D13/D14) is
  a plain Go table test. Persist changed rows via the existing `UpdateSession`, then
  `broadcast` each (the server's `onUpsert` hook already fans out `sessionUpsert`).
  Renumbering strategy: simplest correct approach is to rebuild the whole list as
  `pinned block ++ unpinned block` and assign `railPos = index`, then diff against the old
  values and only persist/broadcast rows that changed — that satisfies INV-1/2/5 without
  clever gap arithmetic. `CreateSession`: `RailPos = max(existing)+1` (0 when none).
- **Routing.** Register `PUT /api/sessions/order` and `PUT /api/sessions/{id}/pin`; Go's
  mux prefers the literal segment so `order` is never parsed as an id. `parseSessionID`
  is the existing helper for the pin route.
- **Web: no optimistic reorder.** Both mutations round-trip; the rail redraws from the
  upserts. This keeps `render()` the single source of DOM order and avoids a rollback path.
  A 4xx/5xx from either call is logged via the existing `ApiResult` pattern and otherwise
  ignored (REQ-15).
- **Web: `tiledrag.ts` generalisation.** Keep the exported `installTileDrag(gridEl, onMove)`
  signature so `tiledrag.test.ts` stands (impl agents never edit tests). The shared module's
  `onMove` passes `(draggedId, targetId, focusedBeforeDrag)`; the rail's `main.ts` handler
  stores `focusedBeforeDrag` for the next `render()` the way the tiles path does
  (`pendingFocusRestore` or equivalent — read `main.ts` around `installTileDrag` first).
- **Web: `pinned-last`.** Set it inside `reconcileCards` after the reorder loop (it already
  walks the ordered sessions and has the elements) — the strip uses the same reconciler,
  so the strip's pinned block gets the same rule for free.
- **E2E fakes.** Sessions are launched via the existing helpers (`web/e2e/helpers/session.ts`
  / `payloads.ts`) with Claude Code faked by synthesized POSTs — no real `claude`. Reorder
  via Playwright `locator.dragTo()`; multi-window via a second `context.newPage()`.
- **Doc upkeep (orchestrator, not impl agents):** tick the TODO.md "Pre-v1 Cleanup" sidebar
  bullet; SPEC.md changelog entry "rail order is user-owned; §2.1's needs-input-first sort
  is now the rail's *attention* mode (default manual)"; ux-flows §3.4 gets a one-line note
  that the sort order described is the attention mode; protocol §3.3/§3.10/§3.11/§5.3 are
  merged at approval by `/plan-work`.
