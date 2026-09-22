---
id: web-components
type: diagram
status: active
date: 2026-09-15
kind: component
summary: The dashboard's modules by directory — two Vite entries over one app seam, features above render, derivation below, protocol at the bottom.
features: []
tags: [ux]
files: [web/src/**, web/vite.config.ts, web/index.html, web/doc.html]
tests: []
refs: [kb:diagram/containers, kb:adr/process-composition-roots-registration-only, kb:adr/reader-popout-is-a-second-page, kb:adr/connection-commands-http-ws-push-only, plans/_audit/diagrams-from-code.md]
---
Drawn from the `import` statements at directory granularity: `features/`, `render/`,
`sessions/`, `terminal/` and `reader/` are one node each, the root modules are their own.

Two Vite entries (`web/vite.config.ts`), each a composition root that only wires
(kb:adr/process-composition-roots-registration-only): `main.ts` for the dashboard,
`doc.ts` for the pop-out reader, which is a second page rather than a route
(kb:adr/reader-popout-is-a-second-page). The graph is acyclic and strictly layered — entry →
`features/` → (`render/` | `terminal/` | `reader/`) → `sessions/` → `protocol.ts` — and no
feature imports another: the mutual needs of actions, tiles, focus and surfaces are resolved
through thunks in `main.ts`.

This opens the Dashboard box of kb:diagram/containers; the daemon and `localStorage` stay on
that diagram and the module descriptions say which module reaches them. Three modules talk to
the daemon, matching kb:adr/connection-commands-http-ws-push-only: `api.ts` holds the only
`fetch`, `ws.ts` the server-to-client state socket, and `terminal/pane.ts` the one WebSocket
constructed outside `ws.ts`, per live terminal. `localStorage` holds only the reader's per-session
memory and the first-paint theme hint, never session state. `protocol.ts` is imported by every
layer for wire types, so those seven wires are stated on its box rather than drawn.

```mermaid
C4Component
    title Component diagram for the Dashboard

    Container_Boundary(dashboard, "Dashboard") {
        Boundary(ctl, "Entries and controllers") {
            Component(main, "main.ts", "entry", "Dashboard composition root: inits 16 controllers, owns render order")
            Component(features, "features/", "16 controllers", "Stateful per-feature controllers; own their elements and listeners")
            Component(doc, "doc.ts", "entry", "Pop-out reader composition root")
        }
        Boundary(rnd, "Render and seam") {
            Component(render, "render/", "21 modules", "DOM only — view-model in, DOM out")
            Component(app, "app.ts", "seam", "Session store, shared state, typed event bus, render phases")
        }
        Boundary(leaves, "Leaves") {
            Component(protocol, "protocol.ts", "types", "Wire types and parsers for protocol version 2; imported by every layer, wires not drawn")
            Component(ws, "ws.ts", "WebSocket", "The state socket to musterd, backoff, dispatch")
            Component(api, "api.ts", "fetch", "The only fetch to musterd; ApiResult, never throws")
            Component(terminal, "terminal/", "7 modules", "xterm.js surfaces, the per-terminal socket to musterd, shell key translation and the shell activity reducer")
            Component(dom, "dom.ts", "helpers", "Element lookup")
            Component(reader, "reader/", "9 modules", "Markdown render, nav tree, per-session memory in localStorage")
            Component(sessions, "sessions/", "8 modules", "Pure derivation — view-models, sort, tile math, formatters")
            Component(theme, "theme.ts", "registry", "Theme choice; first-paint hint in localStorage")
            Component(shortcuts, "shortcuts.ts", "pure", "Keyboard chord table")
        }
    }

    Rel(main, features, "inits")
    Rel(main, ws, "constructs")
    Rel(main, app, "creates")
    Rel(main, render, "drop guard")
    Rel(doc, features, "reader, connection, theme")
    Rel(doc, ws, "constructs")
    Rel(doc, dom, "mounts host")
    Rel(doc, app, "creates")

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
    Rel(render, terminal, "segment")
    Rel(render, reader, "tree types")
    Rel(render, sessions, "view-models")
    Rel(terminal, api, "locate drop")
    Rel(terminal, render, "drag MIME")
    Rel(reader, sessions, "freshness")
    Rel(app, sessions, "SessionStore")
    Rel(app, render, "status type")

    UpdateRelStyle(main, app, $offsetY="-22")
    UpdateRelStyle(main, ws, $offsetX="70", $offsetY="-10")
    UpdateRelStyle(features, reader, $offsetY="-20")
    UpdateRelStyle(terminal, render, $offsetY="22")
    UpdateRelStyle(features, api, $offsetY="-18")
    UpdateLayoutConfig($c4ShapeInRow="1", $c4BoundaryInRow="3")
```
