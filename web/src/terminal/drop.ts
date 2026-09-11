// Pure drop-classification, escaping and notice-text logic for the terminal
// drag-and-drop feature (plan file-drop-fix). No DOM, no fetch — kept separate from
// terminal/pane.ts's DOM/socket wiring so it's Vitest-testable (docs/conventions.md:
// "keep logic in pure modules separate from DOM code").
import type { ApiErrorBody } from "../api";

/** REQ-4: Terminal.app-style path escaping — a backslash is prefixed to every space and
 * to every character in this set; everything else (including non-ASCII) passes through
 * unchanged. */
const ESCAPED_CHARS = new Set([
  " ",
  "\\",
  "!",
  '"',
  "#",
  "$",
  "&",
  "'",
  "(",
  ")",
  "*",
  ",",
  ";",
  "<",
  "=",
  ">",
  "?",
  "[",
  "]",
  "^",
  "`",
  "{",
  "|",
  "}",
  "~",
]);

export function escapePath(path: string): string {
  let out = "";
  for (const ch of path) {
    if (ESCAPED_CHARS.has(ch)) out += "\\";
    out += ch;
  }
  return out;
}

/** REQ-7: a file at or under this size may be uploaded; anything larger is rejected
 * client-side, before any request, and the daemon independently rejects it server-side
 * (kb:anchor/sessions.locate's `413 too_large`). */
export const MAX_DROP_BYTES = 50 * 1024 * 1024;

export type DropKind = "files" | "text" | "none";

/** REQ-2/REQ-10, edge case 15: files win whenever any are present, even alongside a
 * `text/plain` item (some drag sources attach both); text only when there are no files
 * but a `text/plain` item exists; otherwise this feature has nothing to do with the
 * drop (left for the document-level guard to swallow). */
export function classifyDrop(types: readonly string[], fileCount: number): DropKind {
  if (fileCount > 0) return "files";
  if (types.includes("text/plain")) return "text";
  return "none";
}

/** The outcomes `noticeForFailure` renders, per the plan's Testable UI Elements table. */
export type LocateFailure =
  | { kind: "not_located" }
  | { kind: "ambiguous"; count: number }
  | { kind: "too_large" }
  | { kind: "other" }
  | { kind: "not_connected" };

/** REQ-6: the in-flight notice — `name` is the dropped basename verbatim, trailing
 * Unicode ellipsis (U+2026). */
export function locatingText(name: string): string {
  return `Locating ${name}…`;
}

/** REQ-6 / Testable UI Elements: the exact failure notice text for each outcome — em dash
 * (U+2014) with spaces, matching the terminal overlay texts' glyph. `not_connected` names
 * no file (REQ-8's notice never mentions a filename), so `name` is ignored for it. */
export function noticeForFailure(name: string, failure: LocateFailure): string {
  switch (failure.kind) {
    case "not_located":
      return `Can't locate ${name} on disk — paste its path instead`;
    case "ambiguous":
      return `${name} matches ${failure.count} identical files — paste the path of the one you mean`;
    case "too_large":
      return `${name} is over 50 MiB — paste its path instead`;
    case "other":
      return `Couldn't resolve ${name} — paste its path instead`;
    case "not_connected":
      return "Pane isn't connected — nothing pasted";
  }
}

/** Maps a `POST /api/sessions/{id}/locate` failure (kb:anchor/sessions.locate) to the
 * `LocateFailure` kind whose notice text `noticeForFailure` should show. `ambiguous`
 * carries the daemon's own `paths` count (REQ-3); every other non-2xx (`400`, `500`,
 * `network_error`, or any code this client doesn't recognise) is `"other"`. Moved here
 * (web-tests fix attempt 1) from `terminal/pane.ts` so this pure `code -> kind` mapping
 * is Vitest-testable without a DOM/xterm/socket harness — same separation as
 * `terminal/overlay.ts`'s `overlayForCloseCode`. */
export function classifyApiFailure(error: ApiErrorBody): LocateFailure {
  switch (error.code) {
    case "not_located":
      return { kind: "not_located" };
    case "ambiguous":
      return { kind: "ambiguous", count: error.paths?.length ?? 0 };
    case "too_large":
      return { kind: "too_large" };
    default:
      return { kind: "other" };
  }
}
