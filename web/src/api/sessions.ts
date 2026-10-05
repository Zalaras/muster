// Actions on an existing session: end, resume, remove, pin, rename, reorder, the ephemeral
// shell and its pane snapshot.
import { parseBatchResult, type BatchResult } from "../protocol/batch";
import { parseSession, type Session } from "../protocol/session";
import { isRecord } from "../protocol/decode";
import { requestEmpty, requestJson, type ApiResult } from "./http";

/** `POST /api/sessions/{id}/end` (kb:anchor/sessions.end). `200` + the Session object
 * (`alive:false`, `endedAt` set); errors `404 unknown_session` / `409 not_alive`. */
export async function endSession(id: number): Promise<ApiResult<Session>> {
  return requestJson("POST", `/api/sessions/${id}/end`, parseSession);
}

/** `POST /api/sessions/{id}/resume` (kb:anchor/sessions.resume). `200` + the Session object
 * (`state` unchanged until the enveloped `SessionStart(source:"resume")` arrives); errors
 * `404 unknown_session` / `409 not_resumable` / `409 directory_missing` /
 * `500 launch_failed`. */
export async function resumeSession(id: number): Promise<ApiResult<Session>> {
  return requestJson("POST", `/api/sessions/${id}/resume`, parseSession);
}

/** `DELETE /api/sessions/{id}` (kb:anchor/sessions.remove). `204` with no body on success —
 * the removal itself reaches every UI socket via the `sessionRemoved` broadcast. Errors
 * `404 unknown_session` / `500 end_failed` (alive and the kill failed — row not deleted). */
export async function removeSession(id: number): Promise<ApiResult<null>> {
  return requestEmpty("DELETE", `/api/sessions/${id}`, 204);
}

/** kb:anchor/sessions.pane: the last `capture-pane -p` text for a session, display source only. */
export interface PaneSnapshot {
  text: string;
  capturedAt: string;
}

function parsePaneSnapshot(value: unknown): PaneSnapshot | null {
  if (!isRecord(value)) return null;
  const text = value["text"];
  const capturedAt = value["capturedAt"];
  if (typeof text !== "string" || typeof capturedAt !== "string") return null;
  return { text, capturedAt };
}

/** `GET /api/sessions/{id}/pane` (kb:anchor/sessions.pane). Errors `404 unknown_session` /
 * `404 no_snapshot` (no capture has succeeded yet — render/dead.ts's "no snapshot
 * captured" honesty case, not a fetch failure). */
export async function fetchPane(id: number): Promise<ApiResult<PaneSnapshot>> {
  return requestJson("GET", `/api/sessions/${id}/pane`, parsePaneSnapshot);
}

/** `PUT /api/sessions/{id}/title` (kb:anchor/sessions.title). `title: null` clears the
 * override; a non-null string sets it (1-100
 * characters after trimming, validated daemon-side — sessions/rename.ts's `titleCommand`
 * already avoids sending an out-of-range value from the UI's own editor, but a direct
 * caller still gets the daemon's `400`). `204` with no body on success — same
 * "response carries no state, the socket does" shape as `pinSession`: the resulting
 * `title`/`titleOverride` change reaches every UI socket via `sessionUpsert`. Errors:
 * `400 invalid_request` / `404 unknown_session`. */
export async function putTitle(id: number, title: string | null): Promise<ApiResult<null>> {
  return requestEmpty("PUT", `/api/sessions/${id}/title`, 204, { title });
}

/** The `200` body of `POST /api/sessions/{id}/shell` (kb:anchor/sessions.shell). */
export interface CreateShellResult {
  target: string;
  created: boolean;
}

function parseCreateShellResult(value: unknown): CreateShellResult | null {
  if (!isRecord(value)) return null;
  const target = value["target"];
  const created = value["created"];
  if (typeof target !== "string") return null;
  if (typeof created !== "boolean") return null;
  return { target, created };
}

/** `POST /api/sessions/{id}/shell` (kb:anchor/sessions.shell). Idempotent — ensures the
 * session's plain shell is running, spawning it if absent; a session whose shell already
 * runs still succeeds with `created: false`. `alive` is never consulted. Errors:
 * `404 unknown_session` / `409 directory_missing` / `500 shell_spawn_failed` (`message`
 * carries the tmux error, shown verbatim in the surface's `role="status"` notice). */
export async function createShell(id: number): Promise<ApiResult<CreateShellResult>> {
  return requestJson("POST", `/api/sessions/${id}/shell`, parseCreateShellResult);
}

/** `PUT /api/sessions/{id}/pin` (kb:anchor/sessions.pin). `204` with no body on success —
 * the resulting `pinned`/`railPos` changes reach every UI socket (this one included) via
 * `sessionUpsert` broadcasts; features/actions.ts never applies an optimistic reorder, so
 * a caller here doesn't need a decoded body. Errors: `400 invalid_request` /
 * `404 unknown_session`. */
export async function pinSession(id: number, pinned: boolean): Promise<ApiResult<null>> {
  return requestEmpty("PUT", `/api/sessions/${id}/pin`, 204, { pinned });
}

/** `PUT /api/sessions/order` (kb:anchor/sessions.order). Same no-optimistic-update shape
 * as `pinSession` above — the rail redraws from the
 * resulting `sessionUpsert`s. `groupId` (a number, or `null` for Ungrouped) makes every listed
 * id join that section before the order applies — a card dropped among another section's
 * cards moves and lands in one call; omitted, membership is untouched. Errors:
 * `400 invalid_request` (unknown/duplicate id, `pinnedCount` out of range) — nothing changes on
 * a 400 — and `404 unknown_group`. */
export async function putSessionOrder(
  ids: readonly number[],
  pinnedCount: number,
  groupId?: number | null,
): Promise<ApiResult<null>> {
  const body = groupId === undefined ? { ids, pinnedCount } : { ids, pinnedCount, groupId };
  return requestEmpty("PUT", "/api/sessions/order", 204, body);
}

/** `PUT /api/sessions/group` (kb:anchor/sessions.group): move `ids` to the end of the target
 * section (`groupId` null = Ungrouped), pin flag kept. `204`; the moves reach every window as
 * `sessionUpsert`s. Errors: `400 invalid_request`, `404 unknown_group` — nothing changes. */
export async function putSessionsGroup(
  ids: readonly number[],
  groupId: number | null,
): Promise<ApiResult<null>> {
  return requestEmpty("PUT", "/api/sessions/group", 204, { ids, groupId });
}

/** `POST /api/sessions/end` (kb:anchor/sessions.end-many): the batch Stop. Each id is stopped
 * under its own lock exactly as `endSession` does; `200` whatever the mix, the report says which
 * ids were `done`, `skipped` (unknown at its turn, or not alive) or `failed`. */
export async function endSessions(ids: readonly number[]): Promise<ApiResult<BatchResult>> {
  return requestJson("POST", "/api/sessions/end", parseBatchResult, { ids });
}

/** `POST /api/sessions/remove` (kb:anchor/sessions.remove-many): the batch Remove — a live
 * session is stopped first. Same report shape as `endSessions`; a `failed` row is kept. */
export async function removeSessions(ids: readonly number[]): Promise<ApiResult<BatchResult>> {
  return requestJson("POST", "/api/sessions/remove", parseBatchResult, { ids });
}
