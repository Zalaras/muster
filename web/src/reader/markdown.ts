// Renders one markdown file's raw bytes to a sanitized DOM fragment plus its outline
// (kb:adr/reader-markdown-rendered-in-browser). A leading frontmatter block is split off
// first (kb:adr/reader-frontmatter-flat-table-raw-fallback) so it never reaches marked;
// only the remaining body goes marked (GFM) → DOMPurify (`RETURN_DOM_FRAGMENT`) → heading
// ids assigned from the same walk that builds the outline, so the two can never disagree
// about which heading is which. The daemon hands raw `text/markdown` bytes and parses
// nothing it serves (kb:adr/reader-served-paths-confined-to-directory-or-plan); this
// module is the only place that ever turns them into HTML, and the sanitized fragment is
// what render/reader.ts inserts via `article.replaceChildren`, never `innerHTML`. The
// parsed frontmatter is returned, not built into DOM here — element construction belongs
// in `render/`: `render/frontmatter.ts`'s `buildFrontmatterNode` and `render/reader.ts`'s
// `setReaderBody` do that, prepending the result after the outline walk below so a
// frontmatter table/pre can never be queried as a heading or counted in the outline.
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { Frontmatter } from "./frontmatter";
import { splitFrontmatter } from "./frontmatter";
import { dedupeIds, headingSlug } from "./slug";

export interface OutlineEntry {
  level: number;
  text: string;
  id: string;
}

export interface RenderedMarkdown {
  fragment: DocumentFragment;
  outline: OutlineEntry[];
  frontmatter: Frontmatter | null;
}

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

export function renderMarkdown(text: string): RenderedMarkdown {
  const { frontmatter, body } = splitFrontmatter(text);
  const html = marked.parse(body, { gfm: true, async: false });
  const fragment = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true });

  const headings = Array.from(fragment.querySelectorAll(HEADING_SELECTOR));
  const ids = dedupeIds(headings.map((heading) => headingSlug(heading.textContent ?? "")));
  const outline: OutlineEntry[] = headings.map((heading, index) => {
    const id = ids[index] ?? "";
    heading.id = id;
    return { level: Number(heading.tagName.slice(1)), text: heading.textContent ?? "", id };
  });

  return { fragment, outline, frontmatter };
}
