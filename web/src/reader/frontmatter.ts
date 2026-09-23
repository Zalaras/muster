// REQ-1..REQ-4, REQ-7: splits a leading YAML-style frontmatter block off a markdown
// file's raw text before any of it reaches `marked`
// (kb:adr/reader-frontmatter-flat-table-raw-fallback). Pure — no DOM — so it unit-tests
// without a browser (docs/conventions.md: keep logic pure, `slug.ts`'s shape);
// `markdown.ts` is the only caller and owns turning the result into DOM.

/** One `key: value` line from a flat frontmatter block, in file order (duplicates kept). */
export interface FrontmatterEntry {
  key: string;
  value: string;
}

/** REQ-2/REQ-3: a block whose every non-blank, non-comment line matches the flat
 * `key: value` form renders as a table; anything else (a block-list item, a `|` scalar
 * body, a continuation) falls back to its raw inner text. */
export type Frontmatter =
  | { kind: "entries"; entries: FrontmatterEntry[] }
  | { kind: "raw"; text: string };

export interface SplitFrontmatterResult {
  frontmatter: Frontmatter | null;
  body: string;
}

// A fence line is exactly "---" plus optional trailing spaces/tabs — "----" and "--- x"
// are not fences (W5). `\r?` in both handles CRLF without treating `\r` as body content.
const OPEN_FENCE = /^---[ \t]*\r?\n/;
const CLOSE_FENCE = /^---[ \t]*\r?$/m;
const FLAT_LINE = /^([A-Za-z0-9_][A-Za-z0-9_.-]*):(?:[ \t]+(.*))?$/;
const BLANK_LINE = /^[ \t]*$/;
const COMMENT_LINE = /^[ \t]*#/;

/** REQ-1: strips a leading frontmatter block (optional BOM, `---`, lines, `---`) off
 * `text`. Returns `frontmatter: null` and the input unchanged when there is no opening
 * fence on the first line (REQ-7, W2) or no closing fence follows (W1) — in both cases
 * nothing was found to strip, so the original bytes pass through untouched. */
export function splitFrontmatter(text: string): SplitFrontmatterResult {
  const unwrapped = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const openMatch = OPEN_FENCE.exec(unwrapped);
  if (!openMatch) return { frontmatter: null, body: text };

  const rest = unwrapped.slice(openMatch[0].length);
  const closeMatch = CLOSE_FENCE.exec(rest);
  if (!closeMatch) return { frontmatter: null, body: text };

  const inner = rest.slice(0, closeMatch.index);
  let bodyStart = closeMatch.index + closeMatch[0].length;
  if (rest[bodyStart] === "\n") bodyStart += 1;

  return { frontmatter: parseBlock(inner), body: rest.slice(bodyStart) };
}

/** REQ-2/REQ-3/REQ-4: classifies a block's inner text (between the fences). `null` for
 * an empty or comments-only block (REQ-4/W7) — the block is still stripped by the caller
 * regardless, so "nothing to render" is the same outcome as "no block found". */
function parseBlock(inner: string): Frontmatter | null {
  const entries: FrontmatterEntry[] = [];
  let sawContent = false;
  for (const line of inner.split(/\r\n|\n/)) {
    if (BLANK_LINE.test(line) || COMMENT_LINE.test(line)) continue;
    sawContent = true;
    const match = FLAT_LINE.exec(line);
    if (!match) return { kind: "raw", text: inner };
    entries.push({ key: match[1] ?? "", value: (match[2] ?? "").trim() });
  }
  return sawContent ? { kind: "entries", entries } : null;
}
