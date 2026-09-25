// The WS-to-App mapping: every WS message's app-side effect (store write, emit, render).
// `coreWsHandlers` is what both `main.ts` and `doc.ts` register unchanged; `dashboardWsHandlers`
// layers the dashboard-only messages on top (session-removed/usage/update/shell-activity/
// mismatch/hello-arrived), which the pop-out has no feature to receive. Connection-status handling itself
// stays owned by `features/connection.ts` — this module only calls into whatever
// `WsAppConnection` the caller already built.
import type { App } from "./app";
import type { ClaudeCodeInfo } from "./protocol/hello";
import type { WsClientHandlers } from "./ws";
import type { ActionsHandle } from "./features/actions";

/** The slice of `ConnectionHandle`/`ConnectionState` (`features/connection.ts`) this
 * mapping needs. `ConnectionState.connected()` takes no argument — TS's function
 * subtyping (fewer parameters is a subtype of more) accepts it here unchanged; it simply
 * ignores the `claudeCode` `main.ts`'s `ConnectionHandle` renders a version readout from. */
export interface WsAppConnection {
  connected(claudeCode: ClaudeCodeInfo | null): void;
  disconnected(): void;
}

/** `WsAppConnection` plus the one method only the dashboard's protocol-mismatch handler
 * needs — `ConnectionHandle` (`features/connection.ts`) satisfies this; `ConnectionState`,
 * which `doc.ts` builds, does not, so it stays scoped to `dashboardWsHandlers`. */
export interface DashboardConnection extends WsAppConnection {
  showProtocolMismatch(): void;
}

/** Exactly what `doc.ts` registers verbatim; `dashboardWsHandlers` below spreads the
 * dashboard's own additional handlers over the result. */
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

/** The dashboard's full handler set: `coreWsHandlers` plus the messages only `main.ts`'s
 * features receive (the pop-out has no feature for any of these). Kept here, not in
 * `main.ts`, so every WS message's app-side effect lives in one module — `main.ts`'s
 * `WsClient` construction then holds only this call. */
export function dashboardWsHandlers(
  app: App,
  connection: DashboardConnection,
  actions: Pick<ActionsHandle, "handleRemoved">,
): WsClientHandlers {
  return {
    ...coreWsHandlers(app, connection),
    onSessionRemoved: (id) => actions.handleRemoved(id),
    onUsage: (usage) => {
      app.emit("usage", usage);
      app.render();
    },
    onShellActivity: (sessionId, busy) => {
      app.emit("shellActivity", sessionId, busy);
      app.render();
    },
    onUpdate: (update) => {
      app.emit("update", update);
      app.render();
    },
    onProtocolMismatch: () => connection.showProtocolMismatch(),
    // features/updaterestart.ts's own `app.on("helloArrived", ...)` decides what to do
    // with it (kb:adr/update-restart-reloads-dashboard) — this module only relays the
    // raw WS signal onto the event bus, same as every other message above.
    onHelloArrived: () => app.emit("helloArrived"),
  };
}
