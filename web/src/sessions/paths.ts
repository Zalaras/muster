// Pure path derivation — no DOM, Vitest-tested directly. Lives here rather than in
// `reader/`, which is where it's mostly used, so that `reader/`'s downward dependency on
// `sessions/` (kb:diagram/web-components: `sessions/` is the shared derivation layer below
// `reader/`) never grows an edge back the other way — `sessions/card.ts`'s repoLine needs
// this too, and `sessions/` may not import from `reader/`.

/** The last non-empty path segment. A trailing slash is stripped first, so a bare
 * directory path (`session.directory` with no repo) still yields its own name rather than
 * the whole path (`basename("/Users/bob/") === "bob"`, not `""`). Shared by
 * `reader/paths.ts`'s loading-cue text and `sessions/card.ts`'s repo-or-directory
 * fallback. */
export function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || path;
}
