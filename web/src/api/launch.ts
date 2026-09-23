// The launch dialog's daemon calls: create a session, list the MRU repo picker, and browse
// the filesystem for a directory to launch in.
import { parseSession, type Session } from "../protocol/session";
import { isRecord, parseListOf } from "../protocol/decode";
import type { PermissionMode } from "../sessions/permission";
import { requestJson, type ApiResult } from "./http";

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
  permissionMode: PermissionMode;
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
  return {
    id,
    path,
    name,
    isGit,
    branch,
    pinned,
    lastLaunchedAt,
    launchCount,
    lastModel,
    lastPermissionMode,
  };
}

function parseRepos(value: unknown): Repo[] | null {
  return parseListOf(value, parseRepo);
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
  if (typeof path !== "string") return null;
  if (parent !== null && typeof parent !== "string") return null;
  const dirs = parseListOf(value["dirs"], parseBrowseEntry);
  if (!dirs) return null;
  return { path, parent, dirs };
}

/** `POST /api/sessions` (kb:anchor/sessions.create). */
export async function launchSession(body: LaunchRequest): Promise<ApiResult<Session>> {
  return requestJson("POST", "/api/sessions", parseSession, body);
}

/** `GET /api/repos` (kb:anchor/repos.list) — the MRU picker list. */
export async function fetchRepos(): Promise<ApiResult<Repo[]>> {
  return requestJson("GET", "/api/repos", parseRepos);
}

/** `GET /api/browse` (kb:anchor/browse.get). Omitting `path` lists the daemon user's
 * home directory. */
export async function browse(path?: string): Promise<ApiResult<BrowseResult>> {
  const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : "/api/browse";
  return requestJson("GET", url, parseBrowseResult);
}
