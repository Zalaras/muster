// The Focus view: mainhead, main terminal slot, dead surface, sizenote, default focus
// (plan code-breakup vocabulary: "focus"). `deps.getSurfaces` is a thunk — `surfaces` is
// constructed after `focus` (main.ts's init order), and the only place this module needs
// it is inside a click callback, invoked well after every controller exists.
//
// W6/INV-4: no controller module imports a sibling — `deps` below is typed structurally
// (the exact method shapes this module calls), never by importing `ActionsHandle`/
// `SurfacesHandle` from `./actions`/`./surfaces`.
import type { App, RenderFrame } from "../app";
import { requireElement } from "../dom";
import { renderFocusMain, renderSizenote, type SessionAction } from "../render/sessions";
import { renderMainhead, type MainheadElements } from "../render/mainhead";
import { collectDeadSurfaceRefs, renderDeadSurface, type DeadSurfaceRefs, type PaneState } from "../render/dead";
import {
  buildSurfaceSegment,
  DEFAULT_SURFACE_STATE,
  getSurfaceState,
  type SurfaceKind,
  type SurfaceSwitchState,
} from "../terminal/surfaceswitch";
import type { TerminalSurface } from "../terminal/pane";
import type { Session } from "../protocol";
import { orderRail, pickNeediest } from "../sessions/sort";

export interface FocusDeps {
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
  /** Tiles' promote — Focus's own shortcut-driven `nth`/`neediest` promote instead of
   * focusing when the current view is Tiles (`focusSession`'s shared tail). Tiles is
   * constructed before focus (main.ts's init order), so this is a real value. */
  promoteTile(id: number): void;
}

export interface FocusHandle {
  /** For `actions.ts`'s `findDeadSurfaceRefs` thunk. */
  readonly deadSurfaceRefs: DeadSurfaceRefs;
  /** For `rename.ts`'s mainhead editor attachment. */
  readonly nameEl: HTMLElement;
  /** ⌥⌘1–9: focus (or, in Tiles, promote) session n of the rail's own order. */
  nth(n: number): void;
  /** ⌥⌘0: jump to the single highest-attention live session. */
  neediest(): void;
  /** Render phase 10 in Focus (main.ts dispatches focus vs. tiles by `app.state.view`). */
  renderView(frame: RenderFrame): void;
}

export function initFocus(app: App, deps: FocusDeps): FocusHandle {
  const mainheadSurfaceSegment = buildSurfaceSegment((kind) => {
    if (app.state.focusedId !== null) {
      const id = app.state.focusedId;
      deps.getSurfaces().select(id, kind, () => deps.actions.findDeadSurfaceRefs(id));
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
  const deadSurfaceEl = requireElement<HTMLElement>("#dead-surface");
  const deadSurfaceRefs: DeadSurfaceRefs = collectDeadSurfaceRefs(deadSurfaceEl);

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
  // The Focus dead surface's own cap carries a Resume button too (REQ-13/User Flow 3).
  deadSurfaceRefs.resumeBtn.addEventListener("click", () => {
    if (app.state.focusedId !== null) deps.actions.dispatch("resume", app.state.focusedId);
  });

  /** Focus (Focus view) or promote (Tiles) `session` — the shared tail of `nth`/`neediest`. */
  function focusSession(session: Session): void {
    if (app.state.view === "focus") {
      app.focus(session.id);
      app.render();
    } else {
      deps.promoteTile(session.id);
    }
  }

  function nth(n: number): void {
    const session = orderRail(app.store.values(), app.state.railSort)[n - 1];
    if (session) focusSession(session);
  }

  function neediest(): void {
    const session = pickNeediest(app.store.values());
    if (session) focusSession(session);
  }

  // Render phase 6 (UI Specifications > Render phase order): default `focusedId` to the
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

  function renderView(frame: RenderFrame): void {
    const { sessions, now, connected } = frame;
    const hasSessions = sessions.length > 0;
    renderFocusMain({ emptyEl: mainEmptyEl, slotEl: mainSlotEl }, hasSessions);
    const session = sessions.find((s) => s.id === app.state.focusedId) ?? null;
    const surfaceState = session ? getSurfaceState(deps.getSurfaces().state(), session.id) : DEFAULT_SURFACE_STATE;
    renderMainhead(mainheadElements, session, now, connected, surfaceState);

    if (!session) {
      mainSlotEl.hidden = true;
      mainSlotEl.replaceChildren();
      deadSurfaceEl.hidden = true;
      renderSizenote(sizenoteEl, null);
      return;
    }

    // Plan plain-terminal-session, edge case 5: the dead surface only replaces the slot
    // when `claude` is the selected surface.
    if (!session.alive && surfaceState.selected === "claude") {
      mainSlotEl.hidden = true;
      mainSlotEl.replaceChildren();
      deadSurfaceEl.hidden = false;
      deps.actions.ensurePaneFetch(session.id);
      renderDeadSurface(deadSurfaceRefs, session, deps.actions.paneState(session.id), now, connected);
      renderSizenote(sizenoteEl, null);
      return;
    }

    deadSurfaceEl.hidden = true;
    const surface = deps.getSurfaces().get(session.id, surfaceState.selected as SurfaceKind);
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
    // 1) — a non-breaking space keeps the reserved line the same height real geometry
    // text would, so even the very first attach reserves the right amount of space. Must
    // stay a literal NBSP (U+00A0), not an ASCII space: `.sizenote` is flex, and a flex
    // item holding only collapsible whitespace renders at zero height.
    if (sizenoteEl.hidden) {
      sizenoteEl.hidden = false;
      sizenoteEl.textContent = " ";
    }
    surface.refit();
    renderSizenote(sizenoteEl, surface.geometry);
  }

  return {
    deadSurfaceRefs,
    nameEl: mainheadElements.nameEl,
    nth,
    neediest,
    renderView,
  };
}
