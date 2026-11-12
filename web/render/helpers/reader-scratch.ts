// Locators and oracles for the reader nav's claude section (plan claude-tmp-files): the folded
// summary row, its chips, the plan row and the scratchpad rows. Pure DOM, transcribed from the
// plan's Testable UI Elements table; no daemon and no fixture knowledge beyond the shape of a
// recording's `scratch` block.
import { expect, type Locator } from "./harness";
import { barPlanBadge, readerNav } from "./reader";

/** The summary row: `button` named `Claude`, `aria-expanded` tracking the fold. */
export function claudeSummary(region: Locator): Locator {
  return readerNav(region).getByRole("button", { name: "Claude", exact: true });
}

/** The `plan` / dimmed `no plan` chip inside the summary row. */
export function planChip(region: Locator): Locator {
  return claudeSummary(region).locator('[data-role="plan-chip"]');
}

/** The `<n> tmp` chip; absent at 0. */
export function tmpChip(region: Locator): Locator {
  return claudeSummary(region)
    .locator(".chip")
    .filter({ hasText: /^\d+ tmp$/ });
}

/** Every scratch file row in the DOM, in document order. */
export function scratchRows(region: Locator): Locator {
  return readerNav(region).locator("button.f.scratch");
}

/** One scratch row by (a part of) its relative path. */
export function scratchRow(region: Locator, rel: string): Locator {
  return scratchRows(region).filter({ hasText: rel });
}

/** A row's `tmp` badge. */
export function scratchBadge(row: Locator): Locator {
  return row.locator(".badge");
}

/** A row's age (`now`, `2m`, `1h`, `2d`). */
export function rowAge(row: Locator): Locator {
  return row.locator(".when");
}

/** The docbar badge (`plan` or `tmp`). */
export function docbarBadge(region: Locator): Locator {
  return barPlanBadge(region);
}

/** Unfolds the section when it is folded. */
export async function unfoldClaude(region: Locator): Promise<void> {
  const summary = claudeSummary(region);
  if ((await summary.getAttribute("aria-expanded")) !== "true") await summary.click();
}

const NAV_SECTIONS = [".tree", ".outline", ".plan-slot", ".scratch-rows"];

/** Every nav section that is in the DOM, with its box and overflow-y. */
export async function navSectionMetrics(
  nav: Locator,
): Promise<{ section: string; clientHeight: number; scrollHeight: number; overflowY: string }[]> {
  return nav.evaluate((el, sections) => {
    const out = [];
    for (const section of sections) {
      const s = el.querySelector(section) as HTMLElement | null;
      if (!s) continue;
      out.push({
        section,
        clientHeight: s.clientHeight,
        scrollHeight: s.scrollHeight,
        overflowY: getComputedStyle(s).overflowY,
      });
    }
    return out;
  }, NAV_SECTIONS);
}

/**
 * kb:adr/reader-nav-scrolls-as-one-column: no section scrolls on its own (natural height, no
 * overflow-y auto|scroll) and `.rnav` is the one scroller.
 */
export async function expectSectionsNaturalHeight(nav: Locator): Promise<void> {
  const metrics = await navSectionMetrics(nav);
  expect(metrics.map((m) => m.section)).toEqual(expect.arrayContaining([".tree", ".outline"]));
  for (const m of metrics) {
    expect(m.clientHeight, `${m.section} clientHeight == scrollHeight`).toBe(m.scrollHeight);
    expect(["auto", "scroll"], `${m.section} overflow-y`).not.toContain(m.overflowY);
  }
  expect(await nav.evaluate((el) => getComputedStyle(el).overflowY)).toMatch(/auto|scroll/);
}

/** Scrolled to its end the nav holds the last tree and outline rows whole; at the top, the summary row. */
export async function expectNavReachesEveryRow(nav: Locator, summary: Locator): Promise<void> {
  const lastRows = (): Promise<{ tree: boolean; outline: boolean }> =>
    nav.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const fit = (sel: string): boolean => {
        const rows = el.querySelectorAll(`${sel} button`);
        const last = rows[rows.length - 1];
        if (!last) return false;
        const r = last.getBoundingClientRect();
        return r.height > 0 && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5;
      };
      return { tree: fit(".tree"), outline: fit(".outline") };
    });
  await nav.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await lastRows()).toEqual({ tree: true, outline: true });
  await nav.evaluate((el) => {
    el.scrollTop = 0;
  });
  const [nb, sb] = await Promise.all([nav.boundingBox(), summary.boundingBox()]);
  expect(nb && sb && sb.y >= nb.y - 0.5 && sb.y + sb.height <= nb.y + nb.height + 0.5).toBe(true);
}

/** The recorded listing's scratch block. */
export interface RecordedScratch {
  dir: string;
  files: { path: string; modifiedAt: string; writtenAt: string | null }[];
}
