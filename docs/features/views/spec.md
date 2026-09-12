---
id: views
type: spec
status: active
date: 2026-09-12
summary: Focus and Tiles switch, density preference, view containers.
features: [views]
tags: [ux]
go: [internal/server/prefs*.go]
web: [web/src/features/views.ts]
e2e: [web/e2e/views.spec.ts]
protocol: [prefs.put, ws.prefs]
refs: [kb:adr/views-focus-and-tiles-peers, kb:adr/views-active-segment-click-commits-rename, kb:adr/surfaces-one-live-client-per-session, docs/design/ux-flows.md, docs/design/design-system.md]
---
The dashboard has two peer views, Focus (kb:spec/focus) and Tiles (kb:spec/tiles), switched
from a segmented control in the masthead or the toggle chord (kb:spec/shortcuts)
(kb:adr/views-focus-and-tiles-peers, docs/design/design-system.md "The two views"). The
masthead, state colours, attention ordering and degraded states are identical in both.

The choice and the Tiles density are preferences: the switch sends `kb:anchor/prefs.put`
and the view changes only when the `kb:anchor/ws.prefs` echo arrives, never optimistically,
so a second window stays in sync and a reconnect echoing identical prefs changes nothing.
Both persist across reloads and daemon restarts (docs/design/ux-flows.md "Switching
views"). Switching moves geometry ownership between the pane and the tiles and never
duplicates it (kb:adr/surfaces-one-live-client-per-session). Switching cancels an open
rename; clicking the already-active segment commits it
(kb:adr/views-active-segment-click-commits-rename). Each view hides the other's New session
button so exactly one is visible.
