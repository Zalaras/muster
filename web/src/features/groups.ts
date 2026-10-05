// The rail's groups: the per-window state and every action on a group or a selection
// (kb:adr/process-one-name-per-feature: "groups"). Adopts the daemon's whole-list `groups` message
// into `app.state` — never optimistically from a click (kb:adr/rail-groups-daemon-rows-whole-list-broadcast)
// — and owns the filter (kb:adr/rail-filter-and-selection-are-window-state; select mode and its
// bar are the sub-controller `features/groupsselect.ts`),
// the name editor (a rename, or the pending new group — kb:adr/rail-new-group-is-named-before-it-exists),
// the rail, header and Move to menus (the delete-group and new-group dialogs are the
// sub-controller `features/groupsdialogs.ts`), and the drag of a section header (kb:adr/rail-section-headers-drag-in-both-sort-modes).
//
// It draws no section itself: `features/rail.ts` renders the sections through
// `render/railsections.ts`, reading this handle's state and handing it `sectionHandlers`, and calls
// `renderChrome` first in the rail's render phase so the filter row, the Select toggle and the
// selection bar are current for the pass that draws the sections.
//
// `deps` is typed structurally, no controller module imports a sibling.
import {
  createGroup,
  deleteGroup,
  putAllCollapsed,
  putGroupsOrder,
  updateGroup,
} from "../api/groups";
import type { ApiResult } from "../api/http";
import { putSessionsGroup } from "../api/sessions";
import type { App, RenderFrame } from "../app";
import { requireElement, requireElements } from "../dom";
import { installDragReorder } from "../render/dragreorder";
import { createMenu, type MenuEntry } from "../render/menu";
import { PENDING_KEY, type NameEditor, type RailSectionHandlers } from "../render/railsections";
import type { SelectBarElements } from "../render/selectbar";
import type { RailSort } from "../protocol/prefs";
import type { Session } from "../protocol/session";
import {
  buildSections,
  commonGroupId,
  filterForFocus,
  groupsInRailOrder,
  moveSection,
  sectionOrder,
  shownCards,
  type RailFilter,
  type Section,
} from "../sessions/sections";
import { batchPlan } from "./batchplan";
import { MENU_LABELS, NEW_GROUP_CHORD, selectAllLabel } from "./groupscopy";
import { type GroupsDialogsElements, initGroupsDialogs } from "./groupsdialogs";
import { initGroupsSelect } from "./groupsselect";

export interface GroupsDeps {
  actions: {
    dispatchMany(
      action: "end" | "remove",
      ids: readonly number[],
      origin: "selection" | "group",
    ): void;
    /** The one writer of `#action-error` (features/actions.ts). */
    showError(message: string | null): void;
  };
}

export interface GroupsHandle {
  /** The rail's sections as the daemon's groups and the sort mode shape them (the current sort
   * unless `sort` says otherwise — a drop is computed against the manual order). */
  sections(sessions: readonly Session[], sort?: RailSort): Section[];
  filter(): RailFilter;
  selecting(): boolean;
  selectedIds(): ReadonlySet<number>;
  /** The name field open in the rail, if any. */
  editing(): NameEditor | null;
  readonly sectionHandlers: RailSectionHandlers;
  /** A card click (or its checkbox) while selecting toggles instead of focusing. */
  toggleSelected(id: number): void;
  /** The rail's New group…: a pending section with a focused name field. Also ⌥⌘G. */
  newGroup(): void;
  /** The Focus header's control: the Move to menu for `session`, `No group` in place of Ungrouped. */
  openMoveMenu(opener: HTMLElement, session: Session): void;
  /** `sessionId` is about to be focused: the filter resets to All if it hides that session's
   * section, and `expand` unfolds the section if it is collapsed. The caller renders. */
  reveal(sessionId: number, expand: boolean): void;
  /** Phase 9's first step: prune the selection, reset a filter that no longer applies, and write
   * the filter row, the Select toggle, the rail ⋯ button and the selection bar. */
  renderChrome(frame: RenderFrame): void;
}

/** The one name field's full state: `NameEditor` for the renderer, plus what each commit needs. */
interface Editing extends NameEditor {
  kind: "rename" | "new";
  groupId: number | null;
  /** The name a pending group was submitted under, to spot its `groups` message. */
  submitted: string | null;
}

export function initGroups(app: App, deps: GroupsDeps): GroupsHandle {
  const sessionsEl = requireElement<HTMLElement>("#sessions");
  const railActionsBtn = requireElement<HTMLButtonElement>("#rail-actions-button");
  const selectBtn = requireElement<HTMLButtonElement>("#rail-select-button");
  const filterEl = requireElement<HTMLElement>("#rail-filter");
  const filterButtons = requireElements<HTMLButtonElement>("#rail-filter .seg-btn");
  const bar: SelectBarElements = {
    root: requireElement<HTMLElement>("#select-bar"),
    count: requireElement<HTMLElement>("#select-bar .cnt"),
    move: requireElement<HTMLButtonElement>('#select-bar [data-bar="move"]'),
    ungroup: requireElement<HTMLButtonElement>('#select-bar [data-bar="ungroup"]'),
    stop: requireElement<HTMLButtonElement>('#select-bar [data-bar="stop"]'),
    remove: requireElement<HTMLButtonElement>('#select-bar [data-bar="remove"]'),
    all: requireElement<HTMLButtonElement>('#select-bar [data-bar="all"]'),
    done: requireElement<HTMLButtonElement>('#select-bar [data-bar="done"]'),
  };

  const dialogElements: GroupsDialogsElements = {
    newGroup: {
      dialog: requireElement<HTMLDialogElement>("#new-group-dialog"),
      title: requireElement<HTMLElement>("#new-group-title"),
      form: requireElement<HTMLFormElement>("#new-group-form"),
      input: requireElement<HTMLInputElement>("#new-group-input"),
      error: requireElement<HTMLElement>("#new-group-error"),
      createBtn: requireElement<HTMLButtonElement>("#new-group-create"),
      cancelBtn: requireElement<HTMLButtonElement>("#new-group-cancel"),
    },
    deleteGroup: {
      dialog: requireElement<HTMLDialogElement>("#delete-group-dialog"),
      title: requireElement<HTMLElement>("#delete-group-title"),
      body: requireElement<HTMLElement>("#delete-group-body"),
      choices: requireElement<HTMLElement>("#delete-group-choices"),
      radios: {
        ungroup: requireElement<HTMLInputElement>("#delete-choice-ungroup"),
        move: requireElement<HTMLInputElement>("#delete-choice-move"),
        remove: requireElement<HTMLInputElement>("#delete-choice-remove"),
      },
      labels: {
        ungroup: requireElement<HTMLElement>("#delete-label-ungroup"),
        move: requireElement<HTMLElement>("#delete-label-move"),
        remove: requireElement<HTMLElement>("#delete-label-remove"),
      },
      hints: {
        ungroup: requireElement<HTMLElement>("#delete-hint-ungroup"),
        move: requireElement<HTMLElement>("#delete-hint-move"),
        remove: requireElement<HTMLElement>("#delete-hint-remove"),
      },
      moveRow: requireElement<HTMLElement>("#delete-choice-move-row"),
      target: requireElement<HTMLSelectElement>("#delete-group-target"),
      confirmBtn: requireElement<HTMLButtonElement>("#delete-group-confirm"),
      cancelBtn: requireElement<HTMLButtonElement>("#delete-group-cancel"),
    },
  };

  const menu = createMenu();
  // Per-window state: the filter resets to All on reload. Written only by this module's handlers
  // and `renderChrome`; select mode's own state lives in `groupsselect.ts`.
  let filter: RailFilter = "all";
  let editing: Editing | null = null;

  const connected = (): boolean => app.state.connection === "connected";
  const sections = (sessions: readonly Session[], sort: RailSort = app.state.railSort): Section[] =>
    buildSections(sessions, app.state.groups, app.state.ungrouped, sort);
  const sectionsNow = (): Section[] => sections(app.store.values());

  /** A daemon call's one outcome path: a refusal shows in the action-error line, a success clears
   * it (the same rule `features/actions.ts` follows). */
  function settle(result: ApiResult<unknown>): boolean {
    deps.actions.showError(result.ok ? null : result.error.message);
    return result.ok;
  }

  // ── adopt the daemon's groups ──────────────────────────────────────────────────────────────
  app.on("groups", (groups, ungrouped) => {
    const known = new Set(app.state.groups.map((g) => g.id));
    app.state.groups = groups;
    app.state.ungrouped = ungrouped;
    // A pending group whose message has arrived is the real section now: drop the placeholder
    // rather than draw both until the HTTP answer lands.
    const pending = editing;
    if (pending?.kind === "new" && pending.submitted !== null) {
      if (groups.some((g) => !known.has(g.id) && g.name === pending.submitted)) editing = null;
    }
  });

  // Daemon down (or any status change): an open menu closes (the dialogs close themselves, in
  // `groupsdialogs.ts`), so a stale choice cannot be actioned against a dropped connection.
  app.on("status", () => menu.close());
  const dialogs = initGroupsDialogs(app, dialogElements, {
    settle,
    showError: deps.actions.showError,
  });

  // ── select mode ────────────────────────────────────────────────────────────────────────────
  const select = initGroupsSelect(
    app,
    { toggle: selectBtn, bar },
    {
      dispatchMany: deps.actions.dispatchMany,
      settle,
      openMoveMenu: (opener, sessions) => openMoveMenuFor(opener, sessions, MENU_LABELS.ungrouped),
      shownIds: () => shownCards(sectionsNow(), filter).map((c) => c.id),
    },
  );

  // ── the filter ─────────────────────────────────────────────────────────────────────────────
  for (const button of filterButtons) {
    button.addEventListener("click", () => {
      const value = button.dataset["filter"];
      if (value === "all" || value === "groups" || value === "ungrouped") filter = value;
      app.render();
    });
  }

  // ── the name field: a rename, or the pending new group ─────────────────────────────────────
  function closeEditing(): void {
    editing = null;
    app.render();
  }

  /** A daemon answer closes the field it committed, never one opened since: the developer can
   * start another name while this one's request is in flight, and closing that one mid-typing
   * would lose what was typed. */
  function closeEditingIf(committed: Editing): void {
    if (editing === committed) closeEditing();
    else app.render();
  }

  function startRename(section: Section): void {
    if (!connected() || section.id === null) return;
    editing = {
      kind: "rename",
      key: section.key,
      groupId: section.id,
      initial: section.name,
      readOnly: false,
      submitted: null,
    };
    app.render();
  }

  function newGroup(): void {
    if (!connected()) return;
    editing = {
      kind: "new",
      key: PENDING_KEY,
      groupId: null,
      initial: "",
      readOnly: false,
      submitted: null,
    };
    app.render();
  }

  function commitRename(groupId: number, raw: string): void {
    const current = sectionsNow().find((s) => s.id === groupId);
    const name = raw.trim();
    const committed = editing;
    if (!committed || !current || name === "" || name === current.name) {
      closeEditing();
      return;
    }
    committed.readOnly = true;
    app.render();
    void updateGroup(groupId, { name }).then((result) => {
      settle(result);
      closeEditingIf(committed);
    });
  }

  function commitNew(raw: string): void {
    const name = raw.trim();
    const pending = editing;
    if (!pending || name === "") {
      closeEditing();
      return;
    }
    pending.readOnly = true;
    pending.submitted = name;
    app.render();
    void createGroup(name).then((result) => {
      if (settle(result)) {
        closeEditingIf(pending);
        return;
      }
      pending.readOnly = false;
      pending.submitted = null;
      app.render();
    });
  }

  function commitEditing(raw: string): void {
    const current = editing;
    if (!current) return;
    if (current.kind === "new") commitNew(raw);
    else if (current.groupId !== null) commitRename(current.groupId, raw);
  }

  // ── menus and what they do ─────────────────────────────────────────────────────────────────
  function toggleCollapsed(section: Section): void {
    if (!connected()) return;
    void updateGroup(section.id ?? 0, { collapsed: !section.collapsed }).then(settle);
  }

  function ungroupGroup(section: Section): void {
    if (section.id === null) return;
    void deleteGroup(section.id, { sessions: "ungroup" }).then(settle);
  }

  function headerMenuEntries(section: Section): MenuEntry[] {
    const ids = section.cards.map((c) => c.id);
    const stopPlan = batchPlan("end", ids, section.cards);
    const isGroup = section.id !== null;
    const entries: MenuEntry[] = [];
    if (isGroup) {
      entries.push({
        kind: "item",
        label: MENU_LABELS.rename,
        onSelect: () => startRename(section),
      });
    }
    entries.push({
      kind: "item",
      label: section.collapsed ? MENU_LABELS.expand : MENU_LABELS.collapse,
      onSelect: () => toggleCollapsed(section),
    });
    entries.push(
      { kind: "separator" },
      {
        kind: "item",
        label: selectAllLabel(ids.length),
        disabled: ids.length === 0,
        onSelect: () => select.selectMany(ids, true),
      },
      { kind: "item", label: MENU_LABELS.newGroup, onSelect: newGroup },
      { kind: "separator" },
      {
        kind: "item",
        label: MENU_LABELS.stopAll,
        disabled: stopPlan === null,
        onSelect: () => deps.actions.dispatchMany("end", stopPlan?.ids ?? [], "group"),
      },
    );
    if (isGroup) {
      entries.push(
        { kind: "item", label: MENU_LABELS.ungroup, onSelect: () => ungroupGroup(section) },
        {
          kind: "item",
          label: MENU_LABELS.deleteGroup,
          danger: true,
          onSelect: () => dialogs.openDelete(section),
        },
      );
    }
    return entries;
  }

  railActionsBtn.addEventListener("click", () => {
    const none = app.state.groups.length === 0;
    menu.open(railActionsBtn, [
      {
        kind: "item",
        label: MENU_LABELS.newGroup,
        hint: NEW_GROUP_CHORD,
        onSelect: newGroup,
      },
      { kind: "separator" },
      {
        kind: "item",
        label: MENU_LABELS.collapseAll,
        disabled: none,
        onSelect: () => void putAllCollapsed(true).then(settle),
      },
      {
        kind: "item",
        label: MENU_LABELS.expandAll,
        disabled: none,
        onSelect: () => void putAllCollapsed(false).then(settle),
      },
    ]);
  });

  /** Move to: every group (ticked when all of `sessions` share it), New group…, and the
   * no-group entry under the caller's own name for it. */
  function openMoveMenuFor(
    opener: HTMLElement,
    sessions: readonly Session[],
    noGroupLabel: string,
  ): void {
    const ids = sessions.map((s) => s.id);
    const common = commonGroupId(sessions, app.state.groups);
    const move = (groupId: number | null) => (): void => {
      void putSessionsGroup(ids, groupId).then(settle);
    };
    menu.open(opener, [
      { kind: "header", label: MENU_LABELS.moveTo },
      ...groupsInRailOrder(app.state.groups).map(
        (g): MenuEntry => ({
          kind: "item",
          label: g.name,
          current: common === g.id,
          onSelect: move(g.id),
        }),
      ),
      {
        kind: "item",
        label: MENU_LABELS.newGroup,
        current: false,
        onSelect: () => dialogs.promptNewGroupFrom(ids),
      },
      { kind: "separator" },
      { kind: "item", label: noGroupLabel, current: common === null, onSelect: move(null) },
    ]);
  }

  // ── section headers: what the rail's rows call back into ───────────────────────────────────
  const sectionHandlers: RailSectionHandlers = {
    onToggleCollapsed: toggleCollapsed,
    onOpenMenu: (section, opener) => menu.open(opener, headerMenuEntries(section)),
    onStartRename: startRename,
    onToggleSection: (section, checked) =>
      select.selectMany(
        section.cards.map((c) => c.id),
        checked,
      ),
    onNameEnter: (key, value) => {
      if (editing?.key === key && !editing.readOnly) commitEditing(value);
    },
    onNameEscape: (key) => {
      if (editing?.key === key && !editing.readOnly) closeEditing();
    },
    onNameBlur: (key, value) => {
      if (editing?.key !== key || editing.readOnly) return;
      // Leaving a rename commits it; leaving the pending new group discards it.
      if (editing.kind === "new") closeEditing();
      else commitEditing(value);
    },
  };

  // Sections reorder by dragging a header, in both sort modes. The Ungrouped section is `0` on the
  // wire, as it is in `PUT /api/groups/order`.
  installDragReorder(sessionsEl, {
    itemSelector: ".ghead",
    idAttribute: "sectionId",
    onMove: (draggedId, targetId) => {
      const order = moveSection(sectionOrder(sectionsNow()), draggedId, targetId);
      if (order) void putGroupsOrder(order).then(settle);
    },
  });

  return {
    sections,
    filter: () => filter,
    selecting: select.selecting,
    selectedIds: select.selectedIds,
    editing: () => editing,
    sectionHandlers,
    toggleSelected: select.toggle,
    newGroup,
    openMoveMenu: (opener, session) => openMoveMenuFor(opener, [session], MENU_LABELS.noGroup),
    reveal(sessionId, expand) {
      const all = sectionsNow();
      filter = filterForFocus(all, filter, sessionId);
      if (!expand) return;
      const home = all.find((s) => s.cards.some((c) => c.id === sessionId));
      if (home?.headed && home.collapsed) {
        void updateGroup(home.id ?? 0, { collapsed: false }).then(settle);
      }
    },
    renderChrome(frame) {
      select.render(frame);
      const hasGroups = app.state.groups.length > 0;
      // The filter row exists only while a group does; with none left, a held filter has nothing
      // to filter and would hide cards behind a control that is gone.
      if (!hasGroups) filter = "all";
      filterEl.hidden = !hasGroups;
      for (const button of filterButtons) {
        button.setAttribute("aria-pressed", String(button.dataset["filter"] === filter));
      }
      railActionsBtn.disabled = !frame.connected;
    },
  };
}
