# web/src/features — controllers, one per feature

**Owns**: one controller per feature. Each `init<Name>(app, deps)` looks up its elements, attaches listeners, subscribes via `app.on`, registers a render phase via `app.onRender`, returns a small handle. `web/src/main.ts` registers each in one line; `web/src/app.ts` is the shared seam (store, `AppState`, event bus, render frame). Pure logic lives in `sessions/` or `terminal/`, DOM building in `render/`. **Features**: actions, connection, focus, issue, launch, rail, rename, settings, shortcuts, surfaces, theme, tiles, update, usage, views.

**Invariants** (violations are review-Critical):
- `main.ts` holds no DOM lookup, listener, or module-level mutable state (kb:adr/process-composition-roots-registration-only).
- No controller imports a sibling; `deps` is typed structurally with the exact methods it calls.
- Each `AppState` field has exactly one writer, adopted from a `prefs` broadcast, never optimistically from a click.
- Every daemon call goes through `../api.ts`; one `WsClient` owns the connection.
- The name matches the server handler file, E2E spec prefix and helper (kb:adr/process-one-name-per-feature).
- Shortcuts dispatch on `matchShortcut`'s action, never on `event.key` (kb:adr/shortcuts-match-event-code-in-pure-module).

**Exemplar**: `usage.ts` — depends on no other controller; copy it, then register in `main.ts`.

**Gotchas**:
- Init order is dependency order; a controller needing a later one takes a thunk (`() => surfaces`) invoked only from a click or render pass.
- Render phase order is behaviour-bearing, numbered in `main.ts`.
- A `prefs` handler compares the message against its own last value, not `app.state`, which it is about to overwrite (`views.ts`).
- `connection.ts` shows "connecting…" until the first `hello`; the banner appears only after that (kb:adr/connection-banner-only-after-first-hello).

<!-- kb:trailer -->
<!-- kb:hash c0adc07440e4d425 -->
- **actions** — End, Resume and Remove a session, the pane snapshot for dead sessions, confirm dialogs. → `docs/features/actions/INDEX.md`
- **connection** — Token and cookie auth, the /ws hello and snapshot, protocol version, connection banner, Claude version readout. → `docs/features/connection/INDEX.md`
- **focus** — Focus view: mainhead, main slot, dead surface, default focus, focus marker. → `docs/features/focus/INDEX.md`
- **issue** — Issue capture and GitHub issue creation from the dashboard. → `docs/features/issue/INDEX.md`
- **launch** — Launch dialog, repo browse and picker, trust prompt, project-scoped settings write, the claude argv. → `docs/features/launch/INDEX.md`
- **rail** — Rail cards, attention versus manual order, pin, drag reorder, session count. → `docs/features/rail/INDEX.md`
- **rename** — Muster-owned session title override, inline rename in the mainhead and tiles. → `docs/features/rename/INDEX.md`
- **settings** — Settings dialog and the prefs it edits. → `docs/features/settings/INDEX.md`
- **shortcuts** — Keyboard chords routed to views, focus and tiles. → `docs/features/shortcuts/INDEX.md`
- **surfaces** — PTY bridge, xterm pane, the ephemeral shell surface, sizing, one live client per target. → `docs/features/surfaces/INDEX.md`
- **theme** — Muster theme preference and the Claude theme family poll. → `docs/features/theme/INDEX.md`
- **tiles** — Tiles view: slot-stable grid, strip, tile drag, density, snapshot-not-live rule. → `docs/features/tiles/INDEX.md`
- **update** — Release check, minisign-verified apply, in-place restart with sessions re-adopted. → `docs/features/update/INDEX.md`
- **usage** — Masthead usage bars, per-model weekly bar, per-session context gauge, usage poll and Keychain read. → `docs/features/usage/INDEX.md`
- **views** — Focus and Tiles switch, density preference, view containers. → `docs/features/views/INDEX.md`
- 35 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
