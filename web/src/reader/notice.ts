// Pure reader status-line/docChanged derivation (plan general-cleanup REQ-6, REQ-8) —
// no DOM, no fetch; `features/reader.ts` is the only caller.
import type { ConnectionStatus } from "../app";
import { loadingText } from "./paths";

export const UNREACHABLE_TEXT = "musterd unreachable — showing last render";
/** Shared by two different "unknown" moments: `features/reader.ts`'s listing fetch
 * getting `unknown_session` back for a session id the URL did carry, and `doc.ts`'s own
 * `?session=` failing to parse into one at all — the same honest word either way. */
export const UNKNOWN_SESSION_TEXT = "unknown session";

/**
 * Status-line text precedence (originally W9, extended by REQ-8): a reader that has
 * never connected — a pop-out loaded while the daemon is down, or killed mid-load, before
 * any `hello` — reads `"connecting…"` (the masthead's own word, INV-POPOUT-CONNECTING),
 * never the unreachable text, which stays reserved for a *lost* connection
 * (`"reconnecting"`). Once connected, daemon-down (design-system §6.7, REQ-15) is moot and
 * the existing rules apply: a user-initiated open in flight names itself (REQ-8) once
 * something is actually on screen to grey out, while nothing has rendered yet the body's
 * own `loading…` placeholder is the cue instead (REQ-9), so the status line stays
 * whatever it already was; otherwise the last fetch's own outcome.
 */
export function deriveNotice(
  status: ConnectionStatus,
  loadingPath: string | null,
  bodyRendered: boolean,
  noticeText: string | null,
): string | null {
  if (status === "connecting") return "connecting…";
  if (status === "reconnecting") return UNREACHABLE_TEXT;
  if (loadingPath !== null && bodyRendered) return loadingText(loadingPath);
  return noticeText;
}

/** `docChanged` dispatch classification (REQ-6, markdown-render-fixes edge case 5): a
 * write to the currently open file gets a silent re-fetch; a write to anything else just
 * updates that file's tree dot. */
export function classifyDocChanged(
  openPath: string | null,
  changedPath: string,
): "refetch" | "dots" {
  return openPath !== null && openPath === changedPath ? "refetch" : "dots";
}
