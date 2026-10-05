// The launch dialog's Group row, DOM-free: which options the select offers, which one a fresh open
// holds, and what a choice sends (kb:anchor/sessions.create's `groupId` / `newGroup`). Beside its
// one controller (features/launchgroup.ts), the way features/launchpastlist.ts sits beside
// launchresume.ts.
import type { LaunchGroup } from "../api/launch";
import type { Group } from "../protocol/groups";
import type { Session } from "../protocol/session";
import {
  groupOf,
  groupsInRailOrder,
  NEW_GROUP_CHOICE,
  NO_GROUP_CHOICE,
} from "../sessions/sections";

/** The select's fixed values; a group's option value is its id. */
export const NO_GROUP_VALUE = "none";
export const NEW_GROUP_VALUE = "new";

export interface GroupOption {
  value: string;
  label: string;
}

/** `No group`, every group in rail order, then `New group…`. */
export function groupOptions(groups: readonly Group[]): GroupOption[] {
  return [
    { value: NO_GROUP_VALUE, label: NO_GROUP_CHOICE },
    ...groupsInRailOrder(groups).map((g) => ({ value: String(g.id), label: g.name })),
    { value: NEW_GROUP_VALUE, label: NEW_GROUP_CHOICE },
  ];
}

/** What every input to `groupOptions` shapes about the built `<option>` nodes — their value and
 * their text — so the controller rebuilds the select only when this changes. */
export function groupOptionsKey(options: readonly GroupOption[]): string {
  return options.map((o) => `${o.value}\u0000${o.label}`).join("\u0001");
}

/** A fresh open holds the focused session's group, else No group — also when that session's
 * `groupId` names a group the dashboard does not know. */
export function defaultGroupValue(focused: Session | null, groups: readonly Group[]): string {
  const group = focused ? groupOf(focused, groups) : null;
  return group ? String(group.id) : NO_GROUP_VALUE;
}

/** The value to hold after the options changed under an open dialog: the current one while it
 * still exists, else No group. */
export function keepGroupValue(current: string, options: readonly GroupOption[]): string {
  return options.some((o) => o.value === current) ? current : NO_GROUP_VALUE;
}

export type GroupChoice = { ok: true; group: LaunchGroup } | { ok: false; message: string };

/** The request fields for the select's `value` (and, for `New group…`, the typed name). */
export function groupChoice(value: string, newName: string): GroupChoice {
  if (value === NO_GROUP_VALUE) return { ok: true, group: {} };
  if (value === NEW_GROUP_VALUE) {
    const name = newName.trim();
    if (name === "") return { ok: false, message: "Enter a name for the new group." };
    return { ok: true, group: { newGroup: name } };
  }
  const id = Number(value);
  if (!Number.isInteger(id)) return { ok: true, group: {} };
  return { ok: true, group: { groupId: id } };
}
