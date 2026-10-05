// The rail groups' daemon calls (kb:anchor/groups.create, groups.update, groups.order,
// groups.collapsed, groups.delete). None applies an optimistic change: the resulting `groups` and
// `sessionUpsert` broadcasts redraw every window (kb:adr/rail-groups-daemon-rows-whole-list-broadcast).
import { isRecord } from "../protocol/decode";
import { parseBatchResult, type BatchResult } from "../protocol/batch";
import { parseGroup, type Group } from "../protocol/groups";
import { requestEmpty, requestJson, type ApiResult } from "./http";

/** What happens to a deleted group's members (kb:anchor/groups.delete). */
export type DeleteDisposition =
  | { sessions: "ungroup" }
  | { sessions: "move"; to: number }
  | { sessions: "remove" };

/** `DELETE /api/groups/{id}`'s `200` body: `deleted` is false only when a `remove` left a
 * failed member behind; `sessions` reports each member by outcome. */
export interface DeleteGroupResult {
  deleted: boolean;
  sessions: BatchResult;
}

function parseDeleteGroupResult(value: unknown): DeleteGroupResult | null {
  if (!isRecord(value)) return null;
  const deleted = value["deleted"];
  const sessions = parseBatchResult(value["sessions"]);
  if (typeof deleted !== "boolean" || !sessions) return null;
  return { deleted, sessions };
}

/** `POST /api/groups` (kb:anchor/groups.create). `201` + the Group object. `sessionIds` become
 * its first members, in listed order. Errors: `400 invalid_request` (the name is outside 1-40
 * characters after trimming), `404 unknown_session` — nothing is created on either. */
export async function createGroup(
  name: string,
  sessionIds?: readonly number[],
): Promise<ApiResult<Group>> {
  const body = sessionIds === undefined ? { name } : { name, sessionIds };
  return requestJson("POST", "/api/groups", parseGroup, body);
}

/** `PUT /api/groups/{id}` (kb:anchor/groups.update); `id` 0 is the Ungrouped section, which
 * cannot be renamed. `204`; errors `400 invalid_request`, `404 unknown_group`. */
export async function updateGroup(
  id: number,
  fields: { name?: string; collapsed?: boolean },
): Promise<ApiResult<null>> {
  return requestEmpty("PUT", `/api/groups/${id}`, 204, fields);
}

/** `PUT /api/groups/order` (kb:anchor/groups.order): every group id plus `0` for Ungrouped,
 * exactly once; `pos` is the index. `204`; `400 invalid_request` changes nothing. */
export async function putGroupsOrder(order: readonly number[]): Promise<ApiResult<null>> {
  return requestEmpty("PUT", "/api/groups/order", 204, { order });
}

/** `PUT /api/groups/collapsed` (kb:anchor/groups.collapsed): Collapse all / Expand all in one
 * write, Ungrouped included. `204`. */
export async function putAllCollapsed(collapsed: boolean): Promise<ApiResult<null>> {
  return requestEmpty("PUT", "/api/groups/collapsed", 204, { collapsed });
}

/** `DELETE /api/groups/{id}` (kb:anchor/groups.delete). `200` + the members' report. Errors:
 * `400 invalid_request`, `404 unknown_group` (the message says whether the group or the target
 * is the one gone). */
export async function deleteGroup(
  id: number,
  disposition: DeleteDisposition,
): Promise<ApiResult<DeleteGroupResult>> {
  return requestJson("DELETE", `/api/groups/${id}`, parseDeleteGroupResult, disposition);
}
