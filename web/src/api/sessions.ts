// Actions on an existing session: end, resume, remove, pin, rename, reorder, the ephemeral
// shell and its pane snapshot.
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

/** REQ-4/kb:anchor/sessions.pane: the last `capture-pane -p` text for a session, display source only. */
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

/** `PUT /api/sessions/{id}/title` (kb:anchor/sessions.title, plan ui-text-and-focus
 * REQ-10). `title: null` clears the override; a non-null string sets it (1-100
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

/** `POST /api/sessions/{id}/shell` (kb:anchor/sessions.shell, plan plain-terminal-session
 * REQ-1). Idempotent — ensures the session's plain shell is running, spawning it if
 * absent; a session whose shell already runs still succeeds with `created: false`.
 * `alive` is never consulted (REQ-7). Errors: `404 unknown_session` /
 * `409 directory_missing` / `500 shell_spawn_failed` (`message` carries the tmux error —
 * REQ-12 shows it verbatim in the surface's `role="status"` notice). */
export async function createShell(id: number): Promise<ApiResult<CreateShellResult>> {
  return requestJson("POST", `/api/sessions/${id}/shell`, parseCreateShellResult);
}

/** `PUT /api/sessions/{id}/pin` (kb:anchor/sessions.pin, plan order-sidebar REQ-3). `204`
 * with no body on success — the resulting `pinned`/`railPos` changes reach every UI
 * socket (this one included) via `sessionUpsert` broadcasts; features/actions.ts never
 * applies an optimistic reorder (REQ-15/Implementation Notes), so a caller here doesn't
 * need a decoded body. Errors: `400 invalid_request` / `404 unknown_session`. */
export async function pinSession(id: number, pinned: boolean): Promise<ApiResult<null>> {
  return requestEmpty("PUT", `/api/sessions/${id}/pin`, 204, { pinned });
}

/** `PUT /api/sessions/order` (kb:anchor/sessions.order, plan order-sidebar REQ-4/REQ-11).
 * Same no-optimistic-update shape as `pinSession` above — the rail redraws from the
 * resulting `sessionUpsert`s. Errors: `400 invalid_request` (unknown/duplicate id,
 * `pinnedCount` out of range) — nothing changes on a 400. */
export async function putSessionOrder(
  ids: readonly number[],
  pinnedCount: number,
): Promise<ApiResult<null>> {
  return requestEmpty("PUT", "/api/sessions/order", 204, { ids, pinnedCount });
}
