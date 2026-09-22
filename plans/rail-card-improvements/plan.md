# Plan: Rail Card Improvements

**Created**: 2026-09-22
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: rail-unread.spec.ts daemon (asserts rail order, attach state and restarts); rail-layout.spec.ts daemon (prefs are daemon-global; masthead button asserted in both views); rail-activity.spec.ts daemon (prefs.railActivity is daemon-global)
**Features**: rail, settings, views, tiles, launch, lifecycle
**Closes**: #30, #34, #38, #42
**Description**: The four rail-card issues filed together in TODO.md — attention order (#30), read/unread idle (#34), title layout and density (#38), the activity line (#42) — plus the rail-head and masthead rearrangement the layout review asked for.

## Overview

The developer chose every option from the mockups in `mockups/` on 2026-09-22; `mockups/final.html`
composes the choices and is the **design authority** for every surface this plan touches (the option
pages are history). The choices:

- **Card layout C** (#38): a small state row first (badge, timer, pin), then the title wrapping to
  as many lines as it needs, then the repo line, context row, activity line, note and action row.
  Nothing on the card truncates except in compact density. The repo line and the title carry the
  full text as a hover `title`, so a cut-off line can still be read.
- **Rail density** (#38, "compact / expanded"): a three-step pref `prefs.railDensity`
  (`compact` · `comfortable` · `expanded`, default `comfortable`) chosen from an icon segmented
  control in the rail head, remembered across windows and restarts like every pref.
- **Rail head and masthead**: the New session button leaves the rail head and the Tiles toolbar and
  sits once in the masthead, right of the Focus/Tiles switcher, visible in both views. The rail head
  becomes: sort select on the left; session count and the density control on the right.
- **Unread idle** (#34): a session that finishes a turn while nobody has its terminal open is
  **unread** until someone opens it. The daemon infers this from its own terminal registry (only
  the sessions shown live hold a terminal socket, `web/src/features/surfaces.ts`), so no new
  endpoint. The card shows a neutral 7px dot before the title; a read idle title drops to muted.
- **Attention order** (#30): needs input → failed → **unread idle** → **started** → planning →
  working → **read idle**. Reading a card is what sinks it. `started` sits in the "your turn" group
  because a launched session is waiting for its first prompt, and the state machine moves it out
  the moment it is used, so no time decay is needed. The same table drives Option-Command-0 and
  the Tiles initial live pick; that is one definition of "neediest".
- **Activity line** (#42): **turn-aware** by default — `on: <your prompt>` while a turn is open,
  `claude: <reply>` once it closes — with a Settings pref `prefs.railActivity` offering your
  prompt, Claude's reply or both. The daemon starts keeping the user's prompt from
  the prompt-submit hook (kb:fact/hook-payload-fields), skipping the synthetic prompts a finished background task injects
  (kb:fact/background-completion-new-prompt-id names their tag).

Ground truth verified in code (2026-09-22): the card is one shared `<template
id="session-card-template">` rendered by `web/src/render/sessions.ts` from the pure view-model in
`web/src/sessions/card.ts`, and the Tiles strip reuses the identical markup (`renderStrip`), so
layout and density reach both. The attention comparator is `sortSessions` in
`web/src/sessions/sort.ts`; `pickNeediest` and `web/src/sessions/live.ts`'s `initialLive` read it.
`lastActivity` is set by `KindTurnClosed` in `internal/session/machine.go` and persisted in
`session.last_activity`; the prompt is discarded by `internal/claudecode/interpret.go` today. Prefs are
one kv JSON object validated per field in `internal/server/prefs.go`. The next migration is `0009`.
Restart policy (kb:adr/lifecycle-reconcile-converges-with-the-socket): a session that died while
the daemon was down is kept as an ended card for one daemon lifetime and swept on the following
start; this plan does not change that, only makes the unread flag ride the row.

## Requirements

### Must Have

**Layout and density (#38)**

- [ ] REQ-1: The card template becomes, in order: `.stripe`; `.card-in` containing `.r0` (`.badge`,
      `.timer`, `.pin`), `.r1` (`.name`), `.r2`, `.r3`, `.activity.you`, `.activity.claude`, `.note`,
      `.acts-row`. `.name` wraps (`white-space: normal`) and never truncates outside compact density.
      The Tiles strip renders the same template and follows the same rules.
- [ ] REQ-2: `.r2` carries `title` equal to its own text on every render; `.name` carries `title`
      equal to the display title on every render.
- [ ] REQ-3: New pref `railDensity` ∈ `compact | comfortable | expanded`, default `comfortable`,
      validated and persisted by the daemon, echoed in every `prefs` broadcast. The client writes it
      to `document.body.dataset.railDensity` **only** from a `prefs` broadcast, never from the click.
- [ ] REQ-4: Density rules (CSS keyed on `body[data-rail-density]`): **comfortable** is the
      reference render; **compact** clamps `.name` to one line with an ellipsis, hides `.r3 .ctx`
      (the numbers stay), hides both `.activity` lines, clamps `.note` to one line and tightens
      `.card-in` padding to `6px 11px 7px`; **expanded** lets each `.activity` line run to three
      lines (`-webkit-line-clamp: 3`). Nothing else differs between densities.
- [ ] REQ-5: The rail head is, left to right: `#rail-sort` (unchanged select), then, right-aligned,
      `#rail-count` and a `role="group" aria-label="Card density"` control of three
      `.seg-btn` buttons with `aria-label` `Compact` / `Comfortable` / `Expanded`, matching `title`,
      an inline `aria-hidden` SVG icon each (mockups/final.html), and `aria-pressed="true"` on the
      button matching the current pref. A click sends `PUT /api/prefs {railDensity}`.
- [ ] REQ-6: One New session button (`#new-session-button`, text `New session`) sits in the masthead
      immediately after `#view-switcher`, visible in both views. `#tiles-new-session-button` and
      the rail-head button are removed; `features/launch.ts` binds the one button; Option-Command-N
      keeps opening the dialog.

**Unread idle (#34)**

- [ ] REQ-7: New daemon field `Session.Unread` (column `session.unread INTEGER NOT NULL DEFAULT 0`,
      wire `unread: boolean`). On `turn_closed` it is set to **true iff no live terminal client is
      registered for the session** (either surface) at that moment; it is cleared by every input
      whose resulting state is not `idle`, and by a successful terminal attach on either of the
      session's surfaces (`/ws/terminal/{id}`, `/ws/shell/{id}`). `resume_bind` leaves it unchanged.
      Every change persists and broadcasts one `sessionUpsert`; a no-op broadcasts nothing.
- [ ] REQ-8: "Watched" is a port on the session manager (`Watcher.Watched(sessionID) bool`)
      satisfied by `internal/server`'s terminal registry, which answers true iff it holds a
      connection for any `terminalKey` with that session id. The manager exposes
      `MarkSeen(ctx, id)` for the attach path.
- [ ] REQ-9: A card whose session is `unread` carries class `unread`, `data-unread="true"` and
      `aria-label="<display title>, unread"`; otherwise none of the three. The dot is CSS
      (`.card.unread .name::before`, 7px, `--fg`); a read `idle` card's `.name` renders in
      `--fg-muted` at weight 600. No state colour is used.
      *Amended (review cycle 1, decisions/read-idle-title-colour, consensus A): `.card .name` declares
      `color: var(--fg)` so the read-idle drop to `--fg-muted` is a real drop in the rail, whose
      `.cards` list otherwise hands the title `--fg-dim`; the strip already rendered it at `--fg`.*
- [ ] REQ-10: `unread` is independent of `alive` and survives a daemon restart: reconcile never
      writes it, an ended card keeps it, and the ended-last sort rule still wins.

**Attention order (#30)**

- [ ] REQ-11: The attention priority table becomes: `needs_input` (longest-blocked first) →
      `failed` (most recent first) → `idle && unread` (longest-idle first) → `started` → `planning`
      → `working` (each `stateSince` ascending) → `idle && !unread` (longest-idle first); dead last,
      pinned block first, as today. `sortSessions`, `pickNeediest` and `initialLive` all read this
      one table.

**Activity line (#42)**

- [ ] REQ-12: New daemon field `Session.LastPrompt` (column `session.last_prompt TEXT`, wire
      `lastPrompt: string | null`): the most recent user prompt, truncated to 200 characters by the
      same `truncate` `lastActivity` uses. Set on `turn_activity` only when the adapter supplied a
      prompt and the prompt is not a straggler; the adapter supplies one only for the prompt-submit hook
      and never when the prompt begins with the background-completion tag
      (kb:fact/background-completion-new-prompt-id). Reset to null on `clear_rebind`;
      unchanged on `resume_bind`.
- [ ] REQ-13: New pref `railActivity` ∈ `turn | prompt | reply | both`, default `turn`, validated
      and persisted by the daemon, echoed in every `prefs` broadcast, edited from a Settings
      fieldset (legend `Rail card shows`, radios `Turn-aware` / `Your prompt` / `Claude's reply` /
      `Both`, `name="railActivity"`) placed between Theme and Updates; the checked radio follows the
      broadcast, never the click.
- [ ] REQ-14: A pure function `activityLines(session, mode)` in `web/src/sessions/card.ts` returns
      `{ you: string | null, claude: string | null }`: **turn** — state in `working`, `planning`,
      `needs_input` → `you = "on: " + lastPrompt`, `claude = null`; otherwise `you = null`,
      `claude = "claude: " + lastActivity`; **prompt** — `you = "you: " + lastPrompt` only;
      **reply** — `claude = "claude: " + lastActivity` only; **both** — `you = "you: " +
      lastPrompt` and `claude = "claude: " + lastActivity`. A null source renders that line hidden.
      The renderer writes `you` to `.activity.you` and `claude` to `.activity.claude`.

### Should Have

- [ ] REQ-15: A density change and a `railActivity` change never rebuild cards: they are attribute
      and text updates on existing nodes, so a focused card or action button keeps focus.

### Nice to Have

- none

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval; `docs/features/<f>/contract.md`
regenerates). No new endpoints.

### WS: daemon→UI `sessionUpsert` / `snapshot` — the Session object (`kb:anchor/ws.session`)

Two new **required** keys on every Session object:

```jsonc
{ "unread": false,          // boolean — true iff the session entered idle while no terminal client
                            //   was attached to it and nobody has attached since. INV: unread ⇒ state == "idle".
                            //   Cleared by any transition out of idle and by a successful attach on
                            //   /ws/terminal/{id} or /ws/shell/{id}. Independent of alive; survives restarts.
  "lastPrompt": "fix the flaky retry and rerun the suite" }  // string | null — the user's most recent
                            //   prompt, truncated to 200 chars; null until a first prompt and again after /clear.
                            //   Synthetic background-completion prompts never replace it. Display-only.
```

Value semantics addenda: `lastPrompt` is set by the turn-activity input for a prompt that is not a
straggler; status posts never touch `unread` or `lastPrompt`.

### HTTP: PUT /api/prefs (`kb:anchor/prefs.put`) and WS `prefs` (`kb:anchor/ws.prefs`)

**Request** gains two optional fields:

```jsonc
{ "railDensity": "comfortable",   // optional: "compact" | "comfortable" | "expanded" — card density in the rail and strip
  "railActivity": "turn" }        // optional: "turn" | "prompt" | "reply" | "both" — which text the card's activity line shows
```

Defaults before any PUT become
`{"view":"focus","density":"2x2","usageModel":"Fable","railSort":"manual","theme":"follow","updateCheck":true,"railDensity":"comfortable","railActivity":"turn"}`.
**Errors:** unchanged shape — a value outside either enum is `400`:

```json
{ "error": { "code": "invalid_request", "message": "railDensity must be one of compact, comfortable, expanded" } }
```

A persisted value outside the enum loads as the default (same silent fallback as `railSort`). The
`prefs` broadcast carries both keys in its full object.

### WS: `/ws/terminal/{id}` and `/ws/shell/{id}` — attach side effect

A successful attach (the point at which today's takeover installs the connection) marks the
session seen: if `unread` was true it becomes false, is persisted, and one `sessionUpsert` is
broadcast **before** the first PTY byte is forwarded. No change when already false.

### State machine (`kb:anchor/state.tracked`, `kb:anchor/state.transitions`)

Tracked variables gain `unread` (set by `turn_closed` when unwatched, cleared by every transition to
a non-idle state and by attach) and `lastPrompt` (set by `turn_activity` carrying a prompt, reset by
`clear_rebind`). No new state, no new input kind.

## Schema Changes

Migration `internal/store/migrations/0009_rail_cards.sql`, forward-only, additive:

```sql
ALTER TABLE session ADD COLUMN unread INTEGER NOT NULL DEFAULT 0;
ALTER TABLE session ADD COLUMN last_prompt TEXT;
```

`kb:adr/lifecycle-migrations-add-tables-when-written` is respected: columns on the existing table,
no new table. Existing rows load as read with no prompt.

## Diagrams

No new diagram. Two records change; the orchestrator applies these deltas at Completion:

- delta of kb:diagram/store-schema — `session` gains `INTEGER unread "0009, NOT NULL DEFAULT 0"`
  and `TEXT last_prompt "0009, display only"`; the prose's "migrations 0001-0008" becomes 0001-0009.
- delta of kb:diagram/domain-model — `Session` gains `unread` and `last_prompt`; `User Settings`
  gains `rail_density: compact, comfortable, expanded` and `rail_activity: turn, prompt, reply, both`.

## UI Specifications

Design authority: `plans/rail-card-improvements/mockups/final.html` (its `mock.css` transcribes
`web/src/style.css`). Binding sections: design-system §2 (type roles — the state row is metadata,
mono `--fs-2xs`/`--fs-sm`), §3 (state colour is meaning: the dot and the muted read title use
`--fg`/`--fg-muted`, never a state token), §5 Components (Masthead, Rail card, Segmented control),
§6 honesty rules (unknown context still renders the word, in every density).

### Views

- **Masthead** — `brand`, `#view-switcher`, then `#new-session-button` (class `btn`), then
  `.masthead-right` as today. Present in both views; nothing hides it.
- **Rail head** — `#rail-sort` left; `#rail-count` then `#rail-density` (the density group)
  right-aligned. The New session button is gone from here.
- **Tiles toolbar** — `tiles`, the 2×2/3×2 density group; the New session button is gone.
- **Card** (rail and strip) — layout C per REQ-1, density per REQ-4, unread per REQ-9, activity per
  REQ-14. The `current` marker, pin control, drag rules and action row are unchanged.
- **Settings dialog** — new `fieldset.seg` with legend `Rail card shows` and a `.seg-track` of four
  radios, between the Theme fieldset's hint and the Updates fieldset.

### User Flows

1. **Reading a reply.** Session B finishes a turn while the Focus pane shows A. B's card gains the
   dot and, in attention mode, moves above every planning/working/started card. The user clicks B:
   the terminal attaches, the daemon broadcasts `unread:false`, the dot goes, and in attention mode
   B sinks below the active sessions on the next render.
2. **Changing density.** The user clicks the compact icon. `PUT /api/prefs {railDensity:"compact"}`
   is sent; nothing changes until the `prefs` echo arrives, then `body[data-rail-density]` flips,
   every card and strip card tightens, and the pressed icon moves. A second window follows.
3. **Choosing what the line shows.** Settings → Rail card shows → Your prompt. The echo re-checks
   the radio and every card's activity line becomes `you: …`.
4. **Launching.** New session in the masthead opens the launch dialog from either view; the dialog
   is unchanged.

### States

- **No data yet**: `lastPrompt` and `lastActivity` null → both activity lines hidden (no empty
  `on:`). Unknown context → `.r3.unk` "context unknown — no API response yet" in every density
  (compact hides only the track, and the unknown state has no track).
- **Data**: as the mockup.
- **Daemon down**: prefs controls (density buttons, Settings radios) send nothing that succeeds;
  the UI keeps the last broadcast values; the New session button follows the existing disabled
  rule of the launch dialog while disconnected. Cards keep their last unread state.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| New session button | `button` | `New session` | `#new-session-button`, the only one in the DOM, inside `header.masthead` after `#view-switcher` |
| Rail sort select | `combobox` | `Sort` | unchanged |
| Session count | — | `#rail-count` | text is the count or empty |
| Density group | `group` | `Card density` | `#rail-density`, explicit `role="group"`; distinct from the Tiles toolbar's `Density` group |
| Density buttons | `button` | `Compact` · `Comfortable` · `Expanded` | `aria-label`; `aria-pressed="true"` on exactly one |
| Body density attribute | — | `body[data-rail-density="compact\|comfortable\|expanded"]` | set from the prefs broadcast only |
| Session card | — | `[data-testid="session-card"]` | unchanged hook; strip cards share it |
| Unread card | — | `[data-testid="session-card"][data-unread="true"]` | also class `unread`; `aria-label` ends with `, unread` |
| Card title | — | `.name` with `title` attribute | wraps in comfortable/expanded; one line in compact |
| Repo line | — | `.r2` with `title` attribute equal to its text | |
| State row | — | `.r0` containing `.badge`, `.timer`, `.pin` | badge text lowercase as today |
| Your-prompt line | — | `.activity.you`, text `/^(on|you): /` | `hidden` when null |
| Claude line | — | `.activity.claude`, text `/^claude: /` | `hidden` when null |
| Settings fieldset | — | legend `Rail card shows` | `fieldset.seg` |
| Activity radios | `radio` | `Turn-aware` · `Your prompt` · `Claude's reply` · `Both` | `input[name="railActivity"]` values `turn` / `prompt` / `reply` / `both` |

### Invariants

- **INV-1 (unread ⇒ idle).** After every input kind applied from every one of the six states, with
  `unread` initially true and initially false: `unread == true` implies `state == idle`. Table-driven:
  6 states × 2 unread × every `InputKind` × watched ∈ {true,false}.
- **INV-2 (watched is never unread).** A session with a registered terminal connection on any
  surface, from any window, is never broadcast with `unread:true`: at attach it is cleared before
  the first byte; at `turn_closed` it is not set. Holds with other sessions present and attached —
  attaching session A never clears B's unread.
- **INV-3 (one launcher).** Exactly one `#new-session-button` exists in the DOM and it is visible
  in both views; no element with id `tiles-new-session-button` exists.
- **INV-4 (prefs are broadcast-driven).** `body[data-rail-density]`, the pressed density button and
  the checked `railActivity` radio equal the last `prefs` broadcast, never the last click; a
  reconnect echoing identical prefs changes no DOM node.
- **INV-5 (one comparator).** For any session list, the unpinned attention order, `pickNeediest`'s
  choice and `initialLive`'s first N agree with REQ-11's table.
- **INV-6 (prompt text never logged).** No log line carries `lastPrompt` or the payload's prompt
  field, in any package, at any level.

### Carried-over measurements

kb:fact/hook-payload-fields (verified 2.1.233..canary) says the prompt-submit hook carries `prompt`;
this plan reads it in the same hook under the same command-hook transport, so the measurement
applies unchanged. kb:fact/background-completion-new-prompt-id was measured with a background task
on 2.1.259+; REQ-12's tag check is exactly the measured shape. The canary
(`TestHookFields`) guards the first; the second carries `guard` in its record.

## Affected Files

### Daemon

- `internal/store/migrations/0009_rail_cards.sql` — new, two `ALTER TABLE` statements.
- `internal/store/session.go` — `SessionRow.Unread`, `SessionRow.LastPrompt`; insert (`0`, `NULL`),
  update and select columns.
- `internal/session/session.go` — `Session.Unread bool`, `Session.LastPrompt *string`; `Clone`.
- `internal/session/machine.go` — `setState` clears `Unread` whenever the new state is not idle;
  `KindTurnActivity` stores the truncated prompt when `input.Prompt != nil` (after the straggler
  return); `applyBind`'s clear-rebind branch nils `LastPrompt`. Reword the line-71 comment so it
  names "the preceding turn-activity event" rather than the hook (D4's grep).
- `internal/session/manager.go` — `Config.Watcher` port and field; `Apply` sets `Unread = true`
  after `applyInput` when `input.Kind == KindTurnClosed` and `!watcher.Watched(id)` (nil watcher
  counts as unwatched); `MarkSeen(ctx, id)`; `sessionToRow` / row-to-session mapping for both fields.
- `internal/claudecode/interpret.go` — `StateInput.Prompt *string`; the prompt-submit case reads
  `prompt` and leaves `Prompt` nil when it begins with the background-completion tag
  (kb:fact/background-completion-new-prompt-id); the two tool-use cases never set it.
- `internal/server/sessionwire.go` — `Unread bool json:"unread"`, `LastPrompt *string
  json:"lastPrompt"`.
- `internal/server/terminal.go` — `terminalRegistry.watched(sessionID int64) bool`; after a
  successful takeover in the Claude attach handler, `manager.MarkSeen`.
- `internal/server/shells.go` — the same `MarkSeen` call after a successful shell attach.
- `internal/server/prefs.go` — `railDensity`/`railActivity`: defaults, validators, `prefsRequest`,
  `storedPrefs`, `PrefsInfo`, `prefsFields` rows, the "at least one of" message.
- `internal/server/server.go` — construct the terminal registry before the manager and pass it as
  `Watcher` (composition-root wiring only).

### Web

- `web/index.html` — masthead `#new-session-button` after `#view-switcher`; rail head restructured
  (`#rail-sort`, `#rail-count`, `#rail-density` group with three SVG buttons); Tiles toolbar loses
  its button; card template per REQ-1; Settings fieldset per REQ-13.
- `web/src/features/launch.ts` — bind the single `#new-session-button`.
- `web/src/features/rail.ts` — density control wiring (`putPrefs({railDensity})`), pressed state
  and `document.body.dataset.railDensity` from the `prefs` event; `app.state.railDensity` /
  `app.state.railActivity` writes; pass `railActivity` into `renderSessions`.
- `web/src/features/tiles.ts` — pass `app.state.railActivity` into `renderStrip`.
- `web/src/features/settings.ts` — `railActivity` radios: `putPrefs` on change, `setChecked` from
  the broadcast.
- `web/src/app.ts` — `AppState.railDensity`, `AppState.railActivity` (written only by
  `features/rail.ts`).
- `web/src/protocol.ts` — `Session.unread`, `Session.lastPrompt` (required, rejected when
  missing); `Prefs.railDensity`, `Prefs.railActivity`, `RailDensity`, `RailActivity` types;
  `parsePrefs` defaults a missing key to `comfortable` / `turn` and rejects a value outside the
  enum.
- `web/src/sessions/card.ts` — `CardViewModel.unread`, `CardViewModel.activity: {you, claude}`,
  `CardViewModel.repoLine` unchanged; `activityLines(session, mode)` exported; `buildCardViewModel`
  takes the mode.
- `web/src/sessions/sort.ts` — REQ-11's priority function (idle splits on `unread`; `started` moves).
- `web/src/render/sessions.ts` — new slots (`.r0`, `.activity.you`, `.activity.claude`), `title`
  attributes, `unread` class / `data-unread` / `aria-label` suffix; `renderSessions` and
  `reconcileCards` take `railActivity`.
- `web/src/render/tiles.ts` — `renderStrip` takes and forwards `railActivity`.
- `web/src/style.css` — masthead button spacing; rail head layout and `.railhead .seg` icon
  buttons; layout C rules (`.r0`, wrapping `.name`); unread dot and read-title rules; three density
  rule blocks keyed on `body[data-rail-density]`; Settings fieldset needs no new rule.

### E2E (e2e-specs owns; listed so the impact is visible)

- New: `web/e2e/rail-unread.spec.ts`, `web/e2e/rail-layout.spec.ts`, `web/e2e/rail-activity.spec.ts`.
- Existing specs that assert surfaces this plan moves and must be repaired in validate mode:
  `web/e2e/tiles-launch.spec.ts` (the Tiles toolbar button), `web/e2e/rail-order.spec.ts` (E10/E11
  attention order), `web/e2e/shortcuts.spec.ts` and `web/e2e/rename.spec.ts` (`#new-session-button`
  location), `web/e2e/helpers/session.ts` / `railorder.ts` locators if they touch `.r1`.
- `web/e2e/helpers/payloads.ts` — the prompt-submit payload helper already exists; a `prompt` option may be
  needed.

### Unit tests (owned by the test agents)

- Daemon: `internal/session/machine_test.go`, `manager_test.go`, `internal/claudecode/interpret_test.go`,
  `internal/server/prefs_test.go`, `internal/server/terminal_test.go`, `internal/store/store_test.go`.
- Web: `web/src/sessions/sort.test.ts`, `card.test.ts`, `live.test.ts`, `web/src/protocol.test.ts`,
  `web/src/render/sessions.test.ts`, `web/src/app.test.ts`.

## Edge Cases

1. `Stop` arrives for the session the Focus pane shows (attached) → `unread` stays false → E3
2. `Stop` arrives for a session no window shows → `unread` true, dot rendered → E3 (shared with edge case 1)
3. Clicking the unread card attaches its terminal → `unread` false within one render, one `sessionUpsert` → E4
4. Two windows: window 1 shows A, window 2 shows B; B stops → watched via window 2, not unread → D6
5. Unread session receives `turn_activity` (a new prompt) → leaves idle, `unread` cleared → D7
6. `idle_prompt` Notification for the prompt the `Stop` already closed → early return, `unread` unchanged (still true) → D7 (shared with edge case 5)
7. Daemon restart with the tmux server killed (computer restart) → row reconciles to ended, `unread` still true, dot on the greyed card, card sorts last → E10
8. `/clear`: `SessionEnd{clear}` then `SessionStart{clear}` → clear_rebind lands `started`, `unread` false, `lastPrompt` null → D12
9. `/clear` pair reordered: the new-id `SessionStart` applied, then the old-id `Stop` straggler arrives → Apply's monotonic guard routes it without rebinding; it is a `turn_closed` like any other and sets idle and, if unwatched, unread — the same behaviour `lastActivity` already has on this path, accepted → D5 (shared with edge case 12)
10. A previous-turn prompt-submit straggler arrives after its `Stop` (closed prompt, no subagent marker) → early return, `lastPrompt` unchanged → D12 (shared with edge case 8)
11. A prompt-submit hook whose prompt begins with the background-completion tag → adapter supplies no prompt, `lastPrompt` unchanged → D11
12. Prompt longer than 200 characters → stored truncated to 200 → D5 (shared with edge case 9)
13. Pre-plan daemon payload without `railDensity`/`railActivity` → client defaults `comfortable`/`turn` → W7
14. `PUT /api/prefs {"railDensity":"cosy"}` → `400 invalid_request`, nothing persisted, no broadcast → D13
15. A title longer than one line in comfortable density wraps; in compact it is one line with an ellipsis and the full text in `title` → E11
16. The Tiles strip follows the density pref → E7
17. Dead unread card: greyed, dot kept, Resume/Remove row as today → E10 (shared with edge case 7)
18. Attention mode with needs input, failed, unread idle, started, planning, working and read idle present → REQ-11 order → E5
19. Option-Command-0 with no needs-input or failed session → lands on the unread idle, not the working one → E6
20. Tiles view entry with more sessions than slots → the live grid is the first N of REQ-11's order → W5
21. New session button opens the dialog from Focus and from Tiles; Option-Command-N still opens it → E2
22. Empty rail → rail head still shows sort select and density control; count empty; "No sessions yet" as today → E7 (shared with edge case 16)
23. `lastActivity` and `lastPrompt` both null → both activity lines `hidden`, no empty prefix → W6
24. `both` mode with one side null → one line only → W6 (shared with edge case 23)
25. `failed` state in `turn` mode → `claude:` line (the last reply) plus the failure note → W6 (shared with edge case 23)
26. Density change while a card's action button has keyboard focus → focus survives (attribute update only) → E12
27. Resume of a dead unread session → `resume_bind` lands idle with `unread` unchanged; the attach that follows clears it → D7 (shared with edge case 5)
28. Hovering a cut-off repo line → `title` attribute equals the line's text on every card → E11 (shared with edge case 15)
29. Daemon down when a density button is clicked → request fails, `body[data-rail-density]` unchanged, pressed button unchanged → E7 (shared with edge case 16)
30. Reconnect echoing identical prefs → no DOM change, no focus loss → W9
31. Attach on the shell surface of an unread session → also marks seen → D8
32. Watcher nil (unit tests, or a manager constructed without a registry) → every `turn_closed` counts as unwatched → D5 (shared with edge case 9)

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e. One clause per
criterion; never mix a runnable command with a judgement call in one item.

### Daemon

- **D1**: `make test` passes.
- **D2**: `go build ./...` passes.
- **D3**: `make lint` passes.
- **D4**: the adapter boundary holds — hook event names, payload keys and the background-completion
  tag stay inside `internal/claudecode` (the checks block enforces it over the non-test files of
  `internal/session`, `internal/server` and `internal/store`; test files are out of scope because
  they fabricate wire bodies through `internal/claudecode`'s own helpers and the existing
  `store_test.go` fixtures; the one pre-existing hit is `machine.go:71`, reworded by daemon-impl).
- **D5**: `turn_closed` with the watcher reporting false sets `unread` true, persists it and
  broadcasts one `sessionUpsert`; a nil watcher counts as false; the prompt stored by
  `turn_activity` is truncated to 200 characters; a straggler `Stop` after a clear-rebind behaves
  as any `turn_closed`.
- **D6**: `turn_closed` with the watcher reporting true leaves `unread` false and the broadcast
  object carries `unread:false`.
- **D7**: from `idle` with `unread` true, `turn_activity`, `needs_input_permission`, a fresh-prompt
  `needs_input_idle`, `turn_failed`, `bind` and `clear_rebind` each leave `unread` false;
  `resume_bind`, `compaction`, `death_hint`, `inert` and a closed-prompt `needs_input_idle` leave it
  true. Table-driven per INV-1 across all six source states.
- **D8**: `MarkSeen` on an unread session persists `unread:false` and broadcasts once; on a read
  session it persists nothing and broadcasts nothing; it is called after a successful takeover on
  both the Claude and the shell attach handlers, before any PTY byte is forwarded.
- **D9**: `terminalRegistry.watched(id)` is true iff a connection is registered for either surface of
  `id`, and attaching a different session never changes it.
- **D10**: reconcile leaves `unread` and `last_prompt` untouched for every row class it handles, and
  the store round-trips both columns through insert, update and select.
- **D11**: `Interpret` on a prompt-submit event yields `Prompt` equal to the payload's prompt, nil when
  the prompt begins with the background-completion tag or is absent; the two tool-use events yield nil.
- **D12**: `turn_activity` for a closed prompt leaves `lastPrompt` unchanged; `clear_rebind` sets it
  nil and `unread` false; `resume_bind` changes neither.
- **D13**: `PUT /api/prefs` accepts `railDensity` and `railActivity` within their enums, rejects a
  value outside with `400 invalid_request` naming the field, persists and echoes both keys, and
  loads an out-of-enum stored value as the default.
- **D14**: every Session object on `snapshot` and `sessionUpsert` carries `unread` and `lastPrompt`.

### Web

- **W1**: `make web-build` passes.
- **W2**: `make web-test` passes.
- **W3**: `make web-lint` passes.
- **W5**: `sortSessions` orders REQ-11's seven groups as stated, keeps every tiebreak, and
  `pickNeediest` and `initialLive` pick the same head; a read idle sorts after working, an unread
  idle before started.
- **W6**: `activityLines` returns REQ-14's exact strings for every mode × state combination, a null
  source yields a null line, and `both` with one null source yields one line.
- **W7**: `parsePrefs` defaults a missing `railDensity` to `comfortable` and a missing
  `railActivity` to `turn`, rejects an out-of-enum value, and `parseSession` rejects an object
  missing `unread` or `lastPrompt`.
- **W8**: no `any` types in new web code.
- **W9**: `body[data-rail-density]`, the pressed density button and the checked radio are written
  only inside the `prefs` handler, and an identical echo touches no node.
- **W10**: the rendered card's `.r2` and `.name` carry `title` attributes equal to their text; an
  unread session's card carries `unread`, `data-unread="true"` and the `, unread` label suffix, and a
  read one carries none.
- **W11**: the template's child order is `.r0`, `.r1`, `.r2`, `.r3`, `.activity.you`,
  `.activity.claude`, `.note`, `.acts-row`, and `.r0` holds the badge, timer and pin.

### E2E

- **E1**: `make e2e` passes.
- **E2**: the masthead's `New session` button opens the launch dialog in Focus and in Tiles, no other
  New session button exists, and Option-Command-N still opens the dialog.
- **E3**: with A focused and B unfocused, a `Stop` for B gives B's card `data-unread="true"` and a
  `Stop` for A never does.
- **E4**: clicking the unread card removes `data-unread` and `/api/state` reports `unread:false`.
- **E5**: with one session in each of needs input, failed, unread idle, started, planning, working
  and read idle, the attention-mode rail order is exactly that sequence.
- **E6**: with a working session and an unread idle session only, Option-Command-0 focuses the
  unread idle one.
- **E7**: clicking `Compact` sets `body[data-rail-density="compact"]` after the echo, persists across
  a reload, is mirrored in a second window, applies to the Tiles strip, and is left unchanged when
  the daemon is down.
- **E8**: choosing `Your prompt` in Settings turns an idle card's line into `you: …`, and the choice
  persists across a reload.
- **E9**: in `Turn-aware` mode a prompt-submit post gives the card `on: <prompt>` and the following
  `Stop` replaces it with `claude: <reply>`.
- **E10**: after killing the tmux server and restarting the daemon, an unread session renders as an
  ended card that still carries `data-unread="true"` and sorts last.
- **E11**: a long title renders on more than one line in comfortable density and on one line with a
  `title` attribute in compact; every `.r2` has `title` equal to its text.
- **E12**: with a card's End button focused, clicking a density button leaves that button focused
  after the echo.
- **E13**: a prompt-submit post whose prompt begins with the background-completion tag leaves the
  card's `on:` line unchanged.

### Automated Checks

Every line below is `<ID> <single-line shell command>`, run from the project root. A check passes
iff its command exits 0. The negative grep in D4 excludes `_test.go` files (see D4's prose).

```checks
D1 make test
D2 go build ./...
D3 make lint
D4 ! rg -n "UserPromptSubmit|last_assistant_message|task-notification" internal/session internal/server internal/store --glob '!*_test.go'
W1 make web-build
W2 make web-test
W3 make web-lint
E1 make e2e
```

### Reviewer-Verified

- **D5–D14**: by reading the daemon tests the daemon-tests agent wrote and running them.
- **W5–W7, W10, W11**: by reading the Vitest suites and running them.
- **W8**: no `any` types in new web code.
- **W9**: the prefs handler is the only writer of the three prefs-driven DOM states.
- **INV-6**: no `zerolog` call in the diff or in `internal/session` / `internal/server` writes
  `LastPrompt`, `Prompt`, or a hook payload body.
- **E2–E13**: by reading the specs and the validate report.
- **Mockup fidelity**: the rendered rail at each density matches `mockups/final.html` (row order,
  dot, muted read title, icon buttons, masthead button placement).

## Doc Delta

**rail** — becomes true:
- The card is a state row (badge, time in state, pin) above a title that wraps, then the repo and
  branch line with its full text on hover, the context gauge, and an activity line whose text
  `prefs.railActivity` chooses: turn-aware by default (the user's prompt while a turn is open,
  Claude's reply once it closes), or the prompt, the reply, or both (kb:adr/rail-activity-line-turn-aware-default-with-pref).
- Density is `prefs.railDensity`, chosen from an icon control in the rail head: comfortable is the
  reference, compact clamps the title to one line and drops the gauge track and activity line,
  expanded lets the activity line run to three lines; the strip follows
  (kb:adr/rail-card-state-row-then-wrapping-title).
- A session that finishes a turn while no window has its terminal open is unread until one attaches;
  the daemon infers it from its terminal registry, the card shows a neutral dot before the title and
  a read idle title is muted (kb:adr/rail-unread-inferred-from-live-terminal-client,
  kb:adr/rail-unread-marker-neutral-dot).
- Attention sorts the unpinned group `needs_input` longest-blocked first, `failed` most recent
  first, unread `idle` longest-idle first, `started`, `planning`, `working`, then read `idle`
  longest-idle first (kb:adr/rail-attention-order-your-turn-before-active).
- The rail head shows the sort select, the session count and the density control.

**rail** — stops being true:
- "A card shows the display title, the state badge, time in the current state, the repo and
  branch line …, and a reason line: … the last activity for `idle`" (replaced by the sentences
  above; the note behaviour for `needs_input`, `failed` and `started` stays).
- "Attention sorts the unpinned group by `needs_input` longest-blocked first, then `failed` most
  recent first, `planning`, `working`, `started`, and `idle` longest-idle first
  (kb:adr/rail-attention-sort-order)."
- "The rail head shows the session count."

**settings** — becomes true:
- The fields are view, density, usage model, rail sort, rail density, rail activity, theme and
  update check, each with a daemon default.
- The Settings dialog's Rail card shows fieldset offers Turn-aware, Your prompt, Claude's reply and
  Both as radios (kb:adr/rail-activity-line-turn-aware-default-with-pref); the rail density control
  sits in the rail head (kb:adr/rail-card-state-row-then-wrapping-title).

**settings** — stops being true:
- "The fields are view, density, usage model, rail sort, theme and update check".
- "The Settings dialog … holds two sections."

**views** — becomes true:
- One New session button sits in the masthead beside the view switcher and is visible in both
  views (kb:adr/launch-new-session-button-in-masthead).

**views** — stops being true:
- "Each view hides the other's New session button so exactly one is visible."

**tiles** — becomes true:
- Sessions are launched from the masthead's New session button (kb:adr/launch-new-session-button-in-masthead).

**tiles** — stops being true:
- "the New session button lives in the density toolbar (kb:adr/tiles-new-session-button-in-toolbar)."

**launch** — becomes true:
- The dialog opens from the masthead's New session button or the launch chord.

**launch** — stops being true:
- "The dialog opens from the rail's New session button, the Tiles toolbar button or the launch chord."

**lifecycle** — becomes true:
- `idle` carries `lastActivity`, the user's `lastPrompt`, and `unread`, which is set when the turn
  closed with no terminal client attached and cleared by any transition out of idle or by an attach.

**lifecycle** — stops being true:
- "`idle` (a turn finished, with `lastActivity`)" (extended as above; the sentence is replaced, not
  appended to, so the spec stays under its word budget).

**protocol** (`docs/protocol.md`) — becomes true: the Protocol Contract section above, verbatim
under `kb:anchor/ws.session`, `kb:anchor/prefs.put`, `kb:anchor/ws.prefs`, `kb:anchor/terminal.ws`,
`kb:anchor/terminal.shell-ws`, `kb:anchor/state.tracked` and `kb:anchor/state.transitions`; the
`kb:anchor/ws.snapshot` sort sentence names the new order. Stops being true: the prefs defaults
line without the two new keys, and the ws.snapshot sort sentence's old order.

## Out of scope

- **#17 (a real session summary)** — needs a `/spec` pass on whether Muster may spend tokens
  summarising; the `railActivity` pref is designed so a summary option can slot in later.
- **Keeping ended sessions past one daemon lifetime** — today a session that died while musterd
  was down is kept as a resumable ended card until the *following* start sweeps it
  (kb:adr/lifecycle-reconcile-converges-with-the-socket). The developer filed it into `TODO.md`
  § Reported issues › clearing sessions away on 2026-09-22 ("Sessions survive only one daemon start
  after their tmux server is gone"); nothing here copies or changes that entry.
- **Middle-ellipsis titles and a density for the mainhead or tile headers** — the mockup options
  not chosen; nothing is filed.
- **A per-view density** — one `railDensity` applies to the rail and the strip alike.

## Implementation Notes

**Decisions this plan makes** (written as `status: proposed` ADRs at approval, `refs:
[plan:rail-card-improvements]`, flipped to accepted at Completion):

- `kb:adr/rail-card-state-row-then-wrapping-title` — layout C over A/B/D, plus the three-step
  density pref in the rail head (the developer, 2026-09-22, from `mockups/title-layout.html` and
  `density.html`).
- `kb:adr/rail-unread-inferred-from-live-terminal-client` — mechanics A over an explicit seen
  endpoint or client-only memory: the daemon already knows who is watching, it syncs across windows
  and survives restarts for free. Known wrinkle: a session whose Docs tab is showing holds no
  terminal socket, so a reply arriving then counts as unread.
- `kb:adr/rail-unread-marker-neutral-dot` — option 1 over the badge word, weight-only and
  activity-tag treatments; shape carries the state, `--fg`/`--fg-muted` only.
- `kb:adr/rail-attention-order-your-turn-before-active` — option C, with `started` placed in the
  "your turn" group and no time decay; supersedes nothing (kb:adr/rail-attention-sort-order is
  already superseded; kb:adr/rail-user-owned-manual-order-default keeps its modes decision and its
  "attention is the old sort" consequence is what this record replaces in prose).
- `kb:adr/rail-activity-line-turn-aware-default-with-pref` — D as default behind E.
- `kb:adr/launch-new-session-button-in-masthead` — `supersedes: [tiles-new-session-button-in-toolbar]`.

**Facts relied on**: kb:fact/hook-payload-fields (the prompt-submit hook carries `prompt`),
kb:fact/background-completion-new-prompt-id (the tag synthetic prompts begin with),
kb:fact/notification-types-observed (`idle_prompt` arrives ~60 s after `Stop` for the closed prompt
and is dropped by the guard, so it never disturbs `unread`), kb:fact/clear-mints-new-session-id and
kb:fact/resume-keeps-session-identity (the rebind branches REQ-12 keys on).

**Where the rules live.** `unread ⇒ idle` is enforced in one place — `setState` in
`machine.go` clears the flag whenever the target state is not idle — so no arm can strand it. The
watcher call sits in `Manager.Apply` (which owns the port), after `applyInput`, guarded on
`input.Kind == KindTurnClosed`; the registry's own mutex never calls back into the manager, so the
lock order is manager → registry only. `MarkSeen` follows `SetPinned`'s shape: mutate under the
lock, persist, broadcast the clone iff changed.

**Adapter boundary.** Only `internal/claudecode/interpret.go` reads `prompt` and the
background-completion tag (CLAUDE.md hard rule; D4 enforces it). The neutral field is
`StateInput.Prompt`; `internal/session` sees a string or nil.

**Never log the prompt.** `lastPrompt` is prompt text: never in a log line at any level, never in
an error message. The event table already stores payloads verbatim, so persistence adds no new
exposure; the wire is localhost.

**Web patterns.** Density and activity are rendered like `railSort`: `features/rail.ts` adopts them
from the `prefs` event into `app.state`, never from the click (`kb:spec/settings`, INV-4).
`activityLines` is a pure export so Vitest covers the mode × state matrix without a DOM
(kb:lesson/conditional-test-routing-resolves-to-nobody resolves W6 to web-tests). Keep
`buildCardViewModel` under Biome's complexity ceiling by extracting `activityLines` and an
`unreadLabel` helper. The density buttons reuse `.seg-btn`; the SVG icons are inline in
`index.html` with `aria-hidden="true"`, the accessible name is the button's `aria-label`.

**Do not** pass `railDensity` through the card view-model: it is a body attribute and CSS does the
rest, which is what keeps REQ-15 true.

**Doc upkeep (orchestrator, Completion / Doc-Upkeep Backstop)**: tick the four entries under
`TODO.md` § Reported issues › rail cards and move the block to `docs/history/todo-done.md`; apply
the two diagram deltas; update `docs/design/design-system.md` § 5's Masthead sentence (add the New
session button after the view switcher) and Rail card sentence (state row first, wrapping title,
density, dot); flip the six ADRs; `make gen-kb && make check-kb`.
