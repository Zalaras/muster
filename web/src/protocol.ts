// Message types and parser for the daemon->UI WebSocket protocol (docs/protocol.md v1).
//
// M0 only ever sends `hello` and `snapshot` (docs/protocol.md §8). Unknown message
// types and unknown fields are ignored per protocol §1's "additive evolution" rule —
// parsing here only ever reads the fields it knows about, so future additions never
// need a change here to keep working.

export const PROTOCOL_VERSION = 1;

export interface ClaudeCodeInfo {
  pinned: string;
  installed: string | null;
  drift: boolean | null;
}

export interface Hello {
  type: "hello";
  protocolVersion: number;
  daemon: { version: string };
  claudeCode: ClaudeCodeInfo;
}

export interface UsageBucket {
  usedPct: number;
  resetsAt: string;
}

export interface Usage {
  fiveHour: UsageBucket | null;
  sevenDay: UsageBucket | null;
  sampledAt: string | null;
  source: string;
}

/** M0 never sends a non-null bucket; kept so callers don't special-case M0 vs later. */
export const UNKNOWN_USAGE: Usage = {
  fiveHour: null,
  sevenDay: null,
  sampledAt: null,
  source: "subscription",
};

export type SessionState = "started" | "planning" | "working" | "needs_input" | "failed" | "idle";

export interface SessionAttention {
  reason: "permission" | "idle";
  since: string;
}

export interface SessionFailure {
  error: string;
  message: string;
}

export interface SessionRepo {
  name: string;
  branch: string | null;
  isWorktree: boolean;
}

export interface SessionModelInfo {
  id: string;
  displayName: string;
}

export interface PermissionModeInfo {
  value: string;
  source: "seed" | "hook";
}

export interface SessionContext {
  usedPct: number | null;
  totalInputTokens: number | null;
  windowSize: number | null;
  compactions: number;
}

// Full shape per docs/protocol.md §5.3 (M1: the state machine now produces non-empty
// arrays, so parseSession below validates every field rather than trusting the daemon).
export interface Session {
  id: number;
  title: string | null;
  state: SessionState;
  stateSince: string;
  alive: boolean;
  endedAt: string | null;
  attention: SessionAttention | null;
  failure: SessionFailure | null;
  directory: string;
  repo: SessionRepo | null;
  model: SessionModelInfo | null;
  permissionMode: PermissionModeInfo;
  context: SessionContext;
  lastActivity: string | null;
  claudeSessionId: string | null;
  tmuxTarget: string;
  // M1 addition (protocol §5.3): true iff the launch created this directory's repo row —
  // drives the trust-prompt vs. no-signal honesty note client-side (REQ-17).
  firstLaunchHere: boolean;
  createdAt: string;
}

export type Density = "2x2" | "3x2";

// M2 (docs/protocol.md §3.3 refinement): density is always present alongside view — the
// daemon's default before any PUT is {"view":"focus","density":"2x2"} — so both fields
// are required here, matching every real `snapshot`/`prefs` payload on the wire.
export interface Prefs {
  view: "focus" | "tiles";
  density: Density;
}

export interface Snapshot {
  type: "snapshot";
  sessions: Session[];
  usage: Usage;
  prefs: Prefs;
}

export interface SessionUpsert {
  type: "sessionUpsert";
  session: Session;
}

// M2 (docs/protocol.md §5.5): full-object echo of every accepted `PUT /api/prefs`,
// broadcast to every connected UI socket (INV-4).
export interface PrefsMessage {
  type: "prefs";
  prefs: Prefs;
}

export type Message = Hello | Snapshot | SessionUpsert | PrefsMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseClaudeCode(value: unknown): ClaudeCodeInfo | null {
  if (!isRecord(value)) return null;
  const pinned = value["pinned"];
  const installed = value["installed"];
  const drift = value["drift"];
  if (typeof pinned !== "string") return null;
  if (installed !== null && typeof installed !== "string") return null;
  if (drift !== null && typeof drift !== "boolean") return null;
  return { pinned, installed, drift };
}

function parseHello(rec: Record<string, unknown>): Hello | null {
  const protocolVersion = rec["protocolVersion"];
  const daemon = rec["daemon"];
  if (typeof protocolVersion !== "number") return null;
  if (!isRecord(daemon) || typeof daemon["version"] !== "string") return null;
  const claudeCode = parseClaudeCode(rec["claudeCode"]);
  if (!claudeCode) return null;
  return {
    type: "hello",
    protocolVersion,
    daemon: { version: daemon["version"] },
    claudeCode,
  };
}

function parseUsageBucket(value: unknown): UsageBucket | null {
  if (!isRecord(value)) return null;
  const usedPct = value["usedPct"];
  const resetsAt = value["resetsAt"];
  if (typeof usedPct !== "number" || typeof resetsAt !== "string") return null;
  return { usedPct, resetsAt };
}

function parseUsage(value: unknown): Usage | null {
  if (!isRecord(value)) return null;
  const rawFiveHour = value["fiveHour"];
  const rawSevenDay = value["sevenDay"];
  const fiveHour = rawFiveHour === null ? null : parseUsageBucket(rawFiveHour);
  const sevenDay = rawSevenDay === null ? null : parseUsageBucket(rawSevenDay);
  if (rawFiveHour !== null && fiveHour === null) return null;
  if (rawSevenDay !== null && sevenDay === null) return null;
  const sampledAt = value["sampledAt"];
  const source = value["source"];
  if (sampledAt !== null && typeof sampledAt !== "string") return null;
  if (typeof source !== "string") return null;
  return { fiveHour, sevenDay, sampledAt, source };
}

function parsePrefs(value: unknown): Prefs | null {
  if (!isRecord(value)) return null;
  const view = value["view"];
  const density = value["density"];
  if (view !== "focus" && view !== "tiles") return null;
  if (density !== "2x2" && density !== "3x2") return null;
  return { view, density };
}

function isSessionState(value: unknown): value is SessionState {
  return (
    value === "started" ||
    value === "planning" ||
    value === "working" ||
    value === "needs_input" ||
    value === "failed" ||
    value === "idle"
  );
}

function parseAttention(value: unknown): SessionAttention | null {
  if (!isRecord(value)) return null;
  const reason = value["reason"];
  const since = value["since"];
  if (reason !== "permission" && reason !== "idle") return null;
  if (typeof since !== "string") return null;
  return { reason, since };
}

function parseFailure(value: unknown): SessionFailure | null {
  if (!isRecord(value)) return null;
  const error = value["error"];
  const message = value["message"];
  if (typeof error !== "string" || typeof message !== "string") return null;
  return { error, message };
}

function parseRepoInfo(value: unknown): SessionRepo | null {
  if (!isRecord(value)) return null;
  const name = value["name"];
  const branch = value["branch"];
  const isWorktree = value["isWorktree"];
  if (typeof name !== "string") return null;
  if (branch !== null && typeof branch !== "string") return null;
  if (typeof isWorktree !== "boolean") return null;
  return { name, branch, isWorktree };
}

function parseModelInfo(value: unknown): SessionModelInfo | null {
  if (!isRecord(value)) return null;
  const id = value["id"];
  const displayName = value["displayName"];
  if (typeof id !== "string" || typeof displayName !== "string") return null;
  return { id, displayName };
}

function parsePermissionModeInfo(value: unknown): PermissionModeInfo | null {
  if (!isRecord(value)) return null;
  const modeValue = value["value"];
  const source = value["source"];
  if (typeof modeValue !== "string") return null;
  if (source !== "seed" && source !== "hook") return null;
  return { value: modeValue, source };
}

function parseNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number") return value;
  return undefined; // sentinel: caller treats as invalid
}

function parseContext(value: unknown): SessionContext | null {
  if (!isRecord(value)) return null;
  const usedPct = parseNullableNumber(value["usedPct"]);
  const totalInputTokens = parseNullableNumber(value["totalInputTokens"]);
  const windowSize = parseNullableNumber(value["windowSize"]);
  const compactions = value["compactions"];
  if (usedPct === undefined || totalInputTokens === undefined || windowSize === undefined) return null;
  if (typeof compactions !== "number") return null;
  return { usedPct, totalInputTokens, windowSize, compactions };
}

/** Validates one Session object per docs/protocol.md §5.3. Every field is read-checked;
 * an unrecognized field name or type anywhere in the object rejects the whole session
 * (the caller drops the snapshot/upsert rather than render a half-formed card). */
export function parseSession(value: unknown): Session | null {
  if (!isRecord(value)) return null;

  const id = value["id"];
  const title = value["title"];
  const state = value["state"];
  const stateSince = value["stateSince"];
  const alive = value["alive"];
  const endedAt = value["endedAt"];
  const rawAttention = value["attention"];
  const rawFailure = value["failure"];
  const directory = value["directory"];
  const rawRepo = value["repo"];
  const rawModel = value["model"];
  const lastActivity = value["lastActivity"];
  const claudeSessionId = value["claudeSessionId"];
  const tmuxTarget = value["tmuxTarget"];
  const firstLaunchHere = value["firstLaunchHere"];
  const createdAt = value["createdAt"];

  if (typeof id !== "number") return null;
  if (title !== null && typeof title !== "string") return null;
  if (!isSessionState(state)) return null;
  if (typeof stateSince !== "string") return null;
  if (typeof alive !== "boolean") return null;
  if (endedAt !== null && typeof endedAt !== "string") return null;

  const attention = rawAttention === null ? null : parseAttention(rawAttention);
  if (rawAttention !== null && attention === null) return null;

  const failure = rawFailure === null ? null : parseFailure(rawFailure);
  if (rawFailure !== null && failure === null) return null;

  if (typeof directory !== "string") return null;

  const repo = rawRepo === null ? null : parseRepoInfo(rawRepo);
  if (rawRepo !== null && repo === null) return null;

  const model = rawModel === null ? null : parseModelInfo(rawModel);
  if (rawModel !== null && model === null) return null;

  const permissionMode = parsePermissionModeInfo(value["permissionMode"]);
  if (!permissionMode) return null;

  const context = parseContext(value["context"]);
  if (!context) return null;

  if (lastActivity !== null && typeof lastActivity !== "string") return null;
  if (claudeSessionId !== null && typeof claudeSessionId !== "string") return null;
  if (typeof tmuxTarget !== "string") return null;
  if (typeof firstLaunchHere !== "boolean") return null;
  if (typeof createdAt !== "string") return null;

  return {
    id,
    title,
    state,
    stateSince,
    alive,
    endedAt,
    attention,
    failure,
    directory,
    repo,
    model,
    permissionMode,
    context,
    lastActivity,
    claudeSessionId,
    tmuxTarget,
    firstLaunchHere,
    createdAt,
  };
}

function parseSessions(value: unknown): Session[] | null {
  if (!Array.isArray(value)) return null;
  const sessions: Session[] = [];
  for (const item of value) {
    const session = parseSession(item);
    if (!session) return null;
    sessions.push(session);
  }
  return sessions;
}

function parseSnapshot(rec: Record<string, unknown>): Snapshot | null {
  const sessions = parseSessions(rec["sessions"]);
  const usage = parseUsage(rec["usage"]);
  const prefs = parsePrefs(rec["prefs"]);
  if (!sessions || !usage || !prefs) return null;
  return { type: "snapshot", sessions, usage, prefs };
}

function parseSessionUpsert(rec: Record<string, unknown>): SessionUpsert | null {
  const session = parseSession(rec["session"]);
  if (!session) return null;
  return { type: "sessionUpsert", session };
}

function parsePrefsMessage(rec: Record<string, unknown>): PrefsMessage | null {
  const prefs = parsePrefs(rec["prefs"]);
  if (!prefs) return null;
  return { type: "prefs", prefs };
}

/** Parses one WS text frame's decoded JSON. Unknown/malformed messages yield `null`. */
export function parseMessage(data: unknown): Message | null {
  if (!isRecord(data)) return null;
  const type = data["type"];
  switch (type) {
    case "hello":
      return parseHello(data);
    case "snapshot":
      return parseSnapshot(data);
    case "sessionUpsert":
      return parseSessionUpsert(data);
    case "prefs":
      return parsePrefsMessage(data);
    default:
      return null; // unknown message types are ignored (protocol §1)
  }
}

/** REQ-18: a `hello.protocolVersion` the client doesn't know triggers the mismatch view. */
export function isSupportedProtocolVersion(version: number): boolean {
  return version === PROTOCOL_VERSION;
}
