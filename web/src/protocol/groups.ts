// Wire types and parsers for the rail's groups (docs/protocol.md, kb:anchor/ws.groups) — one of
// the protocol/ concept modules, each owning one wire concept's type and parser; `decode.ts`
// holds the primitives every one of them shares. Groups are daemon rows broadcast whole, the
// `prefs` pattern (kb:adr/rail-groups-daemon-rows-whole-list-broadcast): membership is not here,
// it is the session's own `groupId`.

import { asInteger, isBoolean, isRecord, isString, parseListOf } from "./decode";

/** One named, collapsible rail section the developer made. `pos` is the section's place among
 * every section, Ungrouped included; the client sorts by it. */
export interface Group {
  id: number;
  name: string;
  pos: number;
  collapsed: boolean;
}

/** The Ungrouped section's place and collapsed state. It has no id on the wire — group-level
 * endpoints address it as `0` (kb:adr/rail-ungrouped-is-section-zero-on-the-wire). */
export interface UngroupedLayout {
  pos: number;
  collapsed: boolean;
}

/** kb:anchor/ws.groups: the whole list on every change to any group or to the Ungrouped layout. */
export interface GroupsMessage {
  type: "groups";
  groups: Group[];
  ungrouped: UngroupedLayout;
}

/** What a snapshot carries when an older daemon sends neither key: no groups, and Ungrouped in
 * last place, expanded. */
export function emptyGroupsFields(): { groups: Group[]; ungrouped: UngroupedLayout } {
  return { groups: [], ungrouped: { pos: 0, collapsed: false } };
}

export function parseGroup(value: unknown): Group | null {
  if (!isRecord(value)) return null;
  const id = asInteger(value["id"]);
  const name = value["name"];
  const pos = value["pos"];
  const collapsed = value["collapsed"];
  if (id === null) return null;
  if (!isString(name)) return null;
  if (typeof pos !== "number") return null;
  if (!isBoolean(collapsed)) return null;
  return { id, name, pos, collapsed };
}

export function parseUngroupedLayout(value: unknown): UngroupedLayout | null {
  if (!isRecord(value)) return null;
  const pos = value["pos"];
  const collapsed = value["collapsed"];
  if (typeof pos !== "number") return null;
  if (!isBoolean(collapsed)) return null;
  return { pos, collapsed };
}

/** The `groups` and `ungrouped` keys of a `groups` message: both required, a malformed value in
 * either is `null` — the same all-or-nothing rule every wire list here follows. */
function parseGroupsFields(
  rec: Record<string, unknown>,
): { groups: Group[]; ungrouped: UngroupedLayout } | null {
  const groups = parseListOf(rec["groups"], parseGroup);
  const ungrouped = parseUngroupedLayout(rec["ungrouped"]);
  if (!groups || !ungrouped) return null;
  return { groups, ungrouped };
}

/** The same two keys on a snapshot: both absent (an older daemon) is the empty rail, anything
 * else follows the strict rule above. */
export function parseSnapshotGroups(
  rec: Record<string, unknown>,
): { groups: Group[]; ungrouped: UngroupedLayout } | null {
  if (rec["groups"] === undefined && rec["ungrouped"] === undefined) return emptyGroupsFields();
  return parseGroupsFields(rec);
}

export function parseGroupsMessage(rec: Record<string, unknown>): GroupsMessage | null {
  const fields = parseGroupsFields(rec);
  if (!fields) return null;
  return { type: "groups", ...fields };
}
