// The pop-out page's composition root (kb:adr/reader-popout-is-a-second-page) — a second
// Vite entry, not a hash route inside `index.html`'s own composition root. Builds the same
// `App` + `WsClient` shape `main.ts` does; there is no masthead, rail, banner or any other
// feature here. `mountStandaloneReader` (features/reader.ts) owns finding `#reader-host`,
// choosing the unknown-session notice over a real reader, and mounting the reader's root —
// this module only builds `app`, registers the reader/theme/connection controllers and the
// client, and starts the tick.
//
// `onSessionRemoved`/`onUsage`/`onShellActivity`/`onUpdate`/`onProtocolMismatch` are
// deliberately not wired — no feature on this page reads any of them, so `coreWsHandlers`
// (wsapp.ts) is registered unchanged rather than `main.ts`'s `dashboardWsHandlers`.
import { createApp } from "./app";
import { createConnectionState } from "./features/connection";
import { mountStandaloneReader, parseStandaloneQuery } from "./features/reader";
import { initTheme } from "./features/theme";
import { WsClient, wsUrl } from "./ws";
import { coreWsHandlers } from "./wsapp";

const target = parseStandaloneQuery(location.search);
const app = createApp();
const reader = mountStandaloneReader(app, target);

if (reader) {
  // Registered before the socket starts, like `main.ts`'s own init order, so nothing it
  // listens for can fire before it's wired.
  initTheme(app);

  setInterval(app.render, 1000);
  app.render();

  const connection = createConnectionState(app, () => app.render());
  const client = new WsClient(wsUrl("/ws"), coreWsHandlers(app, connection));

  client.start();
}
