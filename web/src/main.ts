// Muster dashboard entrypoint (docs/protocol.md §8, plans m0-skeleton + m1-sessions +
// m2-terminal + m4-reconcile).
//
// Wires the single WS client module (ws.ts) to the render functions, the launch modal
// (render/launch.ts) to the session store, and a 1s tick so timers/notes/geometry keep
// advancing between socket events (design-system §2: tabular-nums timers tick). This
// module also owns the terminal surface manager (plan m2-terminal, Affected Files > Web):
// which sessions are live in the current view (Focus's one pane, or Tiles' grid) and
// which `terminal/pane.ts` instances exist for them — computed via the pure functions in
// sessions/live.ts and applied here as the only place a TerminalSurface is constructed or
// disposed (W7/W8: no render path opens a socket outside this manager, and never for an
// `alive:false` session). Plan m4-reconcile adds the End/Resume/Remove dispatcher, the
// dead-session pane-snapshot cache, and the mainhead/confirm-dialog wiring — still no
// other business logic here: protocol decoding, sort order, card/tile/dead view-models
// and membership math all live in pure modules.
import { renderBanner } from "./render/banner";
import {
  renderClaudeVersion,
  renderConnectionStatus,
  renderDensityControl,
  renderModelWeek,
  renderUsage,
  renderUsageModel,
  renderUsageTrack,
  renderViewSwitcher,
  type ConnectionStatus,
} from "./render/masthead";
import { renderFocusMain, renderSessions, renderSizenote, type SessionAction } from "./render/sessions";
import { buildTile, mountTileDeadSurface, renderStrip, renderTileFooterActions, renderTileGeometry, updateTile, type TileRefs } from "./render/tiles";
import { initLaunchModal, type LaunchModalElements } from "./render/launch";
import { initConfirmDialogs, type ConfirmDialogs } from "./render/confirm";
import { renderMainhead, type MainheadElements } from "./render/mainhead";
import { captureFocusedControl, type FocusedControl, restoreFocusedControl } from "./render/focus";
import { collectDeadSurfaceRefs, loadPane, renderDeadSurface, type DeadSurfaceRefs, type PaneState } from "./render/dead";
import { installTileDrag } from "./render/tiledrag";
import { endSession, putPrefs, refreshUsage, removeSession, resumeSession, type ApiResult } from "./api";
import { type Density, type Prefs, type Session, type Usage, UNKNOWN_USAGE } from "./protocol";
import { aliveOnly, applyDensity, densityCount, initialLive, moveTile, promote, surfaceDiff } from "./sessions/live";
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
const usageModelWeekEl = requireElement<HTMLElement>("#usage-model-week");
const usageRefreshBtn = requireElement<HTMLButtonElement>("#usage-refresh");
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

// ── m4-reconcile: mainhead / dead surface / confirm dialogs ────────────────────────────
const mainheadElements: MainheadElements = {
  root: requireElement<HTMLElement>("#mainhead"),
  nameEl: requireElement<HTMLElement>("#mainhead .name"),
  metaEl: requireElement<HTMLElement>("#mainhead .meta"),
  endBtn: requireElement<HTMLButtonElement>('#mainhead button[data-action="end"]'),
  resumeBtn: requireElement<HTMLButtonElement>('#mainhead button[data-action="resume"]'),
  removeBtn: requireElement<HTMLButtonElement>('#mainhead button[data-action="remove"]'),
};
const deadSurfaceEl = requireElement<HTMLElement>("#dead-surface");
const deadSurfaceRefs: DeadSurfaceRefs = collectDeadSurfaceRefs(deadSurfaceEl);
const deadSurfaceTemplate = requireElement<HTMLTemplateElement>("#dead-surface-template");

const store = new SessionStore();

// ── view/prefs state ────────────────────────────────────────────────────────────────
// `view`/`density` mirror the daemon's persisted prefs (docs/protocol.md §3.3) — the
// single source of truth is always the `prefs` WS message (or the initial `snapshot`),
// never a local optimistic update, so every open window converges on the same broadcast
// (INV-4). `focusedId`/`tilesLive` are per-window, ephemeral, client-only state: Focus's
// explicit focus and Tiles' sticky live-tile membership are never synced across windows.
// `tilesLive`'s ORDER (not just its membership) is also client-only and user-owned as of
// plan move-tiles: `promote`/`applyDensity` never reorder it, and the only thing that
// ever changes the array's order is a drag (`moveTile`, wired below via
// `installTileDrag`) — see sessions/live.ts's header comment for the full rule.
let view: "focus" | "tiles" = "focus";
let density: Density = "2x2";
// Plan usage-model-bar: which model-scoped window the masthead's third readout shows —
// same "daemon's `prefs` broadcast is the single source of truth" rule as view/density
// (INV-6); the daemon's own default before any PUT is "Fable" (docs/protocol.md §5.5).
let usageModel = "Fable";
let focusedId: number | null = null;
let tilesLive: number[] = [];
// Fix attempt 2 (REQ-10/E6): a drag's initiating `mousedown` blurs any focused control in
// the grid to `<body>` before `dragstart`/`drop` ever runs, so `reconcileTilesGrid`'s own
// live `captureFocusedControl` call always finds nothing by drop time. `tiledrag.ts`
// captures the pre-blur snapshot on that `mousedown` instead and hands it back through
// `onMove`; this holds it for the one `reconcileTilesGrid` pass the resulting `render()`
// call triggers, then is cleared so it never leaks into an unrelated later render.
let pendingTileFocus: FocusedControl | null = null;
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

// m4-reconcile: the dead-surface pane-snapshot cache (REQ-4/REQ-13). Keyed by session id,
// populated by `ensurePaneFetch` and consumed by `renderFocusView`/`reconcileTilesGrid`.
// `previousAlive` tracks each session's `alive` from the last render pass so an
// alive->dead transition (a fresh End, or Resume-then-End again) invalidates any stale
// cache entry — "re-fetch when a sessionUpsert flips alive -> false" (plan Implementation
// Notes: the snapshot may have just been finalised by End). Both maps are pruned to the
// current store's ids every render pass so a removed session never leaks an entry.
const deadPaneCache = new Map<number, PaneState>();
const previousAlive = new Map<number, boolean>();

function ensurePaneFetch(id: number): void {
  if (deadPaneCache.has(id)) return;
  deadPaneCache.set(id, { status: "loading" });
  void loadPane(id).then((state) => {
    deadPaneCache.set(id, state);
    render();
  });
}

/** Prunes the dead-pane tracking maps to the current session id set, then invalidates any
 * cache entry whose session just transitioned alive -> dead this pass. Called once at the
 * top of every `render()`, before either view reads from `deadPaneCache`. */
function updateDeadPaneTracking(sessions: readonly Session[]): void {
  const ids = new Set(sessions.map((s) => s.id));
  for (const id of previousAlive.keys()) {
    if (!ids.has(id)) previousAlive.delete(id);
  }
  for (const id of deadPaneCache.keys()) {
    if (!ids.has(id)) deadPaneCache.delete(id);
  }
  for (const session of sessions) {
    const wasAlive = previousAlive.get(session.id);
    if (wasAlive === true && !session.alive) deadPaneCache.delete(session.id);
    previousAlive.set(session.id, session.alive);
  }
}

// Only true once a `hello` has ever been received. Before that, a socket that hasn't
// connected yet is "connecting…", not "daemon down" — the banner would otherwise flash
// "musterd unreachable" on every page load while the very page it's rendering was just
// served by that same daemon. Once we've seen a first `hello`, a later drop really is
// the daemon going away, and the banner applies.
let everConnected = false;
let connectionStatus: ConnectionStatus = "connecting";

function isConnected(): boolean {
  return connectionStatus === "connected";
}

/** The masthead's usage gauges: the M2-era text readout (`renderUsage`, unchanged) plus
 * M3's track/resets markup (appended into the same elements — see renderUsageTrack's own
 * doc comment for why call order matters here), the freshest-sample model readout, and
 * plan usage-model-bar's third readout (the per-model weekly window, driven by the
 * client-local `usageModel` pref selection) — all derived from the one `currentUsage`
 * state so every surface always shows the same sample. */
function renderUsageBlock(usage: Usage, now: Date): void {
  renderUsage({ fiveHour: usageFiveHourEl, sevenDay: usageSevenDayEl }, usage);
  renderUsageTrack(usageFiveHourEl, usage.fiveHour, now);
  renderUsageTrack(usageSevenDayEl, usage.sevenDay, now);
  renderUsageModel(usageModelEl, usage.model);
  renderModelWeek(usageModelWeekEl, usage, usageModel, now, requestUsageModel);
}

function setStatus(status: ConnectionStatus): void {
  connectionStatus = status;
  renderConnectionStatus(connectionStatusEl, status);
  renderBanner(bannerEl, everConnected && status !== "connected");
  // States (m4-reconcile): "Daemon down ... Dialogs, if open, close" — an End/Remove
  // against a dead daemon can never be confirmed as done.
  if (status !== "connected") confirmDialogs.closeAll();
  // review m4-reconcile Major 3: every already-drawn surface (mainhead, dead-surface
  // cap, rail cards, tile footers) carries `connected` baked into its last render call.
  // A focused *dead* session has no terminal socket to incidentally trigger a re-render
  // on disconnect, so without this call its action buttons (and a since-opened confirm
  // dialog) stay stuck in the stale `connected: true` state indefinitely. Re-render on
  // every status transition (down and back up) so button-disabled state never goes stale.
  render();
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

/** REQ-12: the model-week `<select>`'s change handler — same fire-and-forget shape as
 * `requestView`/`requestDensity` above (`usageModel` only ever changes via the `prefs`
 * echo, never optimistically here, so every open window converges from the wire). */
function requestUsageModel(newModel: string): void {
  void putPrefs({ usageModel: newModel }).then(reportPrefsFailure);
}

/** REQ-12: clears the refresh button's `aria-busy` state and cancels the 5s fallback
 * timer — called both when a `usage` message actually arrives (the common case) and when
 * `POST /api/usage/refresh` itself fails outright (network error / 404 poller-disabled),
 * so a failed request never leaves the button spinning until the fallback timer. */
let usageRefreshTimer: ReturnType<typeof setTimeout> | null = null;
function clearUsageRefreshBusy(): void {
  usageRefreshBtn.removeAttribute("aria-busy");
  if (usageRefreshTimer !== null) {
    clearTimeout(usageRefreshTimer);
    usageRefreshTimer = null;
  }
}

/** Strip-card click / ⌘1–9 in Tiles: promotes, demoting exactly the lowest-priority live
 * tile (REQ-8). Membership is per-window state, not a prefs field. */
function promoteSession(id: number): void {
  if (view !== "tiles") return;
  tilesLive = promote(tilesLive, id, store.values());
  render();
}

/** ⌘1–9: focus session n of the sorted list (Focus: focus it, even if ended — REQ-18;
 * Tiles: promote it). */
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

// ── m4-reconcile: End / Resume / Remove dispatcher ──────────────────────────────────────
// One dispatcher, called from the mainhead, every card action row (rail + strip), and
// every tile footer/dead-surface cap — End/Remove open a confirm dialog (REQ-14); Resume
// has none (User Flow 3) and calls the API directly.
function dispatchAction(action: SessionAction, id: number): void {
  const session = store.values().find((s) => s.id === id);
  if (!session) return;
  if (action === "end") {
    confirmDialogs.openEnd(session);
  } else if (action === "remove") {
    confirmDialogs.openRemove(session);
  } else {
    void doResume(id);
  }
}

function doEnd(id: number): void {
  void endSession(id).then((result) => {
    if (!result.ok) {
      console.error(`POST /api/sessions/${id}/end failed: ${result.error.code} ${result.error.message}`);
      return;
    }
    store.upsert(result.value);
    render();
  });
}

async function doResume(id: number): Promise<void> {
  const result = await resumeSession(id);
  if (!result.ok) {
    console.error(`POST /api/sessions/${id}/resume failed: ${result.error.code} ${result.error.message}`);
    return;
  }
  store.upsert(result.value);
  render();
}

/** REQ-15: strips a removed session from the store, the live surface map, Tiles'
 * membership and the mounted tile chrome; if it was focused, focus falls through to
 * `render()`'s existing "top of the sorted list" default. */
function handleRemoved(id: number): void {
  store.remove(id);
  surfaces.get(id)?.dispose();
  surfaces.delete(id);
  const tileRefs = tileElements.get(id);
  if (tileRefs) {
    tileRefs.root.remove();
    tileElements.delete(id);
  }
  tilesLive = tilesLive.filter((x) => x !== id);
  deadPaneCache.delete(id);
  previousAlive.delete(id);
  if (focusedId === id) focusedId = null;
  render();
}

function doRemove(id: number): void {
  void removeSession(id).then((result) => {
    if (!result.ok) {
      console.error(`DELETE /api/sessions/${id} failed: ${result.error.code} ${result.error.message}`);
      return;
    }
    handleRemoved(id);
  });
}

const confirmDialogs: ConfirmDialogs = initConfirmDialogs(
  {
    endDialog: requireElement<HTMLDialogElement>("#end-dialog"),
    endBody: requireElement<HTMLElement>("#end-dialog-body"),
    endConfirmBtn: requireElement<HTMLButtonElement>("#end-confirm-button"),
    endCancelBtn: requireElement<HTMLButtonElement>("#end-cancel-button"),
    removeDialog: requireElement<HTMLDialogElement>("#remove-dialog"),
    removeBody: requireElement<HTMLElement>("#remove-dialog-body"),
    removeConfirmBtn: requireElement<HTMLButtonElement>("#remove-confirm-button"),
    removeCancelBtn: requireElement<HTMLButtonElement>("#remove-cancel-button"),
  },
  {
    onConfirmEnd: doEnd,
    onConfirmRemove: doRemove,
  },
);

mainheadElements.endBtn.addEventListener("click", () => {
  if (focusedId !== null) dispatchAction("end", focusedId);
});
mainheadElements.resumeBtn.addEventListener("click", () => {
  if (focusedId !== null) dispatchAction("resume", focusedId);
});
mainheadElements.removeBtn.addEventListener("click", () => {
  if (focusedId !== null) dispatchAction("remove", focusedId);
});
// The Focus dead surface's own cap carries a Resume button too (REQ-13/User Flow 3) —
// same dispatcher, since collectDeadSurfaceRefs already wired its `data-id` in
// `renderDeadSurface`, but that dataset is only ever read here at click time.
deadSurfaceRefs.resumeBtn.addEventListener("click", () => {
  if (focusedId !== null) dispatchAction("resume", focusedId);
});

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
  // No sticky client-side state depends on usageModel the way tilesLive does on
  // view/density, so there's no reason to skip the assignment when unchanged.
  usageModel = prefs.usageModel;
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

function renderFocusView(sessions: readonly Session[], now: Date, connected: boolean): void {
  const hasSessions = sessions.length > 0;
  renderFocusMain({ emptyEl: mainEmptyEl, slotEl: mainSlotEl }, hasSessions);
  const session = sessions.find((s) => s.id === focusedId) ?? null;
  renderMainhead(mainheadElements, session, now, connected);

  if (!session) {
    mainSlotEl.hidden = true;
    mainSlotEl.replaceChildren();
    deadSurfaceEl.hidden = true;
    renderSizenote(sizenoteEl, null);
    return;
  }

  if (!session.alive) {
    // REQ-13/W8: never a live terminal for a dead session — the dead surface replaces
    // the terminal slot entirely, fetching (and caching) the last pane snapshot.
    mainSlotEl.hidden = true;
    mainSlotEl.replaceChildren();
    deadSurfaceEl.hidden = false;
    ensurePaneFetch(session.id);
    renderDeadSurface(deadSurfaceRefs, session, deadPaneCache.get(session.id) ?? { status: "loading" }, now, connected);
    renderSizenote(sizenoteEl, null);
    return;
  }

  deadSurfaceEl.hidden = true;
  const surface = surfaces.get(session.id);
  if (!surface) {
    mainSlotEl.replaceChildren();
    renderSizenote(sizenoteEl, null);
    return;
  }
  mainSlotEl.hidden = false;
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
    // review m4-reconcile Minor 10: this must be an explicit NBSP escape, not an ASCII
    // space — `.sizenote` is `display: flex`, and a flex item containing only
    // collapsible whitespace renders at zero height, silently defeating the
    // layout-shift reservation this comment block describes. A prior pass regressed
    // this to a plain space (probably a formatter artifact); verified via `od -c` that
    // it had become a literal 0x20 rather than U+00A0.
    sizenoteEl.textContent = "\u00A0";
  }
  surface.refit();
  renderSizenote(sizenoteEl, surface.geometry);
}

/** Reconciles the Tiles grid to `liveSessions` (in priority order, dead-but-sticky ones
 * included — REQ-12's "a dead tile keeps its grid slot") against the persisted
 * `tileElements` map: existing tiles are updated and, if needed, *moved* in place;
 * departed ids are removed; only genuinely new ids get a freshly built tile. This never
 * rebuilds the grid wholesale (review m2-terminal Critical 2 — a wholesale rebuild
 * re-parented every mounted TerminalSurface root every render pass, blurring xterm's
 * textarea within ~1s of the user clicking in) and it always inserts a tile into the
 * grid *before* fitting it (Critical 1 — `FitAddon.fit()` on a still-detached, zero-size
 * container is a silent no-op, so a fit attempted before insertion never sends a
 * `resize`).
 */
function reconcileTilesGrid(liveSessions: readonly Session[], now: Date, connected: boolean): void {
  const desiredIds = new Set(liveSessions.map((s) => s.id));

  for (const [id, refs] of tileElements) {
    if (!desiredIds.has(id)) {
      refs.root.remove();
      tileElements.delete(id);
    }
  }

  // review m4-reconcile cycle-4 Minor 2: the same `insertBefore` detach that blurs a rail
  // card blurs a focused tile-footer button when a priority change reorders the grid
  // (measured: survives 2.5 s of ticks, falls to `<body>` on the reorder). Snapshot the
  // focused logical control before the loop; re-focus it after if the move blurred it.
  //
  // Fix attempt 2 (REQ-10/E6): for a drag-triggered reorder, focus is already gone by the
  // time we get here (the drag's `mousedown` blurred it before `dragstart`/`drop` ever
  // ran) — `installTileDrag`'s `onMove` callback stashed the pre-blur snapshot in
  // `pendingTileFocus` for exactly this pass. Prefer it when present; always consume it
  // (clear it) so a stale snapshot can never apply to a later, unrelated render.
  const focused = pendingTileFocus ?? captureFocusedControl(tilesGridEl);
  pendingTileFocus = null;

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

    // Moving an already-mounted node via insertBefore repositions it in place rather than
    // rebuilding the subtree — the mounted surface survives — but the detach step still
    // runs and blurs a focused descendant (see render/focus.ts); the restore after the
    // loop covers action buttons. Skipped entirely when the tile is already in the right
    // slot, so a steady grid touches no DOM at all on the 1s tick.
    const desiredNext: Element | null = previousRoot
      ? previousRoot.nextElementSibling
      : tilesGridEl.firstElementChild;
    if (desiredNext !== refs.root) {
      tilesGridEl.insertBefore(refs.root, desiredNext);
    }
    previousRoot = refs.root;

    if (session.alive) {
      // Insert into the grid FIRST, then mount/refit — a detached container's fit() is a
      // silent no-op (Critical 1).
      const surface = surfaces.get(session.id);
      if (surface) {
        if (isNewTile || refs.bodySlot.firstElementChild !== surface.root) {
          refs.bodySlot.replaceChildren(surface.root);
        }
        surface.refit();
      }
      renderTileGeometry(refs, true, surface?.geometry ?? null);
    } else {
      // REQ-12/REQ-13/W8: a dead tile never gets a live surface — its body slot mounts
      // the shared dead-surface component instead, fetching the pane snapshot exactly
      // like Focus's does.
      ensurePaneFetch(session.id);
      mountTileDeadSurface(
        refs.bodySlot,
        session,
        deadPaneCache.get(session.id) ?? { status: "loading" },
        now,
        connected,
        deadSurfaceTemplate,
        dispatchAction,
      );
      renderTileGeometry(refs, false, null);
    }

    if (refs.actsEl) renderTileFooterActions(refs.actsEl, session, now, connected, dispatchAction);
  }

  restoreFocusedControl(focused, (id) => tileElements.get(id)?.root);
}

function renderTilesView(sessions: readonly Session[], now: Date, connected: boolean): void {
  const hasSessions = sessions.length > 0;
  tilesEmptyEl.hidden = hasSessions;
  tilesGridEl.hidden = !hasSessions;
  if (!hasSessions) {
    tilesGridEl.replaceChildren();
    tileElements.clear();
    renderStrip(tilesStripEl, [], now, promoteSession, dispatchAction, connected);
    return;
  }

  tilesGridEl.dataset["density"] = density;

  const liveSessions = tilesLive
    .map((id) => sessions.find((s) => s.id === id))
    .filter((s): s is Session => s !== undefined);
  const liveIds = new Set(tilesLive);
  const stripSessions = sortSessions(sessions.filter((s) => !liveIds.has(s.id)));

  reconcileTilesGrid(liveSessions, now, connected);

  renderStrip(tilesStripEl, stripSessions, now, promoteSession, dispatchAction, connected);
}

/** The single render pass: reconciles which sessions should be live in the current view
 * (opening/closing TerminalSurfaces via sessions/live.ts's pure diff — W7/W8) and redraws
 * every view's chrome. Idempotent and safe to call after every store mutation, prefs
 * change, keyboard action or the 1s tick. */
function render(): void {
  const sessions = store.values();
  const now = new Date();
  const connected = isConnected();

  updateDeadPaneTracking(sessions);
  renderUsageBlock(currentUsage, now);

  if (view === "tiles") {
    tilesLive = applyDensity(tilesLive, densityCount(density), sessions);
  } else if (focusedId === null || !sessions.some((s) => s.id === focusedId)) {
    // Default focus on load / whenever the current focus stops existing: top of the
    // §3.4 sort order (REQ-7), which now sorts ended sessions last (REQ-9) — a removed
    // session's focus falls through to here.
    focusedId = sortSessions(sessions)[0]?.id ?? null;
  }

  // REQ-13/INV-5/W8: only alive sessions may ever open a terminal socket — Tiles' sticky
  // grid membership (`tilesLive`) can include a dead id (REQ-12), so the filter is
  // applied here, the last step before diffing against currently-open surfaces.
  const desired = aliveOnly(view === "focus" ? (focusedId !== null ? [focusedId] : []) : tilesLive, sessions);
  const diff = surfaceDiff(Array.from(surfaces.keys()), desired);

  for (const id of diff.toClose) {
    surfaces.get(id)?.dispose();
    surfaces.delete(id);
  }
  for (const id of diff.toOpen) {
    const session = sessions.find((s) => s.id === id);
    if (session) surfaces.set(id, new TerminalSurface(session));
  }

  renderSessions(
    sessionsEl,
    sortSessions(sessions),
    now,
    (id) => {
      focusedId = id;
      render();
    },
    dispatchAction,
    connected,
  );
  railCountEl.textContent = sessions.length > 0 ? String(sessions.length) : "";

  renderViewSwitcher({ focusButton: viewFocusBtn, tilesButton: viewTilesBtn }, view);
  renderDensityControl(
    { container: densityToolbarEl, twoByTwoButton: density2x2Btn, threeByTwoButton: density3x2Btn },
    view,
    density,
  );
  viewFocusEl.hidden = view !== "focus";
  viewTilesEl.hidden = view !== "tiles";

  if (view === "focus") renderFocusView(sessions, now, connected);
  else renderTilesView(sessions, now, connected);
}

viewFocusBtn.addEventListener("click", () => requestView("focus"));
viewTilesBtn.addEventListener("click", () => requestView("tiles"));
density2x2Btn.addEventListener("click", () => requestDensity("2x2"));
density3x2Btn.addEventListener("click", () => requestDensity("3x2"));

// REQ-12: aria-busy from click until the next `usage` message or 5s, whichever is first
// (the onUsage handler below calls clearUsageRefreshBusy() on every message; this timer
// is only the fallback for a fetch that hangs or a result that never triggers a broadcast
// because the list didn't change).
usageRefreshBtn.addEventListener("click", () => {
  usageRefreshBtn.setAttribute("aria-busy", "true");
  if (usageRefreshTimer !== null) clearTimeout(usageRefreshTimer);
  usageRefreshTimer = setTimeout(clearUsageRefreshBusy, 5000);
  void refreshUsage().then((result) => {
    if (!result.ok) {
      console.error(`POST /api/usage/refresh failed: ${result.error.code} ${result.error.message}`);
      clearUsageRefreshBusy();
    }
  });
});

// plan move-tiles REQ-4/REQ-5/REQ-8: delegated drag-to-reorder on the grid container —
// installed once, covers every tile the reconciler ever builds, works even with the
// daemon down (ordering is client-only state, untouched by connection status).
installTileDrag(tilesGridEl, (draggedId, targetId, focusedBeforeDrag) => {
  tilesLive = moveTile(tilesLive, draggedId, targetId);
  // See `pendingTileFocus`'s declaration: the drop's own `mousedown` already blurred
  // whatever was focused by the time we get here, so `reconcileTilesGrid`'s live capture
  // would find nothing — feed it this pre-blur snapshot instead, for this one pass only.
  pendingTileFocus = focusedBeforeDrag;
  render();
});

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
  openButtons: [
    requireElement<HTMLButtonElement>("#new-session-button"),
    requireElement<HTMLButtonElement>("#tiles-new-session-button"),
  ],
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
    // Launched from Tiles: the new session must become a live tile even when the grid is
    // full — `applyDensity` alone would only admit it to a free slot and otherwise leave
    // it in the strip. `promoteSession` demotes exactly the lowest-priority live tile
    // (REQ-8) and renders; it is a no-op guard in Focus, so render there explicitly.
    if (view === "tiles") promoteSession(session.id);
    else render();
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
  onSessionRemoved: (id) => {
    handleRemoved(id);
  },
  onPrefs: (prefs) => {
    applyPrefsFromSnapshot(prefs);
    render();
  },
  onUsage: (usage) => {
    currentUsage = usage;
    clearUsageRefreshBusy();
    render();
  },
  onDisconnected: () => {
    setStatus(everConnected ? "reconnecting" : "connecting");
  },
  onProtocolMismatch: showProtocolMismatch,
});

client.start();
