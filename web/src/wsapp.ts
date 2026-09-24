// The WS-to-App mapping: what a `WsClient` message does to
// `app.store`/`app.state` — store replace/upsert, the snapshot's `prefs` + `snapshot`
// emits, a render after each. `main.ts` and `doc.ts` used to hand-copy this into their own
// handler bodies; both now register `coreWsHandlers(app, connection)` and layer their own
// handlers on top (the dashboard's session-removed/usage/update/shell-activity/mismatch
// wiring, which the pop-out has no feature to receive). Connection-status handling itself
// stays owned by `features/connection.ts` — this module only calls into whatever
// `WsAppConnection` the caller already built.
import type { App } from "./app";
import type { ClaudeCodeInfo } from "./protocol/hello";
import type { WsClientHandlers } from "./ws";

/** The slice of `ConnectionHandle`/`ConnectionState` (`features/connection.ts`) this
 * mapping needs. `ConnectionState.connected()` takes no argument — TS's function
 * subtyping (fewer parameters is a subtype of more) accepts it here unchanged; it simply
 * ignores the `claudeCode` `main.ts`'s `ConnectionHandle` renders a version readout from. */
export interface WsAppConnection {
  connected(claudeCode: ClaudeCodeInfo | null): void;
  disconnected(): void;
}

/** Exactly what `doc.ts` registers verbatim; `main.ts` spreads its own dashboard-only
 * handlers over the result ("the pop-out differs from the dashboard only in
 * the handlers it declares it leaves out"). */
export function coreWsHandlers(app: App, connection: WsAppConnection): WsClientHandlers {
  return {
    onConnecting: () => connection.disconnected(),
    onHello: (hello) => connection.connected(hello.claudeCode),
    onSnapshot: (snapshot) => {
      app.store.replaceAll(snapshot.sessions);
      // The live `prefs` broadcast only fires on a change (`internal/server/prefs.go`),
      // so the initial theme/view/density choice — on either page — comes from the
      // snapshot itself, not just later broadcasts.
      app.emit("prefs", snapshot.prefs);
      app.emit("snapshot", snapshot);
      app.render();
    },
    onSessionUpsert: (session) => {
      app.store.upsert(session);
      app.render();
    },
    onPrefs: (prefs) => {
      app.emit("prefs", prefs);
      app.render();
    },
    onClaudeTheme: (family) => app.emit("claudeTheme", family),
    onDocChanged: (msg) => {
      app.emit("docChanged", msg);
      app.render();
    },
    onDisconnected: () => connection.disconnected(),
  };
}
