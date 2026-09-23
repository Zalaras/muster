// Release check, apply, and the shells a restart would affect.
import { parseUpdateInfo, type UpdateInfo } from "../protocol";
import { isRecord, parseListOf } from "../protocol/decode";
import { requestEmpty, requestJson, type ApiResult } from "./http";

/** `POST /api/update/apply` (kb:anchor/update.apply, plan auto-update). `restart` optional,
 * default false. `202` with no body on success — progress arrives as `update` broadcasts;
 * a POST while an apply is already in flight also returns 202 without starting a second
 * one (REQ-20). Errors: `400 invalid_request` / `404 not_found` (updates disabled, or
 * install `dev`) / `409 update_unsupported` (homebrew/unmanaged, `message` is the remedy) /
 * `409 nothing_to_apply` / `409 shutting_down`. */
export async function applyUpdate(restart: boolean): Promise<ApiResult<null>> {
  return requestEmpty("POST", "/api/update/apply", 202, { restart });
}

/** `POST /api/update/check` (kb:anchor/update.check, plan rail-card-improvements-2 REQ-7).
 * Performs one synchronous release check and returns the resulting update object on
 * success — unlike `applyUpdate`/`putPrefs`, the response itself carries the new state
 * (the caller doesn't need to wait for the `update` broadcast, though one still arrives).
 * Runs regardless of `prefs.updateCheck` (REQ-8). Errors: `404 not_found` (`canCheck`
 * false) / `409 shutting_down` / `502 check_failed`. */
export async function checkForUpdate(): Promise<ApiResult<UpdateInfo>> {
  return requestJson("POST", "/api/update/check", parseUpdateInfo);
}

/** One `muster-<n>-shell` tmux session alive on the daemon's socket
 * (kb:anchor/update.restart-impact) — `title` is the owning session's current title, or
 * `null` when that session is unknown. */
export interface RestartImpactShell {
  sessionId: number;
  title: string | null;
}

export interface RestartImpact {
  shells: RestartImpactShell[];
}

function parseRestartImpactShell(value: unknown): RestartImpactShell | null {
  if (!isRecord(value)) return null;
  const sessionId = value["sessionId"];
  const title = value["title"];
  if (typeof sessionId !== "number") return null;
  if (title !== null && typeof title !== "string") return null;
  return { sessionId, title };
}

function parseRestartImpact(value: unknown): RestartImpact | null {
  if (!isRecord(value)) return null;
  const shells = parseListOf(value["shells"], parseRestartImpactShell);
  if (!shells) return null;
  return { shells };
}

/** `GET /api/update/restart-impact` (kb:anchor/update.restart-impact, plan auto-update REQ-27):
 * the plain-terminal shells the restart confirm names (REQ-11). Computed on request from
 * tmux, never cached. Errors: none beyond auth. */
export async function fetchRestartImpact(): Promise<ApiResult<RestartImpact>> {
  return requestJson("GET", "/api/update/restart-impact", parseRestartImpact);
}
