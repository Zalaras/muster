# Plan: ui-text-and-focus

**Created**: 2026-09-03
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Closes**: #10, #16, #18, #19
**Description**: Four UI backlog items in one pass — a persistent "shown in the Focus pane"
marker on the rail card, a lifted dim-text floor on every theme, a tokenised type scale on a
15px base, and inline rename of a session from the Focus mainhead or a tile header, backed by
a daemon-owned title override.

## Overview

Damian pulled four open dashboard issues into one plan because three of them are one sweep
over `web/src/style.css` and the fourth is small. The measured starting points (2026-09-03,
`main` at `ed9fdc3`):

- **#16 Focus marker.** `focusedId` is `main.ts`-local and never reaches `reconcileCards`; the
  only cue a card has is CSS `:focus-within`, which vanishes as soon as the user clicks into the
  terminal. In Tiles the strip only ever shows sessions that are *not* live, so a "live in this
  view" marker would never render there. Decision (Damian, 2026-09-03): the marker means **"the
  session the Focus pane is showing"**, rendered on the rail only, as a neutral treatment (state
  colours are spoken for, design-system §3): `--bg-hover` ground + a 1px inset `--edge` ring +
  `aria-current="true"`. No word tag.
- **#18 Dim dark themes.** The AA gate passes while the metadata layer sits *at* the floor:
  Instrument `--fg-dim` on `--bg-hover` is 4.57:1, `--fg-muted` 5.52:1, `--idle` 4.51:1; Dark is
  4.64 / 5.93 / 4.63. Decision (**option A**, Damian, 2026-09-03, from a side-by-side mock): one
  higher floor for every theme — `--fg-muted` ≥ 8:1, `--fg-dim` ≥ 7:1, `--idle` and the four
  state hues as text ≥ 6:1, the two note tokens ≥ 7:1 — so Light moves too. The new values are
  tabulated under Implementation Notes and have been written into the two reference mockups
  during planning (they remain the design authority; `style.css` transcribes them verbatim).
- **#19 Type scale.** `style.css` carries 61 hardcoded `font-size` declarations across thirteen
  distinct values from 9px to 16px and no size tokens; `body` is 14px but almost nothing inherits
  it. Decision (Damian, 2026-09-03): a seven-step `--fs-*` ramp in rem anchored to one root size,
  and the root moves from 14px to **15px** (≈7% up, the whole ramp together). **No user-facing
  text-size control in this plan** — that becomes a post-release TODO item (a `prefs.textSize`
  enum with a Settings segmented control and a first-paint hint). The terminal keeps its own
  font: xterm's 12.5px in `web/src/terminal/pane.ts` is untouched.
- **#10 Rename.** Today `title` is written once from the launch form (`claude --name`) and then
  overwritten by the status line's `session_name` on every post; there is no rename route. The
  TODO asked for a `/spec` pass first; Damian pulled it in directly and the spec-level questions
  were settled in this interview: a **daemon-owned title override** (`title_override` column)
  that wins over the status line, exposed on the wire as `titleOverride`, with the wire `title`
  becoming the *display* title (override, else Claude's last-known name). The affordance is
  **inline click-to-edit on the title, in both views**: the Focus mainhead's heading and every
  tile's header name in Tiles (Damian, 2026-09-03: "I should be able to rename from the tile
  view"). One shared editor module serves both. Clearing the field reverts to Claude Code's own
  name. This amends SPEC §2.1's "Muster does not maintain its own ID→title mapping"
  — the launch form's `--name` still reaches Claude Code unchanged; only a post-launch rename is
  Muster-owned (see Implementation Notes → Doc upkeep).

## Requirements

### Must Have

**Focus marker (#16)**

- [ ] REQ-1: `reconcileCards` / `renderSessions` accept a `currentId: number | null`. The card
      whose session id equals `currentId` carries class `current` and `aria-current="true"`; every
      other card carries neither (the attribute is *removed*, not set to `"false"`). The rail
      passes `focusedId`; the Tiles strip passes `null`, so a strip card is never current.
- [ ] REQ-2: `.card.current` renders on `--bg-hover` with a 1px inset `--edge` ring (`outline:
      1px solid var(--edge); outline-offset: -1px`, or the box-shadow equivalent), and its
      `.acts-row` is fully visible (opacity 1) exactly as the hover/focus-within reveal already
      does — the reference mockup annotates that row "shown on hover / on the focused card". No
      state colour is used by the marker.
- [ ] REQ-3: The marker follows `focusedId` through every path that changes it: a rail-card click
      (pointer or Enter/Space), ⌘1–9, the default-focus fallthrough on load and after a removal,
      a drag reorder, a rail sort-mode toggle, and an ended session being focused. See INV-3.

**Dim-text lift (#18)**

- [ ] REQ-4: `web/scripts/contrast-pairs.json` minimums rise to: `--fg-muted` ≥ 8 on `--bg`,
      `--bg-raised`, `--bg-hover`, `--well`; `--fg-dim` ≥ 7 on the same four; `--idle`, `--amber`,
      `--rose`, `--violet`, `--teal` ≥ 6 on `--bg-raised` and `--bg-hover`; `--amber-note` and
      `--rose-note` ≥ 7 on `--bg-raised` and `--bg-hover`. Every other pair keeps its current
      minimum. The `_comment` cites this plan.
- [ ] REQ-5: The three theme blocks in `web/src/style.css` transcribe the lifted values verbatim
      from the re-cut mockups (`docs/design/mockups/a-instrument.html`, `d-tiled.html` — table
      under Implementation Notes → Palettes). Only the tokens in that table change; hue bands and
      the `--idle` saturation ceiling still hold; `make contrast` passes.

**Type scale (#19)**

- [ ] REQ-6: A type ramp of seven size tokens is declared on the bare `:root` block that already
      holds the font stacks (theme-independent): `--fs-root` (15px), `--fs-2xs` (0.68rem),
      `--fs-xs` (0.75rem), `--fs-sm` (0.82rem), `--fs-md` (0.89rem), `--fs-base` (1rem),
      `--fs-lg` (1.07rem), `--fs-xl` (1.14rem). `html` sets its font size to `var(--fs-root)`;
      `body` sets its font size to `var(--fs-base)`.
- [ ] REQ-7: Every `font-size` declaration in `web/src/style.css` other than the token block and
      the `html` rule references a `--fs-*` token; no numeric `font-size` literal (px, rem, em, %)
      remains. The mapping from today's literals is fixed under Implementation Notes → Ramp
      mapping (13 literals → 7 tokens); nothing is re-judged per rule.
- [ ] REQ-8: `web/src/terminal/pane.ts`'s xterm `fontSize: 12.5` / `lineHeight: 1.65` are
      **unchanged** — the terminal is Claude Code's surface (design-system §2/§7.5), not part of
      the ramp.

**Rename (#10)**

- [ ] REQ-9: New column `session.title_override TEXT` (nullable) via forward-only migration
      `0007_title_override.sql`. Loaded on startup with the row; persisted by every session write
      path that persists `title`.
- [ ] REQ-10: New endpoint `PUT /api/sessions/{id}/title` (Protocol Contract §3.15). Body
      `{"title": "<string>"}` sets the override (1–100 characters after trimming, counted in
      runes); `{"title": null}` clears it. → `204`. Broadcasts one `sessionUpsert` iff the wire
      `title` or `titleOverride` changed; no broadcast on a no-op.
- [ ] REQ-11: Wire `title` becomes the **display title**: `titleOverride` when non-null, else
      Claude's last-known name (the existing `title` column), else `null`. New wire field
      `titleOverride: string | null`. The daemon owns this precedence; no client computes it.
- [ ] REQ-12: Status-line posts continue to refresh Claude's name into the existing `title`
      column, and **never** read or write `title_override`. While an override is set, a status
      post that changes only Claude's name persists the row but broadcasts nothing (the wire
      object is unchanged — §5.3's no-no-op-upserts rule stands). See INV-1/INV-2.
- [ ] REQ-13: The session title is a rename trigger on two surfaces, with identical behaviour
      from one shared editor module (`web/src/render/rename.ts`): **(a)** the Focus mainhead —
      `<h2 class="name"><button type="button" class="rename" title="Rename">…</button></h2>`;
      **(b)** every tile header in Tiles — `.thead .nm` wraps the same `<button type="button"
      class="rename" title="Rename">`. The button's text is the display title (or `untitled`).
      Activating it (click, Enter, Space) swaps the container's content for `<input type="text"
      class="name-edit" aria-label="Session title" maxlength="100">` prefilled with the display
      title (empty when untitled), focused, with its text selected. While a tile's edit is open
      its `.thead` carries `draggable="false"` (restored to `"true"` on close) so typing and
      selecting in the field never starts a grid drag; a plain click on the button fires no
      `dragstart`, so click-to-rename and drag-to-reorder coexist on the same header.
- [ ] REQ-14: Commit and cancel semantics, decided by a pure function (`web/src/sessions/
      rename.ts`, `titleCommand(input, session)`): **Enter** or **blur** commits; **Escape**
      cancels. Commit trims the input, then: equal to the current display title → no request;
      empty → `{"title": null}` if `titleOverride` is non-null, else no request; anything else →
      `{"title": <trimmed>}`. The input is replaced by the heading button immediately on commit
      or cancel; the heading shows the last **broadcast** title (the UI never writes the title
      locally — same shape as INV-7 for `prefs.theme`).
- [ ] REQ-15: The 1s render tick and any `sessionUpsert` arriving mid-edit leave the open input
      untouched (its value, focus and selection) on both surfaces: `renderMainhead` and
      `updateTileChrome` skip the title write while the container is marked
      `data-editing="true"` by the editor. In Focus, if the focused session changes mid-edit
      (⌘1–9, rail click, removal fallthrough) the mainhead edit is **cancelled** with no request.
      In Tiles, a tile that leaves the grid mid-edit (demotion, removal, view switch) has its
      edit cancelled with no request before the tile element is detached.
- [ ] REQ-16: A rename works on a dead session too (display-only field; `alive` is irrelevant).
      A rename of an unknown id is a `404 unknown_session`; a failed request surfaces through the
      same fire-and-forget failure path `pinSession` uses in `main.ts`, and the heading keeps its
      broadcast title.

### Should Have

- [ ] REQ-17: `docs/design/design-system.md` §1 records the new contrast floors (replacing the
      "≥ 4.5:1 for every text pair" sentence with the tiered floors from REQ-4), §2's type-roles
      table names the `--fs-*` token per role beside its px value at the 15px root, and §5's
      rail-card entry gains the `current` treatment.
- [ ] REQ-18: The design-system §1 statement that `style.css` transcribes the mockups verbatim
      stays true: both mockups already carry the lifted palette (done in planning); web-impl
      copies, never re-derives.

### Nice to Have

- [ ] REQ-19: The heading button's `title` tooltip reads `Rename · clear to use Claude Code's
      name` so the revert path is discoverable without documentation.

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval).

### §5.3 The Session object — two field changes

```jsonc
{
  "title": "flaky-e2e-hunt",        // DISPLAY title: titleOverride when non-null, else the last-known
                                    //   status-line session_name (launch --name until then), else null
  "titleOverride": null,            // string | null — the user's rename via PUT .../title; null = none.
                                    //   Never touched by status posts, rebinds, resume or reconcile.
  // … every other field unchanged
}
```

Precedence is the daemon's: a client renders `title` and reads `titleOverride` only to decide
whether "clear" means anything. M3's "`title` refreshes from the status line's session name
whenever present" now reads: **Claude's name** refreshes from the status line whenever present;
the wire `title` reflects it only while `titleOverride` is null.

### HTTP: PUT /api/sessions/{id}/title (Pre-v1 — `ui-text-and-focus`, 2026-09-03) → §3.15

**Auth**: UI cookie (401 `unauthorized` without it).
**Request:**
```json
{ "title": "string | null — 1–100 characters after trimming (runes), or null to clear the override" }
```
The `title` key is **required** (absent key ≠ null). Leading/trailing whitespace is trimmed
before validation and storage.
**Response 204:** no body. Every UI socket receives one `sessionUpsert` for the session iff the
wire `title` or `titleOverride` changed; a request that leaves both as they were is a `204` with
no broadcast.
**Errors** (all in the §2 envelope):
- 400 `invalid_request` — body not JSON, `title` key missing, `title` neither string nor null, or
  the trimmed string empty / longer than 100 runes:
  ```json
  { "error": { "code": "invalid_request", "message": "title must be null or 1-100 characters after trimming" } }
  ```
- 404 `unknown_session`:
  ```json
  { "error": { "code": "unknown_session", "message": "unknown session id" } }
  ```

No WS message types are added or changed beyond the two §5.3 fields (which ride the existing
`snapshot` and `sessionUpsert`). No `prefs` change.

## Schema Changes

`internal/store/migrations/0007_title_override.sql`:

```sql
-- Pre-v1 (plan ui-text-and-focus, 2026-09-03): the user's rename. Display-only; wins over
-- the status line's session_name in the wire title. Never read by the state machine.
ALTER TABLE session ADD COLUMN title_override TEXT;
```

Nullable, no default, no backfill (every existing row has no override). The existing `title`
column keeps its meaning (Claude's last-known name).

## UI Specifications

### Views

- **Focus — rail**: the card for `focusedId` carries `class="card … current"` and
  `aria-current="true"`; `--bg-hover` ground, 1px inset `--edge` ring, action row visible.
  Exactly one card is current whenever the rail is non-empty (INV-3).
- **Focus — mainhead**: `<h2 class="name">` wraps a `<button type="button" class="rename">`
  whose text is the display title. Activation swaps in `<input class="name-edit"
  aria-label="Session title" maxlength="100">` inside the same `<h2>`. The `.meta` line and
  End/Resume/Remove buttons are unchanged.
- **Tiles — tiles**: each `.thead .nm` wraps the same rename button; activation swaps in the
  same `input.name-edit`. The header stays the drag handle for a drag that starts anywhere on
  it, including on the button; while editing, the header is `draggable="false"`. Dead tiles
  keep the trigger (display-only field).
- **Tiles — strip**: unchanged markup; never `current`; no rename trigger (a strip card's click
  promotes — promote the session and rename it on its tile).
- **All views**: every text size comes from the ramp; the root is 15px. Visually the whole
  chrome grows ≈7%; nothing is re-laid-out by hand. The masthead must still fit on one row at
  1280px wide (Reviewer-Verified W9).

### User Flows

1. **See which session the pane shows.** Open the dashboard in Focus. The top card of the rail
   is current (default focus). Click another card → it becomes current, the previous one loses
   the ring and attribute, the pane switches. Click into the terminal → the marker stays.
2. **Rename.** Click the mainhead title → it becomes a text field with the title selected. Type
   `hunting flake` and press Enter → the field closes, and on the next broadcast (immediate on
   localhost) the mainhead, the rail card and — in Tiles — the tile header and strip card all
   read `hunting flake`. A later status-line post carrying `session_name: "Run echo hello"`
   changes nothing visible.
3. **Revert to Claude's name.** Click the title, select all, delete, press Enter → the override
   clears; the title becomes Claude's last-known name (or `untitled` if none was ever learned).
4. **Cancel.** Click the title, type anything, press Escape → field closes, no request, title
   unchanged.
5. **Interrupted edit.** Start editing, press ⌘2 → the edit is cancelled (no request), the pane
   and mainhead switch to session 2.
6. **Rename from Tiles.** Switch to Tiles. Click a live tile's header name → it becomes a text
   field inside the header (the header no longer drags). Type and press Enter → the tile
   header, the strip cards and — back in Focus — the rail card and mainhead all read the new
   name. Dragging the header by its name without editing still reorders the grid.

### States

- **No data yet**: no sessions → no rail cards → nothing is current; the mainhead is hidden
  (existing). A session with `title: null` shows `untitled` on the card and the mainhead button;
  the edit field opens empty.
- **Daemon down**: the rename button is disabled while the WS is disconnected (same `connected`
  gate as End/Resume/Remove); an edit already open when the connection drops is cancelled on the
  next render. The marker keeps rendering from the last-known `focusedId`.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Current rail card | — | `[data-testid="session-card"][aria-current="true"]` | exactly one in `#sessions` when non-empty; zero in `#tiles-strip` |
| Any rail card | — | `data-testid="session-card"`, contains the title text | existing helper `sessionCard()` |
| Mainhead heading | `heading` | the display title, or `untitled` | `#mainhead h2.name`; level 2 |
| Rename trigger | `button` | the display title, or `untitled` | inside the heading; `title="Rename"` tooltip (REQ-19 may extend the tooltip text; the accessible name is the button's text either way) |
| Rename field | `textbox` | `Session title` | `aria-label`; present only while editing; `maxlength="100"`; at most one open at a time per surface the test drives |
| Tile rename trigger (Tiles) | `button` | the display title, or `untitled` | inside `.tile .thead .nm`; scope the locator to the tile (`article` role, or `[data-session-id]`) — two tiles may share a title. The mainhead is hidden in Tiles so its button never collides |
| Tile header (drag handle) | — | `.tile .thead[draggable]` | `"true"` at rest, `"false"` while that tile's edit is open |

### Invariants

- **INV-1 (display precedence)**: on every Session object that leaves the daemon (`snapshot`,
  `sessionUpsert`), `title == titleOverride` whenever `titleOverride != null`. Must hold after
  each of: launch, `SessionStart` bind, `/clear` rebind, resume rebind, a status post carrying a
  different `session_name`, a status post carrying no `session_name`, the liveness sweep marking
  the session dead, daemon restart (row reload), and `PUT …/title` itself.
- **INV-2 (status posts never touch the override)**: `applyStatusUpdate` has no path to
  `TitleOverride`; a status post received while an override is set changes `titleOverride` for
  no session, regardless of state (`started`, `working`, `needs_input`, `failed`, `idle`, dead).
- **INV-3 (one current card)**: in Focus with ≥1 session, exactly one `#sessions` card has
  `aria-current="true"` and its `data-session-id` equals `focusedId`; `#tiles-strip` never has
  one. Must hold after every path listed in REQ-3, with **other sessions present** (a reorder
  that moves the current card must not leave a stale attribute on the card that took its slot).
- **INV-4 (edit isolation)**: while the rename field is open, no render tick or `sessionUpsert`
  changes the field's value, and the only requests the client sends on its behalf are the single
  PUT produced by a commit.

### Carried-over measurements

None of this plan's values were measured under a different configuration. The contrast ratios
in Overview/Palettes were computed for the current theme blocks by the same WCAG 2.x formula
`contrast.mjs` implements, against the surfaces those tokens actually sit on; `make contrast`
re-verifies them at build time.

## Affected Files

### Daemon
- `internal/store/migrations/0007_title_override.sql` — new column (Schema Changes).
- `internal/store/session.go` — `TitleOverride *string` on the row struct; insert/update/scan
  include `title_override`.
- `internal/session/session.go` — `TitleOverride *string` on `Session`; a `DisplayTitle()
  *string` helper implementing REQ-11's precedence (pure, unit-testable).
- `internal/session/manager.go` — `SetTitle(ctx, id, title *string) (changed bool, err error)`:
  under the lock, set/clear `TitleOverride`, compute whether the wire title or override changed,
  persist, broadcast only on change; `ErrUnknownSession` for a missing id. `sessionToRow` /
  row→session mapping carry the new field. `ApplyStatus` gains the REQ-12 rule: persist when
  Claude's name changed, broadcast only when `DisplayTitle()` (or model/context) changed.
- `internal/session/status.go` — unchanged logic; the INV-2 comment is updated to name
  `TitleOverride` among the fields it never reaches.
- `internal/server/sessionwire.go` — `Title` populated from `DisplayTitle()`; new
  `TitleOverride *string \`json:"titleOverride"\``.
- `internal/server/sessions.go` — `setTitleRequest` (with a `json.RawMessage`/pointer-to-pointer
  so "absent" and "null" are distinguishable) and `handleSetTitle`; 400/404/204 per §3.15.
- `internal/server/server.go` — register `PUT /api/sessions/{id}/title` beside `/pin`.

### Web
- `web/src/style.css` — REQ-2 `.card.current` rules; REQ-5 theme-block values; REQ-6 ramp tokens
  on the bare `:root`, `html`/`body` sizes; REQ-7 all 61 `font-size` declarations → tokens
  (mapping below); `.mainhead .name .rename` (inherits the heading's font, no button chrome:
  transparent ground, no border, inherits colour, `cursor: text`) and `.name-edit` (a `--well`
  ground, 1px `--edge` border, the heading's font and size).
- `web/scripts/contrast-pairs.json` — REQ-4 minimums.
- `web/index.html` — mainhead heading wraps the rename button (REQ-13). The input is created by
  code, not a template.
- `web/src/protocol.ts` — `titleOverride: string | null` on `Session`; `parseSession` requires it
  (`null` or string; anything else rejects the object, matching the existing strictness).
- `web/src/api.ts` — `putTitle(id: number, title: string | null): Promise<ApiResult<null>>`,
  the `pinSession` shape.
- `web/src/sessions/rename.ts` — **new, pure**: `titleCommand(input: string, session:
  Pick<Session, "title" | "titleOverride">): { kind: "noop" } | { kind: "set"; title: string } |
  { kind: "clear" }` per REQ-14.
- `web/src/render/sessions.ts` — `currentId` parameter threaded through `renderSessions` →
  `reconcileCards` → `updateSessionCardElement` / `buildSessionCardElement` →
  `updateSessionCardContent` (class + `aria-current` set/removed).
- `web/src/render/rename.ts` — **new, shared**: `attachRenameEditor(container: HTMLElement,
  handlers: { getSession: () => Session | null; onCommit: (id: number, command) => void })`
  returning `{ open(), cancel(), isEditing(), setEnabled(boolean), dispose() }`. Owns the
  button↔input swap inside `container`, key handling (Enter/blur commit, Escape cancel), the
  `data-editing` marker on `container`, the Enter-then-blur double-commit guard, and — when
  `container` sits inside a `.thead` — the `draggable` flip. Modelled on `render/settings.ts`'s
  controller shape; DOM only, no transport.
- `web/src/render/tiles.ts` — `renderStrip` passes `null` for `currentId`. `buildTile` wraps
  `.nm`'s text in the rename button and attaches one editor per tile (returned on `TileRefs` as
  `rename` so main.ts can `cancel()`/`dispose()` on demotion and `setEnabled` on connection
  change); `updateTileChrome` skips the name write while `nm.dataset.editing === "true"`.
- `web/src/render/mainhead.ts` — `MainheadElements` gains `renameBtn`; `renderMainhead` skips the
  title write while `nameEl.dataset.editing === "true"` and toggles the button's `disabled` with
  `connected`. The mainhead's editor is attached once at startup by main.ts via `rename.ts`.
- `web/src/main.ts` — passes `focusedId` to `renderSessions`; attaches the mainhead editor and
  routes every editor's commit (mainhead and tiles) through one handler (`set`/`clear` →
  `putTitle`, failure → the pin-failure path); cancels the mainhead edit whenever `focusedId`
  changes or the WS disconnects; cancels a tile's edit before `reconcileTilesGrid` detaches it.
- `docs/design/design-system.md` — REQ-17.
- `web/src/render/sessions.test.ts` — **web-tests only**: the `FakeDomNode` shim may need
  `removeAttribute`/`hasAttribute` for INV-3 assertions; that edit is the test agent's.

### E2E (e2e-specs)
- `web/e2e/focus-marker.spec.ts`, `web/e2e/rename.spec.ts`, `web/e2e/type-scale.spec.ts` — new.
- `web/e2e/helpers/session.ts` — helpers for the current card, the mainhead heading/button/field,
  and a tile-scoped rename button/field.

## Edge Cases

1. **Status post with a different `session_name` while an override is set** (INV-1/INV-2): the
   `title` column updates and persists; `titleOverride` and the wire `title` are unchanged; no
   `sessionUpsert` is sent for the title (one may still go out if model/context changed — then
   its `title` is the override).
2. **Clear when Claude never sent a name**: `PUT {"title": null}` on a session whose `title`
   column is null → wire `title: null`, card and mainhead show `untitled`; still a `204` and (if
   an override existed) one broadcast.
3. **Clear when no override exists**: `204`, no broadcast (no-op). The client's `titleCommand`
   already avoids sending this; the daemon still handles it.
4. **Set to the same string as the current override**: `204`, no broadcast.
5. **Set to a string equal to Claude's current name while no override exists**: the override is
   stored (wire `titleOverride` now non-null, wire `title` unchanged) → one broadcast, because
   `titleOverride` changed. Later renames by Claude Code (`/rename`) no longer show through —
   that is the user's explicit choice.
6. **`/clear` rebind and resume rebind** (§4.2 late arrivals included): neither path touches
   `TitleOverride`. `SessionEnd(clear)` for the old id arriving after `SessionStart(clear)` has
   rebound: the override is still on the Muster session (keyed by tmux target), INV-1 holds on
   the resulting upsert.
7. **Daemon restart mid-session**: `title_override` loads with the row; the first `snapshot`
   already applies precedence.
8. **Rename a dead session**: allowed; the card's ended styling and Resume/Remove are unaffected.
9. **Whitespace-only input**: trimmed to empty → treated as "clear" (client) / `400` if sent as a
   non-empty whitespace string (the daemon trims first, so it is empty → 400 only if the client
   bypasses `titleCommand`).
10. **101+ characters**: the input's `maxlength` stops it client-side; the daemon still returns
    `400` for a direct request.
11. **Blur caused by the commit itself**: Enter → commit → the input is removed → its blur fires.
    The controller must guard against a second commit from that blur (a `committed` flag or
    removing the listener before swapping).
12. **Focus change mid-edit** (REQ-15): the controller's `cancel()` runs before `render()` on any
    `focusedId` change; the pointer path's `surfaces.get(id)?.focus()` then moves keyboard focus
    into the new pane as today.
13. **Reorder while current**: a manual-mode drag or an attention-sort re-rank moves the current
    card; `reconcileCards` re-applies the attribute per card every pass, so no card keeps a stale
    `aria-current` (INV-3 with bystanders).
14. **Strip card promoted in Tiles**: no marker anywhere in Tiles; switching back to Focus shows
    the marker on `focusedId`'s card (the Focus fallthrough sets it if it no longer exists).
15. **Hook loss/duplication/reordering** does not reach this plan's state: neither the marker nor
    the override is derived from hooks. Duplicate `PUT`s are idempotent (edge cases 3–4).
16. **Click vs drag on a tile header**: a mousedown on the rename button followed by movement
    fires `dragstart` on the header (the button is its child) and the browser suppresses the
    `click`; no edit opens. A mousedown+mouseup without movement fires `click` and no
    `dragstart`; the edit opens. No code distinguishes the two — the platform does.
17. **Drag attempt while a tile edit is open**: that header is `draggable="false"`, so
    `dragreorder.ts` never starts a drag from it; other tiles still drag, and the drag's
    initiating mousedown blurs the open field, which commits it (blur commits — a no-op if the
    text is unchanged).
18. **Tile leaves the grid mid-edit** (demotion by a promote, removal, ⌘\ to Focus): main.ts
    cancels the edit before the node is detached, so the detach-blur never reaches a live
    listener and no request is sent. The typed text is lost — acceptable; it was not committed.
19. **Two tiles, both titles `untitled`**: two rename buttons share an accessible name; every
    locator is tile-scoped (Testable UI Elements), and the editor is per-container, so opening
    one never touches the other.
20. **Type ramp and fixed-width chrome**: masthead gauge labels, the segmented controls and the
    tile footer are the places a 7% growth could wrap. Reviewer-Verified W9 checks 1280px; the
    fix, if any is needed, is a width token, never a per-rule px font size.

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e. One clause per
criterion; never mix a runnable command with a judgement call in one item.

### Daemon
- **D1**: `make test` passes.
- **D2**: `go build ./...` succeeds.
- **D3**: `make lint` passes.
- **D4**: A unit test covers `DisplayTitle()` for all four cells: override × Claude-name each
  null/non-null.
- **D5**: A table-driven unit test asserts INV-1 after every source state listed in the
  Invariants section (including a `/clear` rebind and a status post with a different
  `session_name`).
- **D6**: A unit test asserts INV-2: a status update carrying a `session_name` leaves
  `TitleOverride` untouched from every displayed state and from `alive:false`.
- **D7**: A unit test asserts `SetTitle` broadcasts exactly once when the display title or
  override changes and zero times for edge cases 3 and 4.
- **D8**: A handler test asserts `PUT …/title` distinguishes an absent `title` key (400) from
  `"title": null` (204) and returns the §3.15 error envelope for each 400 case and for 404.
- **D9**: A store round-trip test asserts `title_override` survives insert → update → load.
- **D10**: `ApplyStatus` with an override set and a changed Claude name persists the row and does
  not broadcast (unit test with a counting broadcaster).

### Web
- **W1**: `make web-build` succeeds.
- **W2**: `make web-test` passes.
- **W3**: `make contrast` passes with the REQ-4 minimums in place.
- **W4**: No numeric `font-size` literal remains in `web/src/style.css` (see Automated Checks).
- **W5**: A Vitest test covers `titleCommand` for every REQ-14 branch (same title → noop; empty
  with override → clear; empty without override → noop; new string → set; whitespace trimming).
- **W6**: A Vitest test asserts INV-3 through `reconcileCards`: with three sessions, only the
  `currentId` card has `aria-current="true"`; after a reorder that moves the current card, still
  exactly one; with `currentId: null`, none.
- **W7**: A Vitest test asserts `parseSession` accepts `titleOverride: null` and a string and
  rejects a missing or numeric `titleOverride`.
- **W12**: A Vitest test (under the `FakeDomNode` convention `tiles.test.ts` already uses)
  asserts `updateTileChrome` leaves `.nm`'s content untouched while `nm.dataset.editing` is
  `"true"` and writes the title once it is cleared.
- **W8**: `pane.ts` still passes `fontSize: 12.5` and `lineHeight: 1.65` to xterm (Reviewer-
  Verified by reading; W-check below greps for the literal).
- **W9**: At a 1280×800 viewport in Focus with two sessions, the masthead occupies one row and
  no gauge label or button text wraps or clips (Reviewer-Verified in a browser).
- **W10**: The lifted values in `style.css` equal the mockups' blocks byte-for-byte for the
  tokens in the Palettes table (Reviewer-Verified by diff of the two token lists).
- **W11**: `docs/design/design-system.md` states the REQ-4 floors and names the `--fs-*` token
  per type role (Reviewer-Verified).

### E2E
- **E1**: In Focus with two launched sessions, the top rail card has `aria-current="true"` and
  the other does not; clicking the second card moves the attribute to it and removes it from the
  first.
- **E2**: After E1's click, clicking into the terminal region leaves the second card current.
- **E3**: Switching to Tiles shows no `aria-current` card in `#tiles-strip`; switching back to
  Focus shows exactly one in `#sessions`.
- **E4**: Clicking the mainhead title button opens a textbox named `Session title` prefilled with
  the current title and focused; typing a new name and pressing Enter closes the field, and the
  mainhead heading, the rail card and `GET` state (`title` and `titleOverride`) all show the new
  name.
- **E5**: After E4, a status-line post for that session carrying a different `session_name`
  leaves the mainhead heading and the rail card unchanged.
- **E6**: After E5, opening the field, clearing it and pressing Enter shows the `session_name`
  from E5's post as the title, and `GET` state shows `titleOverride: null`.
- **E7**: Opening the field, typing, and pressing Escape closes it with the title unchanged and
  no `PUT …/title` request observed.
- **E8**: With an override set, a daemon restart plus reload still shows the override on the
  mainhead and the rail card.
- **E9**: In Tiles, the promoted tile's header and the strip cards show the override title.
- **E10**: `getComputedStyle(document.documentElement).fontSize` is `15px` and the rail card
  title's computed font size equals `15px` (the `--fs-base` step) on a fresh load.
- **E11**: In Tiles, clicking a live tile's header name opens a textbox named `Session title`
  inside that tile; typing a new name and pressing Enter closes it, and the tile header, the
  other tiles' strip/rail cards and `GET` state show the new name.
- **E12**: While E11's field is open, that tile's `.thead` has `draggable="false"`; after Enter
  it is `"true"` again.
- **E13**: In Tiles with two live tiles, a header drag of the first tile onto the second
  (existing `rail-order`/tiles drag helpers) still reorders the grid and opens no textbox.

### Automated Checks

Every line below is `<ID> <single-line shell command>`, run from the project root. A check passes
iff its command exits 0.

```checks
D1 make test
D2 go build ./...
D3 make lint
W1 make web-build
W2 make web-test
W3 make contrast
W4 ! rg -n -e "font-size:\s*[0-9.]+(px|rem|em|%)" web/src/style.css
W8 rg -q -e "fontSize: 12.5" web/src/terminal/pane.ts
E1 make e2e
```

Notes on the negative check: **W4** scopes to `web/src/style.css` only, so test files and the
mockups are outside its net by construction (mockups keep their own literals — they are renders,
not the shipped stylesheet). Dry-run at planning against the tree: 61 hits, all in `style.css`,
all owned by web-impl under REQ-7. Dry-run against this plan document: the plan spells sizes as
"15px" or "0.75rem" beside a token name, never in the `font-size: <number>` form the pattern
matches (verified with the same `rg` at planning time).

### Reviewer-Verified

- **D4–D10**: present and named as described (read the test files).
- **W5–W7, W12**: present and named as described.
- **W8**: `pane.ts` xterm options unchanged beyond the automated grep (no new `fontSize` writes).
- **W9**: 1280px masthead layout.
- **W10**: mockup ↔ `style.css` token equality for the Palettes table.
- **W11**: design-system §1/§2/§5 text.
- **No `any` types** in new web code; **no colour literal** outside the theme blocks (`make
  contrast` also enforces this).
- **REQ-12/INV-2** by reading `status.go`: no path to `TitleOverride`.
- **REQ-8**: the terminal's visual size is unchanged (compare a pane before/after; the ramp
  touched nothing xterm draws).

## Implementation Notes

### Palettes (REQ-5) — lifted values, transcribed from the re-cut mockups

Only these tokens change; every other token in every theme is untouched. Ratios are the
minimum over the surfaces the gate checks for that token.

| Token | Instrument | Dark | Light |
|---|---|---|---|
| `--fg-muted` | `#9096a8` → `#b2b6c3` (8.05) | `#a3a9b4` → `#c1c5cc` (8.08) | `#585d6b` → `#41454f` (8.11) |
| `--fg-dim` | `#8087a0` → `#a6abbc` (7.12) | `#8e95a1` → `#b4b8c0` (7.04) | `#61667a` → `#494d5c` (7.10) |
| `--idle` | `#7f869e` → `#989db1` (6.05) | `#8c95a4` → `#a4abb7` (6.06) | `#656a7a` → `#535764` (6.09) |
| `--amber` | unchanged `#f2a33c` (7.83) | unchanged `#e6a642` (6.60) | `#9d5600` → `#844800` (6.10) |
| `--rose` | `#e36a6a` → `#e77f7f` (6.01) | `#ef7079` → `#f28e95` (6.05) | `#c0323c` → `#a22a33` (6.09) |
| `--violet` | `#9a8cf0` → `#9e91f1` (6.04) | `#a99cf5` → `#ada1f5` (6.13) | `#6a4fd6` → `#583ad1` (6.04) |
| `--teal` | unchanged `#56c5d0` (7.99) | unchanged `#4fcbc6` (7.13) | `#0c737a` → `#0a6167` (6.08) |
| `--amber-note` | unchanged `#f5cc93` (10.82) | unchanged `#f2cf95` (9.42) | `#7a4400` → `#754100` (7.07) |
| `--rose-note` | unchanged `#f1b0b0` (8.99) | unchanged `#f5b7bb` (8.25) | `#962c34` → `#8e2a31` (7.03) |

Hue check on the moved state tokens: amber 33–37°, rose 356–0°, violet 248–252°, teal 178–185°
— inside their bands; `--idle` saturation 9–14% (ceiling 20%). The `--fg-dim`/`--fg-muted` gap
narrows on the dark themes (7.1 vs 8.1) — deliberate; the hierarchy is carried by size and
family as much as by shade. The `--amber-fg`/`--danger-fg` pairs and `--edge` are untouched.

### Ramp mapping (REQ-7)

| Today's literal | Token | At 15px root |
|---|---|---|
| 9px, 9.5px | `--fs-2xs` (0.68rem) | 10.2px |
| 10px, 10.5px | `--fs-xs` (0.75rem) | 11.25px |
| 11px, 11.5px | `--fs-sm` (0.82rem) | 12.3px |
| 12px, 12.5px | `--fs-md` (0.89rem) | 13.35px |
| 13.5px, 14px | `--fs-base` (1rem) | 15px |
| 14.5px, 15px | `--fs-lg` (1.07rem) | 16.05px |
| 16px | `--fs-xl` (1.14rem) | 17.1px |

Apply mechanically: each of the 61 declarations takes the token for its literal. Do not
re-judge which step a rule "deserves" — one pass, one table. Two adjacent literals collapsing
onto one step (9 and 9.5, 13.5 and 14, …) is the intended flattening. `letter-spacing` values
in `em` scale for free; paddings stay in px. `.terminal-body` / xterm containers: if any
`font-size` there is in `style.css`, it takes the table's token — xterm sets its own inline
size and is unaffected (REQ-8).

### Marker (REQ-1/REQ-2)

`updateSessionCardContent` composes the `className` string already; append ` current` and call
`card.setAttribute("aria-current", "true")` / `card.removeAttribute("aria-current")`. Keep the
hover rule as-is; `.card.current` sits after `.card:hover` so both resolve to `--bg-hover`.
The strip's `.strip .card` overrides (`border-left` stripe) are unaffected because the strip
never passes a current id.

### Rename editor (REQ-13–16)

Keep DOM and transport apart as `settings.ts` does: `render/rename.ts` owns the swap and key
handling and reports a `titleCommand` result; `main.ts` turns `set`/`clear` into
`putTitle(...)`. The editor marks its container `data-editing="true"` while open; the two
per-tick writers (`renderMainhead`, `updateTileChrome`) read that flag and skip the title write,
so neither needs to know an editor exists. On `focusedId` change `main.ts` calls the mainhead
editor's `cancel()` **before** `render()`; on tile demotion it calls that tile's `cancel()`
before `reconcileTilesGrid` detaches the node. Guard the Enter-then-blur double commit (edge
case 11). The button is `disabled` while `!connected`, like the mainhead's three siblings; the
tile's rename button follows the same `connected` flag main.ts already threads into
`renderTileFooterActions`. The header's `draggable` flip is the editor's job (it knows when the
edit opens and closes); `dragreorder.ts` already honours `draggable="false"` — no change there.

### Daemon

Distinguish absent vs null in the request with `json.RawMessage` (or `**string`): decode into a
struct with `Title json.RawMessage`; `len(raw)==0` → 400; `string(raw)=="null"` → clear; else
unmarshal a string. Trim with `strings.TrimSpace`; count with `utf8.RuneCountInString` (same
rule the issue handler uses for its 200-char title). `SetTitle` computes "changed" from the pair
(`DisplayTitle()`, `TitleOverride`) before and after, under the lock, and calls the existing
broadcast helper only when either differs.

### Doc upkeep (orchestrator)

- `SPEC.md` §2.1: amend the "Muster does not maintain its own ID→title mapping" bullet to record
  the post-launch override (launch `--name` still reaches Claude Code; a rename from the
  dashboard is Muster-owned and wins over `session_name`); add a §11 changelog entry dated
  2026-09-03 for this plan citing #10/#16/#18/#19 and the option-A floors.
- `TODO.md`: tick #10, #16, #18, #19 with the plan name; **append one new item** under
  "Post-release": *Text-size setting — `prefs.textSize` enum (`small | medium | large`), a
  Settings-dialog segmented control beside Theme, `<html data-text-size>` driving `--fs-root`,
  and the first-paint hint extended so a reload doesn't flash. Deferred from `ui-text-and-focus`
  (Damian, 2026-09-03): tokens first, control later.*
- `docs/protocol.md`: the §3.15 and §5.3 deltas above (merged at approval by the planner).
