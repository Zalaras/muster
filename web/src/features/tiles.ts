// Tiles grid reconcile, strip, tile drag, density application, and promote (plan
// code-breakup vocabulary: "tiles"). Owns `tilesLive` — per-window, ephemeral, client-only
// membership/order state (never synced across windows, never a prefs field).
//
// `deps.getSurfaces`/`deps.getRenameHandlers` are thunks: `surfaces`/`rename` are
// constructed after `tiles` (main.ts's init order — `surfaces` needs `tiles.liveIds` at
// its own render time), so this closes over their later `const`s rather than taking real
// values now; both are only ever called from `renderView`, invoked well after every
// controller exists.
//
// This module tracks its own `lastView`/`lastDensity` (redundant with `app.state`,
// deliberately) because its `prefs` handler reads `prefs.view`/`prefs.density` off the
// incoming message, not off `app.state` — see views.ts's header comment for why: by the
// time this handler might run, `views.ts`'s own handler could already have overwritten
// `app.state.view`/`density` with the new values, which would make an
// against-`app.state` comparison always report "unchanged" (Edge Case 2/7).
// W6/INV-4: `deps` below is typed structurally rather than by importing
// `ActionsHandle`/`SurfacesHandle`/`RenameHandle` from their owning sibling modules.
import type { App, RenderFrame } from "../app";
import { requireElement } from "../dom";
import {
  buildTile,
  mountTileDeadSurface,
  renderStrip,
  renderTileFooterActions,
  renderTileGeometry,
  updateTile,
  type TileRefs,
  type TileRenameHandlers,
} from "../render/tiles";
import { captureFocusedControl, restoreFocusedControl, type FocusedControl } from "../render/focus";
import { installTileDrag } from "../render/tiledrag";
import { applyDensity, densityCount, initialLive, moveTile, promote } from "../sessions/live";
import { orderRail } from "../sessions/sort";
import {
  getSurfaceState,
  updateSurfaceSegment,
  type SurfaceKind,
  type SurfaceSwitchState,
} from "../terminal/surfaceswitch";
import type { TerminalSurface } from "../terminal/pane";
import type { DeadSurfaceRefs, PaneState } from "../render/dead";
import type { Session } from "../protocol";
import type { SessionAction } from "../render/sessions";

export interface TilesDeps {
  actions: {
    dispatch(action: SessionAction, id: number): void;
    findDeadSurfaceRefs(id: number): DeadSurfaceRefs | null;
    ensurePaneFetch(id: number): void;
    paneState(id: number): PaneState;
  };
  getSurfaces(): {
    state(): SurfaceSwitchState;
    get(id: number, kind: SurfaceKind): TerminalSurface | undefined;
    select(id: number, kind: SurfaceKind, findDeadRefs: () => DeadSurfaceRefs | null): void;
  };
  getRenameHandlers(): TileRenameHandlers;
}

export interface TilesHandle {
  /** Strip-card click / ⌥⌘1–9 or ⌥⌘0 in Tiles: promotes, demoting exactly the
   * lowest-priority live tile. */
  promote(id: number): void;
  /** For `surfaces.ts`'s render-phase visibility diff. */
  liveIds(): readonly number[];
  /** For `actions.ts`'s `findDeadSurfaceRefs` thunk. */
  bodySlotFor(id: number): HTMLElement | null;
  /** Render phase 10 in Tiles. */
  renderView(frame: RenderFrame): void;
}

export function initTiles(app: App, deps: TilesDeps): TilesHandle {
  const tilesEmptyEl = requireElement<HTMLElement>("#tiles-empty");
  const tilesGridEl = requireElement<HTMLElement>("#tiles-grid");
  const tilesStripEl = requireElement<HTMLElement>("#tiles-strip");
  const deadSurfaceTemplate = requireElement<HTMLTemplateElement>("#dead-surface-template");

  let tilesLive: number[] = [];
  // Tiles' mounted chrome per live session id — kept across render passes so the 1s tick
  // (and every other render trigger) updates existing tiles in place instead of
  // rebuilding the grid (review m2-terminal Critical 2).
  const tileElements = new Map<number, TileRefs>();
  let pendingTileFocus: FocusedControl | null = null;
  let lastView = app.state.view;
  let lastDensity = app.state.density;

  function promoteSession(id: number): void {
    if (app.state.view !== "tiles") return;
    tilesLive = promote(tilesLive, id, app.store.values());
    app.render();
  }

  function cancelTileRenames(): void {
    for (const refs of tileElements.values()) refs.rename?.cancel();
  }
  app.on("cancelRenames", cancelTileRenames);
  app.on("status", () => cancelTileRenames());

  app.on("prefs", (prefs) => {
    if (prefs.view !== lastView) {
      lastView = prefs.view;
      if (prefs.view === "tiles")
        tilesLive = initialLive(app.store.values(), densityCount(prefs.density));
    }
    if (prefs.density !== lastDensity) {
      lastDensity = prefs.density;
      if (prefs.view === "tiles")
        tilesLive = applyDensity(tilesLive, densityCount(prefs.density), app.store.values());
    }
  });

  app.on("sessionRemoved", (id) => {
    const tileRefs = tileElements.get(id);
    if (tileRefs) {
      // REQ-15/edge case 18: cancel (no request) and detach the editor's own listener
      // before the tile itself is removed from the DOM.
      tileRefs.rename?.cancel();
      tileRefs.rename?.dispose();
      tileRefs.root.remove();
      tileElements.delete(id);
    }
    tilesLive = tilesLive.filter((x) => x !== id);
  });

  // Render phase 5 (UI Specifications > Render phase order): in Tiles, `tilesLive` tracks
  // density every pass (a session removed elsewhere, a new one launched, ...).
  app.onRender((frame) => {
    if (app.state.view === "tiles") {
      tilesLive = applyDensity(tilesLive, densityCount(app.state.density), frame.sessions);
    }
  });

  installTileDrag(tilesGridEl, (draggedId, targetId, focusedBeforeDrag) => {
    tilesLive = moveTile(tilesLive, draggedId, targetId);
    pendingTileFocus = focusedBeforeDrag;
    app.render();
  });

  /** Tears down every tile whose session is no longer live, cancelling an in-flight rename
   * before the node leaves the document. */
  function dropTilesNotIn(desiredIds: ReadonlySet<number>): void {
    for (const [id, refs] of tileElements) {
      if (!desiredIds.has(id)) {
        refs.rename?.cancel();
        refs.rename?.dispose();
        refs.root.remove();
        tileElements.delete(id);
      }
    }
  }

  /** Fills one tile's body slot: the selected surface, or the dead-pane surface when the
   * session has exited and Claude is the selected surface. Owns the tile's geometry frame
   * either way, so the two paths cannot disagree about what was rendered. */
  function renderTileBody(
    refs: TileRefs,
    session: Session,
    selected: SurfaceKind,
    isNewTile: boolean,
    now: Date,
    connected: boolean,
  ): void {
    if (session.alive || selected !== "claude") {
      const surface = deps.getSurfaces().get(session.id, selected);
      if (surface) {
        if (isNewTile || refs.bodySlot.firstElementChild !== surface.root) {
          refs.bodySlot.replaceChildren(surface.root);
        }
        surface.refit();
      }
      renderTileGeometry(refs, session.alive, surface?.geometry ?? null);
      return;
    }

    deps.actions.ensurePaneFetch(session.id);
    mountTileDeadSurface(
      refs.bodySlot,
      session,
      deps.actions.paneState(session.id),
      now,
      connected,
      deadSurfaceTemplate,
      deps.actions.dispatch,
    );
    renderTileGeometry(refs, false, null);
  }

  function reconcileTilesGrid(
    liveSessions: readonly Session[],
    now: Date,
    connected: boolean,
  ): void {
    dropTilesNotIn(new Set(liveSessions.map((s) => s.id)));

    const focused = pendingTileFocus ?? captureFocusedControl(tilesGridEl);
    pendingTileFocus = null;

    let previousRoot: HTMLElement | null = null;
    for (const session of liveSessions) {
      let refs = tileElements.get(session.id);
      const isNewTile = !refs;
      if (!refs) {
        refs = buildTile(session, now, deps.getRenameHandlers(), (id, kind) =>
          deps.getSurfaces().select(id, kind, () => deps.actions.findDeadSurfaceRefs(id)),
        );
        tileElements.set(session.id, refs);
      } else {
        updateTile(refs, session, now);
      }

      const desiredNext: Element | null = previousRoot
        ? previousRoot.nextElementSibling
        : tilesGridEl.firstElementChild;
      if (desiredNext !== refs.root) {
        tilesGridEl.insertBefore(refs.root, desiredNext);
      }
      previousRoot = refs.root;

      const sessionSurfaceState = getSurfaceState(deps.getSurfaces().state(), session.id);
      renderTileBody(refs, session, sessionSurfaceState.selected, isNewTile, now, connected);

      if (refs.actsEl)
        renderTileFooterActions(refs.actsEl, session, now, connected, deps.actions.dispatch);
      if (refs.surfaceSegment)
        updateSurfaceSegment(refs.surfaceSegment, sessionSurfaceState, connected);
      refs.rename?.setEnabled(connected);
    }

    restoreFocusedControl(focused, (id) => tileElements.get(id)?.root);
  }

  function renderView(frame: RenderFrame): void {
    const { sessions, now, connected } = frame;
    const hasSessions = sessions.length > 0;
    tilesEmptyEl.hidden = hasSessions;
    tilesGridEl.hidden = !hasSessions;
    if (!hasSessions) {
      tilesGridEl.replaceChildren();
      tileElements.clear();
      renderStrip(tilesStripEl, [], now, promoteSession, deps.actions.dispatch, connected);
      return;
    }

    tilesGridEl.dataset["density"] = app.state.density;

    const liveSessions = tilesLive
      .map((id) => sessions.find((s) => s.id === id))
      .filter((s): s is Session => s !== undefined);
    const liveIds = new Set(tilesLive);
    const stripSessions = orderRail(
      sessions.filter((s) => !liveIds.has(s.id)),
      app.state.railSort,
    );

    reconcileTilesGrid(liveSessions, now, connected);

    renderStrip(tilesStripEl, stripSessions, now, promoteSession, deps.actions.dispatch, connected);
  }

  return {
    promote: promoteSession,
    liveIds: () => tilesLive,
    bodySlotFor: (id) => tileElements.get(id)?.bodySlot ?? null,
    renderView,
  };
}
