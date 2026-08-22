// Muster dashboard entrypoint — the M0 shell (docs/protocol.md §8, plan m0-skeleton).
//
// Wires the single WS client module (ws.ts) to the render functions and gates the
// whole shell on the protocol version (REQ-18). No state/business logic here beyond
// deriving "connecting/connected/reconnecting" and banner visibility from the client's
// lifecycle callbacks — that's already about as much as belongs outside a pure module.
import { renderBanner } from "./render/banner";
import { renderClaudeVersion, renderConnectionStatus, renderUsage, type ConnectionStatus } from "./render/masthead";
import { renderSessions } from "./render/sessions";
import { UNKNOWN_USAGE } from "./protocol";
import { WsClient } from "./ws";

function requireElement<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`missing required element: ${selector}`);
  return el;
}

const connectionStatusEl = requireElement<HTMLElement>("#connection-status");
const usageFiveHourEl = requireElement<HTMLElement>("#usage-5h");
const usageSevenDayEl = requireElement<HTMLElement>("#usage-7d");
const claudeVersionEl = requireElement<HTMLElement>("#claude-version");
const bannerEl = requireElement<HTMLElement>("#banner");
const sessionsEl = requireElement<HTMLElement>("#sessions");
const shellEl = requireElement<HTMLElement>("#app");
const mismatchEl = requireElement<HTMLElement>("#protocol-mismatch");

// Only true once a `hello` has ever been received. Before that, a socket that hasn't
// connected yet is "connecting…", not "daemon down" — the banner would otherwise flash
// "musterd unreachable" on every page load while the very page it's rendering was just
// served by that same daemon. Once we've seen a first `hello`, a later drop really is
// the daemon going away, and REQ-17's banner applies.
let everConnected = false;

function setStatus(status: ConnectionStatus): void {
  renderConnectionStatus(connectionStatusEl, status);
  renderBanner(bannerEl, everConnected && status !== "connected");
}

function showProtocolMismatch(): void {
  shellEl.hidden = true;
  mismatchEl.hidden = false;
}

renderUsage({ fiveHour: usageFiveHourEl, sevenDay: usageSevenDayEl }, UNKNOWN_USAGE);
renderClaudeVersion(claudeVersionEl, null);
renderSessions(sessionsEl, []);
setStatus("connecting");

const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
const wsUrl = `${wsProtocol}//${location.host}/ws`;

const client = new WsClient(wsUrl, {
  onConnecting: () => {
    setStatus(everConnected ? "reconnecting" : "connecting");
  },
  onHello: (hello) => {
    everConnected = true;
    setStatus("connected");
    renderClaudeVersion(claudeVersionEl, hello.claudeCode);
  },
  onSnapshot: (snapshot) => {
    renderSessions(sessionsEl, snapshot.sessions);
    renderUsage({ fiveHour: usageFiveHourEl, sevenDay: usageSevenDayEl }, snapshot.usage);
  },
  onDisconnected: () => {
    setStatus(everConnected ? "reconnecting" : "connecting");
  },
  onProtocolMismatch: showProtocolMismatch,
});

client.start();
