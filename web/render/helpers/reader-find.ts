// Locators, oracles and the find documents for the reader's find bar (plans docs-search-bar
// and search-bar-text-length). Pure DOM — no daemon, no fixture knowledge — so both tiers use
// it: the render spec `web/render/reader-find.spec.ts` directly, the E2E journeys through
// `web/e2e/helpers/reader-search.ts`, which re-exports it.
//
// Locators come from the plan's Testable UI Elements table: the icon is a `button` named
// "Search document", the query box a `searchbox` with the same name, previous / next /
// close are buttons with their own aria-labels, and the count is a `role="status"` element
// whose text is `<i> of <n>` or `No results`. `.reader-notice` is also a
// `role="status"` inside `.reader`, so the count is selected by excluding it.
//
// Highlights have no DOM, so `readHighlights` reads them from `CSS.highlights`. The plan
// leaves the two registered names to web-impl, so ranges are classified by structure, not
// by name: the highlight with more ranges inside the reader is "all matches", the other
// one (always exactly one range while there is a match) is "current". At one match both
// hold the same single range, so either assignment reads the same.
//
// The documents (`FIND_DOCUMENTS`) are the one source of the find fixtures' bytes: the E2E
// helper writes them into a scratch directory, and the render fixtures' `find-docs*`
// scenarios carry the same bytes transcribed into Go
// (internal/server/renderfix_scenarios_reader_find.go) — the render spec asserts that
// identity against each fixture's `reader[].files`.
import { expect, type Locator, type Page } from "./harness";
import { docBar, readerNav, renderedBody } from "./reader";
import { liveTileById } from "./tiles";

// ── Reader locators ─────────────────────────────────────────────────────────────────────
//
// The reader feature's own render helper owns them (`./reader`); re-exported so the find
// spec reads one module for the reader it searches in.
export {
  bodyPlaceholder,
  docBar,
  fileEntry,
  navToggle,
  popOutLink,
  readerNav,
  readerRegion,
  readerRegionInTile,
  renderedBody,
} from "./reader";

// ── Surface buttons ─────────────────────────────────────────────────────────────────────
//
// By role and name, as `web/e2e/helpers/shell.ts`'s `mainheadSurfaceButton` and
// `tileSurfaceButton` are: the segmented group is `role="group" aria-label="Surface"` in
// both hosts, and each segment a button named for its kind.

export type SurfaceKind = "claude" | "shell" | "docs";

/** The Focus mainhead's surface segment button, by exact accessible name. */
export function mainheadSurfaceButton(page: Page, kind: SurfaceKind): Locator {
  return page
    .locator("#mainhead")
    .getByRole("group", { name: "Surface" })
    .getByRole("button", { name: kind, exact: true });
}

/** A tile's surface segment button, scoped by session id. */
export function tileSurfaceButton(page: Page, sessionId: number, kind: SurfaceKind): Locator {
  return liveTileById(page, sessionId)
    .getByRole("group", { name: "Surface" })
    .getByRole("button", { name: kind, exact: true });
}

// ── Find-bar locators ───────────────────────────────────────────────────────────────────

export const SEARCH_LABEL = "Search document";

export function searchIcon(region: Locator): Locator {
  return region.getByRole("button", { name: SEARCH_LABEL, exact: true });
}

export function searchBox(region: Locator): Locator {
  return region.getByRole("searchbox", { name: SEARCH_LABEL, exact: true });
}

/** The count: `role="status"` inside the reader, minus the reader's own notice line. */
export function matchCount(region: Locator): Locator {
  return region.locator('[role="status"]:not(.reader-notice)');
}

export function previousMatch(region: Locator): Locator {
  return region.getByRole("button", { name: "Previous match", exact: true });
}

export function nextMatch(region: Locator): Locator {
  return region.getByRole("button", { name: "Next match", exact: true });
}

export function closeSearch(region: Locator): Locator {
  return region.getByRole("button", { name: "Close search", exact: true });
}

// ── Highlights (CSS Custom Highlight API) ──────────────────────────────────────────────

export interface FindRange {
  text: string;
  inSvg: boolean;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface FindHighlights {
  /** Every range of the larger highlight inside this reader, in document order. */
  all: FindRange[];
  /** The smaller highlight's ranges inside this reader (one while a match is current). */
  current: FindRange[];
  /** Index of the current range among `all`, or -1 when absent / not one of them. */
  currentIndex: number;
  /** Where the current range sits: `"ok"` when it is inside the reader body's visible box on
   * both axes, inside the visible box of every horizontally scrolling ancestor, clear of the
   * open find bar and not covered by another element; otherwise a reason. `null` when no
   * range is current. */
  currentPlacement: string | null;
  /** The reader body's own viewport box. */
  body: { top: number; bottom: number };
  /** How many highlight sets held ranges inside this reader. */
  sets: number;
}

/** Reads the highlights whose ranges lie inside `region`, so two readers on one page are
 * read independently (highlight names are document-global). */
export async function readHighlights(region: Locator): Promise<FindHighlights> {
  return region.evaluate((host) => {
    type Registry = Map<string, Iterable<AbstractRange>>;
    const registry = (CSS as unknown as { highlights: Registry }).highlights;
    const toRange = (r: AbstractRange): Range => {
      const out = document.createRange();
      out.setStart(r.startContainer, r.startOffset);
      out.setEnd(r.endContainer, r.endOffset);
      return out;
    };
    const sets: { name: string; ranges: Range[] }[] = [];
    for (const [name, highlight] of registry.entries()) {
      const ranges = [...highlight]
        .filter((r) => host.contains(r.startContainer) && host.contains(r.endContainer))
        .map(toRange);
      if (ranges.length > 0) {
        ranges.sort((a, b) => a.compareBoundaryPoints(Range.START_TO_START, b));
        sets.push({ name, ranges });
      }
    }
    sets.sort((a, b) => {
      if (b.ranges.length !== a.ranges.length) return b.ranges.length - a.ranges.length;
      return Number(/current|active/i.test(a.name)) - Number(/current|active/i.test(b.name));
    });
    const describe = (r: Range) => {
      const box = r.getBoundingClientRect();
      const start = r.startContainer;
      const owner = start instanceof Element ? start : start.parentElement;
      return {
        text: r.toString(),
        inSvg: owner?.closest("svg") != null,
        top: box.top,
        bottom: box.bottom,
        left: box.left,
        right: box.right,
      };
    };
    const all = sets[0]?.ranges ?? [];
    const current = sets[1]?.ranges ?? [];
    const first = current[0];
    const bodyEl = host.querySelector("article.md");
    // Placement is judged from what the user sees, never from the scroll offsets the product
    // set: every box is a live viewport box, and `elementFromPoint` is the covering oracle.
    type Edges = { left: number; right: number; top: number; bottom: number };
    const visible = (el: Element): Edges => {
      const box = el.getBoundingClientRect();
      const left = box.left + el.clientLeft;
      const top = box.top + el.clientTop;
      return { left, right: left + el.clientWidth, top, bottom: top + el.clientHeight };
    };
    const outsideX = (rect: Edges, box: Edges): string | null => {
      if (rect.left < box.left - 1) return `left of ${box.left} (${rect.left})`;
      if (rect.right > box.right + 1) return `right of ${box.right} (${rect.right})`;
      return null;
    };
    const outsideBody = (rect: Edges, box: Edges): string | null => {
      if (rect.top < box.top - 1) return `above the body (${rect.top} < ${box.top})`;
      if (rect.bottom > box.bottom + 1) return `below the body (${rect.bottom} > ${box.bottom})`;
      const x = outsideX(rect, box);
      return x === null ? null : `${x} in the body`;
    };
    const scrollsSideways = (el: Element): boolean => {
      const overflowX = getComputedStyle(el).overflowX;
      return el.scrollWidth > el.clientWidth && (overflowX === "auto" || overflowX === "scroll");
    };
    const outsideScroller = (rect: Edges, from: Element | null, body: Element): string | null => {
      for (let el = from; el; el = el.parentElement) {
        const x = scrollsSideways(el) ? outsideX(rect, visible(el)) : null;
        if (x !== null) return `${x} in its scroll container <${el.tagName.toLowerCase()}>`;
        if (el === body) break;
      }
      return null;
    };
    const underBar = (rect: Edges): string | null => {
      const bar = host.querySelector(".find-bar:not([hidden])")?.getBoundingClientRect();
      if (!bar) return null;
      const overlaps =
        rect.left < bar.right &&
        rect.right > bar.left &&
        rect.top < bar.bottom &&
        rect.bottom > bar.top;
      return overlaps
        ? `under the find bar (bar ${bar.left},${bar.top},${bar.right},${bar.bottom})`
        : null;
    };
    const covered = (rect: Edges, body: Element): string | null => {
      const hit = document.elementFromPoint(
        (rect.left + rect.right) / 2,
        (rect.top + rect.bottom) / 2,
      );
      if (!hit) return "outside the viewport";
      if (hit.closest(".find")) return "the find bar is topmost at the match's centre";
      return body.contains(hit) ? null : `covered by <${hit.tagName.toLowerCase()}>`;
    };
    const placementOf = (r: Range): string => {
      if (!bodyEl) return "no reader body";
      const rect = r.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return "the current range has no box";
      const container = r.commonAncestorContainer;
      const owner = container instanceof Element ? container : container.parentElement;
      return (
        outsideBody(rect, visible(bodyEl)) ??
        outsideScroller(rect, owner, bodyEl) ??
        underBar(rect) ??
        covered(rect, bodyEl) ??
        "ok"
      );
    };
    const currentIndex =
      first === undefined
        ? -1
        : all.findIndex(
            (r) =>
              r.startContainer === first.startContainer &&
              r.startOffset === first.startOffset &&
              r.endContainer === first.endContainer &&
              r.endOffset === first.endOffset,
          );
    const body = host.querySelector("article.md")?.getBoundingClientRect();
    return {
      all: all.map(describe),
      current: current.map(describe),
      currentIndex,
      currentPlacement: first === undefined ? null : placementOf(first),
      body: { top: body?.top ?? 0, bottom: body?.bottom ?? 0 },
      sets: sets.length,
    };
  });
}

/** Asserts the count text and that the highlights agree with it: `total` ranges in the
 * all-matches highlight, exactly one current range, and it is the `index`th (1-based). */
export async function expectFindState(
  region: Locator,
  state: { index: number; total: number },
): Promise<void> {
  await expect(matchCount(region)).toHaveText(`${state.index} of ${state.total}`);
  await expect
    .poll(async () => {
      const h = await readHighlights(region);
      return { all: h.all.length, current: h.current.length, index: h.currentIndex };
    })
    .toEqual({ all: state.total, current: 1, index: state.index - 1 });
}

/** Asserts no highlight range remains inside `region`. */
export async function expectNoHighlights(region: Locator): Promise<void> {
  await expect
    .poll(async () => {
      const h = await readHighlights(region);
      return h.all.length + h.current.length;
    })
    .toBe(0);
}

/** Asserts the current match is where the user can read it: inside the reader body's visible
 * box on both axes, inside the visible box of each horizontally scrolling ancestor (code
 * block, table, diagram), not under the open find bar and not covered by anything else. Reads
 * the live boxes on every poll, so a late scroll settles rather than fails. */
export async function expectCurrentMatchInView(region: Locator): Promise<void> {
  await expect
    .poll(async () => {
      const h = await readHighlights(region);
      return h.current[0] === undefined ? "no current range" : (h.currentPlacement ?? "ok");
    })
    .toBe("ok");
}

/** Asserts the highlighted text of the all-matches set, in document order: an oracle that
 * changes with the query even when two queries produce the same count. */
export async function expectHighlightedText(region: Locator, texts: string[]): Promise<void> {
  await expect
    .poll(async () => (await readHighlights(region)).all.map((r) => r.text))
    .toEqual(texts);
}

// ── Geometry ────────────────────────────────────────────────────────────────────────────

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function right(box: Box): number {
  return box.x + box.width;
}

export function bottom(box: Box): number {
  return box.y + box.height;
}

export async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("element has no bounding box");
  return box;
}

export interface BarMetrics {
  /** The bar's own box: the lowest common ancestor of the query box and the close button. */
  box: Box;
  scrollWidth: number;
  clientWidth: number;
  /** `true` when that ancestor is the reader section itself (no bar wrapper exists). */
  isReaderRoot: boolean;
}

/** The open bar's box and overflow, measured on the lowest common ancestor of its query
 * box and close button. Throws when either is missing. */
export async function barMetrics(region: Locator): Promise<BarMetrics> {
  return region.evaluate((host) => {
    const input = host.querySelector(`input[type="search"][aria-label="Search document"]`);
    const close = host.querySelector(`button[aria-label="Close search"]`);
    if (!input || !close) throw new Error("the find bar's query box or close button is missing");
    let node: Element | null = input;
    while (node && !node.contains(close)) node = node.parentElement;
    if (!node) throw new Error("no common ancestor for the find bar's controls");
    const r = node.getBoundingClientRect();
    return {
      box: { x: r.x, y: r.y, width: r.width, height: r.height },
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      isReaderRoot: node === host,
    };
  });
}

/** The corner geometry of one reader host: its reading area (`article.md`), its docbar and
 * the edge the icon/bar must hug — the nav's left border while the nav is open, the
 * reader's own right edge while it is collapsed. */
export interface CornerGeometry {
  body: Box;
  docbar: Box;
  rightEdge: number;
}

export async function cornerGeometry(region: Locator, navOpen: boolean): Promise<CornerGeometry> {
  const body = await boxOf(renderedBody(region));
  const docbar = await boxOf(docBar(region));
  const rightEdge = navOpen ? (await boxOf(readerNav(region))).x : right(await boxOf(region));
  return { body, docbar, rightEdge };
}

/** Checks a box lies in the reading area's top-right corner: inside `body`'s box, below the
 * docbar's bottom edge, and its right edge within 24 px of `rightEdge` (never past it). */
export function expectInCorner(what: string, box: Box, geometry: CornerGeometry): void {
  const { body, docbar, rightEdge } = geometry;
  expect(box.y, `${what}: below the docbar`).toBeGreaterThanOrEqual(bottom(docbar) - 0.5);
  expect(box.y, `${what}: inside the reading area (top)`).toBeGreaterThanOrEqual(body.y - 0.5);
  expect(bottom(box), `${what}: inside the reading area (bottom)`).toBeLessThanOrEqual(
    bottom(body) + 0.5,
  );
  expect(box.x, `${what}: inside the reading area (left)`).toBeGreaterThanOrEqual(body.x - 0.5);
  expect(right(box), `${what}: right edge not past the target edge`).toBeLessThanOrEqual(
    rightEdge + 0.5,
  );
  expect(
    rightEdge - right(box),
    `${what}: right edge within 24px of the target edge`,
  ).toBeLessThanOrEqual(24);
}

/** The icon's box, asserted into the corner. */
export async function expectIconInCorner(
  region: Locator,
  navOpen: boolean,
  what: string,
): Promise<Box> {
  const icon = await boxOf(searchIcon(region));
  expectInCorner(what, icon, await cornerGeometry(region, navOpen));
  return icon;
}

/** The open bar's box, asserted into the corner and to have its own wrapper. */
export async function expectBarInCorner(
  region: Locator,
  navOpen: boolean,
  what: string,
): Promise<Box> {
  const bar = await barMetrics(region);
  expect(bar.isReaderRoot, `${what}: the bar has its own wrapper`).toBe(false);
  expectInCorner(what, bar.box, await cornerGeometry(region, navOpen));
  return bar.box;
}

export function samePosition(a: Box, b: Box): boolean {
  return Math.abs(a.x - b.x) <= 0.5 && Math.abs(a.y - b.y) <= 0.5;
}

/** Scrolls the reader body to its end by setting `scrollTop` — setup for a position
 * assertion, not evidence of any control. */
export async function scrollBodyToEnd(region: Locator): Promise<number> {
  return renderedBody(region).evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    return el.scrollTop;
  });
}

export async function bodyScrollTop(region: Locator): Promise<number> {
  return renderedBody(region).evaluate((el) => el.scrollTop);
}

/** The widest horizontal scroll offset among `locator` and its ancestors up to the reader
 * body — non-zero when stepping scrolled any code block, table or the body itself sideways. */
export async function sidewaysScroll(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    let widest = 0;
    for (let node: Element | null = el; node; node = node.parentElement) {
      widest = Math.max(widest, node.scrollLeft);
      if (node.matches("article.md")) break;
    }
    return widest;
  });
}

/** How far short of its end the body rests. */
export async function distanceFromEnd(region: Locator): Promise<number> {
  return renderedBody(region).evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
}

// ── Keyboard oracles ───────────────────────────────────────────────────────────────────

export interface LoggedKey {
  code: string;
  metaKey: boolean;
  defaultPrevented: boolean;
}

/** Records every Meta+F keydown on `page` with whether anything default-prevented it. The
 * listener sits in the capture phase on `window` and reads `defaultPrevented` once the
 * dispatch has finished, so it sees the verdict of every handler without being one. */
export async function installFindKeyLog(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __findKeys?: LoggedKey[] };
    if (w.__findKeys) return;
    const log: LoggedKey[] = [];
    w.__findKeys = log;
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.code !== "KeyF" || !event.metaKey) return;
        window.setTimeout(() => {
          log.push({
            code: event.code,
            metaKey: event.metaKey,
            defaultPrevented: event.defaultPrevented,
          });
        }, 0);
      },
      true,
    );
  });
}

export async function readFindKeyLog(page: Page): Promise<LoggedKey[]> {
  return page.evaluate(
    () => (window as unknown as { __findKeys?: LoggedKey[] }).__findKeys?.slice() ?? [],
  );
}

/** Waits for `n` logged Meta+F keydowns and returns the log. */
export async function waitForFindKeys(page: Page, n: number): Promise<LoggedKey[]> {
  await expect.poll(async () => (await readFindKeyLog(page)).length).toBe(n);
  return readFindKeyLog(page);
}

// ── Focus identity ─────────────────────────────────────────────────────────────────────

/** Tags the element that currently holds focus, so a later read can tell whether it is
 * the same node or a rebuilt equivalent. */
export async function tagActiveElement(page: Page, tag: string): Promise<void> {
  await page.evaluate((t) => {
    (document.activeElement as unknown as { __e2eTag?: string }).__e2eTag = t;
  }, tag);
}

export async function activeElementTag(page: Page): Promise<string | null> {
  return page.evaluate(
    () => (document.activeElement as unknown as { __e2eTag?: string }).__e2eTag ?? null,
  );
}

// ── Fixtures ───────────────────────────────────────────────────────────────────────────

export interface FindFixture {
  /** The file's basename in the session directory. */
  name: string;
  /** Its `# ` heading — what the body shows once the file has rendered. */
  heading: string;
}

const CROWD_HEADING = Array.from({ length: 40 }, () => "heron").join(" ");

export const FIND_FILES = {
  /** Frontmatter value, a paragraph (different case) and a code block each hold `quokka`;
   * the file's own basename appears twice in the body (once upper-cased). */
  main: { name: "find-fixture.md", heading: "Find fixture" },
  /** 80 paragraphs; `needle` in paragraphs 3, 40 and 78 (mixed case). */
  tall: { name: "tall.md", heading: "Tall document" },
  /** 90 paragraphs; `needle` in paragraphs 50 and 70. */
  deep: { name: "deep.md", heading: "Deep document" },
  /** Regex metacharacters as literal text. */
  literal: { name: "literal.md", heading: "Literal document" },
  /** No frontmatter, no diagram. */
  plain: { name: "plain.md", heading: "Plain document" },
  /** Flat frontmatter: renders as a table. */
  flat: { name: "fm-flat.md", heading: "Flat document" },
  /** Nested frontmatter: renders as a raw block. */
  raw: { name: "fm-raw.md", heading: "Raw document" },
  /** One mermaid fence whose node label is `Zorblax`. */
  diagram: { name: "diagram-find.md", heading: "Diagram document" },
  /** A 40-word `# heading` of `heron`: the body's first line is all matches and wraps to
   * several lines at the tile widths. */
  crowd: { name: "crowd.md", heading: CROWD_HEADING },
  /** Frontmatter then a heading: the first rendered line is the frontmatter table. */
  frontline: { name: "frontline.md", heading: "Frontline document" },
  /** A long code line ending `codefar` and a 60-column table ending `tablefar`. */
  wide: { name: "wide.md", heading: "Wide document" },
  /** 30 paragraphs, a mermaid fence labelled `Zorblax`, then two paragraphs saying it too. */
  lateDiagram: { name: "late-diagram.md", heading: "Late diagram document" },
} as const satisfies Record<string, FindFixture>;

export type FindFileKey = keyof typeof FIND_FILES;

const FILLER = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor";

/** `count` paragraphs; each index in `needles` carries the word `Needle`, optionally
 * swapped for the same-length `Noodle` when `swap` lists it. Same height either way. */
export function tallBody(
  heading: string,
  count: number,
  needles: readonly number[],
  swap: readonly number[] = [],
): string {
  const lines = [`# ${heading}`, ""];
  for (let i = 1; i <= count; i += 1) {
    let word = "filler";
    if (needles.includes(i)) word = swap.includes(i) ? "Noodle" : "Needle";
    lines.push(`Paragraph ${i} holds a ${word} amid ${FILLER} ${FILLER}.`, "");
  }
  return lines.join("\n");
}

const WIDE_COLUMNS = Array.from({ length: 60 }, (_, i) => `c${i + 1}`);
const WIDE_CELLS = WIDE_COLUMNS.map((_, i) =>
  i === WIDE_COLUMNS.length - 1 ? "tablefar" : `v${i + 1}`,
);

/** The text of every document in `FIND_FILES`, by key — the bytes the E2E helper writes and
 * the `find-docs*` render scenarios transcribe. */
export const FIND_DOCUMENTS: Record<FindFileKey, string> = {
  main: [
    "---",
    "animal: quokka",
    "status: draft",
    "---",
    `# ${FIND_FILES.main.heading}`,
    "",
    "A QUOKKA sat on the log beside the river.",
    "",
    "The notes live in find-fixture.md and FIND-FIXTURE.MD names the same file.",
    "",
    "```text",
    'const pet = "Quokka";',
    "```",
    "",
  ].join("\n"),
  tall: tallBody(FIND_FILES.tall.heading, 80, [3, 40, 78]),
  deep: tallBody(FIND_FILES.deep.heading, 90, [50, 70]),
  literal: [
    `# ${FIND_FILES.literal.heading}`,
    "",
    "The strings abc and a.c and A.C and a*c and (x) all sit here.",
    "",
  ].join("\n"),
  plain: [`# ${FIND_FILES.plain.heading}`, "", "Alpha beta ALPHA gamma alpha.", ""].join("\n"),
  flat: [
    "---",
    "animal: quokka",
    "status: draft",
    "---",
    `# ${FIND_FILES.flat.heading}`,
    "",
    "The quokka waits here.",
    "",
  ].join("\n"),
  raw: [
    "---",
    "tags:",
    "  - a",
    "  - b",
    "notes: |",
    "  the quokka hides in the raw block",
    "---",
    `# ${FIND_FILES.raw.heading}`,
    "",
    "A quokka in the body too.",
    "",
  ].join("\n"),
  diagram: [
    `# ${FIND_FILES.diagram.heading}`,
    "",
    "```mermaid",
    "flowchart TD",
    "  A[Zorblax] --> B[Plain node]",
    "```",
    "",
  ].join("\n"),
  crowd: [`# ${CROWD_HEADING}`, "", "A closing paragraph with no match in it.", ""].join("\n"),
  frontline: [
    "---",
    "animal: heron",
    "status: draft",
    "---",
    `# ${FIND_FILES.frontline.heading}`,
    "",
    "The heron waits here.",
    "",
  ].join("\n"),
  wide: [
    `# ${FIND_FILES.wide.heading}`,
    "",
    "A short paragraph before the wide parts.",
    "",
    "```text",
    `${Array.from({ length: 75 }, (_, i) => `word${i + 1}`).join(" ")} codefar`,
    "```",
    "",
    `| ${WIDE_COLUMNS.join(" | ")} |`,
    `| ${WIDE_COLUMNS.map(() => "---").join(" | ")} |`,
    `| ${WIDE_CELLS.join(" | ")} |`,
    "",
    "A short paragraph after the wide parts.",
    "",
  ].join("\n"),
  lateDiagram: [
    `# ${FIND_FILES.lateDiagram.heading}`,
    "",
    ...Array.from(
      { length: 30 },
      (_, i) => `Paragraph ${i + 1} holds filler amid ${FILLER} ${FILLER}.\n`,
    ),
    "```mermaid",
    "flowchart TD",
    "  A[Zorblax] --> B[Plain node]",
    "```",
    "",
    "After the diagram one: zorblax.",
    "",
    "After the diagram two: ZORBLAX.",
    "",
  ].join("\n"),
};
