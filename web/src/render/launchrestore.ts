// Pure decisions for the launch dialog's async open-time restore (REQ-5/REQ-6,
// plan new-session-improvement, W5/W6), used only by features/launch.ts — same
// relationship as this directory's `crumbs.ts` and `focusrestore.ts` to their one
// caller: a pure decision split out of a controller lives here, not in features/,
// which holds controllers only.
import { permissionModeToCheck, type PermissionMode, type Repo } from "../api";

/** The one fallback a repo has no stored model to restore — also `resetForm`'s brand-new-
 * form default (features/launch.ts), so "sonnet" is written in exactly one place. */
export const DEFAULT_MODEL = "sonnet";

/** Which fields the user has changed since the dialog opened. Set by features/launch.ts
 * on a real `change`/`input` DOM event only — a programmatic `setModel`/`setPermissionMode`
 * call (the reset, or this module's own restore) never dispatches one, so this tracks user
 * intent only. */
export interface Touched {
  model: boolean;
  mode: boolean;
}

/** The field(s) the initial restore should apply. A key is present only when its field is
 * untouched (REQ-6a) — the caller applies whichever keys exist and leaves the rest of the
 * form as the user left it. */
export interface Restore {
  model?: string;
  mode?: PermissionMode;
}

/** A repo's restore values, unfiltered by `touched` — the one owner of "what would this
 * repo's directory restore to". A clicked Recent (features/launch.ts) always applies
 * both; `initialRestore` below applies whichever survives the touched filter. */
export function repoRestore(repo: Repo): { model: string; mode: PermissionMode } {
  return {
    model: repo.lastModel ?? DEFAULT_MODEL,
    mode: permissionModeToCheck(repo.lastPermissionMode),
  };
}

/** REQ-6a: restores only the fields the user has not touched since the dialog opened. */
export function initialRestore(touched: Touched, repo: Repo): Restore {
  const values = repoRestore(repo);
  const restore: Restore = {};
  if (!touched.model) restore.model = values.model;
  if (!touched.mode) restore.mode = values.mode;
  return restore;
}
