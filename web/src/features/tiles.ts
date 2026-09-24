// Tiles grid reconcile, strip, tile drag, density application, and promote. Owns
// `tilesLive` — per-window, ephemeral, client-only membership/order state (never synced
// across windows, never a prefs field; kb:adr/tiles-order-ephemeral-per-window).
//
// `deps.getSurfaces` is a thunk: `surfaces` is constructed after `tiles` (main.ts's init
// order — `surfaces` needs `tiles.liveIds` at its own render time), so this closes over
// its later `const` rather than taking a real value now; it's only ever called from
// `renderView`, invoked well after every controller exists. `rename` is constructed
// before `tiles`, so `deps.renameHandlers` is a real value.
//
// This module tracks its own `lastView`/`lastDensity` (redundant with `app.state`,
// deliberately) because its `prefs` handler reads `prefs.view`/`prefs.density` off the
// incoming message, not off `app.state` — see views.ts's header comment for why: by the
// time this handler might run, `views.ts`'s own handler could already have overwritten
// `app.state.view`/`density` with the new values, which would make an
// against-`app.state` comparison always report "unchanged".
// `deps` below is typed structurally rather than by importing
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
import { installDragReorder } from "../render/dragreorder";
import { captureFocusedControl, type FocusedControl } from "../render/focuskeep";
import { reconcileKeyedOrder, type KeyedReorderEntry } from "../render/keyedreorder";
import { mountSlotRoot } from "../render/slotmount";
import { applyDensity, densityCount, initialLive, moveTile, promote } from "../sessions/live";
import { orderRail } from "../sessions/sort";
import {
  getSurfaceState,
  surfaceBodyKind,
  type SurfaceKind,
  type SurfaceSwitchState,
} from "../terminal/surfaceswitch";
import { updateSurfaceSegment } from "../render/surfaceseg";
import type { TerminalSurface } from "../terminal/pane";
import type { ShellActivityIndicator } from "../terminal/shellactivity";
import { collectDeadSurfaceRefs, type DeadSurfaceRefs } from "../render/dead";
import type { Session } from "../protocol/session";
import type { PaneState, SessionAction } from "../sessions/card";

export interface TilesDeps {
  actions: {
    dispatch(action: SessionAction, id: number): void;
    ensurePaneFetch(id: number): void;
    paneState(id: number): PaneState;
  };
  getSurfaces(): {
    state(): SurfaceSwitchState;
    get(id: number, kind: SurfaceKind): TerminalSurface | undefined;
    select(id: number, kind: SurfaceKind, findDeadRefs: () => DeadSurfaceRefs | null): void;
    activityFor(id: number): ShellActivityIndicator;
  };
  renameHandlers: TileRenameHandlers;
  /** `reader` is constructed after `tiles` (main.ts's init
   * order), so this is a thunk like `getSurfaces` above — invoked only from `renderView`. */
  getReader(): { rootFor(id: number): HTMLElement | null };
}

export interface TilesHandle {
  /** Strip-card click / ⌥⌘1–9 or ⌥⌘0 in Tiles: promotes, demoting exactly the
   * lowest-priority live tile. */
  promote(id: number): void;
  /** For `surfaces.ts`'s render-phase visibility diff. */
  liveIds(): readonly number[];
  /** `null` unless `id` currently has a dead tile mounted — Tiles' own dead-surface
   * lookup, passed directly to `surfaces.select` for a spawn-failure notice
   * (`features/actions.ts`'s header states why this lives here, not there). */
  deadSurfaceRefsFor(id: number): DeadSurfaceRefs | null;
  /** Render phase 10 in Tiles. */
  renderView(frame: RenderFrame): void;
}

export function initTiles(app: App, deps: TilesDeps): TilesHandle {
  const tilesEmptyEl = requireElement<HTMLElement>("#tiles-empty");
  const tilesGridEl = requireElement<HTMLElement>("#tiles-grid");
  const tilesStripEl = requireElement<HTMLElement>("#tiles-strip");
  const deadSurfaceTemplate = requireElement<HTMLTemplateElement>("#dead-surface-template");
  // Looked up once, here, and passed into every `render/tiles.ts` builder that needs it —
  // no `render/` module looks up its own template.
  const tileTemplate = requireElement<HTMLTemplateElement>("#tile-template");
  const sessionCardTemplate = requireElement<HTMLTemplateElement>("#session-card-template");

  let tilesLive: number[] = [];
  // Tiles' mounted chrome per live session id — kept across render passes so the 1s tick
  // (and every other render trigger) updates existing tiles in place instead of
  // rebuilding the grid.
  const tileElements = new Map<number, TileRefs>();
  let pendingTileFocus: FocusedControl | null = null;
  let lastView = app.state.view;
  let lastDensity = app.state.density;

  /** `TilesHandle.deadSurfaceRefsFor`'s own doc above states why this exists apart from
   * `features/actions.ts`. */
  function deadSurfaceRefsFor(id: number): DeadSurfaceRefs | null {
    const tileDeadEl =
      tileElements.get(id)?.bodySlot.querySelector<HTMLElement>(".dead-surface") ?? null;
    return tileDeadEl ? collectDeadSurfaceRefs(tileDeadEl) : null;
  }

  function promoteSession(id: number): void {
    if (app.state.view !== "tiles") return;
    tilesLive = promote(tilesLive, id, app.store.values());
    app.render();
  }

  function cancelTileRenames(): void {
    for (const refs of tileElements.values()) refs.rename.cancel();
  }

  /** The one tile-teardown routine — cancel (no request) and detach the
   * rename editor's own listener before the tile leaves the DOM, then drop its refs. A
   * no-op for an id with no mounted tile. Shared by the `sessionRemoved` handler and
   * `dropTilesNotIn` below. */
  function teardownTile(id: number): void {
    const refs = tileElements.get(id);
    if (!refs) return;
    refs.rename.cancel();
    refs.rename.dispose();
    refs.root.remove();
    tileElements.delete(id);
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
    // Cancel (no request) and detach the editor's own listener
    // before the tile itself is removed from the DOM.
    teardownTile(id);
    tilesLive = tilesLive.filter((x) => x !== id);
  });

  // Render phase 5 (main.ts's numbered render-phase order): in Tiles, `tilesLive` tracks
  // density every pass (a session removed elsewhere, a new one launched, ...).
  app.onRender((frame) => {
    if (app.state.view === "tiles") {
      tilesLive = applyDensity(tilesLive, densityCount(app.state.density), frame.sessions);
    }
  });

  // The tile grid's handle is `.thead` — only a drag that starts there reorders the grid;
  // the body/footer are not drag handles (kb:adr/tiles-drag-reorder-header-handle-insert-shift).
  installDragReorder(tilesGridEl, {
    itemSelector: "article.tile",
    handleSelector: ".thead",
    onMove: (draggedId, targetId, focusedBeforeDrag) => {
      tilesLive = moveTile(tilesLive, draggedId, targetId);
      pendingTileFocus = focusedBeforeDrag;
      app.render();
    },
  });

  /** Tears down every tile whose session is no longer live, via `teardownTile` above —
   * deleting the current entry mid-iteration is safe (`Map`'s iterator never revisits a
   * key removed during its own pass). */
  function dropTilesNotIn(desiredIds: ReadonlySet<number>): void {
    for (const id of tileElements.keys()) {
      if (!desiredIds.has(id)) teardownTile(id);
    }
  }

  /** The reader replaces the tile body for `docs` regardless of `alive` — no
   * `TerminalSurface` ever exists for it (kb:adr/reader-docs-is-third-surface-segment). */
  function renderReaderTileBody(refs: TileRefs, session: Session): void {
    const readerRoot = deps.getReader().rootFor(session.id);
    mountSlotRoot(refs.bodySlot, readerRoot);
    renderTileGeometry(refs, session.alive, null);
  }

  function renderSurfaceTileBody(refs: TileRefs, session: Session, selected: SurfaceKind): void {
    const surface = deps.getSurfaces().get(session.id, selected);
    if (surface) {
      mountSlotRoot(refs.bodySlot, surface.root);
      surface.refit();
    }
    renderTileGeometry(refs, session.alive, surface?.geometry ?? null);
  }

  function renderDeadTileBody(
    refs: TileRefs,
    session: Session,
    now: Date,
    connected: boolean,
  ): void {
    deps.actions.ensurePaneFetch(session.id);
    mountTileDeadSurface(
      refs.bodySlot,
      session,
      deps.actions.paneState(session.id),
      now,
      deadSurfaceTemplate,
      { connected, onAction: deps.actions.dispatch },
    );
    renderTileGeometry(refs, false, null);
  }

  /** Fills one tile's body slot: the reader, the selected surface, or the dead-pane
   * surface — the same shared `surfaceBodyKind` decision features/focus.ts's main slot
   * uses, so the two views can't drift on the branch order or conditions. Owns the tile's
   * geometry frame either way, so the three paths cannot disagree about what was
   * rendered. */
  function renderTileBody(
    refs: TileRefs,
    session: Session,
    selected: SurfaceKind,
    now: Date,
    connected: boolean,
  ): void {
    const kind = surfaceBodyKind(selected, session.alive);
    if (kind === "docs") {
      renderReaderTileBody(refs, session);
    } else if (kind === "dead") {
      renderDeadTileBody(refs, session, now, connected);
    } else {
      renderSurfaceTileBody(refs, session, selected);
    }
  }

  function reconcileTilesGrid(
    liveSessions: readonly Session[],
    now: Date,
    connected: boolean,
  ): void {
    dropTilesNotIn(new Set(liveSessions.map((s) => s.id)));

    // Captured before any tile's content is
    // built or updated below, not just before the position pass — a content update (say,
    // a genuine live/ended transition) can itself blur a focused descendant, same
    // reasoning as `render/sessions.ts`'s `reconcileCards`.
    const focused = pendingTileFocus ?? captureFocusedControl(tilesGridEl);
    pendingTileFocus = null;

    // This module keeps only membership (`tilesLive`, via
    // `dropTilesNotIn` above) and each tile's own refs; the actual DOM
    // insertBefore-reorder-plus-focus-restore is `render/keyedreorder.ts`'s shared
    // routine, the same one `render/sessions.ts`'s `reconcileCards` uses for the rail and
    // strip.
    const entries: KeyedReorderEntry[] = [];
    for (const session of liveSessions) {
      let refs = tileElements.get(session.id);
      if (!refs) {
        // A freshly built tile's `bodySlot` starts empty (its template has no children
        // there), so `mountSlotRoot`'s own firstElementChild diff already mounts on the
        // first pass — no separate "is this a new tile" force-mount flag needed.
        refs = buildTile(session, now, tileTemplate, deps.renameHandlers, (id, kind) =>
          deps.getSurfaces().select(id, kind, () => deadSurfaceRefsFor(id)),
        );
        tileElements.set(session.id, refs);
        // renderTileBody's refit needs a laid-out container (FitAddon.fit() silently
        // does nothing on a detached node); reconcileKeyedOrder below positions it.
        tilesGridEl.append(refs.root);
      } else {
        updateTile(refs, session, now);
      }
      entries.push({ id: session.id, root: refs.root });

      const sessionSurfaceState = getSurfaceState(deps.getSurfaces().state(), session.id);
      renderTileBody(refs, session, sessionSurfaceState.selected, now, connected);

      renderTileFooterActions(refs.actsEl, session, now, connected, deps.actions.dispatch);
      updateSurfaceSegment(
        refs.surfaceSegment,
        sessionSurfaceState,
        connected,
        deps.getSurfaces().activityFor(session.id),
      );
      refs.rename.setEnabled(connected);
    }

    reconcileKeyedOrder(tilesGridEl, entries, focused);
  }

  function renderView(frame: RenderFrame): void {
    const { sessions, now, connected } = frame;
    const hasSessions = sessions.length > 0;
    tilesEmptyEl.hidden = hasSessions;
    tilesGridEl.hidden = !hasSessions;

    // One `renderStrip` call per pass — `stripSessions` is `[]` in the empty-dashboard
    // case.
    let stripSessions: readonly Session[] = [];
    if (!hasSessions) {
      tilesGridEl.replaceChildren();
      tileElements.clear();
    } else {
      tilesGridEl.dataset["density"] = app.state.density;
      const liveSessions = tilesLive
        .map((id) => sessions.find((s) => s.id === id))
        .filter((s): s is Session => s !== undefined);
      const liveIds = new Set(tilesLive);
      stripSessions = orderRail(
        sessions.filter((s) => !liveIds.has(s.id)),
        app.state.railSort,
      );
      reconcileTilesGrid(liveSessions, now, connected);
    }

    renderStrip(tilesStripEl, stripSessions, now, sessionCardTemplate, promoteSession, {
      onAction: deps.actions.dispatch,
      connected,
      railActivity: app.state.railActivity,
    });
  }

  return {
    promote: promoteSession,
    liveIds: () => tilesLive,
    deadSurfaceRefsFor,
    renderView,
  };
}
