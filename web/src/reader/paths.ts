// Pure text derivation — no DOM, Vitest-tested directly. `basename` itself now lives in
// `sessions/paths.ts` (kb:diagram/web-components's acyclic sessions-below-reader shape;
// see that file's header).
import { basename } from "../sessions/paths";

/** The reader's "loading" text — the status line's `loading <basename>…` while a
 * user-initiated open of `path` is in flight, or the bare `loading…` (`path`
 * `null`) used for the body placeholder and the tree's loading row before anything is
 * known to load — one pure function so the three call sites can never
 * drift out of sync with each other. */
export function loadingText(path: string | null): string {
  return path === null ? "loading…" : `loading ${basename(path)}…`;
}
