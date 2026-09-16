// The pop-out page's composition root (plan markdown-viewing REQ-8/REQ-27,
// kb:adr/reader-popout-is-a-second-page) — a second Vite entry, not a hash route inside
// `index.html`'s own composition root (Implementation Notes). Builds the same `App` +
// `WsClient` shape `main.ts` does and mounts one standalone `ReaderInstance` into
// `#reader-host`; there is no masthead, rail, banner or any other feature here.
//
// Every `WsClient` callback below was checked against what `main.ts` wires, not carried
// over by analogy (review cycle 5 Critical 1 — the previous version wired none of the
// three connection callbacks, so `app.state.connection` never left its "connecting"
// default and the reader's status line asserted "unreachable" forever, even while this
// page's own socket was live). Wired: `onConnecting`/`onHello`/`onDisconnected` (feed
// `createConnectionState`, the only thing standing between "unreachable" being true or
// false), `onSnapshot`/`onSessionUpsert`/`onDocChanged` (the reader reads the store and
// this event directly), `onPrefs`/`onClaudeTheme` (plan general-cleanup REQ-9 — an open
// pop-out follows a live theme change the same way the dashboard does; `initTheme` below
// is the same controller `main.ts` registers, with a no-op `surfaces.applyTheme` since
// this page has no terminal surfaces to re-theme). Deliberately not wired:
// `onSessionRemoved` — `initReader`'s own `sessionRemoved` subscription is gated
// `if (!standalone)`, so it would be a dead wire here regardless; `onUsage`/`onUpdate`
// (no feature on this page reads either); and `onProtocolMismatch` (the plan's States
// table has no mismatch row for `/doc.html`, and a full takeover needs the shell/banner
// markup this page doesn't have).
import { createApp } from "./app";
import { requireElement } from "./dom";
import { createConnectionState } from "./features/connection";
import { initReader } from "./features/reader";
import { initTheme } from "./features/theme";
import { WsClient } from "./ws";

function readQuery(): { sessionId: number | null; path: string | null } {
  const params = new URLSearchParams(location.search);
  const rawSession = params.get("session");
  const sessionId = rawSession !== null && /^\d+$/.test(rawSession) ? Number(rawSession) : null;
  return { sessionId, path: params.get("path") };
}

const { sessionId, path } = readQuery();
const host = requireElement<HTMLElement>("#reader-host");

const app = createApp();

if (sessionId === null) {
  // Views > Pop-out: an unparsable/missing `?session=` never reaches a numeric id to
  // build a reader around at all — the nearest honest thing this page can show.
  const notice = document.createElement("p");
  notice.setAttribute("role", "status");
  notice.textContent = "unknown session";
  host.replaceChildren(notice);
} else {
  const reader = initReader(
    app,
    {
      tilesLive: () => [],
      getSurfaces: () => ({ state: () => new Map() }),
    },
    { sessionId, path },
  );
  const root = reader.rootFor(sessionId);
  if (root) host.replaceChildren(root);

  // REQ-9: same controller `main.ts` registers, with a no-op `surfaces.applyTheme` — this
  // page has no terminal surfaces to re-theme. Registered before the socket starts, like
  // `main.ts`'s own init order, so nothing it listens for can fire before it's wired.
  initTheme(app, { surfaces: { applyTheme() {} } });

  setInterval(app.render, 1000);
  app.render();

  const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProtocol}//${location.host}/ws`;

  const connection = createConnectionState(app, () => app.render());

  const client = new WsClient(wsUrl, {
    onConnecting: () => connection.disconnected(),
    onHello: () => connection.connected(),
    onSnapshot: (snapshot) => {
      app.store.replaceAll(snapshot.sessions);
      // Mirrors `main.ts`'s own onSnapshot: the live `prefs` broadcast only fires on a
      // change (`internal/server/prefs.go`), so the initial theme choice — like the
      // dashboard's — comes from the snapshot itself, not just later broadcasts.
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
  });

  client.start();
}
