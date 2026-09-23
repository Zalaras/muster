// The rail: cards, count, sort select, and drag reorder (plan code-breakup vocabulary:
// "rail"). `deps.surfaces` is a real value — `surfaces` is constructed before `rail`
// (main.ts's init order).
import type { App } from "../app";
import { requestPrefs } from "../api/prefs";
import { putSessionOrder } from "../api/sessions";
import { requireElement, requireElements } from "../dom";
import { installDragReorder } from "../render/dragreorder";
import type { FocusedControl } from "../render/focus";
import { renderSessions } from "../render/sessions";
import { moveCard } from "../sessions/railorder";
import { orderRail } from "../sessions/sort";
import { isRailDensity, type RailDensity, type RailSort } from "../protocol/prefs";
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
  const railDensityButtons = requireElements<HTMLButtonElement>("#rail-density .seg-btn");

  let pendingRailFocus: FocusedControl | null = null;

  function requestRailSort(newSort: RailSort): void {
    requestPrefs({ railSort: newSort });
  }

  function requestRailDensity(newDensity: RailDensity): void {
    requestPrefs({ railDensity: newDensity });
  }

  // No sticky client-side state depends on `railSort` (unlike view/density's `tilesLive`)
  // — the rail/strip just render through `orderRail(sessions, railSort)` every pass.
  // REQ-3/INV-4: `railDensity`/`railActivity` are adopted here too — never optimistically
  // from a click — and `body[data-rail-density]` is written only from this same broadcast
  // (W9), mirroring features/theme.ts's `document.documentElement.dataset` write.
  app.on("prefs", (prefs) => {
    app.state.railSort = prefs.railSort;
    app.state.railDensity = prefs.railDensity;
    app.state.railActivity = prefs.railActivity;
    document.body.dataset["railDensity"] = prefs.railDensity;
  });

  railSortSelect.addEventListener("change", () => {
    requestRailSort(railSortSelect.value === "attention" ? "attention" : "manual");
  });

  for (const button of railDensityButtons) {
    // REQ-15: a mousedown's default action focuses its target, which would blur a
    // focused card or action button the instant a density button is clicked — before
    // this module's own `click` listener even runs. Suppressing that default action (the
    // same technique a toolbar button uses to leave a text field's own focus/selection
    // alone) leaves whatever was focused before the click focused after it; the button
    // stays reachable and activatable by keyboard (Tab, Enter/Space), which never goes
    // through `mousedown`.
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      const density = button.dataset["density"];
      if (isRailDensity(density)) requestRailDensity(density);
    });
  }

  installDragReorder(sessionsEl, {
    itemSelector: "article.card",
    onMove: (draggedId, targetId, focusedBeforeDrag) => {
      const move = moveCard(orderRail(app.store.values(), "manual"), draggedId, targetId);
      if (!move) return;
      pendingRailFocus = focusedBeforeDrag;
      void putSessionOrder(move.ids, move.pinnedCount);
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
      app.state.railActivity,
    );
    pendingRailFocus = null;
    railCountEl.textContent = frame.sessions.length > 0 ? String(frame.sessions.length) : "";
    railSortSelect.value = app.state.railSort;
    // REQ-5/INV-4: the pressed button always reflects `app.state.railDensity` (itself
    // only ever adopted from `prefs` above), never the click that requested it.
    for (const button of railDensityButtons) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset["density"] === app.state.railDensity),
      );
    }
  });
}
