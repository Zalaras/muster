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
// this event directly). Deliberately not wired: `onSessionRemoved` — `initReader`'s own
// `sessionRemoved` subscription is gated `if (!standalone)`, so it would be a dead wire
// here regardless; `onPrefs`/`onUsage`/`onClaudeTheme`/`onUpdate` (`features/reader.ts`
// calls `app.on` only for `"docChanged"`, `"snapshot"` and `"sessionRemoved"` — no
// feature on this page reads any of the other four); and `onProtocolMismatch` (the
// plan's States table has no mismatch row for `/doc.html`, and a full takeover needs the
// shell/banner markup this page doesn't have).
import { createApp } from "./app";
import { requireElement } from "./dom";
import { createConnectionState } from "./features/connection";
import { initReader } from "./features/reader";
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
      app.emit("snapshot", snapshot);
      app.render();
    },
    onSessionUpsert: (session) => {
      app.store.upsert(session);
      app.render();
    },
    onDocChanged: (msg) => {
      app.emit("docChanged", msg);
      app.render();
    },
    onDisconnected: () => connection.disconnected(),
  });

  client.start();
}
