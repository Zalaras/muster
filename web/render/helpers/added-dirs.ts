// The Focus header's `+N` added-directories suffix and its location panel: the suffix's
// locator and drawing oracle, the panel's
// locator, hover path, anchored text pattern and placement geometry. Pure DOM — the panel
// reads the session's `addedDirs` off the snapshot and opens client-side — so both tiers
// use it: the render spec here directly (card-location.spec.ts, for a fixture's list), the
// E2E journeys through `web/e2e/helpers/added-dirs.ts`, which re-exports it beside the
// status-line post and the wire oracle only the daemon answers.
import { expect, type Locator, type Page } from "./harness";

// --- The header's `+N` suffix. ---

/** The folder line `.repo .rf` of the Focus header. */
export function headerFolderLine(page: Page): Locator {
  return page.locator("#mainhead .meta .loc .repo .rf");
}

/** The `+N` span: the last child of the folder line (plan Testable UI Elements). */
export function addedCountSuffix(page: Page): Locator {
  return headerFolderLine(page).locator(":scope > span:last-child");
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The folder line ends in `+N` right after the folder name (an optional ` /` may sit between). */
export function folderLineEndingInPlus(folder: string, n: number): RegExp {
  return new RegExp(`^${escapeRegExp(folder)}[ /]*\\+${n}$`);
}

/**
 * What is wrong with the suffix's drawing right now: it must lie inside the viewport and its own
 * folder line, and be what the pointer meets at its centre and at its right edge — a suffix
 * clipped by the folder line's `overflow: hidden` is a box that exists but is not drawn.
 */
export async function suffixProblems(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const suffix = document.querySelector<HTMLElement>(
      "#mainhead .meta .loc .repo .rf > span:last-child",
    );
    if (!suffix) return ["the suffix is missing"];
    const line = suffix.parentElement as HTMLElement;
    const box = suffix.getBoundingClientRect();
    const lineBox = line.getBoundingClientRect();
    const out: string[] = [];
    if (box.width <= 0) out.push("the suffix has no width");
    if (box.left < 0 || box.right > document.documentElement.clientWidth + 0.5)
      out.push(`the suffix ${box.left}-${box.right} is outside the viewport`);
    if (box.right > lineBox.right + 0.5)
      out.push(`the suffix ends at ${box.right}, past its folder line at ${lineBox.right}`);
    const y = box.top + box.height / 2;
    for (const [label, x] of [
      ["centre", box.left + box.width / 2],
      ["right edge", box.right - 1],
    ] as const) {
      const hit = document.elementFromPoint(x, y);
      if (!hit || !suffix.contains(hit))
        out.push(`the pointer at the suffix's ${label} meets something else`);
    }
    return out;
  });
}

/** Whether the folder name (anything in the folder line but the suffix) is cut with an ellipsis. */
export async function nameEllipsized(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const suffix = document.querySelector<HTMLElement>(
      "#mainhead .meta .loc .repo .rf > span:last-child",
    );
    const line = suffix?.parentElement;
    if (!suffix || !line) return false;
    return [line, ...line.querySelectorAll<HTMLElement>("*")]
      .filter((el) => el !== suffix && !suffix.contains(el))
      .some(
        (el) => getComputedStyle(el).textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth,
      );
  });
}

// --- The location panel. ---

/** The panel is the page's one `role="tooltip"`, appended to `document.body` while open. */
export function locationPanel(page: Page): Locator {
  return page.getByRole("tooltip");
}

/** The header readout the panel hangs off. */
function readout(page: Page): Locator {
  return page.locator("#mainhead .meta .loc");
}

/** Moves the mouse off everything, then rests it on the readout (a real pointer path). */
export async function hoverReadout(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await readout(page).hover();
}

export async function leaveReadout(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
}

export interface PanelRow {
  folder: string;
  /** `null`: the row shows the folder and the path alone. */
  branch: string | null;
  path: string;
}

export interface PanelExpectation {
  /** The launch checkout's row. */
  launch: PanelRow;
  /** The `↳` row, present only while Claude is elsewhere. */
  moved?: PanelRow;
  /** The added directories in wire order; empty means no `Added directories` section at all. */
  added: PanelRow[];
}

function rowPattern(row: PanelRow): string {
  const branch = row.branch === null ? "" : ` · ${escapeRegExp(row.branch)}`;
  // `textContent` has no whitespace between the folder line and the path line, so adjacency
  // is `\s*`; a row with a branch the test did not expect would not match a null-branch row.
  return `${escapeRegExp(row.folder)}${branch}\\s*${escapeRegExp(row.path)}`;
}

/**
 * The panel's whole text as one anchored pattern: the `Location` heading, the launch row, the
 * `↳` row when moved, then `Added directories · N` and one row per directory in wire order.
 * Anchored at both ends, so an extra section, a row out of order or a stray branch fails it.
 */
export function panelPattern(expected: PanelExpectation): RegExp {
  let source = `^\\s*Location\\s*${rowPattern(expected.launch)}\\s*`;
  if (expected.moved) source += `↳\\s*${rowPattern(expected.moved)}\\s*`;
  if (expected.added.length > 0) {
    source += `Added directories · ${expected.added.length}\\s*`;
    for (const row of expected.added) source += `${rowPattern(row)}\\s*`;
  }
  return new RegExp(`${source}$`);
}

/**
 * Opens the panel with the mouse and asserts its content, retrying the whole hover so a panel
 * that was opened before the data arrived is closed and opened again rather than read stale.
 * Leaves the mouse off the readout, so the panel is closed on return.
 */
export async function expectLocationPanel(page: Page, expected: PanelExpectation): Promise<void> {
  await expect(async () => {
    await hoverReadout(page);
    // Shortened from the 15 s default on purpose: each toPass attempt re-hovers, so a panel
    // showing stale text is replaced by the next attempt instead of waited on.
    await expect(locationPanel(page)).toHaveText(panelPattern(expected), { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await leaveReadout(page);
  await expect(locationPanel(page)).toHaveCount(0);
}

// --- The panel's placement. ---

export interface PanelGeometry {
  viewportHeight: number;
  readout: { top: number; bottom: number };
  panel: { top: number; bottom: number; height: number };
  /** Every `.dr` row of the open panel, top to bottom. */
  rows: { top: number; bottom: number }[];
}

/** The open panel's and the readout's boxes, measured in one evaluation so they share a frame. */
export async function panelGeometry(page: Page): Promise<PanelGeometry> {
  return await page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    };
    const panel = document.querySelector('[role="tooltip"]');
    const readout = document.querySelector("#mainhead .meta .loc");
    if (!panel || !readout) throw new Error("the panel or the readout is not in the page");
    return {
      viewportHeight: window.innerHeight,
      readout: box(readout),
      panel: box(panel),
      rows: [...panel.querySelectorAll(".dr")].map(box),
    };
  });
}

/** The panel's margins (decisions/location-panel-overflow
 * outcome B): the gap it keeps from the viewport's edge and from the readout it hangs off. */
export const EDGE_GAP = 8;
export const ANCHOR_GAP = 4;
