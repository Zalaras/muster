// File fixtures for the file-drop-fix E2E suite.
//
// The daemon's locate step (POST /api/sessions/{id}/locate, kb:anchor/sessions.locate)
// resolves a dropped file's bytes to an on-disk path by walking the session's directory
// and byte-comparing candidates. Spotlight never sees these fixtures — the plan's
// Implementation Notes are explicit: "the harness's scratch dirs live under
// os.tmpdir(), which Spotlight does not index, so E2E always exercises the walk". Every
// fixture's content is therefore only required to be unique enough that no unrelated file
// elsewhere on the walked machine could coincidentally byte-match it; the design calls for
// "unique random bytes" by design (same Implementation Notes paragraph), which is not a
// determinism violation here — no assertion in the suite depends on which random bytes
// were chosen, only on the locate outcome (found / not found / ambiguous).
import { randomBytes } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Collision-proof file content — see module comment. */
export function uniqueContent(size = 256): Buffer {
  return randomBytes(size);
}

/**
 * Writes `content` to `path` (creating parent directories as needed) and returns the
 * symlink-resolved absolute path — the exact form the daemon's `EvalSymlinks`-deduped
 * `Locate` returns (kb:anchor/sessions.locate), so a test's "expected path"
 * oracle matches regardless of whether the scratch tmp root itself sits behind a symlink
 * (e.g. macOS's `/tmp` -> `/private/tmp`).
 */
export async function writeFixtureFile(path: string, content: Buffer): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return await realpath(path);
}

/**
 * The escaping rule, reimplemented independently from `web/src/terminal/drop.ts`'s
 * `escapePath` — this is the E2E oracle, not a re-export of the code under test (that unit
 * is Vitest's job). A backslash goes before every space and every character in
 * `` \ ! " # $ & ' ( ) * , ; < = > ? [ ] ^ ` { | } ~ ``; nothing else is touched.
 */
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

export function expectedEscapedPath(path: string): string {
  let out = "";
  for (const ch of path) {
    if (ESCAPED_CHARS.has(ch)) out += "\\";
    out += ch;
  }
  return out;
}

// The size cap is a display-side constant the render tier owns (web/render/helpers/drop.ts,
// where the size gate's property re-levelled on 2026-10-20 reads it); re-exported here for
// any journey that needs a fixture exactly one byte over it.
export { MAX_DROP_BYTES } from "../../render/helpers/drop";
