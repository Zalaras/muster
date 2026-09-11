// Muster dashboard entrypoint (docs/protocol.md §8). The composition root only (plan
// code-breakup REQ-1): builds the app, initialises every feature controller in
// dependency order, wires the one `WsClient` to `app`, starts the 1s tick, and installs
// the document-level drop guard. No DOM lookup, no DOM listener, no module-level mutable
// state lives here — each feature controller under `features/` owns its own element
// lookups, listeners and closure state (docs/conventions.md > Composition roots).
//
// Init order below is dependency order, not the render-phase order (the two are
// independent — see the numbered block further down): most controllers take real handle
// values from controllers already constructed; `actions` and `tiles` instead take a
// small thunk (`() => laterConst.method(...)`) for the one or two methods they need from
// a controller constructed *after* them, since those thunks are only ever invoked later
// (a click, a render pass) — never synchronously during the referencing controller's own
// init call. This is what lets `actions`/`tiles`/`focus`/`surfaces`' mutual needs resolve
// without a construction cycle (cf. the daemon side's Edge Case 13).
import { createApp } from "./app";
import { initActions } from "./features/actions";
import { initUsage } from "./features/usage";
import { initUpdate } from "./features/update";
import { initIssue } from "./features/issue";
import { initTiles } from "./features/tiles";
import { initFocus } from "./features/focus";
import { initSurfaces } from "./features/surfaces";
import { initRail } from "./features/rail";
import { initViews } from "./features/views";
import { initRename } from "./features/rename";
import { initTheme } from "./features/theme";
import { initLaunch } from "./features/launch";
import { initSettings } from "./features/settings";
import { initShortcuts } from "./features/shortcuts";
import { initConnection } from "./features/connection";
import { installDropGuard } from "./render/dropguard";
import { WsClient } from "./ws";

const app = createApp();

const actions = initActions(app, {
  focusDeadSurfaceRefs: () => focus.deadSurfaceRefs,
  tileBodySlot: (id) => tiles.bodySlotFor(id),
});
initUsage(app);
const update = initUpdate(app);
initIssue(app);
const tiles = initTiles(app, {
  actions,
  getSurfaces: () => surfaces,
  getRenameHandlers: () => rename.tileRenameHandlers,
});
const focus = initFocus(app, {
  actions,
  getSurfaces: () => surfaces,
  promoteTile: tiles.promote,
});
const surfaces = initSurfaces(app, { tilesLive: () => tiles.liveIds() });
initRail(app, { actions, surfaces });
const views = initViews(app);
// Render phase order (UI Specifications > Render phase order — behaviour-bearing):
//  1. actions  — dead-pane tracking (registered inside initActions)
//  2. usage    — gauges/model week/model readout (initUsage)
//  3. update   — Updates section + Settings badge (initUpdate)
//  4. issue    — Issue button disabled state (initIssue)
//  5. tiles    — membership: tilesLive tracks density (initTiles)
//  6. focus    — default focusedId (initFocus)
//  7. surfaces — open/close diff over (id, kind) keys (initSurfaces)
//  8. rail     — renderSessions, count, sort select (initRail)
//  9. views    — switcher, density control, view containers' hidden (initViews)
// 10. focus (view) in Focus, else tiles (view) in Tiles — the one phase inherently split
//     across two controllers by shared state, so it is registered here rather than
//     inside either controller's own init.
app.onRender((frame) => {
  if (app.state.view === "focus") focus.renderView(frame);
  else tiles.renderView(frame);
});
const rename = initRename(app, { focus });
initTheme(app, { surfaces });
initLaunch(app, { tiles });
initSettings(app, { update });
initShortcuts(app, { views, focus, actions });
const connection = initConnection(app);

// plan file-drop-fix REQ-1: a document-level foreign-drag/drop guard, installed once at
// startup — swallows a drag/drop anywhere it isn't already claimed by a terminal
// surface's own drop target or the tile/rail reorder handlers (REQ-9/INV-3).
installDropGuard(document);

// Every view ticks every second (design-system §2 tabular-nums timers) — this never
// opens/closes a socket by itself (surfaces.ts's diff is a no-op unless membership
// actually changed); it just keeps timers, sizenote/footer geometry and chrome text
// current.
setInterval(app.render, 1000);
app.render();

const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
const wsUrl = `${wsProtocol}//${location.host}/ws`;

const client = new WsClient(wsUrl, {
  onConnecting: () => connection.disconnected(),
  onHello: (hello) => connection.connected(hello.claudeCode),
  onSnapshot: (snapshot) => {
    app.store.replaceAll(snapshot.sessions);
    app.emit("prefs", snapshot.prefs);
    app.emit("snapshot", snapshot);
    app.render();
  },
  onSessionUpsert: (session) => {
    app.store.upsert(session);
    app.render();
  },
  onSessionRemoved: (id) => actions.handleRemoved(id),
  onPrefs: (prefs) => {
    app.emit("prefs", prefs);
    app.render();
  },
  onUsage: (usageInfo) => {
    app.emit("usage", usageInfo);
    app.render();
  },
  onClaudeTheme: (family) => app.emit("claudeTheme", family),
  onUpdate: (updateInfo) => {
    app.emit("update", updateInfo);
    app.render();
  },
  onDisconnected: () => connection.disconnected(),
  onProtocolMismatch: () => connection.showProtocolMismatch(),
});

client.start();
