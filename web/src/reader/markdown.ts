// REQ-5/REQ-14/REQ-22: renders one markdown file's raw bytes to a sanitized DOM fragment
// plus its outline (kb:adr/reader-markdown-rendered-in-browser). A leading frontmatter
// block is split off first (kb:adr/reader-frontmatter-flat-table-raw-fallback) so it
// never reaches marked; only the remaining body goes marked (GFM) → DOMPurify
// (`RETURN_DOM_FRAGMENT`) → heading ids assigned from the same walk that builds the
// outline, so the two can never disagree about which heading is which. The daemon hands
// raw `text/markdown` bytes and parses nothing it serves (kb:adr/reader-served-paths-confined-to-directory-or-plan);
// this module is the only place that ever turns them into HTML, and the sanitized
// fragment is what render/reader.ts inserts via `article.replaceChildren` — never through
// `innerHTML` (W15).
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { Frontmatter, FrontmatterEntry } from "./frontmatter";
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

  // REQ-5/REQ-6: prepended after the outline walk above, so a frontmatter table/pre
  // can never be queried as a heading or counted in the outline.
  const frontmatterNode = buildFrontmatterNode(frontmatter);
  if (frontmatterNode) fragment.prepend(frontmatterNode);

  return { fragment, outline };
}

// REQ-5, REQ-10: built from DOM APIs with textContent only. A frontmatter value never
// reaches marked or DOMPurify — there is nothing to sanitize because nothing here is
// ever parsed as markup, the same boundary kb:adr/reader-diagram-svg-crosses-dompurify
// draws for mermaid SVG, just on the other side of it.
function buildFrontmatterNode(
  frontmatter: Frontmatter | null,
): HTMLTableElement | HTMLPreElement | null {
  if (frontmatter === null) return null;
  return frontmatter.kind === "entries"
    ? buildFrontmatterTable(frontmatter.entries)
    : buildFrontmatterFallback(frontmatter.text);
}

function buildFrontmatterTable(entries: readonly FrontmatterEntry[]): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "frontmatter";
  table.setAttribute("aria-label", "Frontmatter");
  const tbody = document.createElement("tbody");
  for (const { key, value } of entries) {
    const row = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = key;
    const td = document.createElement("td");
    td.textContent = value;
    row.append(th, td);
    tbody.append(row);
  }
  table.append(tbody);
  return table;
}

function buildFrontmatterFallback(text: string): HTMLPreElement {
  const pre = document.createElement("pre");
  pre.className = "frontmatter";
  const code = document.createElement("code");
  code.textContent = text;
  pre.append(code);
  return pre;
}
