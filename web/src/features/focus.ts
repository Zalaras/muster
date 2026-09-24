// The Focus view: mainhead, main terminal slot, dead surface, sizenote, default focus
// (kb:adr/process-one-name-per-feature). `deps.getSurfaces` is a thunk — `surfaces` is
// constructed after `focus` (main.ts's init order), and the only place this module needs
// it is inside a click callback, invoked well after every controller exists.
//
// No controller module imports a sibling — `deps` below is typed structurally
// (the exact method shapes this module calls), never by importing `ActionsHandle`/
// `SurfacesHandle` from `./actions`/`./surfaces`.
import type { App, RenderFrame } from "../app";
import { requireElement } from "../dom";
import { renderFocusMain, renderSizenote, setMainSlotHidden } from "../render/focusview";
import { renderMainhead, type MainheadElements } from "../render/mainhead";
import { attachRenameEditor, type RenameEditorHandlers } from "../render/rename";
import { mountSlotRoot } from "../render/slotmount";
import type { PaneState, SessionAction } from "../sessions/card";
import { collectDeadSurfaceRefs, renderDeadSurface, type DeadSurfaceRefs } from "../render/dead";
import {
  DEFAULT_SURFACE_STATE,
  getSurfaceState,
  surfaceBodyKind,
  type SessionSurfaceState,
  type SurfaceKind,
  type SurfaceSwitchState,
} from "../terminal/surfaceswitch";
import { buildSurfaceSegment } from "../render/surfaceseg";
import type { TerminalSurface } from "../terminal/pane";
import type { ShellActivityIndicator } from "../terminal/shellactivity";
import type { Session } from "../protocol/session";
import { orderRail, pickNeediest } from "../sessions/sort";

export interface FocusDeps {
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
  /** Tiles' promote — Focus's own shortcut-driven `nth`/`neediest` promote instead of
   * focusing when the current view is Tiles (`bringForward`'s shared tail). Tiles is
   * constructed before focus (main.ts's init order), so this is a real value. */
  promoteTile(id: number): void;
  /** `reader` is constructed after `focus` (main.ts's init
   * order), so this is a thunk like `getSurfaces` above — invoked only from `renderView`. */
  getReader(): { rootFor(id: number): HTMLElement | null };
  /** `rename` is constructed before `focus` (main.ts's init order), so this is a real
   * value — this module attaches its own mainhead editor with it directly, the same way
   * `render/tiles.ts`'s `buildTile` attaches each tile's editor with `renameHandlers`. */
  renameHandlers: RenameEditorHandlers;
}

export interface FocusHandle {
  /** `null` unless `id` is the currently-focused session in Focus view — Focus's own
   * dead-surface lookup, passed directly to `surfaces.select` for a spawn-failure notice
   * (`features/actions.ts`'s header states why this lives here, not there). */
  deadSurfaceRefsFor(id: number): DeadSurfaceRefs | null;
  /** ⌥⌘1–9: focus (or, in Tiles, promote) session n of the rail's own order. */
  nth(n: number): void;
  /** ⌥⌘0: jump to the single highest-attention live session. */
  neediest(): void;
  /** Bring `session` forward in the current view: focuses it in Focus, promotes it in
   * Tiles. The shared tail of `nth`/`neediest`, also reached by `features/launch.ts`'s
   * `onLaunched` through this structurally typed handle — the one owner for "bring a
   * session forward", never duplicated in launch.ts. */
  bringForward(session: Session): void;
  /** Render phase 10 in Focus (features/views.ts dispatches focus vs. tiles by `app.state.view`). */
  renderView(frame: RenderFrame): void;
}

export function initFocus(app: App, deps: FocusDeps): FocusHandle {
  const deadSurfaceEl = requireElement<HTMLElement>("#dead-surface");
  const deadSurfaceRefs: DeadSurfaceRefs = collectDeadSurfaceRefs(deadSurfaceEl);

  /** `null` unless `id` is the currently-focused session in Focus view — passed directly
   * to `surfaces.select` below, and returned on `FocusHandle` for the same reason. */
  function deadSurfaceRefsFor(id: number): DeadSurfaceRefs | null {
    return app.state.view === "focus" && app.state.focusedId === id ? deadSurfaceRefs : null;
  }

  const mainheadSurfaceSegment = buildSurfaceSegment((kind) => {
    if (app.state.focusedId !== null) {
      const id = app.state.focusedId;
      deps.getSurfaces().select(id, kind, () => deadSurfaceRefsFor(id));
    }
  });
  requireElement<HTMLElement>("#mainhead .acts").before(mainheadSurfaceSegment.root);

  const mainheadElements: MainheadElements = {
    root: requireElement<HTMLElement>("#mainhead"),
    nameEl: requireElement<HTMLElement>("#mainhead .name"),
    metaEl: requireElement<HTMLElement>("#mainhead .meta"),
    endBtn: requireElement<HTMLButtonElement>('#mainhead button[data-action="end"]'),
    resumeBtn: requireElement<HTMLButtonElement>('#mainhead button[data-action="resume"]'),
    removeBtn: requireElement<HTMLButtonElement>('#mainhead button[data-action="remove"]'),
    renameBtn: requireElement<HTMLButtonElement>("#mainhead button.rename"),
    surfaceSegment: mainheadSurfaceSegment,
  };

  // Attached here, directly, the same way `render/tiles.ts`'s `buildTile` attaches each
  // tile's own editor with its `renameHandlers` — `features/rename.ts` holds no editor of
  // its own.
  const mainheadRename = attachRenameEditor(mainheadElements.nameEl, deps.renameHandlers);
  // Cancels the mainhead's open rename editor, with no request sent either way, on every
  // trigger that must not let a blur-driven commit through — a disconnect, a `view` change
  // arriving over the wire, or a direct mousedown on the Focus/Tiles masthead buttons
  // (views.ts's own guard, kb:adr/views-active-segment-click-commits-rename).
  app.on("cancelRenames", () => mainheadRename.cancel());
  app.on("status", () => mainheadRename.cancel());
  // focusChanged: today's `setFocusedId` always cancelled the mainhead editor first.
  app.on("focusChanged", () => mainheadRename.cancel());

  const mainEmptyEl = requireElement<HTMLElement>("#main-empty");
  const mainSlotEl = requireElement<HTMLElement>("#main-terminal-slot");
  const sizenoteEl = requireElement<HTMLElement>("#sizenote");

  mainheadElements.endBtn.addEventListener("click", () => {
    if (app.state.focusedId !== null) deps.actions.dispatch("end", app.state.focusedId);
  });
  mainheadElements.resumeBtn.addEventListener("click", () => {
    if (app.state.focusedId !== null) deps.actions.dispatch("resume", app.state.focusedId);
  });
  mainheadElements.removeBtn.addEventListener("click", () => {
    if (app.state.focusedId !== null) deps.actions.dispatch("remove", app.state.focusedId);
  });
  // The Focus dead surface's own cap carries a Resume button too.
  deadSurfaceRefs.resumeBtn.addEventListener("click", () => {
    if (app.state.focusedId !== null) deps.actions.dispatch("resume", app.state.focusedId);
  });

  /** Focus (Focus view) or promote (Tiles) `session` — see the `bringForward` doc comment
   * on `FocusHandle` above. */
  function bringForward(session: Session): void {
    if (app.state.view === "focus") {
      app.focus(session.id);
      app.render();
    } else {
      deps.promoteTile(session.id);
    }
  }

  function nth(n: number): void {
    const session = orderRail(app.store.values(), app.state.railSort)[n - 1];
    if (session) bringForward(session);
  }

  function neediest(): void {
    const session = pickNeediest(app.store.values());
    if (session) bringForward(session);
  }

  // Render phase 6 (main.ts's numbered render-phase order): default `focusedId` to the
  // top of the rail's own order when unset/vanished. Only fires in Focus — Tiles' own
  // membership phase (5) owns `tilesLive` instead.
  app.onRender((frame) => {
    if (app.state.view !== "focus") return;
    if (app.state.focusedId === null || !frame.sessions.some((s) => s.id === app.state.focusedId)) {
      app.focus(orderRail(frame.sessions, app.state.railSort)[0]?.id ?? null);
    }
  });

  app.on("sessionRemoved", (id) => {
    if (app.state.focusedId === id) app.focus(null);
  });

  /** Mounts the reader into the main slot for `docs` (kb:adr/reader-docs-is-third-surface-segment) —
   * split out of `renderView` purely to keep that function's cognitive complexity under
   * the project ceiling. */
  function mountReader(session: Session): void {
    const readerRoot = deps.getReader().rootFor(session.id);
    setMainSlotHidden(mainSlotEl, readerRoot === null);
    mountSlotRoot(mainSlotEl, readerRoot);
    renderSizenote(sizenoteEl, null);
  }

  /** Mounts/refits the `claude`/`shell` terminal surface into the main slot — split out
   * of `renderView` purely to keep that function's cognitive complexity under the
   * project ceiling. */
  function mountTerminalSurface(session: Session, surfaceState: SessionSurfaceState): void {
    const surface = deps.getSurfaces().get(session.id, surfaceState.selected as SurfaceKind);
    if (!surface) {
      mountSlotRoot(mainSlotEl, null);
      renderSizenote(sizenoteEl, null);
      return;
    }
    setMainSlotHidden(mainSlotEl, false);
    mountSlotRoot(mainSlotEl, surface.root);
    // Reserve the sizenote line's layout space BEFORE fitting (`renderSizenote`'s
    // `reserving` option) — needed only the first time this attaches, while the line is
    // still hidden; once it's already showing a prior geometry, that text stays put until
    // `refit()` below reports the real one.
    if (sizenoteEl.hidden) renderSizenote(sizenoteEl, null, { reserving: true });
    surface.refit();
    renderSizenote(sizenoteEl, surface.geometry);
  }

  function renderView(frame: RenderFrame): void {
    const { sessions, now, connected } = frame;
    const hasSessions = sessions.length > 0;
    renderFocusMain({ emptyEl: mainEmptyEl }, hasSessions);
    const session = sessions.find((s) => s.id === app.state.focusedId) ?? null;
    const surfaceState = session
      ? getSurfaceState(deps.getSurfaces().state(), session.id)
      : DEFAULT_SURFACE_STATE;
    const activity = session ? deps.getSurfaces().activityFor(session.id) : "none";
    renderMainhead(
      mainheadElements,
      session,
      now,
      connected,
      surfaceState,
      activity,
      mainheadRename.isEditing(),
    );

    if (!session) {
      setMainSlotHidden(mainSlotEl, true);
      mountSlotRoot(mainSlotEl, null);
      deadSurfaceEl.hidden = true;
      renderSizenote(sizenoteEl, null);
      return;
    }

    // The one "what does this session's slot show?" decision, shared with
    // features/tiles.ts: dead only applies to the `claude` surface, and `docs` replaces
    // the pane regardless of `alive` (kb:adr/reader-docs-is-third-surface-segment).
    const bodyKind = surfaceBodyKind(surfaceState.selected, session.alive);

    if (bodyKind === "dead") {
      setMainSlotHidden(mainSlotEl, true);
      mountSlotRoot(mainSlotEl, null);
      deadSurfaceEl.hidden = false;
      deps.actions.ensurePaneFetch(session.id);
      renderDeadSurface(
        deadSurfaceRefs,
        session,
        deps.actions.paneState(session.id),
        now,
        connected,
      );
      renderSizenote(sizenoteEl, null);
      return;
    }

    deadSurfaceEl.hidden = true;

    if (bodyKind === "docs") {
      mountReader(session);
      return;
    }

    mountTerminalSurface(session, surfaceState);
  }

  return {
    deadSurfaceRefsFor,
    nth,
    neediest,
    bringForward,
    renderView,
  };
}
