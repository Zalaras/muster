// The rail groups' composed text — menu labels, the bulk Stop/Remove and delete-group dialogs'
// titles and bodies, the batch report. DOM-free decisions with no DOM caller of their own: the
// controllers (features/groups.ts and its groupsdialogs.ts / groupsselect.ts, features/actions.ts,
// features/focus.ts) hand the strings to
// `render/` builders, which only ever assign them to `textContent`. The singular/plural noun
// phrase is `sessions/sections.ts`'s `sessionsPhrase`, shared with the header popover.
import type { BatchResult } from "../protocol/batch";
import {
  NEW_GROUP_CHOICE,
  NO_GROUP_CHOICE,
  sessionsPhrase,
  UNGROUPED_NAME,
} from "../sessions/sections";

export const MENU_LABELS = {
  newGroup: NEW_GROUP_CHOICE,
  collapseAll: "Collapse all groups",
  expandAll: "Expand all groups",
  rename: "Rename",
  collapse: "Collapse",
  expand: "Expand",
  stopAll: "Stop all…",
  ungroup: "Ungroup",
  deleteGroup: "Delete group…",
  moveTo: "Move to",
  ungrouped: UNGROUPED_NAME,
  noGroup: NO_GROUP_CHOICE,
} as const;

/** The chord the rail menu's New group item shows. */
export const NEW_GROUP_CHORD = "⌥⌘G";

export function selectAllLabel(n: number): string {
  return `Select all (${n})`;
}

/** The selection bar's count: `3 selected`, or the prompt at zero. */
export function selectionCount(n: number): string {
  return n === 0 ? "Select sessions" : `${n} selected`;
}

/** `#rail-count`: the plain total (`0` with no sessions), or `n of m` while the filter hides a card. */
export function railCountText(shown: number, total: number, hides: boolean): string {
  return hides && total > 0 ? `${shown} of ${total}` : String(total);
}

export function stopManyTitle(n: number): string {
  return `Stop ${sessionsPhrase(n)}?`;
}

/** A header's Stop all… states that the group itself stays. */
export function stopManyBody(fromGroup: boolean): string {
  const base =
    "Each is stopped the way Stop does: it stays in the rail as ended and can be resumed.";
  return fromGroup ? `${base} The group stays.` : base;
}

export function stopManyConfirm(n: number): string {
  return `Stop ${n}`;
}

export function removeManyTitle(n: number): string {
  return `Remove ${sessionsPhrase(n)}?`;
}

/** `live` of the selection are alive and are stopped first; the sentence is absent at 0. */
export function removeManyBody(live: number): string {
  const stopFirst = live > 0 ? `${live} of them are alive and will be stopped first. ` : "";
  return `${stopFirst}A removed session cannot be resumed.`;
}

export function removeManyConfirm(n: number): string {
  return `Remove ${n}`;
}

export function deleteGroupTitle(name: string): string {
  return `Delete group “${name}”?`;
}

/** The dialog's lead line; an empty group has nothing to choose, so it says so alone. */
export function deleteGroupBody(members: number): string {
  if (members === 0) return "The group is empty; nothing else changes.";
  return `The group goes away. Choose what happens to its ${sessionsPhrase(members)}.`;
}

export type DeleteChoice = "ungroup" | "move" | "remove";

export const DELETE_CHOICES: Record<DeleteChoice, { label: string; hint: string }> = {
  ungroup: {
    label: "Move them to Ungrouped",
    hint: "They keep their order and stay in the rail, ungrouped.",
  },
  move: {
    label: "Move them to another group",
    hint: "They go to the end of the group you pick.",
  },
  remove: {
    label: "Stop and remove them",
    hint: "Live sessions are stopped first. Removed sessions cannot be resumed.",
  },
};

export const DELETE_CONFIRM_LABEL = "Delete group";

export function newGroupFromTitle(n: number): string {
  return `New group from ${sessionsPhrase(n)}`;
}

/** The action-error line for a batch that did not do everything it was asked, or `null` for a
 * complete one (kb:adr/actions-bulk-stop-remove-are-daemon-batches). A fixed phrase: the ids are
 * not the developer's to read. */
export function batchReport(result: BatchResult): string | null {
  if (result.skipped.length === 0 && result.failed.length === 0) return null;
  return "Not every session was handled — some were skipped or failed.";
}
