// The launch dialog's daemon calls: create a session, list the MRU repo picker, browse
// the filesystem for a directory to launch in, and check the model catalog.
import { parseSession, type PermissionMode, type Session } from "../protocol/session";
import { isRecord, parseListOf } from "../protocol/decode";
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

/** The group a launch joins (kb:anchor/sessions.create): an existing group by id, or a name to
 * create together with the session — the daemon refuses both at once. Neither is No group. */
export interface LaunchGroup {
  groupId?: number;
  newGroup?: string;
}

export interface LaunchRequest extends LaunchGroup {
  directory: string;
  title?: string;
  model: string;
  permissionMode: PermissionMode;
}

/** kb:anchor/sessions.create's resume-from-list request form: `resumeSessionId`
 * combined with no `title`/`model`/`permissionMode` — the daemon reads the transcript's
 * own last mode and model, so the dialog sends neither. */
export interface ResumeListRequest extends LaunchGroup {
  directory: string;
  resumeSessionId: string;
}

/** kb:anchor/pastsessions.list: one of a directory's Claude Code sessions, read
 * from its transcripts. `permissionMode` is the transcript's own last permission-mode
 * line verbatim (an open string, not the dialog's `PermissionMode` union — an unrecognised
 * value just never matches `"bypassPermissions"` and never matches a Start-in radio).
 * `openSessionId` is the id of an alive Muster session already bound to this
 * `claudeSessionId`, or `null` (kb:adr/launch-resume-running-guard-muster-only). */
export interface PastSession {
  claudeSessionId: string;
  title: string | null;
  lastPrompt: string | null;
  lastActiveAt: string;
  permissionMode: string | null;
  openSessionId: number | null;
}

export interface PastSessionsResult {
  sessions: PastSession[];
  truncated: boolean;
}

export const MODEL_VERDICT_KINDS = ["recognized", "unrecognized", "unchecked"] as const;
export type ModelVerdictKind = (typeof MODEL_VERDICT_KINDS)[number];

export interface ModelVerdict {
  model: string;
  verdict: ModelVerdictKind;
  /** Present iff `verdict` is `"unrecognized"` — exactly the `model_unrecognized` message
   * `POST /api/sessions` would refuse this model with. */
  message?: string;
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

function parsePastSession(value: unknown): PastSession | null {
  if (!isRecord(value)) return null;
  const claudeSessionId = value["claudeSessionId"];
  const title = value["title"];
  const lastPrompt = value["lastPrompt"];
  const lastActiveAt = value["lastActiveAt"];
  const permissionMode = value["permissionMode"];
  const openSessionId = value["openSessionId"];
  if (typeof claudeSessionId !== "string") return null;
  if (title !== null && typeof title !== "string") return null;
  if (lastPrompt !== null && typeof lastPrompt !== "string") return null;
  if (typeof lastActiveAt !== "string") return null;
  if (permissionMode !== null && typeof permissionMode !== "string") return null;
  if (openSessionId !== null && typeof openSessionId !== "number") return null;
  return { claudeSessionId, title, lastPrompt, lastActiveAt, permissionMode, openSessionId };
}

/** `GET /api/past-sessions`'s whole body (kb:anchor/pastsessions.list). */
export function parsePastSessions(value: unknown): PastSessionsResult | null {
  if (!isRecord(value)) return null;
  const sessions = parseListOf(value["sessions"], parsePastSession);
  const truncated = value["truncated"];
  if (!sessions) return null;
  if (typeof truncated !== "boolean") return null;
  return { sessions, truncated };
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

function isModelVerdictKind(value: unknown): value is ModelVerdictKind {
  return (MODEL_VERDICT_KINDS as readonly unknown[]).includes(value);
}

function parseModelVerdict(value: unknown): ModelVerdict | null {
  if (!isRecord(value)) return null;
  const model = value["model"];
  const verdict = value["verdict"];
  if (typeof model !== "string") return null;
  if (!isModelVerdictKind(verdict)) return null;
  if (verdict === "unrecognized") {
    const message = value["message"];
    if (typeof message !== "string") return null;
    return { model, verdict, message };
  }
  return { model, verdict };
}

/** `GET /api/models`'s `{ "models": [...] }` body (kb:anchor/models.check), unwrapped to
 * the array — one bad element rejects the whole response, same all-or-nothing rule as
 * every other wire list (`protocol/decode.ts`'s `parseListOf`). */
function parseModelVerdicts(value: unknown): ModelVerdict[] | null {
  if (!isRecord(value)) return null;
  return parseListOf(value["models"], parseModelVerdict);
}

/** `POST /api/sessions` (kb:anchor/sessions.create). */
export async function launchSession(body: LaunchRequest): Promise<ApiResult<Session>> {
  return requestJson("POST", "/api/sessions", parseSession, body);
}

/** `POST /api/sessions` with `resumeSessionId` (kb:anchor/sessions.create's
 * resume-from-list form). Errors add `404 unknown_claude_session` and
 * `409 already_open` to the existing `directory`/`launch_failed` set — both surface
 * through the same `#launch-error` path as any other launch refusal. */
export async function resumeFromList(body: ResumeListRequest): Promise<ApiResult<Session>> {
  return requestJson("POST", "/api/sessions", parseSession, body);
}

/** `GET /api/past-sessions` (kb:anchor/pastsessions.list) — the Resume tab's list,
 * newest first. */
export async function fetchPastSessions(directory: string): Promise<ApiResult<PastSessionsResult>> {
  return requestJson(
    "GET",
    `/api/past-sessions?directory=${encodeURIComponent(directory)}`,
    parsePastSessions,
  );
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

/** `GET /api/models` (kb:anchor/models.check): a catalog verdict per requested model,
 * cached daemon-side per binary identity. `models` is 1 to 8 non-empty values; the caller
 * (features/launch.ts) never calls this with more or none. */
export async function checkModels(models: readonly string[]): Promise<ApiResult<ModelVerdict[]>> {
  const params = new URLSearchParams();
  for (const model of models) params.append("model", model);
  return requestJson("GET", `/api/models?${params.toString()}`, parseModelVerdicts);
}
