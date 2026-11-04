import { createApp } from "./app";
import { createConnectionState } from "./features/connection";
import { mountNotePage } from "./features/notespage";
import { parseNoteQuery } from "./features/noteswindows";
import { initTheme } from "./features/theme";
import { initUpdateRestart } from "./features/updaterestart";
import { WsClient, wsUrl } from "./ws";
import { noteWindowWsHandlers } from "./wsapp";

const app = createApp();

initTheme(app);
initUpdateRestart(app);
mountNotePage(app, parseNoteQuery(location.search));

setInterval(app.render, 1000);
app.render();

const connection = createConnectionState(app, () => app.render());
const client = new WsClient(wsUrl("/ws"), noteWindowWsHandlers(app, connection));

client.start();
