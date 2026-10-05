// The rail's sections: pure derivation from the sessions, the groups and the Ungrouped layout the
// daemon broadcast (kb:adr/rail-groups-daemon-rows-whole-list-broadcast). No DOM, no socket —
// render/railsections.ts draws the result and features/groups.ts / features/rail.ts /
// features/focus.ts call in. Sections keep their place in both sort modes and only the cards
// inside them sort (`orderRail`, per section), so a state change in a collapsed group moves
// nothing (kb:adr/rail-pin-invariant-scoped-per-section). The Tiles grid and strip never read this:
// they keep ordering every session flat.
import type { Group, UngroupedLayout } from "../protocol/groups";
import type { RailSort } from "../protocol/prefs";
import type { Session, SessionState } from "../protocol/session";
import { displayTitle, stateBadgeText } from "./card";
import { insertAtDragTarget } from "./reorder";
import { orderRail } from "./sort";

/** The rail-head filter. Per-window client state, never a pref (kb:adr/rail-filter-and-selection-are-window-state). */
export type RailFilter = "all" | "groups" | "ungrouped";

/** `data-group-id` of the Ungrouped section's header and body, and its reconciliation key. */
export const UNGROUPED_KEY = "ungrouped";

export const UNGROUPED_NAME = "Ungrouped";

/** What a session with no group reads as in a group control. */
export const NO_GROUP_LABEL = "no group";

/** The choice that leaves a session with no group, as the Move to menu and the launch Group
 * select word it. */
export const NO_GROUP_CHOICE = "No group";

/** The choice that names a new group, as every menu and the launch Group select word it. */
export const NEW_GROUP_CHOICE = "New group…";

export interface Section {
  /** The group id; `null` is the Ungrouped section. */
  id: number | null;
  /** `String(id)` or `UNGROUPED_KEY`. */
  key: string;
  name: string;
  /** The section's place among every section, Ungrouped included. */
  pos: number;
  collapsed: boolean;
  /** False only for the lone Ungrouped section while no group exists: the rail then reads as it
   * did before groups, with no header, no filter and nothing collapsible. */
  headed: boolean;
  /** Ordered by `orderRail` for the sort mode: a pinned block, then the rest. */
  cards: Session[];
}

function byPlace(a: Section, b: Section): number {
  const byPos = a.pos - b.pos;
  if (byPos !== 0) return byPos;
  // Equal places cannot arise from a current daemon (pos is unique); a stable total order anyway,
  // Ungrouped after the groups it ties with.
  if ((a.id === null) !== (b.id === null)) return a.id === null ? 1 : -1;
  return (a.id ?? 0) - (b.id ?? 0);
}

/** The groups in rail order (`pos`), Ungrouped left out: the order the Move to menu, the delete
 * dialog's targets and the launch Group row list them. */
export function groupsInRailOrder(groups: readonly Group[]): Group[] {
  return [...groups].sort((a, b) => a.pos - b.pos);
}

/** Every session in a section, in the display order the sort mode gives: sections by `pos`, cards
 * inside a section by `orderRail`. A session whose `groupId` names no known group renders in
 * Ungrouped until the next `groups` message (a lost or out-of-order frame, never an error). */
export function buildSections(
  sessions: readonly Session[],
  groups: readonly Group[],
  ungrouped: UngroupedLayout,
  sort: RailSort,
): Section[] {
  if (groups.length === 0) {
    return [
      {
        id: null,
        key: UNGROUPED_KEY,
        name: UNGROUPED_NAME,
        pos: 0,
        collapsed: false,
        headed: false,
        cards: orderRail(sessions, sort),
      },
    ];
  }
  const known = new Set(groups.map((g) => g.id));
  const membersOf = (id: number | null): Session[] =>
    sessions.filter((s) => (s.groupId !== null && known.has(s.groupId) ? s.groupId : null) === id);
  const sections: Section[] = groups.map((g) => ({
    id: g.id,
    key: String(g.id),
    name: g.name,
    pos: g.pos,
    collapsed: g.collapsed,
    headed: true,
    cards: orderRail(membersOf(g.id), sort),
  }));
  sections.push({
    id: null,
    key: UNGROUPED_KEY,
    name: UNGROUPED_NAME,
    pos: ungrouped.pos,
    collapsed: ungrouped.collapsed,
    headed: true,
    cards: orderRail(membersOf(null), sort),
  });
  return sections.sort(byPlace);
}

/** Whether the filter keeps a section. A headless (flat) rail has nothing to filter. */
export function sectionShown(section: Section, filter: RailFilter): boolean {
  if (!section.headed || filter === "all") return true;
  return filter === "groups" ? section.id !== null : section.id === null;
}

/** The cards the rail displays, in order: those of every kept section that is not collapsed.
 * ⌥⌘1-9 index this, and the default focus is its first entry. */
export function visibleCards(sections: readonly Section[], filter: RailFilter): Session[] {
  return sections
    .filter((s) => sectionShown(s, filter) && !(s.headed && s.collapsed))
    .flatMap((s) => s.cards);
}

/** Every card the filter keeps, in order (collapsed sections included — folding is not
 * filtering). The selection bar's All selects these. */
export function shownCards(sections: readonly Section[], filter: RailFilter): Session[] {
  return sections.filter((s) => sectionShown(s, filter)).flatMap((s) => s.cards);
}

/** How many cards the filter keeps. */
export function shownCount(sections: readonly Section[], filter: RailFilter): number {
  return shownCards(sections, filter).length;
}

/** Whether the filter hides any card — `#rail-count` then reads `n of m`. */
export function filterHides(sections: readonly Section[], filter: RailFilter): boolean {
  return shownCount(sections, filter) < sections.reduce((n, s) => n + s.cards.length, 0);
}

/** The filter to hold once `sessionId` is about to be focused: `all` when its section is filtered
 * out, so the focused session is never in a hidden section (a launch, ⌥⌘0 and the default-focus
 * pick all land through this). */
export function filterForFocus(
  sections: readonly Section[],
  filter: RailFilter,
  sessionId: number,
): RailFilter {
  const home = sections.find((s) => s.cards.some((c) => c.id === sessionId));
  if (!home || sectionShown(home, filter)) return filter;
  return "all";
}

/** The default focus: the first displayed card, else — every kept section empty or collapsed —
 * the first card of the whole rail. `null` only with no sessions. The caller resets the filter
 * through `filterForFocus` when that card's section is filtered out. */
export function defaultFocusId(sections: readonly Section[], filter: RailFilter): number | null {
  const shown = visibleCards(sections, filter)[0];
  return (shown ?? sections.flatMap((s) => s.cards)[0])?.id ?? null;
}

/** The section order a header drag sends to `PUT /api/groups/order`: every group id and `0` for
 * Ungrouped, exactly once, as the sections now stand. */
export function sectionOrder(sections: readonly Section[]): number[] {
  return sections.map((s) => s.id ?? 0);
}

/** Drops section `draggedId` onto section `targetId` with the same insert-and-shift rule as a
 * card drag, or `null` for a self-drop or an id the order does not hold. Ids are the wire's: a
 * group id, `0` for Ungrouped. */
export function moveSection(
  order: readonly number[],
  draggedId: number,
  targetId: number,
): number[] | null {
  // Boxed: `insertAtDragTarget` finds the dragged item by truthiness, and Ungrouped's id is 0.
  const moved = insertAtDragTarget(
    order.map((id) => ({ id })),
    (item) => item.id,
    draggedId,
    targetId,
  );
  return moved ? moved.map((item) => item.id) : null;
}

/** The group a session shows in, or `null` for Ungrouped — an unknown `groupId` reads as none. */
export function groupOf(session: Session, groups: readonly Group[]): Group | null {
  if (session.groupId === null) return null;
  return groups.find((g) => g.id === session.groupId) ?? null;
}

/** The label a group control shows for `session`: its group's name, else `no group`. */
export function groupLabel(session: Session, groups: readonly Group[]): string {
  return groupOf(session, groups)?.name ?? NO_GROUP_LABEL;
}

/** The group every one of `sessions` is in (`null` for Ungrouped), or `undefined` when they
 * differ or none is given — the Move to menu ticks that group. */
export function commonGroupId(
  sessions: readonly Session[],
  groups: readonly Group[],
): number | null | undefined {
  const first = sessions[0];
  if (!first) return undefined;
  const id = groupOf(first, groups)?.id ?? null;
  return sessions.every((s) => (groupOf(s, groups)?.id ?? null) === id) ? id : undefined;
}

/** A header summary's state: a session state, or `ended` for a card whose pane is gone. */
export type SummaryState = SessionState | "ended";

/** Attention order, idle once and ended last (kb:adr/rail-summary-dot-order-is-attention-order-idle-once). */
export const SUMMARY_ORDER: readonly SummaryState[] = [
  "needs_input",
  "failed",
  "started",
  "planning",
  "working",
  "idle",
  "ended",
];

export function summaryStateOf(session: Session): SummaryState {
  return session.alive ? session.state : "ended";
}

/** The state's word, shared with the badge: `needs input`, `working`, `ended`. */
export function summaryStateWord(state: SummaryState): string {
  return state === "ended" ? "ended" : stateBadgeText(state);
}

export interface SummaryRow {
  state: SummaryState;
  cards: Session[];
}

/** The cards of a section by summary state, in `SUMMARY_ORDER`, absent states left out. */
export function summaryRows(cards: readonly Session[]): SummaryRow[] {
  return SUMMARY_ORDER.map((state) => ({
    state,
    cards: cards.filter((c) => summaryStateOf(c) === state),
  })).filter((row) => row.cards.length > 0);
}

export interface Summary {
  count: number;
  states: { state: SummaryState; n: number }[];
}

/** The header summary: the member count and one entry per state present. An empty section is a
 * count of 0 and no states (never a gauge — design-system §6). */
export function summarize(cards: readonly Session[]): Summary {
  return {
    count: cards.length,
    states: summaryRows(cards).map((row) => ({ state: row.state, n: row.cards.length })),
  };
}

/** The caret's accessible name: what pressing it does to the section. */
export function caretLabel(name: string, collapsed: boolean): string {
  return `${collapsed ? "Expand" : "Collapse"} ${name}`;
}

export function headerCheckboxLabel(name: string): string {
  return `Select all in ${name}`;
}

/** The line a header-less-of-cards section shows where its cards would be. */
export function emptySectionLine(section: Pick<Section, "id">): string {
  return section.id === null ? "no ungrouped sessions" : "empty — drop sessions here";
}

/** `1 session`, `3 sessions` — the count phrase the popover, the bulk dialogs and the delete-group
 * dialog all use. */
export function sessionsPhrase(n: number): string {
  return `${n} ${n === 1 ? "session" : "sessions"}`;
}

/** A summary item's hover title: `2 needs input`, `1 ended`. */
export function summaryTitle(state: SummaryState, n: number): string {
  return `${n} ${summaryStateWord(state)}`;
}

export interface PopoverRowModel {
  state: SummaryState;
  word: string;
  n: number;
  titles: string[];
}

/** What a header's hover popover lists: the group's name and `n sessions`, then one row per
 * state present with that state's session titles. An empty group has no rows (the popover says
 * `empty`). */
export interface PopoverModel {
  name: string;
  sessions: string;
  rows: PopoverRowModel[];
}

export function popoverModel(section: Section): PopoverModel {
  return {
    name: section.name,
    sessions: sessionsPhrase(section.cards.length),
    rows: summaryRows(section.cards).map((row) => ({
      state: row.state,
      word: summaryStateWord(row.state),
      n: row.cards.length,
      titles: row.cards.map(displayTitle),
    })),
  };
}

/** What the selection bar needs to know about the selected sessions. */
export interface SelectionState {
  count: number;
  /** At least one is in a group: Ungroup has something to do. */
  anyGrouped: boolean;
  /** At least one is alive: Stop has something to do. */
  anyAlive: boolean;
}

export function selectionState(
  selected: readonly Session[],
  groups: readonly Group[],
): SelectionState {
  return {
    count: selected.length,
    anyGrouped: selected.some((s) => groupOf(s, groups) !== null),
    anyAlive: selected.some((s) => s.alive),
  };
}
