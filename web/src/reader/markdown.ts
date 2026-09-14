// REQ-5/REQ-14/REQ-22: renders one markdown file's raw bytes to a sanitized DOM fragment
// plus its outline (kb:adr/reader-markdown-rendered-in-browser). marked (GFM) → DOMPurify
// (`RETURN_DOM_FRAGMENT`) → heading ids assigned from the same walk that builds the
// outline, so the two can never disagree about which heading is which. The daemon hands
// raw `text/markdown` bytes and parses nothing it serves (kb:adr/reader-served-paths-confined-to-directory-or-plan);
// this module is the only place that ever turns them into HTML, and the sanitized
// fragment is what render/reader.ts inserts via `article.replaceChildren` — never through
// `innerHTML` (W15).
import DOMPurify from "dompurify";
import { marked } from "marked";
import { dedupeIds, headingSlug } from "./slug";

export interface OutlineEntry {
  level: number;
  text: string;
  id: string;
}

export interface RenderedMarkdown {
  fragment: DocumentFragment;
  outline: OutlineEntry[];
}

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

export function renderMarkdown(text: string): RenderedMarkdown {
  const html = marked.parse(text, { gfm: true, async: false });
  const fragment = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true });

  const headings = Array.from(fragment.querySelectorAll(HEADING_SELECTOR));
  const ids = dedupeIds(headings.map((heading) => headingSlug(heading.textContent ?? "")));
  const outline: OutlineEntry[] = headings.map((heading, index) => {
    const id = ids[index] ?? "";
    heading.id = id;
    return { level: Number(heading.tagName.slice(1)), text: heading.textContent ?? "", id };
  });

  return { fragment, outline };
}
