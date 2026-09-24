// The reader's frontmatter DOM builders — split out of reader/markdown.ts: `reader/`
// holds pure logic with no DOM building beyond the sanitizer's own window requirement;
// element construction belongs in `render/` (docs/conventions.md § Composition roots).
// `reader/markdown.ts`'s `renderMarkdown` returns the parsed `Frontmatter` alongside the
// body fragment; `render/reader.ts`'s `setReaderBody` calls `buildFrontmatterNode` and
// prepends the result, so no DOM is built inside `reader/`.
import type { Frontmatter, FrontmatterEntry } from "../reader/frontmatter";

// Built from DOM APIs with textContent only. A frontmatter value never
// reaches marked or DOMPurify — there is nothing to sanitize because nothing here is
// ever parsed as markup, the same boundary kb:adr/reader-diagram-svg-crosses-dompurify
// draws for mermaid SVG, just on the other side of it.
export function buildFrontmatterNode(
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
