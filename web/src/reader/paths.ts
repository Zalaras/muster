// Pure path/text derivations — no DOM, Vitest-tested directly.

/** The last non-empty path segment. A trailing slash is stripped first, so a bare
 * directory path (`session.directory` with no repo) still yields its own name rather than
 * the whole path (`basename("/Users/bob/") === "bob"`, not `""`). Shared by the reader's
 * own file-path display and `sessions/card.ts`'s repo-or-directory fallback. */
export function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || path;
}

/** The reader's "loading" text — the status line's `loading <basename>…` while a
 * user-initiated open of `path` is in flight, or the bare `loading…` (`path`
 * `null`) used for the body placeholder and the tree's loading row before anything is
 * known to load — one pure function so the three call sites can never
 * drift out of sync with each other. */
export function loadingText(path: string | null): string {
  return path === null ? "loading…" : `loading ${basename(path)}…`;
}
