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

/** Plan usage-model-bar (docs/protocol.md §5.4): one model-scoped weekly window, as
 * musterd's own `GET /api/oauth/usage` poller reports it — a second usage source,
 * independent of the status-line buckets above. */
export interface ModelWindow {
  displayName: string;
  usedPct: number;
  resetsAt: string;
}

/** REQ-6: the three failure kinds a model-scoped poll can end in; `null` after a
 * successful fetch. */
export type ModelScopedError = "no-credentials" | "unauthorized" | "unreachable";

export interface Usage {
  fiveHour: UsageBucket | null;
  sevenDay: UsageBucket | null;
  // M3 addition (docs/protocol.md §5.4): the freshest sample's model, masthead-only.
  // Optional (not just nullable) so a pre-M3 wire payload that omits the key entirely
  // round-trips unchanged (additive evolution, protocol §1) — present-and-null still
  // means "no sample yet", same as the buckets.
  model?: SessionModelInfo | null;
  sampledAt: string | null;
  source: string;
  // Plan usage-model-bar additions (docs/protocol.md §5.4) — optional wire fields, same
  // "absent key round-trips as absent, not synthesized null" pattern as `model` above,
  // so a pre-plan daemon's payload (all four keys absent) round-trips unchanged. INV-1
  // (modelScopedAt null iff modelScoped null) is a daemon-side invariant only — a client
  // reads `usage.modelScoped ?? null` and `usage.modelScopedAt ?? null` uniformly.
  modelScoped?: ModelWindow[] | null;
  modelScopedAt?: string | null;
  modelScopedError?: ModelScopedError | null;
  modelScopedSource?: string;
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
// daemon's default before any PUT is {"view":"focus","density":"2x2","usageModel":"Fable"}
// — so all three fields are required here, matching every real `snapshot`/`prefs` payload
// on the wire. `usageModel` was added by plan usage-model-bar; `parsePrefs` below defaults
// a missing key to `"Fable"` so a pre-plan daemon's payload still parses.
export interface Prefs {
  view: "focus" | "tiles";
  density: Density;
  usageModel: string;
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

// M3 (docs/protocol.md §5.4): broadcast whenever a routed status post's bucket values or
// model changed — a bare `sampledAt` advance produces no broadcast (server-side dedup).
export interface UsageMessage {
  type: "usage";
  usage: Usage;
}

// M4 (docs/protocol.md §5.5, plan m4-reconcile REQ-15): sent once per `DELETE
// /api/sessions/{id}` — a client that has never seen `id` ignores it (main.ts's remove
// handler is a no-op on an unknown id, same tolerance as every other broadcast here).
export interface SessionRemoved {
  type: "sessionRemoved";
  id: number;
}

export type Message = Hello | Snapshot | SessionUpsert | PrefsMessage | UsageMessage | SessionRemoved;

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

function parseModelWindow(value: unknown): ModelWindow | null {
  if (!isRecord(value)) return null;
  const displayName = value["displayName"];
  const usedPct = value["usedPct"];
  const resetsAt = value["resetsAt"];
  if (typeof displayName !== "string") return null;
  if (typeof usedPct !== "number") return null;
  if (typeof resetsAt !== "string") return null;
  return { displayName, usedPct, resetsAt };
}

function parseModelScopedList(value: unknown): ModelWindow[] | null {
  if (!Array.isArray(value)) return null;
  const windows: ModelWindow[] = [];
  for (const item of value) {
    const window = parseModelWindow(item);
    if (!window) return null;
    windows.push(window);
  }
  return windows;
}

function isModelScopedError(value: unknown): value is ModelScopedError {
  return value === "no-credentials" || value === "unauthorized" || value === "unreachable";
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

  const usage: Usage = { fiveHour, sevenDay, sampledAt, source };
  // `model` (M3) is read only when the key is actually present on the wire — an absent
  // key stays absent on the parsed object (additive evolution, protocol §1), so an M0–M2
  // payload with no `model` key round-trips byte-for-byte rather than gaining a
  // synthesized `model: null`.
  if ("model" in value) {
    const rawModel = value["model"];
    const model = rawModel === null ? null : parseModelInfo(rawModel);
    if (rawModel !== null && model === null) return null;
    usage.model = model;
  }
  // Plan usage-model-bar (docs/protocol.md §5.4): same present-only pattern as `model`
  // above — each of the four new fields is read only when its key is on the wire, and a
  // malformed value (wrong type, an unrecognized `modelScopedError` string, a malformed
  // `modelScoped` element) rejects the whole message rather than silently degrading to
  // "unknown" (W5).
  if ("modelScoped" in value) {
    const rawModelScoped = value["modelScoped"];
    const modelScoped = rawModelScoped === null ? null : parseModelScopedList(rawModelScoped);
    if (rawModelScoped !== null && modelScoped === null) return null;
    usage.modelScoped = modelScoped;
  }
  if ("modelScopedAt" in value) {
    const rawModelScopedAt = value["modelScopedAt"];
    if (rawModelScopedAt !== null && typeof rawModelScopedAt !== "string") return null;
    usage.modelScopedAt = rawModelScopedAt;
  }
  if ("modelScopedError" in value) {
    const rawModelScopedError = value["modelScopedError"];
    if (rawModelScopedError !== null && !isModelScopedError(rawModelScopedError)) return null;
    usage.modelScopedError = rawModelScopedError;
  }
  if ("modelScopedSource" in value) {
    const rawModelScopedSource = value["modelScopedSource"];
    if (typeof rawModelScopedSource !== "string") return null;
    usage.modelScopedSource = rawModelScopedSource;
  }
  return usage;
}

function parsePrefs(value: unknown): Prefs | null {
  if (!isRecord(value)) return null;
  const view = value["view"];
  const density = value["density"];
  if (view !== "focus" && view !== "tiles") return null;
  if (density !== "2x2" && density !== "3x2") return null;
  // Plan usage-model-bar: missing key (pre-plan daemon) defaults to the daemon's own
  // documented default, "Fable" (docs/protocol.md §5.5).
  const rawUsageModel = value["usageModel"];
  const usageModel = rawUsageModel === undefined ? "Fable" : rawUsageModel;
  if (typeof usageModel !== "string") return null;
  return { view, density, usageModel };
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

function parseUsageMessage(rec: Record<string, unknown>): UsageMessage | null {
  const usage = parseUsage(rec["usage"]);
  if (!usage) return null;
  return { type: "usage", usage };
}

function parseSessionRemoved(rec: Record<string, unknown>): SessionRemoved | null {
  const id = rec["id"];
  if (typeof id !== "number") return null;
  return { type: "sessionRemoved", id };
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
    case "usage":
      return parseUsageMessage(data);
    case "sessionRemoved":
      return parseSessionRemoved(data);
    default:
      return null; // unknown message types are ignored (protocol §1)
  }
}

/** REQ-18: a `hello.protocolVersion` the client doesn't know triggers the mismatch view. */
export function isSupportedProtocolVersion(version: number): boolean {
  return version === PROTOCOL_VERSION;
}
