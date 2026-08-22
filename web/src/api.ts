// Cookie-authed HTTP wrappers for the M1 UI-facing endpoints (docs/protocol.md §3.1,
// §3.2, §3.6). Decoding mirrors protocol.ts's style: pure parse functions validate the
// daemon's response shape before any caller (render/launch.ts) sees it. Errors never
// throw — every call returns an ApiResult so the launch modal can render `error.message`
// inline (REQ-14) instead of an uncaught rejection.
import { type Session, parseSession } from "./protocol";

export interface ApiErrorBody {
  code: string;
  message: string;
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

export interface LaunchRequest {
  directory: string;
  title?: string;
  model: string;
  permissionMode: "default" | "plan" | "acceptEdits";
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
  return { code, message };
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
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  return decodeJson(res, parseSession);
}

/** `GET /api/repos` (docs/protocol.md §3.2) — the MRU picker list. */
export async function fetchRepos(): Promise<ApiResult<Repo[]>> {
  const res = await fetch("/api/repos", { credentials: "same-origin" });
  return decodeJson(res, parseRepos);
}

/** `GET /api/browse` (docs/protocol.md §3.6). Omitting `path` lists the daemon user's
 * home directory. */
export async function browse(path?: string): Promise<ApiResult<BrowseResult>> {
  const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : "/api/browse";
  const res = await fetch(url, { credentials: "same-origin" });
  return decodeJson(res, parseBrowseResult);
}
