// Permission-mode domain logic, moved out of the HTTP layer (review.maintainability.d-webcore.md
// Seed check B2: `api.ts` held `PERMISSION_MODES`/`permissionModeToCheck`, but neither one
// concerns "make a request" — they're the rules for a wire enum value, which belongs beside the
// other pure session logic in this directory (`web/src/sessions/CLAUDE.md`: "no DOM, no socket,
// no fetch"). `api/launch.ts`'s `LaunchRequest.permissionMode` field and every UI caller
// (features/launch.ts, render/launchrestore.ts) import from here instead.

// Plan fix-auto-mode-select (kb:anchor/sessions.create): the accepted wire values for
// permissionMode, in dialog/cycle order. `default` is Claude Code's manual mode (the UI
// labels it "manual"); one source for both the request union and features/launch.ts's
// radio guard, so they can't drift apart.
export const PERMISSION_MODES = ["default", "acceptEdits", "plan", "auto"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

// The single decision point for "which radio should be checked for this stored value" —
// a stored mode this dialog has no radio for (a future Claude Code mode, `null`, or the
// empty string) falls back to `auto`, since Muster cannot read Claude Code's own
// configured default (Out of scope) and auto is the least surprising guess. Pure and
// exported so it's unit-testable without a fake DOM; features/launch.ts's
// `setPermissionMode` and `selectedPermissionMode`, and render/launchrestore.ts's
// `repoRestore`, are its callers, all passing a `string | null` straight through — the
// function takes `null` directly, no caller-side coercion to `""` needed.
export function permissionModeToCheck(stored: string | null): PermissionMode {
  return (PERMISSION_MODES as readonly string[]).includes(stored ?? "")
    ? (stored as PermissionMode)
    : "auto";
}
