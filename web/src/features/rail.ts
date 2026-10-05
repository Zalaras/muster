// The rail: sections of cards, count, sort select, and drag reorder
// (kb:adr/process-one-name-per-feature). `deps.surfaces` and `deps.groups` are real values —
// both are constructed before `rail` (main.ts's init order). Which sections exist, the filter, the
// selection and what a header does are `features/groups.ts`'s; this controller draws them through
// `render/railsections.ts` and owns the cards' own drag and click.
import type { App, RenderFrame } from "../app";
import { sendPrefsPatch } from "../api/prefs";
import { putSessionOrder, putSessionsGroup } from "../api/sessions";
import { requireElement, requireElements } from "../dom";
import { installDragReorder } from "../render/dragreorder";
import type { FocusedControl } from "../render/focuskeep";
import { createGroupPopover } from "../render/grouppopover";
import {
  createRailSections,
  type NameEditor,
  type RailSectionHandlers,
} from "../render/railsections";
import { renderRailDensityControl } from "../render/sessions";
import { moveCard } from "../sessions/railorder";
import {
  filterHides,
  shownCount,
  UNGROUPED_KEY,
  type RailFilter,
  type Section,
} from "../sessions/sections";
import { isRailDensity, type RailDensity, type RailSort } from "../protocol/prefs";
import type { Session } from "../protocol/session";
import type { SessionAction } from "../sessions/card";
import { railCountText } from "./groupscopy";

// Structural deps, not `import type { ActionsHandle }`/`{ SurfacesHandle }`/`{ GroupsHandle }`
// from `./actions`/`./surfaces`/`./groups`.
export interface RailDeps {
  actions: { dispatch(action: SessionAction, id: number): void };
  surfaces: { focusSelected(id: number): void };
  groups: {
    sections(sessions: readonly Session[], sort?: RailSort): Section[];
    filter(): RailFilter;
    selecting(): boolean;
    selectedIds(): ReadonlySet<number>;
    editing(): NameEditor | null;
    readonly sectionHandlers: RailSectionHandlers;
    toggleSelected(id: number): void;
    renderChrome(frame: RenderFrame): void;
  };
}

export function initRail(app: App, deps: RailDeps): void {
  const sessionsEl = requireElement<HTMLElement>("#sessions");
  const railCountEl = requireElement<HTMLElement>("#rail-count");
  const railSortSelect = requireElement<HTMLSelectElement>("#rail-sort");
  const railDensityButtons = requireElements<HTMLButtonElement>("#rail-density .seg-btn");
  // Looked up once, here, and passed into `render/railsections.ts`'s `createRailSections` — no
  // `render/` module looks up its own template.
  const sessionCardTemplate = requireElement<HTMLTemplateElement>("#session-card-template");
  const popover = createGroupPopover();
  const railSections = createRailSections(
    sessionsEl,
    sessionCardTemplate,
    deps.groups.sectionHandlers,
    popover,
  );

  let pendingRailFocus: FocusedControl | null = null;

  function requestRailSort(newSort: RailSort): void {
    sendPrefsPatch({ railSort: newSort });
  }

  function requestRailDensity(newDensity: RailDensity): void {
    sendPrefsPatch({ railDensity: newDensity });
  }

  // No sticky client-side state depends on `railSort` (unlike view/density's `tilesLive`)
  // — the rail renders through `sections(sessions)` every pass and the strip through
  // `orderRail(sessions, railSort)`.
  // `railDensity`/`railActivity` are adopted here too — never optimistically
  // from a click — and `body[data-rail-density]` is written only from this same broadcast,
  // mirroring features/theme.ts's `document.documentElement.dataset` write.
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
    // A mousedown's default action focuses its target, which would blur a
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

  /** The cards in manual display order with the section each is shown in (an unknown `groupId`
   * reads as Ungrouped), the shape `moveCard` computes a drop from. */
  function manualOrder(): { id: number; pinned: boolean; groupId: number | null }[] {
    return deps.groups
      .sections(app.store.values(), "manual")
      .flatMap((section) =>
        section.cards.map((c) => ({ id: c.id, pinned: c.pinned, groupId: section.id })),
      );
  }

  // A card drags onto another card (its section, its pin side) or onto a section's header or body
  // (the end of that section). Manual mode only: attention-mode and select-mode cards are
  // `draggable="false"` and never start a drag.
  installDragReorder(sessionsEl, {
    itemSelector: "article.card",
    dropZoneSelector: ".ghead, .gbody",
    zoneKeyAttribute: "groupId",
    onMove: (draggedId, targetId, focusedBeforeDrag) => {
      const move = moveCard(manualOrder(), draggedId, targetId);
      if (!move) return;
      pendingRailFocus = focusedBeforeDrag;
      void putSessionOrder(move.ids, move.pinnedCount, move.groupId);
    },
    onDropZone: (draggedId, zoneKey, focusedBeforeDrag) => {
      const target = zoneKey === UNGROUPED_KEY ? null : Number(zoneKey);
      if (Number.isNaN(target)) return;
      const from = manualOrder().find((c) => c.id === draggedId);
      if (!from || from.groupId === target) return;
      pendingRailFocus = focusedBeforeDrag;
      void putSessionsGroup([draggedId], target);
    },
  });

  app.on("status", () => popover.close());

  // Render phase 9 (main.ts's numbered render-phase order).
  app.onRender((frame) => {
    deps.groups.renderChrome(frame);
    const sections = deps.groups.sections(frame.sessions);
    const filter = deps.groups.filter();
    const selecting = deps.groups.selecting();
    railSections.render({
      sections,
      filter,
      editing: deps.groups.editing(),
      selecting,
      selectedIds: deps.groups.selectedIds(),
      empty: frame.sessions.length === 0,
      now: frame.now,
      onToggleCard: deps.groups.toggleSelected,
      cards: {
        onClick: (id, source) => {
          // Select mode: a card click toggles the selection and never changes what Focus shows.
          // Read live: a card's listener is wired once, when it is built, so a `selecting` captured
          // by this pass would be the mode at that moment.
          if (deps.groups.selecting()) {
            deps.groups.toggleSelected(id);
            return;
          }
          app.focus(id);
          app.render();
          // Only a deliberate pointer click on a rail card moves keyboard focus into the
          // terminal (kb:adr/focus-rail-click-focuses-terminal).
          if (source === "pointer") deps.surfaces.focusSelected(id);
        },
        onAction: deps.actions.dispatch,
        connected: frame.connected,
        draggable: app.state.railSort === "manual" && !selecting,
        pendingFocus: pendingRailFocus,
        currentId: app.state.focusedId,
        railActivity: app.state.railActivity,
      },
    });
    pendingRailFocus = null;
    railCountEl.textContent = railCountText(
      shownCount(sections, filter),
      frame.sessions.length,
      filterHides(sections, filter),
    );
    railSortSelect.value = app.state.railSort;
    // The pressed button always reflects `app.state.railDensity` (itself
    // only ever adopted from `prefs` above), never the click that requested it.
    renderRailDensityControl(railDensityButtons, app.state.railDensity);
  });
}
