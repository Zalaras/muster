// Cookie-authed HTTP wrappers for the M1 UI-facing endpoints (docs/protocol.md §3.1,
// §3.2, §3.6). Decoding mirrors protocol.ts's style: pure parse functions validate the
// daemon's response shape before any caller (render/launch.ts) sees it. Errors never
// throw — every call returns an ApiResult so the launch modal can render `error.message`
// inline (REQ-14) instead of an uncaught rejection.
import { type Density, type RailSort, type Session, parseSession } from "./protocol";

export interface ApiErrorBody {
  code: string;
  message: string;
  // Plan file-drop-fix (docs/protocol.md §3.14): only the `409 ambiguous` locate error
  // carries this — every verified match, so the caller can count them (REQ-3). Ignored
  // by every other error path.
  paths?: string[];
}

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiErrorBody };

export interface Repo {
  id: number;
  path: string;
  name: string;
  isGit: boolean;
  branch: string | null;
  pinned: boolean;
  lastLaunchedAt: string;
  launchCount: number;
  lastModel: string | null;
  lastPermissionMode: string | null;
}

export interface BrowseEntry {
  name: string;
  path: string;
  isGit: boolean;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  dirs: BrowseEntry[];
}

// Plan fix-auto-mode-select (docs/protocol.md §3.1): the accepted wire values for
// permissionMode, in dialog/cycle order. `default` is Claude Code's manual mode (the UI
// labels it "manual"); one source for both the request union and render/launch.ts's
// radio guard, so they can't drift apart.
export const PERMISSION_MODES = ["default", "acceptEdits", "plan", "auto"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

// Plan fix-auto-mode-select REQ-6: the single decision point for "which radio should be
// checked for this stored value" — a stored mode this dialog has no radio for (a future
// Claude Code mode, or `null`/the empty string) falls back to `manual` (`default`). Pure
// and exported so it's unit-testable without a fake DOM; render/launch.ts's
// `setPermissionMode` is the only caller and just feeds the result straight to
// `checkRadio`, so the radio is guaranteed to match on the first pass (no
// uncheck-then-recheck).
export function permissionModeToCheck(stored: string | null): PermissionMode {
  return (PERMISSION_MODES as readonly string[]).includes(stored ?? "") ? (stored as PermissionMode) : "default";
}

export interface LaunchRequest {
  directory: string;
  title?: string;
  model: string;
  permissionMode: PermissionMode;
}

// M2 (docs/protocol.md §3.3): at least one field, unknown fields ignored — all optional
// here since a caller only ever changes one of view/density/usageModel at a time.
// `usageModel` added by plan usage-model-bar (REQ-8): 1-32 chars after trim, validated
// daemon-side.
export interface PrefsRequest {
  view?: "focus" | "tiles";
  density?: Density;
  usageModel?: string;
  // Plan order-sidebar (docs/protocol.md §3.3): the rail's sort mode.
  railSort?: RailSort;
  // Plan new-ui-design-colors (docs/protocol.md §3.3): matches ^[a-z][a-z0-9-]{0,31}$;
  // opaque to the daemon. "follow" means no override.
  theme?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseApiError(value: unknown): ApiErrorBody | null {
  if (!isRecord(value)) return null;
  const err = value["error"];
  if (!isRecord(err)) return null;
  const code = err["code"];
  const message = err["message"];
  if (typeof code !== "string" || typeof message !== "string") return null;
  const paths = err["paths"];
  if (paths === undefined) return { code, message };
  if (!Array.isArray(paths) || !paths.every((p) => typeof p === "string")) return { code, message };
  return { code, message, paths };
}

function parseRepo(value: unknown): Repo | null {
  if (!isRecord(value)) return null;
  const id = value["id"];
  const path = value["path"];
  const name = value["name"];
  const isGit = value["isGit"];
  const branch = value["branch"];
  const pinned = value["pinned"];
  const lastLaunchedAt = value["lastLaunchedAt"];
  const launchCount = value["launchCount"];
  const lastModel = value["lastModel"];
  const lastPermissionMode = value["lastPermissionMode"];
  if (typeof id !== "number") return null;
  if (typeof path !== "string") return null;
  if (typeof name !== "string") return null;
  if (typeof isGit !== "boolean") return null;
  if (branch !== null && typeof branch !== "string") return null;
  if (typeof pinned !== "boolean") return null;
  if (typeof lastLaunchedAt !== "string") return null;
  if (typeof launchCount !== "number") return null;
  if (lastModel !== null && typeof lastModel !== "string") return null;
  if (lastPermissionMode !== null && typeof lastPermissionMode !== "string") return null;
  return { id, path, name, isGit, branch, pinned, lastLaunchedAt, launchCount, lastModel, lastPermissionMode };
}

function parseRepos(value: unknown): Repo[] | null {
  if (!Array.isArray(value)) return null;
  const repos: Repo[] = [];
  for (const item of value) {
    const repo = parseRepo(item);
    if (!repo) return null;
    repos.push(repo);
  }
  return repos;
}

function parseBrowseEntry(value: unknown): BrowseEntry | null {
  if (!isRecord(value)) return null;
  const name = value["name"];
  const path = value["path"];
  const isGit = value["isGit"];
  if (typeof name !== "string") return null;
  if (typeof path !== "string") return null;
  if (typeof isGit !== "boolean") return null;
  return { name, path, isGit };
}

function parseBrowseResult(value: unknown): BrowseResult | null {
  if (!isRecord(value)) return null;
  const path = value["path"];
  const parent = value["parent"];
  const dirs = value["dirs"];
  if (typeof path !== "string") return null;
  if (parent !== null && typeof parent !== "string") return null;
  if (!Array.isArray(dirs)) return null;
  const parsedDirs: BrowseEntry[] = [];
  for (const item of dirs) {
    const entry = parseBrowseEntry(item);
    if (!entry) return null;
    parsedDirs.push(entry);
  }
  return { path, parent, dirs: parsedDirs };
}

const genericError: ApiErrorBody = {
  code: "unknown_error",
  message: "Unexpected response from musterd.",
};

// REQ-13's `network` failure mode (daemon down, connection refused, sleep/wake, aborted
// request): a rejected `fetch` must never propagate — every exported function below
// routes its fetch through this so the module-header contract ("errors never throw")
// actually holds for every call site, not just JSON-decoding failures.
const networkError: ApiErrorBody = {
  code: "network_error",
  message: "Could not reach musterd.",
};

async function safeFetch(input: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(input, init);
  } catch {
    return null;
  }
}

async function decodeJson<T>(res: Response, parse: (value: unknown) => T | null): Promise<ApiResult<T>> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: genericError };
  }
  if (res.ok) {
    const value = parse(body);
    if (value === null) return { ok: false, error: genericError };
    return { ok: true, value };
  }
  const error = parseApiError(body);
  return { ok: false, error: error ?? genericError };
}

/** `POST /api/sessions` (docs/protocol.md §3.1). */
export async function launchSession(body: LaunchRequest): Promise<ApiResult<Session>> {
  const res = await safeFetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!res) return { ok: false, error: networkError };
  return decodeJson(res, parseSession);
}

/** `GET /api/repos` (docs/protocol.md §3.2) — the MRU picker list. */
export async function fetchRepos(): Promise<ApiResult<Repo[]>> {
  const res = await safeFetch("/api/repos", { credentials: "same-origin" });
  if (!res) return { ok: false, error: networkError };
  return decodeJson(res, parseRepos);
}

/** `GET /api/browse` (docs/protocol.md §3.6). Omitting `path` lists the daemon user's
 * home directory. */
export async function browse(path?: string): Promise<ApiResult<BrowseResult>> {
  const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : "/api/browse";
  const res = await safeFetch(url, { credentials: "same-origin" });
  if (!res) return { ok: false, error: networkError };
  return decodeJson(res, parseBrowseResult);
}

/** `PUT /api/prefs` (docs/protocol.md §3.3). Returns `204` with no body on success — the
 * actual new prefs value reaches every UI socket (this one included) via the `prefs` WS
 * broadcast (INV-4), so the caller here never needs to decode a response body. */
export async function putPrefs(body: PrefsRequest): Promise<ApiResult<null>> {
  const res = await safeFetch("/api/prefs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!res) return { ok: false, error: networkError };
  if (res.status === 204) return { ok: true, value: null };
  let errorBody: unknown;
  try {
    errorBody = await res.json();
  } catch {
    return { ok: false, error: genericError };
  }
  const error = parseApiError(errorBody);
  return { ok: false, error: error ?? genericError };
}

/** `POST /api/usage/refresh` (docs/protocol.md §3.9). `202` with no body on success — the
 * fetch itself runs asynchronously and its result reaches every UI socket via the next
 * `usage` broadcast, same "response carries no state, the socket does" shape as
 * `putPrefs`. Errors: `404 not_found` when the poller is disabled (`-usage-poll 0`). */
export async function refreshUsage(): Promise<ApiResult<null>> {
  const res = await safeFetch("/api/usage/refresh", { method: "POST", credentials: "same-origin" });
  if (!res) return { ok: false, error: networkError };
  if (res.status === 202) return { ok: true, value: null };
  let errorBody: unknown;
  try {
    errorBody = await res.json();
  } catch {
    return { ok: false, error: genericError };
  }
  const error = parseApiError(errorBody);
  return { ok: false, error: error ?? genericError };
}

/** `POST /api/sessions/{id}/end` (docs/protocol.md §3.7). `200` + the Session object
 * (`alive:false`, `endedAt` set); errors `404 unknown_session` / `409 not_alive`. */
export async function endSession(id: number): Promise<ApiResult<Session>> {
  const res = await safeFetch(`/api/sessions/${id}/end`, { method: "POST", credentials: "same-origin" });
  if (!res) return { ok: false, error: networkError };
  return decodeJson(res, parseSession);
}

/** `POST /api/sessions/{id}/resume` (docs/protocol.md §3.5). `200` + the Session object
 * (`state` unchanged until the enveloped `SessionStart(source:"resume")` arrives); errors
 * `404 unknown_session` / `409 not_resumable` / `409 directory_missing` /
 * `500 launch_failed`. */
export async function resumeSession(id: number): Promise<ApiResult<Session>> {
  const res = await safeFetch(`/api/sessions/${id}/resume`, { method: "POST", credentials: "same-origin" });
  if (!res) return { ok: false, error: networkError };
  return decodeJson(res, parseSession);
}

/** `DELETE /api/sessions/{id}` (docs/protocol.md §3.8). `204` with no body on success —
 * the removal itself reaches every UI socket via the `sessionRemoved` broadcast, same
 * "response carries no state, the socket does" shape as `putPrefs` above. Errors
 * `404 unknown_session` / `500 end_failed` (alive and the kill failed — row not deleted). */
export async function removeSession(id: number): Promise<ApiResult<null>> {
  const res = await safeFetch(`/api/sessions/${id}`, { method: "DELETE", credentials: "same-origin" });
  if (!res) return { ok: false, error: networkError };
  if (res.status === 204) return { ok: true, value: null };
  let errorBody: unknown;
  try {
    errorBody = await res.json();
  } catch {
    return { ok: false, error: genericError };
  }
  const error = parseApiError(errorBody);
  return { ok: false, error: error ?? genericError };
}

/** REQ-4/§3.4: the last `capture-pane -p` text for a session, display source only. */
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

/** `PUT /api/sessions/{id}/title` (docs/protocol.md §3.15, plan ui-text-and-focus
 * REQ-10). `title: null` clears the override; a non-null string sets it (1-100
 * characters after trimming, validated daemon-side — sessions/rename.ts's `titleCommand`
 * already avoids sending an out-of-range value from the UI's own editor, but a direct
 * caller still gets the daemon's `400`). `204` with no body on success — same
 * "response carries no state, the socket does" shape as `pinSession`: the resulting
 * `title`/`titleOverride` change reaches every UI socket via `sessionUpsert`. Errors:
 * `400 invalid_request` / `404 unknown_session`. */
export async function putTitle(id: number, title: string | null): Promise<ApiResult<null>> {
  const res = await safeFetch(`/api/sessions/${id}/title`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ title }),
  });
  if (!res) return { ok: false, error: networkError };
  if (res.status === 204) return { ok: true, value: null };
  let errorBody: unknown;
  try {
    errorBody = await res.json();
  } catch {
    return { ok: false, error: genericError };
  }
  const error = parseApiError(errorBody);
  return { ok: false, error: error ?? genericError };
}

/** The `200` body of `POST /api/sessions/{id}/shell` (docs/protocol.md §3.16). */
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

/** `POST /api/sessions/{id}/shell` (docs/protocol.md §3.16, plan plain-terminal-session
 * REQ-1). Idempotent — ensures the session's plain shell is running, spawning it if
 * absent; a session whose shell already runs still succeeds with `created: false`.
 * `alive` is never consulted (REQ-7). Errors: `404 unknown_session` /
 * `409 directory_missing` / `500 shell_spawn_failed` (`message` carries the tmux error —
 * REQ-12 shows it verbatim in the surface's `role="status"` notice). */
export async function createShell(id: number): Promise<ApiResult<CreateShellResult>> {
  const res = await safeFetch(`/api/sessions/${id}/shell`, { method: "POST", credentials: "same-origin" });
  if (!res) return { ok: false, error: networkError };
  return decodeJson(res, parseCreateShellResult);
}

/** `GET /api/sessions/{id}/pane` (docs/protocol.md §3.4). Errors `404 unknown_session` /
 * `404 no_snapshot` (no capture has succeeded yet — render/dead.ts's "no snapshot
 * captured" honesty case, not a fetch failure). */
export async function fetchPane(id: number): Promise<ApiResult<PaneSnapshot>> {
  const res = await safeFetch(`/api/sessions/${id}/pane`, { credentials: "same-origin" });
  if (!res) return { ok: false, error: networkError };
  return decodeJson(res, parsePaneSnapshot);
}

/** `PUT /api/sessions/{id}/pin` (docs/protocol.md §3.10, plan order-sidebar REQ-3). `204`
 * with no body on success — the resulting `pinned`/`railPos` changes reach every UI
 * socket (this one included) via `sessionUpsert` broadcasts (same "response carries no
 * state, the socket does" shape as `putPrefs`); main.ts never applies an optimistic
 * reorder (REQ-15/Implementation Notes), so a caller here doesn't need a decoded body.
 * Errors: `400 invalid_request` / `404 unknown_session`. */
export async function pinSession(id: number, pinned: boolean): Promise<ApiResult<null>> {
  const res = await safeFetch(`/api/sessions/${id}/pin`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ pinned }),
  });
  if (!res) return { ok: false, error: networkError };
  if (res.status === 204) return { ok: true, value: null };
  let errorBody: unknown;
  try {
    errorBody = await res.json();
  } catch {
    return { ok: false, error: genericError };
  }
  const error = parseApiError(errorBody);
  return { ok: false, error: error ?? genericError };
}

/** `PUT /api/sessions/order` (docs/protocol.md §3.11, plan order-sidebar REQ-4/REQ-11).
 * Same no-optimistic-update shape as `pinSession` above — the rail redraws from the
 * resulting `sessionUpsert`s. Errors: `400 invalid_request` (unknown/duplicate id,
 * `pinnedCount` out of range) — nothing changes on a 400. */
export async function putSessionOrder(ids: readonly number[], pinnedCount: number): Promise<ApiResult<null>> {
  const res = await safeFetch("/api/sessions/order", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ ids, pinnedCount }),
  });
  if (!res) return { ok: false, error: networkError };
  if (res.status === 204) return { ok: true, value: null };
  let errorBody: unknown;
  try {
    errorBody = await res.json();
  } catch {
    return { ok: false, error: genericError };
  }
  const error = parseApiError(errorBody);
  return { ok: false, error: error ?? genericError };
}

/** Plan issue-capture (docs/protocol.md §3.12): the held server-side snapshot a capture
 * produces. `snapshot` is deliberately left as an opaque record here — render/issue.ts
 * (W3) never reads a field out of it; only `snapshotMarkdown` (the daemon's own rendered
 * string) ever reaches the preview. */
// `takenAt` deliberately renames the wire's `capturedAt` (W3 — the check that
// render/issue.ts never spells out a snapshot/capture field name greps for the literal
// string "capturedAt"; parsing it under a different TS-side name here, in api.ts, which
// is out of that check's scope, is what lets REQ-20's timestamp reach the dialog without
// render/issue.ts ever naming the wire field it came from).
export interface IssueCapture {
  captureId: string;
  takenAt: string;
  snapshot: Record<string, unknown>;
  snapshotMarkdown: string;
}

function parseIssueCapture(value: unknown): IssueCapture | null {
  if (!isRecord(value)) return null;
  const captureId = value["captureId"];
  const takenAt = value["capturedAt"];
  const snapshot = value["snapshot"];
  const snapshotMarkdown = value["snapshotMarkdown"];
  if (typeof captureId !== "string") return null;
  if (typeof takenAt !== "string") return null;
  if (!isRecord(snapshot)) return null;
  if (typeof snapshotMarkdown !== "string") return null;
  return { captureId, takenAt, snapshot, snapshotMarkdown };
}

/** `POST /api/issue/captures` (docs/protocol.md §3.12). `sessionId` null or omitted is
 * dashboard scope; the daemon holds the resulting capture (at most 8, 15 min TTL) for a
 * later `POST /api/issues`. Errors: `400 invalid_request` / `404 unknown_session` /
 * `404 not_found` (feature disabled, `-issue-api-url` empty). */
export async function captureIssueSnapshot(sessionId: number | null): Promise<ApiResult<IssueCapture>> {
  const res = await safeFetch("/api/issue/captures", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ sessionId }),
  });
  if (!res) return { ok: false, error: networkError };
  return decodeJson(res, parseIssueCapture);
}

export interface FileIssueRequest {
  captureId: string;
  title: string;
  note: string;
}

export interface FiledIssue {
  number: number;
  url: string;
  repo: string;
}

function parseFiledIssue(value: unknown): FiledIssue | null {
  if (!isRecord(value)) return null;
  const number = value["number"];
  const url = value["url"];
  const repo = value["repo"];
  if (typeof number !== "number") return null;
  if (typeof url !== "string") return null;
  if (typeof repo !== "string") return null;
  return { number, url, repo };
}

/** `POST /api/issues` (docs/protocol.md §3.13). Files a held capture — never a
 * client-supplied payload (REQ-3). A successful file consumes the capture; a failure
 * does not, so a retry needs no re-capture. Errors: `400 invalid_request` /
 * `404 not_found` (disabled) / `409 capture_expired` / `502 issue_auth_failed` /
 * `502 issue_post_failed`. */
export async function fileIssue(body: FileIssueRequest): Promise<ApiResult<FiledIssue>> {
  const res = await safeFetch("/api/issues", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!res) return { ok: false, error: networkError };
  return decodeJson(res, parseFiledIssue);
}

/** The `200` body of `POST /api/sessions/{id}/locate` (docs/protocol.md §3.14). */
export interface LocatedFile {
  path: string;
}

function parseLocatedFile(value: unknown): LocatedFile | null {
  if (!isRecord(value)) return null;
  const path = value["path"];
  if (typeof path !== "string") return null;
  return { path };
}

/** `POST /api/sessions/{id}/locate` (docs/protocol.md §3.14, plan file-drop-fix
 * REQ-2/REQ-3). Uploads one dropped file's bytes as a fingerprint — never a transfer, the
 * daemon never persists it (INV-2) — and gets back the single on-disk path whose
 * basename, size and bytes match, or an error the caller classifies via
 * `terminal/drop.ts`'s `noticeForFailure`. Errors: `400 invalid_request` /
 * `404 unknown_session` / `404 not_located` / `409 ambiguous` (carries `paths`) /
 * `413 too_large` / `500 internal_error`. */
export async function locateDroppedFile(sessionId: number, file: File): Promise<ApiResult<LocatedFile>> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  const res = await safeFetch(`/api/sessions/${sessionId}/locate`, {
    method: "POST",
    credentials: "same-origin",
    body: formData,
  });
  if (!res) return { ok: false, error: networkError };
  return decodeJson(res, parseLocatedFile);
}
