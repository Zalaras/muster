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

// Full shape per docs/protocol.md §5.3. M0's daemon only ever sends an empty `sessions`
// array (the state machine and its fields arrive in M1) — this type exists so
// `Snapshot.sessions` is correctly typed for M1 without a churn migration of this file.
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
  createdAt: string;
}

export interface Prefs {
  view: "focus" | "tiles";
}

export interface Snapshot {
  type: "snapshot";
  sessions: Session[];
  usage: Usage;
  prefs: Prefs;
}

export type Message = Hello | Snapshot;

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
  if (view !== "focus" && view !== "tiles") return null;
  return { view };
}

// M0's daemon only ever sends `sessions: []`. Deep per-field validation of the §5.3
// shape is M1 work (it lands with the state machine that actually produces non-empty
// arrays); trusting the daemon's shape here avoids dead validation code that nothing
// in M0 can exercise.
function parseSessions(value: unknown): Session[] | null {
  if (!Array.isArray(value)) return null;
  return value as Session[];
}

function parseSnapshot(rec: Record<string, unknown>): Snapshot | null {
  const sessions = parseSessions(rec["sessions"]);
  const usage = parseUsage(rec["usage"]);
  const prefs = parsePrefs(rec["prefs"]);
  if (!sessions || !usage || !prefs) return null;
  return { type: "snapshot", sessions, usage, prefs };
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
    default:
      return null; // unknown message types are ignored (protocol §1)
  }
}

/** REQ-18: a `hello.protocolVersion` the client doesn't know triggers the mismatch view. */
export function isSupportedProtocolVersion(version: number): boolean {
  return version === PROTOCOL_VERSION;
}
