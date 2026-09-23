// Wire types and parser for `UpdateInfo` and its `update` broadcast (docs/protocol.md,
// kb:anchor/ws.update) — one of the protocol/ concept modules split
// out of the former protocol.ts (plan maintainability-cleanup W3).

import { isRecord } from "./decode";

// Plan auto-update (kb:anchor/ws.update): the daemon's startup classification of its own
// resolved executable path, constant for the daemon's life.
export const UPDATE_INSTALL_KINDS = ["installer", "dev", "homebrew", "unmanaged"] as const;
export type UpdateInstallKind = (typeof UPDATE_INSTALL_KINDS)[number];

// Plan auto-update (kb:anchor/ws.update): apply progress, broadcast on every phase change.
export const UPDATE_APPLY_PHASES = [
  "idle",
  "downloading",
  "verifying",
  "installing",
  "restarting",
  "failed",
  "done",
] as const;
export type UpdateApplyPhase = (typeof UPDATE_APPLY_PHASES)[number];

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

// Plan auto-update (kb:anchor/ws.update): sent on every change to any `update` field
// (check result, pref toggle, each apply phase, an out-of-band swap detection).
export interface UpdateMessage {
  type: "update";
  update: UpdateInfo;
}

function isUpdateInstallKind(value: unknown): value is UpdateInstallKind {
  return (UPDATE_INSTALL_KINDS as readonly unknown[]).includes(value);
}

function isUpdateApplyPhase(value: unknown): value is UpdateApplyPhase {
  return (UPDATE_APPLY_PHASES as readonly unknown[]).includes(value);
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
// Exported for api/update.ts's `checkForUpdate` (kb:anchor/update.check), which decodes the same
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

export function parseUpdateMessage(rec: Record<string, unknown>): UpdateMessage | null {
  const update = parseUpdateInfo(rec["update"]);
  if (!update) return null;
  return { type: "update", update };
}
