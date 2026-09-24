// The `Snapshot` envelope, the remaining stand-alone WS message envelopes (a concept's own
// envelope — `UsageMessage`, `PrefsMessage`, `UpdateMessage`, `ClaudeThemeMessage` — lives
// beside that concept's parser instead), the `Message` union, and the one entry point
// (`parseMessage`) that dispatches a decoded WS frame to its parser (docs/protocol.md,
// protocol version 2) — one of the protocol/ concept modules, each owning one wire
// concept's type and parser; `decode.ts` holds the primitives every one of them shares.
//
// Unknown message types and unknown fields are ignored per kb:anchor/conventions's "additive
// evolution" rule — parsing here only ever reads the fields it knows about, so future
// additions never need a change here to keep working.

import { asNumber, isRecord, parseListOf } from "./decode";
import { type Hello, parseHello } from "./hello";
import { type Prefs, type PrefsMessage, parsePrefs, parsePrefsMessage } from "./prefs";
import { type Session, parseSession } from "./session";
import {
  type ClaudeThemeInfo,
  type ClaudeThemeMessage,
  parseClaudeThemeInfo,
  parseClaudeThemeMessage,
} from "./theme";
import { type UpdateInfo, type UpdateMessage, parseUpdateInfo, parseUpdateMessage } from "./update";
import { type Usage, type UsageMessage, parseUsage, parseUsageMessage } from "./usage";

export interface Snapshot {
  type: "snapshot";
  sessions: Session[];
  usage: Usage;
  prefs: Prefs;
  claudeTheme: ClaudeThemeInfo;
  // kb:anchor/ws.snapshot: always present once the daemon supports updates; an older
  // daemon's payload (no `update` key at all) parses this as null rather than
  // rejecting the snapshot - same additive-evolution tolerance as
  // `claudeTheme` before it.
  update: UpdateInfo | null;
  // kb:anchor/ws.shell-activity: session ids whose shell is
  // busy right now — lets a reconnecting dashboard re-sync the activity indicator without
  // waiting for a `shellActivity` transition. Present-only, same tolerance as
  // `usage.model`/`modelScoped` (kb:anchor/conventions's additive evolution): an absent
  // wire key stays absent on the parsed object rather than gaining a synthesized `[]`, so
  // an older daemon's payload round-trips unchanged. Real callers read `snapshot.shellsBusy ??
  // []`, same as every other present-only field's read site.
  shellsBusy?: number[];
}

export interface SessionUpsert {
  type: "sessionUpsert";
  session: Session;
}

// kb:anchor/ws.session-removed: sent once per `DELETE
// /api/sessions/{id}` — a client that has never seen `id` ignores it (features/actions.ts's
// `handleRemoved` is a no-op on an unknown id, same tolerance as every other broadcast here).
export interface SessionRemoved {
  type: "sessionRemoved";
  id: number;
}

// kb:anchor/ws.doc-changed: sent once per routed PostToolUse
// Write/Edit/MultiEdit naming a `.md` under the session's directory or its plan path.
// Best-effort like the hooks it mirrors — a client never depends on receiving
// one; a missed write just leaves the file labelled stale by its freshness cue instead.
export interface DocChanged {
  type: "docChanged";
  id: number;
  path: string;
  at: string;
}

// kb:anchor/ws.shell-activity: broadcast on every observed
// change of a shell's busy flag (the daemon's ~1s tmux poller). Deliberately
// not a Session field and adds no session state (kb:adr/surfaces-shell-is-attach-target-not-session) —
// a shell is still not a session.
export interface ShellActivityMessage {
  type: "shellActivity";
  sessionId: number;
  busy: boolean;
}

export type Message =
  | Hello
  | Snapshot
  | SessionUpsert
  | PrefsMessage
  | UsageMessage
  | SessionRemoved
  | ClaudeThemeMessage
  | DocChanged
  | UpdateMessage
  | ShellActivityMessage;

function parseSnapshot(rec: Record<string, unknown>): Snapshot | null {
  const sessions = parseListOf(rec["sessions"], parseSession);
  const usage = parseUsage(rec["usage"]);
  const prefs = parsePrefs(rec["prefs"]);
  // Missing key (an older daemon) defaults to
  // {family: "unknown"}, same tolerance as protocol/prefs.ts's `theme` field.
  const rawClaudeTheme = rec["claudeTheme"];
  const claudeTheme: ClaudeThemeInfo | null =
    rawClaudeTheme === undefined ? { family: "unknown" } : parseClaudeThemeInfo(rawClaudeTheme);
  if (!sessions || !usage || !prefs || !claudeTheme) return null;
  // Missing key (an older daemon) parses as null; a
  // present-but-malformed value rejects the whole snapshot, same discipline as claudeTheme.
  const rawUpdate = rec["update"];
  let update: UpdateInfo | null = null;
  if (rawUpdate !== undefined) {
    update = parseUpdateInfo(rawUpdate);
    if (!update) return null;
  }
  const snapshot: Snapshot = { type: "snapshot", sessions, usage, prefs, claudeTheme, update };
  // Present-only, same pattern as protocol/usage.ts's `model` field — an
  // absent key stays absent on the parsed object rather than gaining a synthesized `[]`,
  // so an older daemon's payload (and every existing snapshot fixture that predates this field)
  // round-trips unchanged. Real callers read `snapshot.shellsBusy ?? []`
  // (`features/surfaces.ts`), same as every other present-only field's read site.
  if ("shellsBusy" in rec) {
    const shellsBusy = parseListOf(rec["shellsBusy"], asNumber);
    if (!shellsBusy) return null;
    snapshot.shellsBusy = shellsBusy;
  }
  return snapshot;
}

function parseSessionUpsert(rec: Record<string, unknown>): SessionUpsert | null {
  const session = parseSession(rec["session"]);
  if (!session) return null;
  return { type: "sessionUpsert", session };
}

function parseSessionRemoved(rec: Record<string, unknown>): SessionRemoved | null {
  const id = rec["id"];
  if (typeof id !== "number") return null;
  return { type: "sessionRemoved", id };
}

/** kb:anchor/ws.doc-changed. */
export function parseDocChanged(rec: Record<string, unknown>): DocChanged | null {
  const id = rec["id"];
  const path = rec["path"];
  const at = rec["at"];
  if (typeof id !== "number") return null;
  if (typeof path !== "string") return null;
  if (typeof at !== "string") return null;
  return { type: "docChanged", id, path, at };
}

function parseShellActivityMessage(rec: Record<string, unknown>): ShellActivityMessage | null {
  const sessionId = rec["sessionId"];
  const busy = rec["busy"];
  if (typeof sessionId !== "number") return null;
  if (typeof busy !== "boolean") return null;
  return { type: "shellActivity", sessionId, busy };
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
    case "claudeTheme":
      return parseClaudeThemeMessage(data);
    case "update":
      return parseUpdateMessage(data);
    case "docChanged":
      return parseDocChanged(data);
    case "shellActivity":
      return parseShellActivityMessage(data);
    default:
      return null; // unknown message types are ignored (kb:anchor/conventions)
  }
}
