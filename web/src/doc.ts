// The pop-out page's composition root (kb:adr/reader-popout-is-a-second-page) — a second
// Vite entry, not a hash route inside `index.html`'s own composition root. Builds the same
// `App` + `WsClient` shape `main.ts` does and mounts one standalone `ReaderInstance` into
// `#reader-host`; there is no masthead, rail, banner or any other feature here.
//
// The `WsClient` wiring below is `wsapp.ts`'s `coreWsHandlers` unchanged — this used to be
// a hand-copied duplicate of `main.ts`'s handler bodies, which is how a real regression
// happened: the previous version before that wired none of the three connection callbacks,
// so `app.state.connection` never left its "connecting" default and the reader's status
// line asserted "unreachable" forever, even while this page's own socket was live.
// `onSessionRemoved` is deliberately not wired
// either way — `initReader`'s own `sessionRemoved` subscription is gated `if
// (!standalone)`, so it would be a dead wire here regardless — nor is `onUsage`/`onUpdate`/
// `onShellActivity` (no feature on this page reads any of them) or `onProtocolMismatch`
// (the plan's States table has no mismatch row for `/doc.html`, and a full takeover needs
// the shell/banner markup this page doesn't have); those are `main.ts`'s own additions on
// top of the same core, not omissions made here.
import { createApp } from "./app";
import { requireElement } from "./dom";
import { createConnectionState } from "./features/connection";
import { initReader, parseStandaloneQuery } from "./features/reader";
import { initTheme } from "./features/theme";
import { renderUnknownSessionNotice } from "./render/reader";
import { WsClient, wsUrl } from "./ws";
import { coreWsHandlers } from "./wsapp";

const target = parseStandaloneQuery(location.search);
const host = requireElement<HTMLElement>("#reader-host");

const app = createApp();

if (target === null) {
  // Views > Pop-out: an unparsable/missing `?session=` never reaches a numeric id to
  // build a reader around at all — the nearest honest thing this page can show.
  renderUnknownSessionNotice(host);
} else {
  const reader = initReader(
    app,
    {
      getTilesLive: () => [],
      getSurfaces: () => ({ state: () => new Map() }),
    },
    target,
  );
  const root = reader.rootFor(target.sessionId);
  if (root) host.replaceChildren(root);

  // Same controller `main.ts` registers — `initTheme` no longer
  // takes a `surfaces` dep at all (it emits `app.emit("themeChanged")`, and this page's
  // own `reader` above already subscribes to it), so there is no fake to write here
  // anymore. Registered before the socket starts, like `main.ts`'s own init order, so
  // nothing it listens for can fire before it's wired.
  initTheme(app);

  setInterval(app.render, 1000);
  app.render();

  const connection = createConnectionState(app, () => app.render());

  // The shared core mapping (wsapp.ts), registered unchanged — this page has no feature
  // for any handler beyond it (onSessionRemoved, onUsage, onShellActivity, onUpdate,
  // onProtocolMismatch: `main.ts`'s own dashboard-only additions on top of the same core).
  const client = new WsClient(wsUrl("/ws"), coreWsHandlers(app, connection));

  client.start();
}
