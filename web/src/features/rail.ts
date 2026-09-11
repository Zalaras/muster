// The rail: cards, count, sort select, and drag reorder (plan code-breakup vocabulary:
// "rail"). `deps.surfaces` is a real value — `surfaces` is constructed before `rail`
// (main.ts's init order).
import type { App } from "../app";
import { putPrefs, putSessionOrder } from "../api";
import { requireElement } from "../dom";
import { installDragReorder } from "../render/dragreorder";
import type { FocusedControl } from "../render/focus";
import { renderSessions } from "../render/sessions";
import { moveCard } from "../sessions/railorder";
import { orderRail } from "../sessions/sort";
import type { RailSort } from "../protocol";
import type { SessionAction } from "../render/sessions";

// W6/INV-4: structural deps, not `import type { ActionsHandle }`/`{ SurfacesHandle }`
// from `./actions`/`./surfaces`.
export interface RailDeps {
  actions: { dispatch(action: SessionAction, id: number): void };
  surfaces: { focusSelected(id: number): void };
}

export function initRail(app: App, deps: RailDeps): void {
  const sessionsEl = requireElement<HTMLElement>("#sessions");
  const railCountEl = requireElement<HTMLElement>("#rail-count");
  const railSortSelect = requireElement<HTMLSelectElement>("#rail-sort");

  let pendingRailFocus: FocusedControl | null = null;

  function requestRailSort(newSort: RailSort): void {
    void putPrefs({ railSort: newSort }).then((result) => {
      if (!result.ok) console.error(`PUT /api/prefs failed: ${result.error.code} ${result.error.message}`);
    });
  }

  // No sticky client-side state depends on `railSort` (unlike view/density's `tilesLive`)
  // — the rail/strip just render through `orderRail(sessions, railSort)` every pass.
  app.on("prefs", (prefs) => {
    app.state.railSort = prefs.railSort;
  });

  railSortSelect.addEventListener("change", () => {
    requestRailSort(railSortSelect.value === "attention" ? "attention" : "manual");
  });

  installDragReorder(sessionsEl, {
    itemSelector: "article.card",
    onMove: (draggedId, targetId, focusedBeforeDrag) => {
      const move = moveCard(orderRail(app.store.values(), "manual"), draggedId, targetId);
      if (!move) return;
      pendingRailFocus = focusedBeforeDrag;
      void putSessionOrder(move.ids, move.pinnedCount).then((result) => {
        if (!result.ok) console.error(`PUT /api/sessions/order failed: ${result.error.code} ${result.error.message}`);
      });
    },
  });

  // Render phase 8 (UI Specifications > Render phase order).
  app.onRender((frame) => {
    renderSessions(
      sessionsEl,
      orderRail(frame.sessions, app.state.railSort),
      frame.now,
      (id, source) => {
        app.focus(id);
        app.render();
        // plan terminal-focus: only a deliberate pointer click on a rail card moves
        // keyboard focus into the terminal.
        if (source === "pointer") deps.surfaces.focusSelected(id);
      },
      deps.actions.dispatch,
      frame.connected,
      app.state.railSort === "manual",
      pendingRailFocus,
      app.state.focusedId,
    );
    pendingRailFocus = null;
    railCountEl.textContent = frame.sessions.length > 0 ? String(frame.sessions.length) : "";
    railSortSelect.value = app.state.railSort;
  });
}
