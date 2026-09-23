// Wire type and parser for one `Session` (docs/protocol.md, kb:anchor/ws.session) — one of the protocol/
// concept modules split out of the former protocol.ts (plan maintainability-cleanup W3).

import { isRecord, parseNullable } from "./decode";

export const SESSION_STATES = [
  "started",
  "planning",
  "working",
  "needs_input",
  "failed",
  "idle",
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

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

// Plan markdown-viewing (kb:anchor/ws.session): the plan the transcript scan derived.
// `null` until a transcript of this session has named a plan (never entered plan mode);
// once non-null it is never null again for the row's lifetime — a scan that finds no plan
// (a `/clear`'s fresh transcript, a deleted transcript) keeps the path and re-checks
// `exists`, and only a scan that names a plan replaces it (kb:adr/reader-plan-sticky-once-named).
// `exists: false` means the path is known but no file is there: plan mode entered with
// nothing written yet, or the file was since deleted.
export interface SessionPlan {
  path: string;
  exists: boolean;
}

// Full shape per kb:anchor/ws.session; parseSession below validates every field rather
// than trusting the daemon.
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
  // kb:anchor/ws.session: true iff the launch created this directory's repo row —
  // drives the trust-prompt vs. no-signal honesty note client-side.
  firstLaunchHere: boolean;
  createdAt: string;
  // Plan order-sidebar (kb:anchor/ws.session): the rail's user-owned order. Required on every
  // wire Session (never null, both fields ship together) — unlike `model`/`usageModel`'s
  // "absent key defaults" pattern, there is no pre-plan daemon to tolerate here (the
  // daemon and client ship together for this plan), so parseSession below rejects a
  // session missing either field rather than defaulting it.
  pinned: boolean;
  railPos: number;
  // Plan ui-text-and-focus (kb:anchor/ws.session): the user's rename via `PUT
  // /api/sessions/{id}/title`; `null` means no override. `title` above is already the
  // daemon's precedence-resolved DISPLAY title (titleOverride when non-null, else
  // Claude's last-known name) — a client renders `title` and reads this field only to
  // decide whether "clear" means anything (sessions/rename.ts's `titleCommand`).
  // Required on every wire Session, same "no pre-plan daemon to tolerate" reasoning as
  // pinned/railPos above (ship together).
  titleOverride: string | null;
  // Plan markdown-viewing REQ-17 (kb:anchor/ws.session): additive, no protocol bump
  // (kb:adr/connection-protocol-bumps-only-on-shape-change) — but required on every wire
  // Session all the same, same "daemon and client ship together" reasoning as
  // pinned/railPos/titleOverride above, since there is no pre-plan daemon this build
  // needs to keep parsing.
  plan: SessionPlan | null;
  // Plan rail-card-improvements (kb:anchor/ws.session, REQ-7): true iff the turn closed
  // while no terminal client was attached to this session on either surface and nobody
  // has attached since. INV: unread ⇒ state == "idle". Required on every wire Session,
  // same "daemon and client ship together" reasoning as pinned/railPos/titleOverride/plan
  // above — no pre-plan daemon to tolerate here.
  unread: boolean;
  // Plan rail-card-improvements (kb:anchor/ws.session, REQ-12): the user's most recent
  // prompt, truncated to 200 chars; `null` until a first prompt and again after `/clear`.
  // Display-only — never logged (INV-6). Same "ship together" reasoning as `unread` above.
  lastPrompt: string | null;
}

function isSessionState(value: unknown): value is SessionState {
  return (SESSION_STATES as readonly unknown[]).includes(value);
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

// Exported: usage.ts's `parseUsage` decodes the same shape for `Usage.model`
// (kb:anchor/ws.usage) rather than keeping its own copy.
export function parseModelInfo(value: unknown): SessionModelInfo | null {
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

function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

// Exported: messages.ts's `parseSnapshot` uses this for `shellsBusy` (a list of session
// ids), the same "unknown -> number | null" adapter `parseContext` below needs for its
// three nullable numeric fields.
export function asNumber(value: unknown): number | null {
  return isNumber(value) ? value : null;
}

function parseContext(value: unknown): SessionContext | null {
  if (!isRecord(value)) return null;
  const usedPct = parseNullable(value["usedPct"], asNumber);
  const totalInputTokens = parseNullable(value["totalInputTokens"], asNumber);
  const windowSize = parseNullable(value["windowSize"], asNumber);
  const compactions = value["compactions"];
  if (usedPct === undefined || totalInputTokens === undefined || windowSize === undefined)
    return null;
  if (typeof compactions !== "number") return null;
  return { usedPct, totalInputTokens, windowSize, compactions };
}

function parseSessionPlan(value: unknown): SessionPlan | null {
  if (!isRecord(value)) return null;
  const path = value["path"];
  const exists = value["exists"];
  if (typeof path !== "string") return null;
  if (typeof exists !== "boolean") return null;
  return { path, exists };
}

/** Validates one Session object per kb:anchor/ws.session. Every field is read-checked;
 * an unrecognized field name or type anywhere in the object rejects the whole session
 * (the caller drops the snapshot/upsert rather than render a half-formed card).
 *
 * Scores 41 on cognitive complexity (plan rail-card-improvements added `unread`/
 * `lastPrompt`'s two guards), but every point is a flat `return null` guard at zero
 * nesting — the score tracks the wire object's field count, not any tangle. Splitting
 * it would scatter the "any bad field rejects the whole session" invariant across
 * several functions, where no single reader or test sees it whole. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: flat per-field guards; a split strands the all-or-nothing invariant
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
  const pinned = value["pinned"];
  const railPos = value["railPos"];
  const titleOverride = value["titleOverride"];
  const rawPlan = value["plan"];
  const unread = value["unread"];
  const lastPrompt = value["lastPrompt"];

  if (typeof id !== "number") return null;
  if (title !== null && typeof title !== "string") return null;
  if (!isSessionState(state)) return null;
  if (typeof stateSince !== "string") return null;
  if (typeof alive !== "boolean") return null;
  if (endedAt !== null && typeof endedAt !== "string") return null;

  const attention = parseNullable(rawAttention, parseAttention);
  if (attention === undefined) return null;

  const failure = parseNullable(rawFailure, parseFailure);
  if (failure === undefined) return null;

  if (typeof directory !== "string") return null;

  const repo = parseNullable(rawRepo, parseRepoInfo);
  if (repo === undefined) return null;

  const model = parseNullable(rawModel, parseModelInfo);
  if (model === undefined) return null;

  const permissionMode = parsePermissionModeInfo(value["permissionMode"]);
  if (!permissionMode) return null;

  const context = parseContext(value["context"]);
  if (!context) return null;

  if (lastActivity !== null && typeof lastActivity !== "string") return null;
  if (claudeSessionId !== null && typeof claudeSessionId !== "string") return null;
  if (typeof tmuxTarget !== "string") return null;
  if (typeof firstLaunchHere !== "boolean") return null;
  if (typeof createdAt !== "string") return null;
  if (typeof pinned !== "boolean") return null;
  if (typeof railPos !== "number") return null;
  if (titleOverride !== null && typeof titleOverride !== "string") return null;

  const plan = parseNullable(rawPlan, parseSessionPlan);
  if (plan === undefined) return null;

  if (typeof unread !== "boolean") return null;
  if (lastPrompt !== null && typeof lastPrompt !== "string") return null;

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
    pinned,
    railPos,
    titleOverride,
    plan,
    unread,
    lastPrompt,
  };
}
