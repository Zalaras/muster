# web/src/render — pure DOM builders, no state

**Owns**: the DOM half of every view: rail cards, tiles and strip, mainhead, masthead, dead surface, confirm dialogs, inline rename editor, drag wiring, drop guard. No state, fetch or socket here; derivation lives in `web/src/sessions/`, wiring in `web/src/features/`. **Features**: actions, connection, drop, focus, launch, rail, rename, tiles, update, usage.

**Invariants** (violations are review-Critical):
- Every displayed string comes from a pure view-model (`sessions.ts` reads `../sessions/card.ts`); a builder never composes a second copy of text a card already owns.
- No `innerHTML` with interpolated data; build via `<template>` clones and `textContent`.
- Focusable controls inside the render tick are reused, never rebuilt; a builder creates once and updates in place (kb:lesson/select-rebuilt-every-tick-passed-selectoption).
- An unknown gauge renders the word "unknown" and no track (kb:adr/usage-unknown-renders-word-not-track).
- Pointer and DnD listeners map events to session ids and call back; the caller in `features/` owns the reorder math (`dragreorder.ts`).

**Exemplar**: `confirm.ts` — elements in, handlers in, a small controller out; copy this shape for a new dialog. `context.ts` for one builder rendered in two places.

**Gotchas**:
- `insertBefore` on a mounted node detaches it first and Chrome blurs the focused descendant; wrap reorders in `focus.ts`'s snapshot and restore.
- A `[hidden]` element with an author `display` rule stays visible (kb:lesson/display-rule-overrides-hidden-attribute).
- A shared class carries its CSS along: `.acts-row` hover-opacity hid the dead surface's Resume (kb:lesson/shared-class-css-hid-resume-button).
- `dead.ts` renders in two hosts, Focus's `#dead-surface` and every tile clone; change the builder, never one host.

<!-- kb:trailer -->
<!-- kb:hash 3ac32e7c9f63511d -->
- **actions** — End, Resume and Remove a session, the pane snapshot for dead sessions, confirm dialogs. → `docs/features/actions/INDEX.md`
- **connection** — Token and cookie auth, the /ws hello and snapshot, protocol version, connection banner, Claude version readout. → `docs/features/connection/INDEX.md`
- **drop** — File drop pastes the original on-disk path into the pane. → `docs/features/drop/INDEX.md`
- **focus** — Focus view: mainhead, main slot, dead surface, default focus, focus marker. → `docs/features/focus/INDEX.md`
- **launch** — Launch dialog, repo browse and picker, trust prompt, project-scoped settings write, the claude argv. → `docs/features/launch/INDEX.md`
- **rail** — Rail cards, attention versus manual order, pin, drag reorder, session count. → `docs/features/rail/INDEX.md`
- **rename** — Muster-owned session title override, inline rename in the mainhead and tiles. → `docs/features/rename/INDEX.md`
- **tiles** — Tiles view: slot-stable grid, strip, tile drag, density, snapshot-not-live rule. → `docs/features/tiles/INDEX.md`
- **update** — Release check, minisign-verified apply, in-place restart with sessions re-adopted. → `docs/features/update/INDEX.md`
- **usage** — Masthead usage bars, per-model weekly bar, per-session context gauge, usage poll and Keychain read. → `docs/features/usage/INDEX.md`
- 22 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
