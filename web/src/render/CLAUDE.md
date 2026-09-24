# web/src/render — pure DOM builders, no state

**Owns**: the DOM half of every view: rail cards, tiles and strip, mainhead, masthead, dead surface, confirm dialogs, inline rename editor, drag wiring, drop guard, the reader (bar, nav tree, outline) and its diagram pass (`diagrams.ts`, `mermaid.ts`, `diagramdialog.ts`). No cross-call state here (render-state rule below); session/reader derivation lives in `web/src/sessions/`/`web/src/reader/`, wiring in `web/src/features/`. A DOM-free decision only one controller calls lives in `web/src/features/`, not here — a builder here takes the computed value, never the raw data (docs/conventions.md § Composition roots). **Features**: actions, connection, drop, focus, launch, rail, reader, rename, tiles, update, usage.

**Render-state rule**: a builder holds only its own instance's state — never state keyed across calls by an external id; that belongs to the caller, which holds refs it built once (`masthead.ts`'s model-week `<select>`, not a module-level `Map`).

**Invariants** (violations are review-Critical):
- Every displayed string comes from a pure view-model (`sessions.ts` reads `../sessions/card.ts`); a builder never composes a second copy of text a card already owns.
- No `innerHTML` with interpolated data; build via `<template>` clones and `textContent`.
- Focusable controls inside the render tick are reused, never rebuilt; a builder creates once and updates in place (kb:lesson/select-rebuilt-every-tick-passed-selectoption).
- An unknown gauge renders the word "unknown" and no track (kb:adr/usage-unknown-renders-word-not-track).
- Pointer and DnD listeners map events to session ids and call back; the caller in `features/` owns the reorder math (`dragreorder.ts`).

**Exemplar**: `confirm.ts` — elements/handlers in, a controller out, copy this shape. `context.ts`: one builder, two renderers.

**Gotchas**:
- `insertBefore` on a mounted node detaches it first and Chrome blurs the focused descendant; via `focuskeep.ts`'s snapshot/restore. `keyedreorder.ts` shares this across the rail, strip and grid.
- A `[hidden]` element with an author `display` rule stays visible (kb:lesson/display-rule-overrides-hidden-attribute).
- A shared class carries its CSS along: `.acts-row` hover-opacity hid the dead surface's Resume (kb:lesson/shared-class-css-hid-resume-button).
- `dead.ts` renders in two hosts, Focus's `#dead-surface` and every tile clone; change the builder, never one host.
- `reader.ts`'s tree/outline rebuild only when their flattened signature (stashed on the container's `dataset`) changes, so the 1s tick never steals focus from a tree button or the filter box.
- `diagramdialog.ts`'s backdrop-close is `event.target === dialogEl` — a `<dialog>`'s `::backdrop` isn't a real node, so an outside click targets the dialog itself; only when its children fill the whole box (no padding left uncovered).

<!-- kb:trailer -->
<!-- kb:hash fcfb22ea346c0688 -->
- **actions** — End, Resume and Remove a session, the pane snapshot for dead sessions, confirm dialogs. → `docs/features/actions/INDEX.md`
- **connection** — Token and cookie auth, the /ws hello and snapshot, protocol version, connection banner, Claude version readout. → `docs/features/connection/INDEX.md`
- **drop** — File drop pastes the original on-disk path into the pane. → `docs/features/drop/INDEX.md`
- **focus** — Focus view: mainhead, main slot, dead surface, default focus, focus marker. → `docs/features/focus/INDEX.md`
- **issue** — Issue capture and GitHub issue creation from the dashboard. → `docs/features/issue/INDEX.md`
- **launch** — Launch dialog, repo browse and picker, trust prompt, project-scoped settings write, the claude argv. → `docs/features/launch/INDEX.md`
- **rail** — Rail cards, attention versus manual order, pin, drag reorder, session count. → `docs/features/rail/INDEX.md`
- **reader** — The docs surface — a sanitized markdown reader for a session's plan and the .md files under its directory, with a file nav, outline and pop-out. → `docs/features/reader/INDEX.md`
- **rename** — Muster-owned session title override, inline rename in the mainhead and tiles. → `docs/features/rename/INDEX.md`
- **settings** — Settings dialog and the prefs it edits. → `docs/features/settings/INDEX.md`
- **surfaces** — PTY bridge, xterm pane, the ephemeral shell surface, sizing, one live client per target. → `docs/features/surfaces/INDEX.md`
- **tiles** — Tiles view: slot-stable grid, strip, tile drag, density, snapshot-not-live rule. → `docs/features/tiles/INDEX.md`
- **update** — Release check, minisign-verified apply, in-place restart with sessions re-adopted. → `docs/features/update/INDEX.md`
- **usage** — Masthead usage bars, per-model weekly bar, per-session context gauge, usage poll and Keychain read. → `docs/features/usage/INDEX.md`
- 35 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
