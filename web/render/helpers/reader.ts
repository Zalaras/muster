// Locators, oracles and the documents for the docs reader (
// markdown, frontmatter, mermaid, expanded-state persistence). Pure DOM —
// no daemon, no fixture knowledge — so both tiers use it: the render spec
// `web/render/reader.spec.ts` and `web/render/helpers/reader-find.ts` directly, the E2E
// journeys through `web/e2e/helpers/reader.ts`, which re-exports it and keeps what a render
// test never does (the on-disk fixture builders, the held responses, the HTTP oracles).
//
// Locators are transcribed from the plans' Testable UI Elements tables and the Reader DOM
// sketch (docs/design/mockups/markdown-viewing/): a folder/file tree entry's caret, count
// and changed-dot are all `aria-hidden`, so a button's accessible name is exactly its own
// name — `getByRole` needs no extra disambiguation beyond that. `readerRegion` is page-wide
// (by title); use `readerRegionInTile` whenever two live tiles might share a title.
//
// The documents (`MARKDOWN_TREE_DOCUMENTS`, `READER_DOCUMENTS`, `LARGE_TREE_DOCUMENTS`,
// `MERMAID_DOCUMENTS`, `INTERLEAVED_DOCUMENT`, `READER_PLAN_BODY`) are the one source of the
// reader fixtures' bytes: the E2E helper's builders write them into a scratch directory, and
// the `reader-docs*` / `reader-diagrams*` render scenarios carry the same bytes transcribed
// into Go (internal/server/renderfix_scenarios_reader.go) — the render spec asserts that
// identity against each fixture's `reader[].files`.
import type { Locator, Page } from "./harness";
import { liveTileById } from "./tiles";

// ── Locators ────────────────────────────────────────────────────────────────────────────

/** The reader region for a session, by its display title (`aria-label="Reader: <title>"`,
 * Testable UI Elements; "untitled" when the title is null). Page-wide — use only when at
 * most one host renders this session's reader (Focus, or a pop-out alone); for Tiles use
 * `readerRegionInTile`. */
export function readerRegion(page: Page, title: string): Locator {
  return page.locator(`[aria-label="Reader: ${title}"]`);
}

/** The reader region scoped to one tile by session id, mirroring `liveTileById`'s
 * disambiguation rationale (two tiles can share a title). */
export function readerRegionInTile(page: Page, id: number): Locator {
  return liveTileById(page, id).locator(".reader");
}

export function docBar(region: Locator): Locator {
  return region.locator(".docbar");
}

/** Present only while the plan is open. */
export function barPlanBadge(region: Locator): Locator {
  return docBar(region).locator(".badge");
}

export function barFileName(region: Locator): Locator {
  return docBar(region).locator(".fname");
}

/** Absent in `.reader.compact`. */
export function barPath(region: Locator): Locator {
  return docBar(region).locator(".path");
}

/** Absent until a write hook is seen this daemon lifetime — assert
 * `.toHaveCount(0)` for "no cue yet", never a visibility check. */
export function freshnessCue(region: Locator): Locator {
  return docBar(region).locator(".chg");
}

export function popOutLink(region: Locator): Locator {
  return docBar(region).getByRole("link", { name: "pop out ↗" });
}

/** The single nav-toggle button: last child of
 * `.docbar`, present and unhidden in every state, `aria-label="File explorer"` throughout
 * — its glyph (`›`/`‹`) and `aria-expanded` track the nav's own open/collapsed state, so
 * this one locator covers both. */
export function navToggle(region: Locator): Locator {
  return docBar(region).getByRole("button", { name: "File explorer" });
}

/** The reader's own `role="status"` line — the only one inside `.reader` (States). */
export function readerStatusLine(region: Locator): Locator {
  return region.locator(".reader-notice");
}

export function readerNav(region: Locator): Locator {
  return region.getByRole("navigation", { name: "Documents" });
}

/** The nav's plan header row (`[data-role="plan-header"]`) — `renderPlanSlot` sets its
 * `hidden` attribute (the codebase's existing `.hidden =` idiom, never removal) when the
 * plan slot is absent (a dead session), so `.toBeHidden()` is the "no empty padded
 * strip" oracle, not `.toHaveCount(0)`. */
export function planHeaderRow(region: Locator): Locator {
  return readerNav(region).locator('[data-role="plan-header"]');
}

export function planSlotEntry(region: Locator): Locator {
  return readerNav(region).locator(".f.plan");
}

export function noPlanText(region: Locator): Locator {
  return readerNav(region).locator(".f.none");
}

export function filesHeaderToggle(region: Locator): Locator {
  return readerNav(region).getByRole("button", { name: "Files", exact: true });
}

/** Absent before the listing arrives and in compact mode. */
export function fileCount(region: Locator): Locator {
  return filesHeaderToggle(region).locator(".n");
}

export function filterBox(region: Locator): Locator {
  return region.getByRole("searchbox", { name: "Filter files" });
}

/** The tree's own scroll container (`.rnav .tree`, review cycle 2 Critical 1) — the
 * element whose `overflow-y` is `auto` and whose `scrollHeight`/`clientHeight` and
 * `scrollTop` are the reachability oracle for a fixture that exceeds the nav's height. */
export function navTreeSection(region: Locator): Locator {
  return readerNav(region).locator(".tree");
}

/** The single `loading…` row shown inside the tree while the listing is in flight
 * — a `div`, not a button (Testable UI Elements: "not focusable"), styled like
 * `.f.none`. */
export function treeLoadingRow(region: Locator): Locator {
  return navTreeSection(region).getByText("loading…");
}

/** The outline's own scroll container (`.rnav .outline`), mirroring `navTreeSection`. */
export function navOutlineSection(region: Locator): Locator {
  return readerNav(region).locator(".outline");
}

/** A folder button in the tree, by its own name — accessible name is exactly `<name>/`
 * since the caret and count are `aria-hidden` (Testable UI Elements). */
export function folderEntry(region: Locator, name: string): Locator {
  return navTreeSection(region).getByRole("button", { name: `${name}/`, exact: true });
}

/** A file button in the tree, by its basename — accessible name is exactly the basename
 * since the changed dot is `aria-hidden`. */
export function fileEntry(region: Locator, fileBasename: string): Locator {
  return navTreeSection(region).getByRole("button", { name: fileBasename, exact: true });
}

/** The changed-dot span inside a tree/plan-slot entry — its presence in the DOM (not a
 * CSS state) is the whole indicator. */
export function changedDot(entry: Locator): Locator {
  return entry.locator(".dot");
}

export function outlineHeaderToggle(region: Locator): Locator {
  return readerNav(region).getByRole("button", { name: "Outline" });
}

/** `exact: true` matters here specifically (unlike `fileEntry`/`folderEntry`, which
 * already had it): Playwright's default name match is substring, and
 * `LARGE_TREE_DOCUMENTS`'s 30 headings are `Section 1`..`Section 30`, so `"Section 1"`
 * would otherwise also match `Section 10`..`Section 19`. */
export function outlineEntry(region: Locator, headingText: string): Locator {
  return navOutlineSection(region).getByRole("button", { name: headingText, exact: true });
}

export function renderedBody(region: Locator): Locator {
  return region.locator("article.md");
}

export function bodyPlaceholder(region: Locator): Locator {
  return renderedBody(region).getByText("nothing open — pick a file");
}

/** `article.md > p.placeholder` while nothing has rendered yet (mount, or a user-initiated
 * open with `bodyRendered` still false). Neither
 * `article.md` nor `p` carries an implicit role (Testable UI Elements), so this is a text
 * locator like `bodyPlaceholder` above, never a role query. */
export function bodyLoadingPlaceholder(region: Locator): Locator {
  return renderedBody(region).getByText("loading…");
}

/** `/doc.html?session=<id>&path=<abs>` — for asserting a pop-out tab's URL, or
 * navigating to it directly rather than through the `pop out ↗` link. */
export function popOutURL(id: number, path: string): string {
  return `/doc.html?session=${id}&path=${encodeURIComponent(path)}`;
}

// ── Frontmatter ──────────────────────────────────────────────────────
//
// The flat-block table is a native `<table aria-label="Frontmatter">` with `<th scope="row">`
// key cells (role `rowheader`) and `<td>` value cells (role `cell`); the fallback block is
// `pre.frontmatter > code`, which — like a `<details><summary>` — carries no implicit
// role, so it's a plain CSS locator rather than a `getByRole` query.

/** The frontmatter key/value table — always the body's first element when
 * present (assert via `renderedBody(region).evaluate(el => el.firstElementChild?.tagName)`,
 * since a role query alone can't answer position). Absent for the raw-fallback or empty
 * shapes, or when the file carries no frontmatter at all. */
export function frontmatterTable(region: Locator): Locator {
  return renderedBody(region).getByRole("table", { name: "Frontmatter" });
}

/** Every row's key cell in document order — the "one row per key, in file order"
 * oracle without pinning a specific key. */
export function frontmatterKeyCells(region: Locator): Locator {
  return frontmatterTable(region).getByRole("rowheader");
}

/** A frontmatter row, scoped by its key cell's exact text — duplicate keys each get
 * their own `<tr>`, so this can match more than one row. `filter({has})` re-applies the
 * inner locator's full selector chain scoped to each `tr` candidate, so the inner locator
 * must be rooted at `page` rather than at any ancestor of the `tr`. */
function frontmatterRow(region: Locator, key: string): Locator {
  const table = frontmatterTable(region);
  return table
    .locator("tr")
    .filter({ has: region.page().getByRole("rowheader", { name: key, exact: true }) });
}

/** A frontmatter row's key cell (`<th scope="row">`), by its own text. */
export function frontmatterKeyCell(region: Locator, key: string): Locator {
  return frontmatterRow(region, key).getByRole("rowheader", { name: key, exact: true });
}

/** A frontmatter row's value cell (`<td>`), by its row's key text. */
export function frontmatterValueCell(region: Locator, key: string): Locator {
  return frontmatterRow(region, key).getByRole("cell");
}

/** The raw fallback block — `pre.frontmatter > code`, inner text verbatim. Absent
 * for the flat-table or empty shapes, or when the file carries no frontmatter at all. */
export function frontmatterFallback(region: Locator): Locator {
  return renderedBody(region).locator("pre.frontmatter");
}

/** Every outline entry button in document order — the "frontmatter contributes no
 * outline entry" oracle: assert `.first()`'s name against the document's own first real
 * heading, or the full list against the headings a fixture expects and nothing else. */
export function outlineEntries(region: Locator): Locator {
  return navOutlineSection(region).getByRole("button");
}

// ── Diagrams ─────────────────────────────────────────────────────
//
// A diagram figure carries no implicit role, so it's a plain CSS locator; the enlarge
// button, the dialog and its toolbar buttons all pin role + accessible name.

/** Every `figure.diagram` in the rendered body, document order — index with `.nth()` or
 * scope further with `.filter()` (Testable UI Elements: `article.md figure.diagram`). */
export function diagramFigures(region: Locator): Locator {
  return renderedBody(region).locator("figure.diagram");
}

/** The `n`th rendered diagram (default the first). */
export function diagramFigure(region: Locator, n = 0): Locator {
  return diagramFigures(region).nth(n);
}

/** `figure.diagram > button.diagram-enlarge`, named "Enlarge diagram" (Testable UI
 * Elements) — scope to one figure when a document has more than one diagram. */
export function enlargeButton(figure: Locator): Locator {
  return figure.getByRole("button", { name: "Enlarge diagram" });
}

/** `pre > code.language-mermaid` still present after a render pass — only for a fence
 * that failed to parse/render; a succeeded fence leaves none. */
export function keptMermaidSource(region: Locator): Locator {
  return renderedBody(region).locator("pre > code.language-mermaid");
}

/** `p.diagram-error`, the failed fence's kept-source sibling — text matches
 * `/^diagram not rendered: /` (Testable UI Elements). */
export function diagramErrorLine(region: Locator): Locator {
  return renderedBody(region).locator("p.diagram-error");
}

/** The one `dialog.modal.diagram-modal` per reader root, by its accessible name
 * ("Diagram", Testable UI Elements) — matches only while `[open]`, since a closed
 * `<dialog>` has no accessible role. Use `diagramDialogRaw` to count regardless of state. */
export function diagramDialog(region: Locator): Locator {
  return region.getByRole("dialog", { name: "Diagram" });
}

/** Raw `dialog.diagram-modal` locator, open or closed — the "exactly one per root"
 * oracle, which a role query can't answer once the dialog is closed. */
export function diagramDialogRaw(region: Locator): Locator {
  return region.locator("dialog.diagram-modal");
}

export function diagramStage(dialog: Locator): Locator {
  return dialog.locator(".diagram-stage");
}

export function diagramCanvas(dialog: Locator): Locator {
  return dialog.locator(".diagram-canvas");
}

export function diagramZoomIn(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Zoom in" });
}

export function diagramZoomOut(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Zoom out" });
}

export function diagramZoomReset(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Reset zoom" });
}

export function diagramClose(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Close" });
}

/** Parses the canvas's inline `transform: translate(<x>px, <y>px) scale(<s>)` (DOM sketch)
 * into numbers — the pan/zoom oracle, since Playwright has no numeric-CSS matcher. */
export async function canvasTransform(
  canvas: Locator,
): Promise<{ x: number; y: number; scale: number }> {
  const transform = await canvas.evaluate((el) => (el as HTMLElement).style.transform);
  const match = transform.match(
    /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)\s*scale\(\s*([\d.]+)\s*\)/,
  );
  if (!match) throw new Error(`unexpected canvas transform: "${transform}"`);
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}

/**
 * Records every request's URL for the lifetime of `page` — the "no request leaves the
 * page's origin" oracle (unfiltered by path, since a mermaid chunk's hashed name isn't
 * known ahead of a build). `data:`/`blob:` URLs carry no origin and are excluded rather
 * than treated as violations.
 */
export class OriginRequestTracker {
  private readonly urls: string[] = [];
  private readonly origin: string;

  constructor(page: Page, baseURL: string) {
    this.origin = new URL(baseURL).origin;
    page.on("request", (req) => {
      this.urls.push(req.url());
    });
  }

  /** Every recorded request's origin equals the page's own; throws naming the first
   * offender otherwise. */
  assertAllSameOrigin(): void {
    const offender = this.urls.find(
      (u) => !u.startsWith("data:") && !u.startsWith("blob:") && !u.startsWith(this.origin),
    );
    if (offender) throw new Error(`request left the page's origin: ${offender}`);
  }

  /** Every `.js` request recorded so far whose URL contains `substr` (case-insensitive)
   * — the "engine chunk loaded" oracle, without hardcoding a Vite-hashed
   * filename. Applies no origin filter of its own: pair it with `assertAllSameOrigin()`,
   * as that test does, when the point is that the chunk came from the page's origin. */
  scriptRequestsContaining(substr: string): string[] {
    const needle = substr.toLowerCase();
    return this.urls.filter((u) => u.endsWith(".js") && u.toLowerCase().includes(needle));
  }

  get count(): number {
    return this.urls.length;
  }
}

// ── Nav label layout (#67) ──────────────────────────────────────────────────────────────

/** How a nav row's label text is laid out against the nav's own box (#67) — measured on the
 * element that directly holds the row's label text node, since `text-overflow` acts on that
 * element and only when it is a block container (a flex container never ellipsizes).
 * `lines` counts the label's distinct line boxes. */
export interface NavLabelLayout {
  display: string;
  textOverflow: string;
  overflowX: string;
  overflowing: boolean;
  lines: number;
  labelRight: number;
  navRight: number;
}

export async function navLabelLayout(nav: Locator, entry: Locator): Promise<NavLabelLayout> {
  const navRight = await nav.evaluate((el) => el.getBoundingClientRect().right);
  const layout = await entry.evaluate((btn) => {
    const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
    let label: Text | null = null;
    for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
      const text = n as Text;
      if (text.data.length > (label?.data.length ?? 0)) label = text;
    }
    if (label === null) throw new Error("nav row has no label text");
    const owner = label.parentElement as HTMLElement;
    const style = getComputedStyle(owner);
    const range = document.createRange();
    range.selectNodeContents(label);
    const tops = new Set(Array.from(range.getClientRects(), (r) => Math.round(r.top)));
    return {
      display: style.display,
      textOverflow: style.textOverflow,
      overflowX: style.overflowX,
      overflowing: owner.scrollWidth > owner.clientWidth,
      lines: tops.size,
      labelRight: owner.getBoundingClientRect().right,
    };
  });
  return { ...layout, navRight };
}

// ── Documents ───────────────────────────────────────────────────────────────────────────

/** One document of a reader fixture: its path relative to the checkout (`/`-separated) and
 * its exact bytes. */
export interface ReaderDocument {
  path: string;
  body: string;
}

/** The tree `docs/features/reader/spec.md` describes for its fixtures: a top-level `.md`, a
 * two-deep nested `.md`, a non-`.md` sibling and a `.md` inside a dot-directory — the last
 * two are never listed. */
export const MARKDOWN_TREE_DOCUMENTS = {
  todo: { path: "TODO.md", body: "# TODO\n\n- [ ] one\n" },
  nested: { path: "docs/adr/x.md", body: "# ADR X\n\nBody.\n" },
  nonMarkdown: { path: "notes.txt", body: "not markdown\n" },
  dotDir: { path: ".hidden/secret.md", body: "# hidden\n" },
} as const satisfies Record<string, ReaderDocument>;

/** The plan the "opens it automatically" test wrote; the `reader-docs-plan` scenario
 * names it from a transcript. */
export const READER_PLAN_BODY = "# The Plan\n\nDo the thing.\n";

/** The long names of #67: a folder and a file that must ellipsize inside the nav, and a
 * heading that must wrap. */
export const LONG_NAMES = {
  folder: "a-very-long-folder-name-that-overflows-the-nav",
  file: "a-very-long-file-name-that-overflows-the-nav-panel.md",
  heading: "A very long heading that is far wider than the outline panel can show",
} as const;

/** The raw frontmatter block of `fm-raw.md`, verbatim — the raw-block oracle compares
 * `textContent` against exactly these bytes. */
export const FM_RAW_INNER = "tags:\n  - a\n  - b\nnotes: |\n  # Not a real heading\n  just text\n";

function filler(paragraphs: number): string {
  return Array.from(
    { length: paragraphs },
    (_, i) => `Paragraph line ${i} of filler text to force a scrollable body.`,
  ).join("\n\n");
}

const LONG_FILLER = filler(80);

/** Every document web/e2e/reader.spec.ts wrote inline for a rendering property, by key. */
export const READER_DOCUMENTS = {
  /** A GFM table, a task list and a fenced code block. */
  gfm: {
    path: "gfm.md",
    body: [
      "# GFM",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "- [ ] todo one",
      "- [x] todo two",
      "",
      "```js",
      "console.log('hi');",
      "```",
      "",
    ].join("\n"),
  },
  /** A script element, an onerror attribute and a javascript: link. */
  unsafe: {
    path: "unsafe.md",
    body: [
      "# Unsafe",
      "",
      "<script>window.__readerXss = true;</script>",
      "",
      '<img src="x" onerror="window.__readerXss = true" />',
      "",
      "[click me](javascript:window.__readerXss=true)",
      "",
    ].join("\n"),
  },
  /** Three headings with 80 filler paragraphs between each, so the body scrolls. */
  long: {
    path: "long.md",
    body: `# Top\n\n${LONG_FILLER}\n\n## Middle\n\n${LONG_FILLER}\n\n## Bottom\n\n${LONG_FILLER}\n`,
  },
  /** A repeated heading (edge case 26). */
  dup: { path: "dup.md", body: "# Top\n\n## Notes\n\nFirst.\n\n## Notes\n\nSecond.\n" },
  /** The #67 document: a long file name inside a long folder name, with a long heading. */
  longName: {
    path: `${LONG_NAMES.folder}/${LONG_NAMES.file}`,
    body: `# Top\n\n## ${LONG_NAMES.heading}\n\nBody.\n`,
  },
  /** Flat frontmatter, three keys, two real headings. */
  front: {
    path: "front.md",
    body: [
      "---",
      "id: reader-plan-located-by-transcript-scan",
      "tags: [claude-code-format, store]",
      "status: accepted",
      "---",
      "# Real Heading",
      "",
      "Body text.",
      "",
      "## Second Heading",
      "",
      "More text.",
      "",
    ].join("\n"),
  },
  /** Frontmatter and nothing else (edge case 20). */
  onlyFront: { path: "only-front.md", body: ["---", "solo: value", "---", ""].join("\n") },
  /** Frontmatter values carrying markup. */
  fmUnsafe: {
    path: "fm-unsafe.md",
    body: [
      "---",
      'title: <img src=x onerror="window.__fmXss = true">',
      "note: <script>window.__fmXss = true;</script>",
      "---",
      "# Heading",
      "",
      "Body text.",
      "",
    ].join("\n"),
  },
  /** Nested YAML frontmatter: the raw fallback. */
  fmRaw: { path: "fm-raw.md", body: `---\n${FM_RAW_INNER}---\n# Real Heading\n\nBody text.\n` },
  /** A long frontmatter key. */
  wideKey: {
    path: "wide-key.md",
    body: [
      "---",
      "verified_claude_code_version: 2.1.3",
      "an_extremely_long_frontmatter_key_used_to_test_line_wrapping: value",
      "---",
      "# Heading",
      "",
      "Body text.",
      "",
    ].join("\n"),
  },
} as const satisfies Record<string, ReaderDocument>;

/** The tree bigger than the nav's own height (review cycle 2 Critical 1): 20 top-level
 * files and a 30-heading document. `0-outline.md` sorts before every `file-NN.md`
 * (`"0" < "f"`), so `file-20.md` is reliably the tree's last row whatever is open. */
export const LARGE_TREE = {
  lastFileName: "file-20.md",
  outlineFileName: "0-outline.md",
  lastHeading: "Section 30",
} as const;

export const LARGE_TREE_DOCUMENTS: readonly ReaderDocument[] = [
  ...Array.from({ length: 20 }, (_, i) => ({
    path: `file-${String(i + 1).padStart(2, "0")}.md`,
    body: `# File ${i + 1}\n\nBody text for file ${i + 1}.\n`,
  })),
  {
    path: LARGE_TREE.outlineFileName,
    body: `# Outline\n\n${Array.from({ length: 30 }, (_, i) => `Section ${i + 1}`)
      .map((h) => `## ${h}\n\nParagraph text for ${h}.\n`)
      .join("\n\n")}\n`,
  },
];

/** The mermaid documents the plan's Implementation Notes name. Diagram sources are the
 * smallest syntactically valid (or deliberately invalid, for `broken`) mermaid text for each
 * construct — inputs to the real bundled mermaid engine, never simulated output. */
export const MERMAID_DOCUMENTS = {
  /** One valid `flowchart TD`. */
  flow: { path: "flow.md", body: "# Flow\n\n```mermaid\nflowchart TD\n  A --> B\n```\n" },
  /** One fence missing an arrow target, one valid fence after it. */
  broken: {
    path: "broken.md",
    body: [
      "# Broken",
      "",
      "```mermaid",
      "flowchart TD",
      "  A -->",
      "```",
      "",
      "```mermaid",
      "flowchart TD",
      "  C --> D",
      "```",
      "",
    ].join("\n"),
  },
  /** Script/onerror/`javascript:` labels plus a `securityLevel: "loose"` init directive
   * that must have no effect. */
  unsafe: {
    path: "unsafe.md",
    body: [
      "# Unsafe",
      "",
      "```mermaid",
      '%%{init: {"securityLevel": "loose", "flowchart": {"htmlLabels": true}}}%%',
      "flowchart TD",
      '  A["<script>window.__readerXss = true;</script>"]',
      "  B[\"<img src=x onerror='window.__readerXss = true' />\"]",
      "  A --> B",
      '  click A "javascript:window.__readerXss=true" "click"',
      "```",
      "",
    ].join("\n"),
  },
  /** One fence of each of the kb's eight diagram kinds, plus case, attribute, blockquote
   * and duplicate-fence variants. */
  kinds: {
    path: "kinds.md",
    body: [
      "# Kinds",
      "",
      "```mermaid",
      "C4Context",
      '  Person(user, "User")',
      '  System(sys, "System")',
      '  Rel(user, sys, "Uses")',
      "```",
      "",
      "```mermaid",
      "C4Container",
      '  Person(user, "User")',
      '  Container(app, "App", "Go")',
      '  Rel(user, app, "Uses")',
      "```",
      "",
      "```mermaid",
      "C4Component",
      '  Person(user, "User")',
      '  Component(comp, "Component")',
      '  Rel(user, comp, "Uses")',
      "```",
      "",
      "```mermaid",
      "classDiagram",
      "  class Animal",
      "  Animal : +String name",
      "```",
      "",
      "```mermaid",
      "stateDiagram-v2",
      "  [*] --> Idle",
      "  Idle --> Done",
      "```",
      "",
      "```mermaid",
      "sequenceDiagram",
      "  Alice->>Bob: Hello",
      "```",
      "",
      "```mermaid",
      "erDiagram",
      "  CUSTOMER ||--o{ ORDER : places",
      "```",
      "",
      "```mermaid",
      "flowchart TD",
      "  E --> F",
      "```",
      "",
      "```Mermaid",
      "flowchart TD",
      "  G --> H",
      "```",
      "",
      "```mermaid title=x",
      "flowchart TD",
      "  I --> J",
      "```",
      "",
      "> ```mermaid",
      "> flowchart TD",
      "> K --> L",
      "> ```",
      "",
      "```mermaid",
      "flowchart TD",
      "  M --> N",
      "```",
      "",
      "```mermaid",
      "flowchart TD",
      "  M --> N",
      "```",
      "",
    ].join("\n"),
  },
  /** A flowchart naming `layout: elk` in frontmatter, and one naming no layout. */
  elk: {
    path: "elk.md",
    body: [
      "# ELK",
      "",
      "```mermaid",
      "---",
      "config:",
      "  layout: elk",
      "---",
      "flowchart TD",
      "  A --> B --> C",
      "```",
      "",
      "```mermaid",
      "flowchart TD",
      "  X --> Y",
      "```",
      "",
    ].join("\n"),
  },
  /** A `flowchart LR` with 40 chained nodes, wider than the reader body. */
  wide: {
    path: "wide.md",
    body: `# Wide\n\n\`\`\`mermaid\nflowchart LR\n  ${Array.from({ length: 40 }, (_, i) => `N${i}`).join(" --> ")}\n\`\`\`\n`,
  },
  /** No mermaid fence at all (the engine chunk must never load for this file). */
  plain: { path: "plain.md", body: "# Plain\n\nNo diagrams here.\n" },
} as const satisfies Record<string, ReaderDocument>;

/** The interleaved document: headings with filler and a valid and a malformed fence between them. */
export const INTERLEAVED_DOCUMENT: ReaderDocument = {
  path: "interleaved.md",
  body: [
    "# Top",
    "",
    "## Alpha",
    "",
    filler(40),
    "",
    "```mermaid",
    "flowchart TD",
    "  A --> B",
    "```",
    "",
    "## Beta",
    "",
    filler(40),
    "",
    "```mermaid",
    "flowchart TD",
    "  C -->",
    "```",
    "",
    "## Gamma",
    "",
    filler(40),
    "",
  ].join("\n"),
};
