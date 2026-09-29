// The launch dialog's permission-mode fallback rule — pure UI logic, kept beside the
// other pure session logic in this directory (`web/src/sessions/CLAUDE.md`: "no DOM, no
// socket, no fetch"). The wire enum itself (`PermissionMode`/`PERMISSION_MODES`) lives in
// `protocol/session.ts` beside `PermissionModeInfo`, since it's the accepted values of one
// wire field, not a UI-only concept.
import { isPermissionMode, type PermissionMode } from "../protocol/session";

/** "Is this mode bypass?" — the one owner, shared by `permissionModeToCheck` and
 * `launchPrimaryFace` below, `features/launch.ts`'s bypass-warning visibility,
 * `sessions/card.ts`'s `bypassChip`, and `features/launchpastlist.ts`'s `pastRowView`, so
 * the five can never drift onto different literal comparisons. Takes the raw wire string
 * (or `null`, a past session's unrecorded mode) rather than `PermissionMode`, since two of
 * those five callers read a value that was never validated against `PERMISSION_MODES`. */
export function isBypassMode(value: string | null): boolean {
  return value === "bypassPermissions";
}

// The single decision point for "which radio should be checked for this stored value" —
// a stored mode this dialog has no radio for (a future Claude Code mode, `null`, or the
// empty string) falls back to `auto`, since Muster cannot read Claude Code's own
// configured default and auto is the least surprising guess. Pure and exported so it's
// unit-testable without a fake DOM; features/launchrestore.ts's `repoRestore` (via
// features/launch.ts's `setPermissionMode`) is its one caller — the currently-checked
// radio's own value (a live selection, not a restore) reads `isPermissionMode` directly
// instead (features/launch.ts's `selectedPermissionMode`), so a deliberately checked
// bypass radio is never coerced away by this function. Takes `null` directly, no
// caller-side coercion to `""` needed.
//
// kb:adr/launch-bypass-never-restored-as-default: a directory's remembered
// `bypassPermissions` is never restored — every restore path (dialog open, Recent click)
// checks `auto` instead, same fallback as an unrecognised mode.
export function permissionModeToCheck(stored: string | null): PermissionMode {
  if (isBypassMode(stored)) return "auto";
  return isPermissionMode(stored) ? stored : "auto";
}

export type LaunchTab = "new" | "resume";

export interface LaunchPrimaryFace {
  label: string;
  danger: boolean;
}

/** `#launch-button`'s face follows whichever tab is showing — the New tab's own
 * checked Start-in mode, or the Resume tab's selected row's last-known mode (`null` while
 * nothing is selected, which never happens to read as bypass). Bypass in either shape
 * gets the danger face (kb:adr/launch-bypass-offered-with-danger-guardrails) — exactly
 * one filled button in the dialog either way (design-system §3). */
export function launchPrimaryFace(
  tab: LaunchTab,
  mode: PermissionMode,
  selectedRowMode: string | null,
): LaunchPrimaryFace {
  if (tab === "resume") {
    const danger = isBypassMode(selectedRowMode);
    return { label: danger ? "Resume without checks" : "Resume", danger };
  }
  const danger = isBypassMode(mode);
  return { label: danger ? "Launch without checks" : "Launch", danger };
}
