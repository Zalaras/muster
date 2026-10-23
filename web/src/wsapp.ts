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
  claudeCodeChanged(claudeCode: ClaudeCodeInfo): void;
}

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
      app.emit("groups", snapshot.groups, snapshot.ungrouped);
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
    onGroups: (groups, ungrouped) => {
      app.emit("groups", groups, ungrouped);
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

function updateWsHandlers(app: App): Pick<WsClientHandlers, "onUpdate" | "onHelloArrived"> {
  return {
    onUpdate: (update) => {
      app.emit("update", update);
      app.render();
    },
    onHelloArrived: () => app.emit("helloArrived"),
  };
}

export function popoutWsHandlers(app: App, connection: WsAppConnection): WsClientHandlers {
  return { ...coreWsHandlers(app, connection), ...updateWsHandlers(app) };
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
    ...updateWsHandlers(app),
    onSessionRemoved: (id) => actions.handleRemoved(id),
    onUsage: (usage) => {
      app.emit("usage", usage);
      app.render();
    },
    onShellActivity: (sessionId, busy) => {
      app.emit("shellActivity", sessionId, busy);
      app.render();
    },
    onClaudeCode: (claudeCode) => connection.claudeCodeChanged(claudeCode),
    onProtocolMismatch: () => connection.showProtocolMismatch(),
  };
}
