// Message types and parser for the daemon->UI WebSocket protocol (docs/protocol.md, protocol
// version 2 as of plan version-claude-interface, 2026-09-10).
//
// M0 only ever sends `hello` and `snapshot` (docs/history/protocol-changelog.md). Unknown message
// types and unknown fields are ignored per kb:anchor/conventions's "additive evolution" rule —
// parsing here only ever reads the fields it knows about, so future additions never
// need a change here to keep working.

export const PROTOCOL_VERSION = 2;

// Plan version-claude-interface (kb:anchor/ws.hello, protocol 2): the daemon's startup
// classification of the installed Claude Code against the canary-verified range —
// replaces the M0-era {pinned, installed, drift} pin/drift shape.
export type ClaudeCodeStatus = "unknown" | "below" | "verified" | "above";

export interface ClaudeCodeInfo {
  installed: string | null;
  floor: string;
  verified: string;
  status: ClaudeCodeStatus;
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

/** Plan usage-model-bar (kb:anchor/ws.usage): one model-scoped weekly window, as
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
  // M3 addition (kb:anchor/ws.usage): the freshest sample's model, masthead-only.
  // Optional (not just nullable) so a pre-M3 wire payload that omits the key entirely
  // round-trips unchanged (additive evolution, kb:anchor/conventions) — present-and-null still
  // means "no sample yet", same as the buckets.
  model?: SessionModelInfo | null;
  sampledAt: string | null;
  source: string;
  // Plan usage-model-bar additions (kb:anchor/ws.usage) — optional wire fields, same
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

// Full shape per kb:anchor/ws.session (M1: the state machine now produces non-empty
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
  // M1 addition (kb:anchor/ws.session): true iff the launch created this directory's repo row —
  // drives the trust-prompt vs. no-signal honesty note client-side (REQ-17).
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

// Plan order-sidebar (kb:anchor/prefs.put): the rail's sort mode pref.
export type RailSort = "manual" | "attention";

export type Density = "2x2" | "3x2";

// Plan rail-card-improvements (kb:anchor/prefs.put): the rail/strip card density pref.
export type RailDensity = "compact" | "comfortable" | "expanded";

// Plan rail-card-improvements (kb:anchor/prefs.put): which text a card's activity line
// shows — turn-aware by default (REQ-14/kb:adr/rail-activity-line-turn-aware-default-with-pref).
export type RailActivity = "turn" | "prompt" | "reply" | "both";

// M2 (kb:anchor/prefs.put refinement): density is always present alongside view — the
// daemon's default before any PUT is {"view":"focus","density":"2x2","usageModel":"Fable"}
// — so all three fields are required here, matching every real `snapshot`/`prefs` payload
// on the wire. `usageModel` was added by plan usage-model-bar; `parsePrefs` below defaults
// a missing key to `"Fable"` so a pre-plan daemon's payload still parses.
export interface Prefs {
  view: "focus" | "tiles";
  density: Density;
  usageModel: string;
  // Plan order-sidebar (kb:anchor/prefs.put): defaulted to "manual" client-side when
  // the key is absent (same "pre-plan daemon" tolerance as `usageModel`).
  railSort: RailSort;
  // Plan new-ui-design-colors (kb:anchor/prefs.put, REQ-19): opaque to the daemon
  // beyond its pattern — the client owns the theme registry (theme.ts). Missing key
  // (pre-plan daemon) defaults to "follow", same tolerance as usageModel/railSort.
  theme: string;
  // Plan auto-update (kb:anchor/prefs.put / kb:anchor/ws.prefs): governs checking only - the binary
  // never changes without an explicit apply. Missing key (pre-plan daemon) defaults to
  // true (the daemon's own documented default), same tolerance as the other prefs above.
  updateCheck: boolean;
  // Plan rail-card-improvements (kb:anchor/prefs.put): card density in the rail and the
  // Tiles strip. Missing key (pre-plan daemon) defaults to "comfortable", same tolerance
  // as the other prefs above.
  railDensity: RailDensity;
  // Plan rail-card-improvements (kb:anchor/prefs.put): which text a card's activity line
  // shows. Missing key (pre-plan daemon) defaults to "turn", same tolerance as above.
  railActivity: RailActivity;
}

// Plan auto-update (kb:anchor/ws.update): the daemon's startup classification of its own
// resolved executable path, constant for the daemon's life.
export type UpdateInstallKind = "installer" | "dev" | "homebrew" | "unmanaged";

// Plan auto-update (kb:anchor/ws.update): apply progress, broadcast on every phase change.
export type UpdateApplyPhase =
  | "idle"
  | "downloading"
  | "verifying"
  | "installing"
  | "restarting"
  | "failed"
  | "done";

export interface UpdateApply {
  phase: UpdateApplyPhase;
  // string|null - the release being/last applied; null iff phase is "idle" (INV-4).
  version: string | null;
  // string|null - message plus remedy sentence; non-null iff phase is "failed" (INV-4).
  error: string | null;
}

// Plan auto-update (kb:anchor/ws.update): the daemon's current view of its own update
// state, always present on `snapshot` and re-sent on every field change as a bare `update`
// message. `running` duplicates `hello.daemon.version` deliberately - render/update.ts's
// buildUpdateViewModel renders the Settings dialog from this one object.
export interface UpdateInfo {
  running: string;
  install: UpdateInstallKind;
  remedy: string | null;
  // Plan rail-card-improvements-2 (kb:anchor/ws.update): true iff a release check is
  // possible at all — `-update-base-url` is non-empty and the install kind is not "dev".
  // Constant for the daemon's life and independent of `prefs.updateCheck`, which governs
  // only the automatic schedule. False means POST /api/update/check returns 404.
  canCheck: boolean;
  available: string | null;
  checkedAt: string | null;
  installed: string | null;
  apply: UpdateApply;
}

// Plan new-ui-design-colors (kb:anchor/ws.snapshot / kb:anchor/ws.claude-theme): the daemon's latest read of
// Claude Code's own theme setting, folded to a family. Always present on every
// snapshot/GET /api/state — "unknown" while polling is disabled or nothing has been
// read yet.
export type ClaudeFamily = "light" | "dark" | "unknown";

export interface ClaudeThemeInfo {
  family: ClaudeFamily;
}

export interface Snapshot {
  type: "snapshot";
  sessions: Session[];
  usage: Usage;
  prefs: Prefs;
  claudeTheme: ClaudeThemeInfo;
  // Plan auto-update (kb:anchor/ws.snapshot): always present on a post-plan daemon; a
  // pre-plan daemon's payload (no `update` key at all) parses this as null rather than
  // rejecting the snapshot (edge case 32) - same additive-evolution tolerance as
  // `claudeTheme` before it.
  update: UpdateInfo | null;
  // Plan terminal-fixes-cleanup (kb:anchor/ws.shell-activity): session ids whose shell is
  // busy right now — lets a reconnecting dashboard re-sync the activity indicator without
  // waiting for a `shellActivity` transition (W9). Present-only, same tolerance as
  // `usage.model`/`modelScoped` (kb:anchor/conventions's additive evolution): an absent
  // wire key stays absent on the parsed object rather than gaining a synthesized `[]`, so
  // a pre-plan payload round-trips unchanged. Real callers read `snapshot.shellsBusy ??
  // []`, same as every other present-only field's read site.
  shellsBusy?: number[];
}

export interface SessionUpsert {
  type: "sessionUpsert";
  session: Session;
}

// M2 (kb:anchor/ws.prefs): full-object echo of every accepted `PUT /api/prefs`,
// broadcast to every connected UI socket (INV-4).
export interface PrefsMessage {
  type: "prefs";
  prefs: Prefs;
}

// M3 (kb:anchor/ws.usage): broadcast whenever a routed status post's bucket values or
// model changed — a bare `sampledAt` advance produces no broadcast (server-side dedup).
export interface UsageMessage {
  type: "usage";
  usage: Usage;
}

// M4 (kb:anchor/ws.session-removed, plan m4-reconcile REQ-15): sent once per `DELETE
// /api/sessions/{id}` — a client that has never seen `id` ignores it (features/actions.ts's
// `handleRemoved` is a no-op on an unknown id, same tolerance as every other broadcast here).
export interface SessionRemoved {
  type: "sessionRemoved";
  id: number;
}

// Plan new-ui-design-colors (kb:anchor/ws.claude-theme): sent only when the polled family
// differs from the previously broadcast one — never per tick. Note the flat shape
// (`family` a top-level key, not nested under `claudeTheme` like the snapshot field).
export interface ClaudeThemeMessage {
  type: "claudeTheme";
  family: ClaudeFamily;
}

// Plan auto-update (kb:anchor/ws.update): sent on every change to any `update` field
// (check result, pref toggle, each apply phase, an out-of-band swap detection).
export interface UpdateMessage {
  type: "update";
  update: UpdateInfo;
}

// Plan markdown-viewing (kb:anchor/ws.doc-changed): sent once per routed PostToolUse
// Write/Edit/MultiEdit naming a `.md` under the session's directory or its plan path
// (REQ-18). Best-effort like the hooks it mirrors — a client never depends on receiving
// one; a missed write just leaves the file labelled stale by its freshness cue instead.
export interface DocChanged {
  type: "docChanged";
  id: number;
  path: string;
  at: string;
}

// Plan terminal-fixes-cleanup (kb:anchor/ws.shell-activity): broadcast on every observed
// change of a shell's busy flag (the ~1s tmux poller — Protocol Contract). Deliberately
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClaudeCodeStatus(value: unknown): value is ClaudeCodeStatus {
  return value === "unknown" || value === "below" || value === "verified" || value === "above";
}

function parseClaudeCode(value: unknown): ClaudeCodeInfo | null {
  if (!isRecord(value)) return null;
  const installed = value["installed"];
  const floor = value["floor"];
  const verified = value["verified"];
  const status = value["status"];
  if (installed !== null && typeof installed !== "string") return null;
  if (typeof floor !== "string") return null;
  if (typeof verified !== "string") return null;
  if (!isClaudeCodeStatus(status)) return null;
  return { installed, floor, verified, status };
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

/** Scores 33 on cognitive complexity, all of it flat guards plus the one-level
 * `if ("key" in value)` blocks that implement present-only additive evolution
 * (kb:anchor/conventions). Each block carries the comment explaining why an absent key
 * must stay absent rather than become `null`; splitting the function strands those
 * comments away from the fields they govern. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: flat guards plus present-only key blocks whose comments must stay with their fields
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
  // key stays absent on the parsed object (additive evolution, kb:anchor/conventions), so an M0–M2
  // payload with no `model` key round-trips byte-for-byte rather than gaining a
  // synthesized `model: null`.
  if ("model" in value) {
    const rawModel = value["model"];
    const model = rawModel === null ? null : parseModelInfo(rawModel);
    if (rawModel !== null && model === null) return null;
    usage.model = model;
  }
  // Plan usage-model-bar (kb:anchor/ws.usage): same present-only pattern as `model`
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

function isRailSort(value: unknown): value is RailSort {
  return value === "manual" || value === "attention";
}

function isRailDensity(value: unknown): value is RailDensity {
  return value === "compact" || value === "comfortable" || value === "expanded";
}

function isRailActivity(value: unknown): value is RailActivity {
  return value === "turn" || value === "prompt" || value === "reply" || value === "both";
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/** Reads one prefs field that has a fixed default for a missing key and a guard for a
 * present one — every field below `view`/`density` (which have no default; a pre-plan
 * daemon always sends them) shares this exact "missing key defaults, present-but-wrong-shape
 * rejects the whole object" shape. Extracted so `parsePrefs` states each field once,
 * under Biome's complexity ceiling, rather than repeating a ternary-then-guard pair per
 * field inline. */
function parsePrefsField<T>(raw: unknown, fallback: T, guard: (v: unknown) => v is T): T | null {
  const v = raw === undefined ? fallback : raw;
  return guard(v) ? v : null;
}

function parsePrefs(value: unknown): Prefs | null {
  if (!isRecord(value)) return null;
  const view = value["view"];
  const density = value["density"];
  if (view !== "focus" && view !== "tiles") return null;
  if (density !== "2x2" && density !== "3x2") return null;
  // Plan usage-model-bar: missing key (pre-plan daemon) defaults to the daemon's own
  // documented default, "Fable" (kb:anchor/ws.prefs).
  const usageModel = parsePrefsField(value["usageModel"], "Fable", isString);
  if (usageModel === null) return null;
  // Plan order-sidebar: missing key (pre-plan daemon) defaults to "manual" (docs/
  // kb:anchor/prefs.put's documented default).
  const railSort = parsePrefsField(value["railSort"], "manual", isRailSort);
  if (railSort === null) return null;
  // Plan new-ui-design-colors (REQ-19): missing key (pre-plan daemon) defaults to
  // "follow" (kb:anchor/prefs.put's documented default) — the daemon treats the
  // string as opaque beyond its pattern, so no further validation happens client-side.
  const theme = parsePrefsField(value["theme"], "follow", isString);
  if (theme === null) return null;
  // Plan auto-update: missing key (pre-plan daemon) defaults to true
  // (kb:anchor/prefs.put's documented default), same tolerance as usageModel/railSort/theme above.
  const updateCheck = parsePrefsField(value["updateCheck"], true, isBoolean);
  if (updateCheck === null) return null;
  // Plan rail-card-improvements: missing key (pre-plan daemon) defaults to "comfortable"
  // (kb:anchor/prefs.put's documented default). A *stored* value outside the enum is the
  // daemon's problem, not the wire's — it falls back to "comfortable" server-side (D13's
  // silent fallback) before it is ever sent. If an out-of-enum railDensity somehow reaches
  // the client anyway, parsePrefsField's guard fails and parsePrefs rejects the whole
  // prefs object (protocol.test.ts's "rejects a railDensity value outside the
  // compact|comfortable|expanded enum").
  const railDensity = parsePrefsField(value["railDensity"], "comfortable", isRailDensity);
  if (railDensity === null) return null;
  // Plan rail-card-improvements: missing key (pre-plan daemon) defaults to "turn"
  // (kb:anchor/prefs.put's documented default), same tolerance as railDensity above.
  const railActivity = parsePrefsField(value["railActivity"], "turn", isRailActivity);
  if (railActivity === null) return null;
  return {
    view,
    density,
    usageModel,
    railSort,
    theme,
    updateCheck,
    railDensity,
    railActivity,
  };
}

function isUpdateInstallKind(value: unknown): value is UpdateInstallKind {
  return value === "installer" || value === "dev" || value === "homebrew" || value === "unmanaged";
}

function isUpdateApplyPhase(value: unknown): value is UpdateApplyPhase {
  return (
    value === "idle" ||
    value === "downloading" ||
    value === "verifying" ||
    value === "installing" ||
    value === "restarting" ||
    value === "failed" ||
    value === "done"
  );
}

function parseUpdateApply(value: unknown): UpdateApply | null {
  if (!isRecord(value)) return null;
  const phase = value["phase"];
  const version = value["version"];
  const error = value["error"];
  if (!isUpdateApplyPhase(phase)) return null;
  if (version !== null && typeof version !== "string") return null;
  if (error !== null && typeof error !== "string") return null;
  return { phase, version, error };
}

/** Plan auto-update (kb:anchor/ws.update). Every field is read-checked; a malformed
 * value anywhere rejects the whole object rather than degrading it to a partial "unknown"
 * shape (same discipline as parseSession). */
// Exported for api.ts's `checkForUpdate` (kb:anchor/update.check), which decodes the same
// shape from a POST response instead of a WS broadcast.
export function parseUpdateInfo(value: unknown): UpdateInfo | null {
  if (!isRecord(value)) return null;
  const running = value["running"];
  const install = value["install"];
  const remedy = value["remedy"];
  const canCheck = value["canCheck"];
  const available = value["available"];
  const checkedAt = value["checkedAt"];
  const installed = value["installed"];
  if (typeof running !== "string") return null;
  if (!isUpdateInstallKind(install)) return null;
  if (remedy !== null && typeof remedy !== "string") return null;
  if (typeof canCheck !== "boolean") return null;
  if (available !== null && typeof available !== "string") return null;
  if (checkedAt !== null && typeof checkedAt !== "string") return null;
  if (installed !== null && typeof installed !== "string") return null;
  const apply = parseUpdateApply(value["apply"]);
  if (!apply) return null;
  return { running, install, remedy, canCheck, available, checkedAt, installed, apply };
}

function isClaudeFamily(value: unknown): value is ClaudeFamily {
  return value === "light" || value === "dark" || value === "unknown";
}

function parseClaudeThemeInfo(value: unknown): ClaudeThemeInfo | null {
  if (!isRecord(value)) return null;
  const family = value["family"];
  if (!isClaudeFamily(family)) return null;
  return { family };
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
  if (typeof pinned !== "boolean") return null;
  if (typeof railPos !== "number") return null;
  if (titleOverride !== null && typeof titleOverride !== "string") return null;

  const plan = rawPlan === null ? null : parseSessionPlan(rawPlan);
  if (rawPlan !== null && plan === null) return null;

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

function parseShellsBusy(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids: number[] = [];
  for (const item of value) {
    if (typeof item !== "number") return null;
    ids.push(item);
  }
  return ids;
}

function parseSnapshot(rec: Record<string, unknown>): Snapshot | null {
  const sessions = parseSessions(rec["sessions"]);
  const usage = parseUsage(rec["usage"]);
  const prefs = parsePrefs(rec["prefs"]);
  // Plan new-ui-design-colors (REQ-19): missing key (pre-plan daemon) defaults to
  // {family: "unknown"}, same pre-plan-daemon tolerance as prefs.theme above.
  const rawClaudeTheme = rec["claudeTheme"];
  const claudeTheme: ClaudeThemeInfo | null =
    rawClaudeTheme === undefined ? { family: "unknown" } : parseClaudeThemeInfo(rawClaudeTheme);
  if (!sessions || !usage || !prefs || !claudeTheme) return null;
  // Plan auto-update: missing key (pre-plan daemon) parses as null (edge case 32); a
  // present-but-malformed value rejects the whole snapshot, same discipline as claudeTheme.
  const rawUpdate = rec["update"];
  let update: UpdateInfo | null = null;
  if (rawUpdate !== undefined) {
    update = parseUpdateInfo(rawUpdate);
    if (!update) return null;
  }
  const snapshot: Snapshot = { type: "snapshot", sessions, usage, prefs, claudeTheme, update };
  // Plan terminal-fixes-cleanup: present-only, same pattern as `usage.model` above — an
  // absent key stays absent on the parsed object rather than gaining a synthesized `[]`,
  // so a pre-plan payload (and every existing snapshot fixture that predates this field)
  // round-trips unchanged. Real callers read `snapshot.shellsBusy ?? []`
  // (`features/surfaces.ts`), same as every other present-only field's read site.
  if ("shellsBusy" in rec) {
    const shellsBusy = parseShellsBusy(rec["shellsBusy"]);
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

function parseClaudeThemeMessage(rec: Record<string, unknown>): ClaudeThemeMessage | null {
  const family = rec["family"];
  if (!isClaudeFamily(family)) return null;
  return { type: "claudeTheme", family };
}

function parseUpdateMessage(rec: Record<string, unknown>): UpdateMessage | null {
  const update = parseUpdateInfo(rec["update"]);
  if (!update) return null;
  return { type: "update", update };
}

/** Plan markdown-viewing (kb:anchor/ws.doc-changed). */
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

/** REQ-18: a `hello.protocolVersion` the client doesn't know triggers the mismatch view. */
export function isSupportedProtocolVersion(version: number): boolean {
  return version === PROTOCOL_VERSION;
}
