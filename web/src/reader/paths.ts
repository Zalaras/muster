// Pure path/text derivations for the reader — no DOM, Vitest-tested directly.
import { basename } from "../sessions/card";

export { basename };

/** The reader's "loading" text — the status line's `loading <basename>…` while a
 * user-initiated open of `path` is in flight, or the bare `loading…` (`path`
 * `null`) used for the body placeholder and the tree's loading row before anything is
 * known to load — one pure function so the three call sites can never
 * drift out of sync with each other. */
export function loadingText(path: string | null): string {
  return path === null ? "loading…" : `loading ${basename(path)}…`;
}
