// Muster dashboard entrypoint (docs/protocol.md §8, plans m0-skeleton + m1-sessions +
// m2-terminal).
//
// Wires the single WS client module (ws.ts) to the render functions, the launch modal
// (render/launch.ts) to the session store, and a 1s tick so timers/notes/geometry keep
// advancing between socket events (design-system §2: tabular-nums timers tick). This
// module also owns the terminal surface manager (plan m2-terminal, Affected Files > Web):
// which sessions are live in the current view (Focus's one pane, or Tiles' grid) and
// which `terminal/pane.ts` instances exist for them — computed via the pure functions in
// sessions/live.ts and applied here as the only place a TerminalSurface is constructed or
// disposed (W7: no render path opens a socket outside this manager). No other business
// logic here: protocol decoding, sort order, card/tile view-models and membership math
// all live in pure modules.
import { renderBanner } from "./render/banner";
import {
  renderClaudeVersion,
  renderConnectionStatus,
  renderDensityControl,
  renderUsage,
  renderUsageModel,
  renderUsageTrack,
  renderViewSwitcher,
  type ConnectionStatus,
} from "./render/masthead";
import { renderFocusMain, renderSessions, renderSizenote } from "./render/sessions";
import { buildTile, renderStrip, renderTileGeometry, updateTile, type TileRefs } from "./render/tiles";
import { initLaunchModal, type LaunchModalElements } from "./render/launch";
import { type ApiResult, putPrefs } from "./api";
import { type Density, type Prefs, type Session, type Usage, UNKNOWN_USAGE } from "./protocol";
import { applyDensity, densityCount, initialLive, promote, surfaceDiff } from "./sessions/live";
import { SessionStore } from "./sessions/store";
import { sortSessions } from "./sessions/sort";
import { TerminalSurface } from "./terminal/pane";
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
const usageModelEl = requireElement<HTMLElement>("#usage-model");
const claudeVersionEl = requireElement<HTMLElement>("#claude-version");
const bannerEl = requireElement<HTMLElement>("#banner");
const sessionsEl = requireElement<HTMLElement>("#sessions");
const railCountEl = requireElement<HTMLElement>("#rail-count");
const shellEl = requireElement<HTMLElement>("#app");
const mismatchEl = requireElement<HTMLElement>("#protocol-mismatch");

const viewFocusBtn = requireElement<HTMLButtonElement>("#view-focus-btn");
const viewTilesBtn = requireElement<HTMLButtonElement>("#view-tiles-btn");
const density2x2Btn = requireElement<HTMLButtonElement>("#density-2x2-btn");
const density3x2Btn = requireElement<HTMLButtonElement>("#density-3x2-btn");
const densityToolbarEl = requireElement<HTMLElement>("#density-toolbar");

const viewFocusEl = requireElement<HTMLElement>("#view-focus");
const viewTilesEl = requireElement<HTMLElement>("#view-tiles");
const mainEmptyEl = requireElement<HTMLElement>("#main-empty");
const mainSlotEl = requireElement<HTMLElement>("#main-terminal-slot");
const sizenoteEl = requireElement<HTMLElement>("#sizenote");
const tilesEmptyEl = requireElement<HTMLElement>("#tiles-empty");
const tilesGridEl = requireElement<HTMLElement>("#tiles-grid");
const tilesStripEl = requireElement<HTMLElement>("#tiles-strip");

const store = new SessionStore();

// ── view/prefs state ────────────────────────────────────────────────────────────────
// `view`/`density` mirror the daemon's persisted prefs (docs/protocol.md §3.3) — the
// single source of truth is always the `prefs` WS message (or the initial `snapshot`),
// never a local optimistic update, so every open window converges on the same broadcast
// (INV-4). `focusedId`/`tilesLive` are per-window, ephemeral, client-only state: Focus's
// explicit focus and Tiles' sticky live-tile membership are never synced across windows.
let view: "focus" | "tiles" = "focus";
let density: Density = "2x2";
let focusedId: number | null = null;
let tilesLive: number[] = [];
// M3: the account-global Usage object, from the initial `snapshot` and every subsequent
// `usage` broadcast (docs/protocol.md §5.4) — re-rendered every pass (like the rest of
// `render()`) so REQ-14's reset-time formatting stays current against the wall clock.
let currentUsage: Usage = UNKNOWN_USAGE;
const surfaces = new Map<number, TerminalSurface>();
// Tiles' mounted chrome per live session id — kept across render passes so the 1s tick
// (and every other render trigger) updates existing tiles in place instead of rebuilding
// the grid, which used to re-parent a mounted TerminalSurface root and blur its xterm
// textarea within ~1s of the user clicking into it (review m2-terminal Critical 2).
const tileElements = new Map<number, TileRefs>();

// Only true once a `hello` has ever been received. Before that, a socket that hasn't
// connected yet is "connecting…", not "daemon down" — the banner would otherwise flash
// "musterd unreachable" on every page load while the very page it's rendering was just
// served by that same daemon. Once we've seen a first `hello`, a later drop really is
// the daemon going away, and the banner applies.
let everConnected = false;

/** The masthead's usage gauges: the M2-era text readout (`renderUsage`, unchanged) plus
 * M3's track/resets markup (appended into the same elements — see renderUsageTrack's own
 * doc comment for why call order matters here) and the model readout — all derived from
 * the one `currentUsage` state so every surface always shows the same sample. */
function renderUsageBlock(usage: Usage, now: Date): void {
  renderUsage({ fiveHour: usageFiveHourEl, sevenDay: usageSevenDayEl }, usage);
  renderUsageTrack(usageFiveHourEl, usage.fiveHour, now);
  renderUsageTrack(usageSevenDayEl, usage.sevenDay, now);
  renderUsageModel(usageModelEl, usage.model);
}

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

/** Logs a failed `PUT /api/prefs` (review m2-terminal Major 2) — the daemon-down banner
 * already covers the common "socket is down" case, so this is not a user-facing error
 * surface (no launch-modal-style inline error exists for this control); it is just the
 * difference between a silently-swallowed rejection and one that leaves a trace. */
function reportPrefsFailure(result: ApiResult<null>): void {
  if (!result.ok) console.error(`PUT /api/prefs failed: ${result.error.code} ${result.error.message}`);
}

/** `PUT /api/prefs` — fire-and-forget. `view`/`density` never change locally here; they
 * change only when the resulting `prefs` broadcast (or the next snapshot) arrives, which
 * is also what makes a second window converge purely from the wire (INV-4). */
function requestView(newView: "focus" | "tiles"): void {
  void putPrefs({ view: newView }).then(reportPrefsFailure);
}

function requestDensity(newDensity: Density): void {
  void putPrefs({ density: newDensity }).then(reportPrefsFailure);
}

/** Strip-card click / ⌘1–9 in Tiles: promotes, demoting exactly the lowest-priority live
 * tile (REQ-8). Membership is per-window state, not a prefs field. */
function promoteSession(id: number): void {
  if (view !== "tiles") return;
  tilesLive = promote(tilesLive, id, store.values());
  render();
}

/** ⌘1–9: focus session n of the sorted list (Focus: focus it; Tiles: promote it). */
function focusNth(n: number): void {
  const sorted = sortSessions(store.values());
  const session = sorted[n - 1];
  if (!session) return;
  if (view === "focus") {
    focusedId = session.id;
    render();
  } else {
    promoteSession(session.id);
  }
}

/** Adopts a `prefs` object (from the initial snapshot or a `prefs` broadcast) as local
 * view/density state — only resetting Tiles' sticky membership when the value actually
 * changed, so an unrelated broadcast (or a reconnect echoing the same prefs) never
 * reshuffles a live grid the user already customized via promotion. */
function applyPrefsFromSnapshot(prefs: Prefs): void {
  if (prefs.view !== view) {
    view = prefs.view;
    if (view === "tiles") tilesLive = initialLive(store.values(), densityCount(density));
  }
  if (prefs.density !== density) {
    density = prefs.density;
    if (view === "tiles") tilesLive = applyDensity(tilesLive, densityCount(density), store.values());
  }
}

/** After the daemon connection is restored (`hello`), every currently-mounted surface
 * gets a chance to reattach — a no-op unless it's showing the "disconnected" overlay for
 * a still-alive session (REQ-13). */
function reattachDisconnectedSurfaces(): void {
  const sessions = store.values();
  for (const [id, surface] of surfaces) {
    const session = sessions.find((s) => s.id === id);
    surface.reattachIfDisconnected(session?.alive ?? false);
  }
}

function renderFocusView(sessions: readonly Session[]): void {
  renderFocusMain({ emptyEl: mainEmptyEl, slotEl: mainSlotEl }, sessions.length > 0);
  const session = sessions.find((s) => s.id === focusedId);
  const surface = session ? surfaces.get(session.id) : undefined;
  if (!surface) {
    mainSlotEl.replaceChildren();
    renderSizenote(sizenoteEl, null);
    return;
  }
  if (mainSlotEl.firstElementChild !== surface.root) {
    mainSlotEl.replaceChildren(surface.root);
  }
  // Reserve the sizenote line's layout space BEFORE fitting (review m2-terminal Minor
  // 1) — un-hiding it only after `refit()` measured against a sizenote-less body used to
  // send an initial `resize` one row too tall, self-correcting only on the next 1s tick.
  // A non-breaking space keeps the reserved line the same height real geometry text
  // would, so even the very first-ever attach (no prior geometry to fall back on)
  // reserves the right amount of space before the measurement happens.
  if (sizenoteEl.hidden) {
    sizenoteEl.hidden = false;
    sizenoteEl.textContent = " ";
  }
  surface.refit();
  renderSizenote(sizenoteEl, surface.geometry);
}

/** Reconciles the Tiles grid to `liveSessions` (in priority order) against the persisted
 * `tileElements` map: existing tiles are updated and, if needed, *moved* in place;
 * departed ids are removed; only genuinely new ids get a freshly built tile. This never
 * rebuilds the grid wholesale (review m2-terminal Critical 2 — a wholesale rebuild
 * re-parented every mounted TerminalSurface root every render pass, blurring xterm's
 * textarea within ~1s of the user clicking in) and it always inserts a tile into the
 * grid *before* fitting it (Critical 1 — `FitAddon.fit()` on a still-detached, zero-size
 * container is a silent no-op, so a fit attempted before insertion never sends a
 * `resize`).
 */
function reconcileTilesGrid(liveSessions: readonly Session[], now: Date): void {
  const desiredIds = new Set(liveSessions.map((s) => s.id));

  for (const [id, refs] of tileElements) {
    if (!desiredIds.has(id)) {
      refs.root.remove();
      tileElements.delete(id);
    }
  }

  let previousRoot: HTMLElement | null = null;
  for (const session of liveSessions) {
    let refs = tileElements.get(session.id);
    const isNewTile = !refs;
    if (!refs) {
      refs = buildTile(session, now);
      tileElements.set(session.id, refs);
    } else {
      updateTile(refs, session, now);
    }

    // Moving an already-mounted node via insertBefore/appendChild repositions it in
    // place — it does not detach-then-reattach the subtree the way rebuilding the grid
    // did, so a surface mounted inside stays mounted and keeps focus. Skipped entirely
    // when the tile is already in the right slot, so a steady grid touches no DOM at all
    // on the 1s tick.
    const desiredNext: Element | null = previousRoot
      ? previousRoot.nextElementSibling
      : tilesGridEl.firstElementChild;
    if (desiredNext !== refs.root) {
      tilesGridEl.insertBefore(refs.root, desiredNext);
    }
    previousRoot = refs.root;

    // Insert into the grid FIRST, then mount/refit — a detached container's fit() is a
    // silent no-op (Critical 1).
    const surface = surfaces.get(session.id);
    if (surface) {
      if (isNewTile || refs.bodySlot.firstElementChild !== surface.root) {
        refs.bodySlot.replaceChildren(surface.root);
      }
      surface.refit();
    }
    renderTileGeometry(refs, session.alive, surface?.geometry ?? null);
  }
}

function renderTilesView(sessions: readonly Session[], now: Date): void {
  const hasSessions = sessions.length > 0;
  tilesEmptyEl.hidden = hasSessions;
  tilesGridEl.hidden = !hasSessions;
  if (!hasSessions) {
    tilesGridEl.replaceChildren();
    tileElements.clear();
    renderStrip(tilesStripEl, [], now, promoteSession);
    return;
  }

  tilesGridEl.dataset["density"] = density;

  const liveSessions = tilesLive
    .map((id) => sessions.find((s) => s.id === id))
    .filter((s): s is Session => s !== undefined);
  const liveIds = new Set(tilesLive);
  const stripSessions = sortSessions(sessions.filter((s) => !liveIds.has(s.id)));

  reconcileTilesGrid(liveSessions, now);

  renderStrip(tilesStripEl, stripSessions, now, promoteSession);
}

/** The single render pass: reconciles which sessions should be live in the current view
 * (opening/closing TerminalSurfaces via sessions/live.ts's pure diff — W7) and redraws
 * every view's chrome. Idempotent and safe to call after every store mutation, prefs
 * change, keyboard action or the 1s tick. */
function render(): void {
  const sessions = store.values();
  const now = new Date();

  renderUsageBlock(currentUsage, now);

  if (view === "tiles") {
    tilesLive = applyDensity(tilesLive, densityCount(density), sessions);
  } else if (focusedId === null || !sessions.some((s) => s.id === focusedId)) {
    // Default focus on load / whenever the current focus stops existing: top of the
    // §3.4 sort order (REQ-7). Not persisted — recomputed, never remembered across a
    // reload the way view/density are.
    focusedId = sortSessions(sessions)[0]?.id ?? null;
  }

  const desired = view === "focus" ? (focusedId !== null ? [focusedId] : []) : tilesLive;
  const diff = surfaceDiff(Array.from(surfaces.keys()), desired);

  for (const id of diff.toClose) {
    surfaces.get(id)?.dispose();
    surfaces.delete(id);
  }
  for (const id of diff.toOpen) {
    const session = sessions.find((s) => s.id === id);
    if (session) surfaces.set(id, new TerminalSurface(session));
  }

  renderSessions(sessionsEl, sortSessions(sessions), now, (id) => {
    focusedId = id;
    render();
  });
  railCountEl.textContent = sessions.length > 0 ? String(sessions.length) : "";

  renderViewSwitcher({ focusButton: viewFocusBtn, tilesButton: viewTilesBtn }, view);
  renderDensityControl(
    { container: densityToolbarEl, twoByTwoButton: density2x2Btn, threeByTwoButton: density3x2Btn },
    view,
    density,
  );
  viewFocusEl.hidden = view !== "focus";
  viewTilesEl.hidden = view !== "tiles";

  if (view === "focus") renderFocusView(sessions);
  else renderTilesView(sessions, now);
}

viewFocusBtn.addEventListener("click", () => requestView("focus"));
viewTilesBtn.addEventListener("click", () => requestView("tiles"));
density2x2Btn.addEventListener("click", () => requestDensity("2x2"));
density3x2Btn.addEventListener("click", () => requestDensity("3x2"));

// design-system §4.1 / ux-flows §3.8: ⌘\ toggles the view; ⌘1–9 keeps its meaning in
// both views. ⌘N (launch modal) is wired separately in render/launch.ts.
window.addEventListener("keydown", (event) => {
  if (!event.metaKey || event.shiftKey || event.altKey) return;
  if (event.key === "\\") {
    event.preventDefault();
    requestView(view === "focus" ? "tiles" : "focus");
    return;
  }
  const n = Number(event.key);
  if (Number.isInteger(n) && n >= 1 && n <= 9) {
    event.preventDefault();
    focusNth(n);
  }
});

renderClaudeVersion(claudeVersionEl, null);
render();
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
    render();
  },
});

// Every view ticks every second (design-system §2 tabular-nums timers; ux-flows §1.4's
// no-signal note also depends on wall-clock elapsed time, not just events) — this never
// opens/closes a socket by itself (`render`'s diff is a no-op unless membership actually
// changed), it just keeps timers, sizenote/footer geometry and chrome text current.
setInterval(render, 1000);

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
    applyPrefsFromSnapshot(snapshot.prefs);
    currentUsage = snapshot.usage;
    reattachDisconnectedSurfaces();
    render();
  },
  onSessionUpsert: (session) => {
    store.upsert(session);
    render();
  },
  onPrefs: (prefs) => {
    applyPrefsFromSnapshot(prefs);
    render();
  },
  onUsage: (usage) => {
    currentUsage = usage;
    render();
  },
  onDisconnected: () => {
    setStatus(everConnected ? "reconnecting" : "connecting");
  },
  onProtocolMismatch: showProtocolMismatch,
});

client.start();
