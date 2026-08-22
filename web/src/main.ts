// Muster dashboard entrypoint (docs/protocol.md §8, plans m0-skeleton + m1-sessions).
//
// Wires the single WS client module (ws.ts) to the render functions, the launch modal
// (render/launch.ts) to the session store, and a 1s tick to the rail so timers/notes
// keep advancing between socket events (design-system §2: tabular-nums timers tick).
// No state/business logic here beyond that wiring — protocol decoding, sort order and
// card view-models all live in pure modules.
import { renderBanner } from "./render/banner";
import {
  renderClaudeVersion,
  renderConnectionStatus,
  renderUsage,
  renderViewSwitcherSlot,
  type ConnectionStatus,
} from "./render/masthead";
import { renderSessions } from "./render/sessions";
import { initLaunchModal, type LaunchModalElements } from "./render/launch";
import { UNKNOWN_USAGE } from "./protocol";
import { SessionStore } from "./sessions/store";
import { sortSessions } from "./sessions/sort";
import { WsClient } from "./ws";

function requireElement<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`missing required element: ${selector}`);
  return el;
}

function requireElements<T extends HTMLElement>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}

const connectionStatusEl = requireElement<HTMLElement>("#connection-status");
const usageFiveHourEl = requireElement<HTMLElement>("#usage-5h");
const usageSevenDayEl = requireElement<HTMLElement>("#usage-7d");
const claudeVersionEl = requireElement<HTMLElement>("#claude-version");
const bannerEl = requireElement<HTMLElement>("#banner");
const sessionsEl = requireElement<HTMLElement>("#sessions");
const railCountEl = requireElement<HTMLElement>("#rail-count");
const viewSwitcherEl = requireElement<HTMLElement>("#view-switcher");
const shellEl = requireElement<HTMLElement>("#app");
const mismatchEl = requireElement<HTMLElement>("#protocol-mismatch");

const store = new SessionStore();

function renderRail(): void {
  const sessions = sortSessions(store.values());
  renderSessions(sessionsEl, sessions, new Date());
  railCountEl.textContent = sessions.length > 0 ? String(sessions.length) : "";
}

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
  // The shell vanishes under this fatal state (review m1-sessions Minor 7) — role="alert"
  // on the element (index.html) announces it, and moving focus onto it (it carries
  // tabindex="-1" for exactly this) makes sure a keyboard/screen-reader user lands
  // somewhere sensible rather than on a now-hidden control.
  mismatchEl.focus();
}

renderUsage({ fiveHour: usageFiveHourEl, sevenDay: usageSevenDayEl }, UNKNOWN_USAGE);
renderClaudeVersion(claudeVersionEl, null);
renderViewSwitcherSlot(viewSwitcherEl);
renderRail();
setStatus("connecting");

const launchModalElements: LaunchModalElements = {
  dialog: requireElement<HTMLDialogElement>("#launch-dialog"),
  openButton: requireElement<HTMLButtonElement>("#new-session-button"),
  mruList: requireElement<HTMLElement>("#mru-list"),
  mruEntryTemplate: requireElement<HTMLTemplateElement>("#mru-entry-template"),
  browseButton: requireElement<HTMLButtonElement>("#browse-button"),
  browsePanel: requireElement<HTMLElement>("#browse-panel"),
  browsePath: requireElement<HTMLElement>("#browse-path"),
  browseUpButton: requireElement<HTMLButtonElement>("#browse-up"),
  browseDirs: requireElement<HTMLElement>("#browse-dirs"),
  subdirEntryTemplate: requireElement<HTMLTemplateElement>("#subdir-entry-template"),
  useThisFolderButton: requireElement<HTMLButtonElement>("#use-this-folder"),
  selectedDirectoryDisplay: requireElement<HTMLElement>("#selected-directory"),
  titleInput: requireElement<HTMLInputElement>("#title-input"),
  modelRadios: requireElements<HTMLInputElement>('input[name="model"]'),
  customModelRow: requireElement<HTMLElement>("#custom-model-row"),
  customModelInput: requireElement<HTMLInputElement>("#custom-model-input"),
  permissionModeRadios: requireElements<HTMLInputElement>('input[name="permission-mode"]'),
  launchError: requireElement<HTMLElement>("#launch-error"),
  cancelButton: requireElement<HTMLButtonElement>("#cancel-button"),
  form: requireElement<HTMLFormElement>("#launch-form"),
};

initLaunchModal(launchModalElements, {
  // REQ-2: the card must appear the instant the 201 comes back — before any hook can
  // possibly arrive. The `sessionUpsert` the daemon also broadcasts for this same launch
  // is a harmless duplicate upsert once the WS delivers it.
  onLaunched: (session) => {
    store.upsert(session);
    renderRail();
  },
});

// Rail cards tick every second (design-system §2 tabular-nums timers; ux-flows §1.4's
// no-signal note also depends on wall-clock elapsed time, not just events).
setInterval(renderRail, 1000);

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
    store.replaceAll(snapshot.sessions);
    renderRail();
    renderUsage({ fiveHour: usageFiveHourEl, sevenDay: usageSevenDayEl }, snapshot.usage);
  },
  onSessionUpsert: (session) => {
    store.upsert(session);
    renderRail();
  },
  onDisconnected: () => {
    setStatus(everConnected ? "reconnecting" : "connecting");
  },
  onProtocolMismatch: showProtocolMismatch,
});

client.start();
