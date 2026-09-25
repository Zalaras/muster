// Muster dashboard entrypoint (docs/history/protocol-changelog.md). The composition root
// only (kb:adr/process-composition-roots-registration-only): builds the app, initialises
// every feature controller in dependency order, wires the one `WsClient` to `app`, starts
// the 1s tick, and installs
// the document-level drop guard. No DOM lookup, no DOM listener, no module-level mutable
// state lives here — each feature controller under `features/` owns its own element
// lookups, listeners and closure state (docs/conventions.md > Composition roots).
//
// Init order below is dependency order, not the render-phase order (the two are
// independent — see the numbered block further down): most controllers take real handle
// values from controllers already constructed; `tiles` and `focus` instead take a small
// thunk (`() => laterConst.method(...)`) for the one or two methods they need from a
// controller constructed *after* them — `surfaces` and `reader` are each constructed
// before their only consumers need them, so both take real values — since those thunks
// are only ever invoked later (a click, a render pass) — never synchronously during the
// referencing controller's own init call. This is what lets their mutual needs resolve
// without a construction cycle.
import { createApp } from "./app";
import { initActions } from "./features/actions";
import { initUsage } from "./features/usage";
import { initUpdate } from "./features/update";
import { initUpdateRestart } from "./features/updaterestart";
import { initIssue } from "./features/issue";
import { initTiles } from "./features/tiles";
import { initFocus } from "./features/focus";
import { initSurfaces } from "./features/surfaces";
import { initReader } from "./features/reader";
import { initRail } from "./features/rail";
import { initViews } from "./features/views";
import { initRename } from "./features/rename";
import { initTheme } from "./features/theme";
import { initLaunch } from "./features/launch";
import { initSettings } from "./features/settings";
import { initShortcuts } from "./features/shortcuts";
import { initConnection } from "./features/connection";
import { installDropGuard } from "./render/dropguard";
import { WsClient, wsUrl } from "./ws";
import { dashboardWsHandlers } from "./wsapp";

const app = createApp();

const actions = initActions(app);
initUsage(app);
initUpdate(app);
const updateRestart = initUpdateRestart(app);
initIssue(app);
const rename = initRename(app);
const tiles = initTiles(app, {
  actions,
  getSurfaces: () => surfaces,
  renameHandlers: rename.tileRenameHandlers,
  getReader: () => reader,
});
const focus = initFocus(app, {
  actions,
  getSurfaces: () => surfaces,
  promoteTile: tiles.promote,
  getReader: () => reader,
  renameHandlers: rename.mainheadRenameHandlers,
});
const surfaces = initSurfaces(app, { tilesLive: tiles.liveIds });
const reader = initReader(app, { tilesLive: tiles.liveIds, surfaces });
initRail(app, { actions, surfaces });
// Render phase order (behaviour-bearing — see each phase's own controller for why its
// position matters):
//  1. actions  — dead-pane tracking (registered inside initActions)
//  2. usage    — gauges/model week/model readout (initUsage)
//  3. update   — Updates section + Settings badge (initUpdate)
//  4. issue    — Issue button disabled state (initIssue)
//  5. tiles    — membership: tilesLive tracks density (initTiles)
//  6. focus    — default focusedId (initFocus)
//  7. surfaces — open/close diff over (id, kind) keys (initSurfaces)
//  8. reader   — mount/dispose diff over docs-selected sessions (initReader)
//  9. rail     — renderSessions, count, sort select (initRail)
// 10. views    — switcher, density control, view containers' hidden, then focus (view) in
//     Focus, else tiles (view) in Tiles — registered inside initViews, since that phase is
//     inherently split across two controllers by shared state (views.ts).
// 11. connection — banner text/visibility, time-based as well as status-driven
//     (initConnection, registered further down once `updateRestart` exists to supply it)
const views = initViews(app, { focus, tiles });
initTheme(app);
const launch = initLaunch(app, { focus, surfaces });
initSettings(app);
initShortcuts(app, { views, focus, actions, launch });
const connection = initConnection(app, {
  restartBanner: updateRestart.bannerOverride,
  reloading: updateRestart.reloading,
});

// A document-level foreign-drag/drop guard, installed once at
// startup — swallows a drag/drop anywhere it isn't already claimed by a terminal
// surface's own drop target or the tile/rail reorder handlers
// (kb:adr/drop-reorder-drag-mime-custom-type).
installDropGuard(document);

// Every view ticks every second (design-system §2 tabular-nums timers) — this never
// opens/closes a socket by itself (surfaces.ts's diff is a no-op unless membership
// actually changed); it just keeps timers, sizenote/footer geometry and chrome text
// current.
setInterval(app.render, 1000);
app.render();

const client = new WsClient(wsUrl("/ws"), dashboardWsHandlers(app, connection, actions));

client.start();
