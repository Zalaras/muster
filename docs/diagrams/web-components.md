---
id: web-components
type: diagram
status: active
date: 2026-09-25
kind: component
summary: The dashboard's modules by directory — two Vite entries over one app seam, features above render, derivation below, protocol at the bottom.
features: []
tags: [ux]
files: [web/src/**, web/vite.config.ts, web/index.html, web/doc.html]
tests: []
refs: [kb:diagram/containers, kb:adr/process-composition-roots-registration-only, kb:adr/reader-popout-is-a-second-page, kb:adr/connection-commands-http-ws-push-only, plans/_audit/diagrams-from-code.md]
---
Drawn from the `import` statements at directory granularity: `features/`, `render/`,
`sessions/`, `terminal/`, `reader/`, `protocol/` and `api/` are one node each, the root
modules are their own. `protocol/` and `api/` are split per concept/endpoint family, with
no barrel (`docs/conventions.md`).

Two Vite entries (`web/vite.config.ts`), each a composition root that only wires
(kb:adr/process-composition-roots-registration-only): `main.ts` for the dashboard,
`doc.ts` for the pop-out reader, which is a second page rather than a route
(kb:adr/reader-popout-is-a-second-page). Both now register the same `wsapp.ts` mapping
(`coreWsHandlers`) instead of hand-copying it, and no feature imports another: the mutual
needs of actions, tiles, focus and surfaces are resolved through thunks in `main.ts`. The
graph is acyclic but no longer a single line down: `render/`, `terminal/`, `reader/` and
`api/` all sit below `features/`, and `render/`/`terminal/`/`features/` each reach `api/`
directly too. `app.ts` is the seam all of those reach for shared state (including
`ConnectionStatus`, moved here off `render/masthead.ts` to cut a cycle), and it depends on
nothing above `sessions/`/`protocol/`, so no loop closes back up.

This opens the Dashboard box of kb:diagram/containers; the daemon and `localStorage` stay on
that diagram and the module descriptions say which module reaches them. Three modules talk to
the daemon, matching kb:adr/connection-commands-http-ws-push-only: `api/` holds the only
`fetch`, `ws.ts` the server-to-client state socket, and `terminal/pane.ts` the one WebSocket
constructed outside `ws.ts`, per live terminal. `localStorage` is reached through one seam,
`storage.ts`'s `readJson`/`writeJson`, by the reader's per-session memory and the first-paint
theme hint, never session state; `sessionStorage` through the same seam, by the update
restart handoff only (kb:adr/update-restart-reloads-dashboard). `protocol/` is imported by every layer for wire types,
so those seven wires sit on its box rather than drawn. `dragmime.ts` is the other root-level
leaf: the drag-reorder MIME marker `render/dragreorder.ts` sets and `terminal/pane.ts`
checks, owned by neither.

```mermaid
C4Component
    title Component diagram for the Dashboard

    Container_Boundary(dashboard, "Dashboard") {
        Boundary(ctl, "Entries and controllers") {
            Component(main, "main.ts", "entry", "Dashboard composition root: inits 17 controllers, owns render order")
            Component(features, "features/", "23 modules", "17 stateful per-feature controllers (the update feature has two: its Settings panel and its restart banner/reload), own their elements and listeners, plus 6 DOM-free helpers each owned by one controller")
            Component(doc, "doc.ts", "entry", "Pop-out reader composition root")
            Component(wsapp, "wsapp.ts", "mapping", "The WS-to-app mapping both entries register, then layer their own handlers on top of")
        }
        Boundary(rnd, "Render and seam") {
            Component(render, "render/", "28 modules", "DOM only — view-model in, DOM out")
            Component(app, "app.ts", "seam", "Session store, shared state (incl. ConnectionStatus), typed event bus, render phases")
        }
        Boundary(leaves, "Leaves") {
            Component(protocol, "protocol/", "8 modules", "Wire types and parsers for protocol version 2, split per concept, no barrel; imported by every layer, wires not drawn")
            Component(ws, "ws.ts", "WebSocket", "The state socket to musterd, backoff, dispatch")
            Component(api, "api/", "8 modules", "The only fetch to musterd, one file per endpoint family, no barrel; ApiResult, never throws")
            Component(terminal, "terminal/", "8 modules", "xterm.js surfaces, the per-terminal socket to musterd, shell key translation, drop wiring and the shell activity reducer")
            Component(dom, "dom.ts", "helpers", "Element lookup")
            Component(reader, "reader/", "10 modules", "Markdown render, nav tree, per-session memory")
            Component(sessions, "sessions/", "12 modules", "Pure derivation — view-models, sort, tile math, formatters, a path basename")
            Component(theme, "theme.ts", "registry", "Theme choice; first-paint hint")
            Component(shortcuts, "shortcuts.ts", "pure", "Keyboard chord table")
            Component(storage, "storage.ts", "seam", "The one localStorage/sessionStorage read/write-JSON seam")
            Component(dragmime, "dragmime.ts", "const", "The drag-reorder MIME marker, owned by neither render nor terminal")
        }
    }

    Rel(main, features, "inits")
    Rel(main, ws, "constructs")
    Rel(main, wsapp, "registers")
    Rel(main, app, "creates")
    Rel(main, render, "drop guard")
    Rel(doc, features, "reader, connection, theme")
    Rel(doc, ws, "constructs")
    Rel(doc, wsapp, "registers")
    Rel(doc, dom, "mounts host")
    Rel(doc, app, "creates")
    Rel(wsapp, app, "store/state writes")
    Rel(wsapp, ws, "handlers")

    Rel(features, render, "DOM writers")
    Rel(features, api, "commands")
    Rel(features, terminal, "surfaces")
    Rel(features, reader, "markdown, tree")
    Rel(features, sessions, "derivation")
    Rel(features, app, "state, events")
    Rel(features, dom, "lookup")
    Rel(features, theme, "theme")
    Rel(features, shortcuts, "chords")

    Rel(render, api, "snapshot load")
    Rel(render, terminal, "segment types")
    Rel(render, reader, "tree types")
    Rel(render, sessions, "view-models")
    Rel(render, app, "status type")
    Rel(render, dragmime, "sets on dragstart")
    Rel(terminal, api, "locate drop")
    Rel(terminal, dragmime, "checks on drop")
    Rel(reader, sessions, "freshness")
    Rel(reader, app, "connection state")
    Rel(reader, storage, "per-session memory")
    Rel(theme, storage, "first-paint hint")
    Rel(features, storage, "restart handoff")
    Rel(app, sessions, "SessionStore")

    UpdateRelStyle(main, app, $offsetY="-22")
    UpdateRelStyle(main, ws, $offsetX="70", $offsetY="-10")
    UpdateRelStyle(features, reader, $offsetY="-20")
    UpdateRelStyle(render, terminal, $offsetY="22")
    UpdateRelStyle(features, api, $offsetY="-18")
    UpdateLayoutConfig($c4ShapeInRow="1", $c4BoundaryInRow="3")
```
