// The launch dialog's permission-mode fallback rule — pure UI logic, kept beside the
// other pure session logic in this directory (`web/src/sessions/CLAUDE.md`: "no DOM, no
// socket, no fetch"). The wire enum itself (`PermissionMode`/`PERMISSION_MODES`) lives in
// `protocol/session.ts` beside `PermissionModeInfo`, since it's the accepted values of one
// wire field, not a UI-only concept.
import { isPermissionMode, type PermissionMode } from "../protocol/session";

// The single decision point for "which radio should be checked for this stored value" —
// a stored mode this dialog has no radio for (a future Claude Code mode, `null`, or the
// empty string) falls back to `auto`, since Muster cannot read Claude Code's own
// configured default and auto is the least surprising guess. Pure and exported so it's
// unit-testable without a fake DOM; features/launch.ts's `setPermissionMode` and
// `selectedPermissionMode`, and features/launchrestore.ts's `repoRestore`, are its
// callers, all passing a `string | null` straight through — the function takes `null`
// directly, no caller-side coercion to `""` needed.
export function permissionModeToCheck(stored: string | null): PermissionMode {
  return isPermissionMode(stored) ? stored : "auto";
}
