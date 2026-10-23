# web/src/features — controllers, one per feature (update: two)

**Owns**: one controller per feature, except **update** (`update.ts`, `updaterestart.ts`). Each `init<Name>(app, deps)` looks up its elements, attaches listeners, subscribes via `app.on`, registers an `app.onRender` phase. `main.ts` registers each in one line; `app.ts` is the shared seam (store, `AppState`, bus, render frame). Shared pure logic is in `sessions/` or `terminal/`, DOM building in `render/`. A pure decision with one controller caller lives beside it in `features/` — inline when short, else in its own `<owner><concern>.ts` (the pure ones: `actionscopy.ts`, `batchplan.ts`, `connectionhealth.ts`, `connectionrestore.ts`, `connectionversion.ts`, `groupscopy.ts`, `launchcrumbs.ts`, `launchgroupchoice.ts`, `launchmodels.ts`, `launchpastlist.ts`, `launchrestore.ts`, `railmenuitems.ts`, `updateview.ts`, and notes' `notesdrafts.ts`, `notesgeometry.ts`, `notespanelstate.ts`, `notessave.ts`, `notesview.ts`). `railmenu.ts`: the card menu. `groups.ts` owns the rail's per-window state (filter, name editor, menus), hands its two sub-controllers their markup, and adopts the `groups` event; `rail.ts` calls its `renderChrome` first. `groupsselect.ts` is its select-mode part and `groupsdialogs.ts` its Delete/New group dialogs. `launchgroup.ts`/`launchresume.ts` are `launch.ts`'s Group-row/Resume-tab sub-controllers, `readerfind.ts`/`readerscroll.ts` `reader.ts`'s find bar/reading position. `effort.ts`: Dismiss, via `focus.ts`. `notes.ts`: the note glyph and panel. **Features**: actions, connection, focus, issue, launch, notes, rail, reader, rename, settings, shortcuts, surfaces, theme, tiles, update, usage, views.

**Invariants** (violations are review-Critical):
- `main.ts` holds no DOM lookup, listener, or module-level mutable state (kb:adr/process-composition-roots-registration-only).
- No controller imports a sibling; `deps` is typed structurally with the exact methods it calls.
- Each `AppState` field has one writer, adopted from a `prefs` (or `groups`) broadcast, never optimistically from a click.
- Every daemon call goes through `../api/`; one `WsClient` owns the connection.
- The name matches the server handler file, E2E spec prefix and helper (kb:adr/process-one-name-per-feature).
- Shortcuts dispatch on `matchShortcut`'s action, never on `event.key` (kb:adr/shortcuts-match-event-code-in-pure-module).

**Exemplar**: `usage.ts` — depends on no other controller; copy it, register in `main.ts`.

**Gotchas**:
- Init order is dependency order; a controller needing a later one takes a thunk (`() => surfaces`) invoked only from a click or render pass.
- Render phase order is behaviour-bearing, numbered in `main.ts`.
- A `prefs` handler compares the message against its own last value, not `app.state`, which it is about to overwrite (`views.ts`).
- `connection.ts` shows "connecting…" until the first `hello`, the banner only after (kb:adr/connection-banner-only-after-first-hello).
- A card's click listener is wired once: read live state (`groups.selecting()`) inside it.
- `deps` is always a named exported `<Name>Deps` interface, never inline; a thunk reaching a later-constructed controller is named `get<Noun>`; `init` returns a handle only when a caller uses it.

<!-- kb:trailer -->
<!-- kb:hash 91ea39e68e766ca5 -->
- **actions** — Stop, Resume and Remove a session, the pane snapshot for dead sessions, confirm dialogs. → `docs/features/actions/INDEX.md`
- **connection** — Token and cookie auth, the /ws hello and snapshot, protocol version, connection banner, Claude version readout. → `docs/features/connection/INDEX.md`
- **focus** — Focus view: mainhead, main slot, dead surface, default focus, focus marker. → `docs/features/focus/INDEX.md`
- **groups** — Rail groups: sections, header summary and popover, select mode, filter, group create, rename, ungroup and delete, persistence. → `docs/features/groups/INDEX.md`
- **issue** — Issue capture and GitHub issue creation from the dashboard. → `docs/features/issue/INDEX.md`
- **launch** — Launch dialog, repo browse and picker, trust prompt, project-scoped settings write, the claude argv. → `docs/features/launch/INDEX.md`
- **notes** — A persistent, markdown-rendered note per session, edited from the Focus header and peeked from the rail card and tile header. → `docs/features/notes/INDEX.md`
- **past-sessions** — The launch dialog's Resume tab — a directory's Claude Code sessions listed from transcripts, the running-session guard, resume in the original mode. → `docs/features/past-sessions/INDEX.md`
- **rail** — Rail cards, attention versus manual order, pin, drag reorder, session count. → `docs/features/rail/INDEX.md`
- **reader** — The docs surface — a sanitized markdown reader for a session's plan and the .md files under its directory, with a file nav, outline and pop-out. → `docs/features/reader/INDEX.md`
- **reader-find** — The reader's own find bar — case-insensitive matches in the rendered document alone, highlighted without touching the sanitized body, in every reader host. → `docs/features/reader-find/INDEX.md`
- **rename** — Muster-owned session title override, inline rename in the mainhead and tiles. → `docs/features/rename/INDEX.md`
- **settings** — Settings dialog and the prefs it edits. → `docs/features/settings/INDEX.md`
- **shortcuts** — Keyboard chords routed to views, focus and tiles. → `docs/features/shortcuts/INDEX.md`
- **surfaces** — PTY bridge, xterm pane, the ephemeral shell surface, sizing, one live client per target. → `docs/features/surfaces/INDEX.md`
- **theme** — Muster theme preference and the Claude theme family poll. → `docs/features/theme/INDEX.md`
- **tiles** — Tiles view: slot-stable grid, strip, tile drag, density, snapshot-not-live rule. → `docs/features/tiles/INDEX.md`
- **update** — Release check, minisign-verified apply, in-place restart with sessions re-adopted. → `docs/features/update/INDEX.md`
- **usage** — Masthead usage bars, per-model weekly bar, per-session context gauge, usage poll and Keychain read. → `docs/features/usage/INDEX.md`
- **views** — Focus and Tiles switch, density preference, view containers. → `docs/features/views/INDEX.md`
- 73 records name files in this directory: `go tool kb for <path>` lists them for one file.
<!-- /kb:trailer -->
