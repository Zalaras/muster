// The rail's select mode (kb:adr/rail-filter-and-selection-are-window-state): the Select toggle, the
// selection set, the bar at the rail's foot and what its buttons do. Split out of features/groups.ts
// the way launchgroup.ts is split out of launch.ts. It owns the mode's two pieces of per-window state
// — `selecting` and the selected ids, which never outlive the mode — and writes the toggle and the
// bar; `features/groups.ts` decides what All selects (it knows the filter and the sections), what
// Move to opens, and how a daemon refusal shows.
//
// With the daemon down every selection control is disabled and `selectMany` changes nothing, so a
// selection cannot be edited that nothing could act on; Escape still leaves the mode.
import { putSessionsGroup } from "../api/sessions";
import type { ApiResult } from "../api/http";
import type { App, RenderFrame } from "../app";
import { renderSelectBar, type SelectBarElements } from "../render/selectbar";
import type { Session } from "../protocol/session";
import { selectionState } from "../sessions/sections";
import { selectionCount } from "./groupscopy";

export interface GroupsSelectElements {
  /** The rail head's Select toggle. */
  toggle: HTMLButtonElement;
  bar: SelectBarElements;
}

export interface GroupsSelectDeps {
  dispatchMany(
    action: "end" | "remove",
    ids: readonly number[],
    origin: "selection" | "group",
  ): void;
  /** A daemon call's one outcome path (shows a refusal, clears the line on success). */
  settle(result: ApiResult<unknown>): boolean;
  /** The Move to menu for the selected sessions, anchored on the bar's Move to button. */
  openMoveMenu(opener: HTMLElement, sessions: readonly Session[]): void;
  /** What the bar's All selects: every card the filter shows. */
  shownIds(): number[];
}

export interface GroupsSelectHandle {
  selecting(): boolean;
  selectedIds(): ReadonlySet<number>;
  /** Selects or deselects `ids`; selecting any turns the mode on. A no-op while the daemon is down. */
  selectMany(ids: readonly number[], on: boolean): void;
  /** A card click (or its checkbox) while selecting toggles instead of focusing. */
  toggle(id: number): void;
  /** Prunes the selection to sessions that still exist, ends the mode when none remain, and
   * writes the Select toggle and the bar. */
  render(frame: RenderFrame): void;
}

export function initGroupsSelect(
  app: App,
  elements: GroupsSelectElements,
  deps: GroupsSelectDeps,
): GroupsSelectHandle {
  const { toggle: toggleBtn, bar } = elements;
  let selecting = false;
  const selected = new Set<number>();

  const selectedSessions = (): Session[] => app.store.values().filter((s) => selected.has(s.id));
  const selectedIdList = (): number[] => selectedSessions().map((s) => s.id);

  function reset(): void {
    selecting = false;
    selected.clear();
  }

  function leave(): void {
    reset();
    app.render();
  }

  function selectMany(ids: readonly number[], on: boolean): void {
    if (app.state.connection !== "connected") return;
    for (const id of ids) {
      if (on) selected.add(id);
      else selected.delete(id);
    }
    if (on && ids.length > 0) selecting = true;
    app.render();
  }

  toggleBtn.addEventListener("click", () => {
    if (selecting) {
      leave();
      return;
    }
    selecting = true;
    app.render();
  });
  bar.done.addEventListener("click", leave);
  bar.all.addEventListener("click", () => selectMany(deps.shownIds(), true));
  bar.ungroup.addEventListener("click", () => {
    const ids = selectedSessions()
      .filter((s) => s.groupId !== null)
      .map((s) => s.id);
    void putSessionsGroup(ids, null).then(deps.settle);
  });
  bar.stop.addEventListener("click", () => deps.dispatchMany("end", selectedIdList(), "selection"));
  bar.remove.addEventListener("click", () =>
    deps.dispatchMany("remove", selectedIdList(), "selection"),
  );
  bar.move.addEventListener("click", () => deps.openMoveMenu(bar.move, selectedSessions()));

  // Escape leaves select mode — but never while a dialog is open (Escape is closing it), and a
  // menu or a name field takes the key first and stops it.
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || !selecting) return;
    if (document.querySelector("dialog[open]")) return;
    leave();
  });
  // Tiles has no select mode: leaving Focus clears it.
  app.on("prefs", (prefs) => {
    if (prefs.view === "tiles") reset();
  });

  return {
    selecting: () => selecting,
    selectedIds: () => selected,
    selectMany,
    toggle: (id) => selectMany([id], !selected.has(id)),
    render(frame) {
      const present = new Set(frame.sessions.map((s) => s.id));
      for (const id of selected) if (!present.has(id)) selected.delete(id);
      // With no session left there is nothing to select: a bulk Remove of everything ends the mode.
      if (present.size === 0) selecting = false;
      toggleBtn.setAttribute("aria-pressed", String(selecting));
      toggleBtn.disabled = !frame.connected;
      const state = selectionState(selectedSessions(), app.state.groups);
      renderSelectBar(bar, {
        visible: selecting,
        countText: selectionCount(state.count),
        connected: frame.connected,
        hasSelection: state.count > 0,
        anyGrouped: state.anyGrouped,
        anyAlive: state.anyAlive,
      });
    },
  };
}
