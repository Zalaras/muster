// Locators and routes for the diff viewer's render tests. The harness serves the diff GETs from
// the fixture's `diff` recording; here the three review writes answer 204 (`writes: "ok"`) or
// stay at the harness's 404 (`writes: "fail"`), and `failReads` overrides the diff read with 500.
import { type Dashboard, expect, type Locator, type Page, settleFor } from "./harness";

export interface DiffFile {
  path: string;
  oldPath: string | null;
  status: string;
  binary: boolean;
  additions: number;
  deletions: number;
  hunks: { lines: { kind: string; old: number | null; new: number | null; text: string }[] }[];
}

export interface DiffRead {
  base: string;
  files: DiffFile[];
}

export const BUTTON =
  /^(branch · )?(\d+ files? \+\d+ −\d+ · )?(💬 \d+ · )?(View diff ›|Close diff ×)$/;

export type Writes = "ok" | "fail";

/** Serves the recording behind the page and nudges the page's counts poll. */
export async function openDiff(
  dashboard: Dashboard,
  page: Page,
  scenario: string,
  opts: { writes?: Writes; failReads?: boolean } = {},
) {
  const fixture = await dashboard.open(scenario);
  const down = {
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "diff_failed", message: "could not read the diff" } }),
  };
  if ((opts.writes ?? "ok") === "ok") {
    await page.route(/\/api\/sessions\/\d+\/diff\/(comments\/[^/]+|ticks)$/, (route) =>
      route.fulfill({ status: 204 }),
    );
  }
  if (opts.failReads) {
    await page.route(/\/api\/sessions\/\d+\/diff\?/, (route) => route.fulfill(down));
  }
  await settleFor(page, 6000);
  return fixture;
}

export function diffButton(page: Page): Locator {
  return page.getByRole("button", { name: BUTTON });
}

export function viewer(page: Page): Locator {
  return page.getByRole("region", { name: "Diff", exact: true });
}

export async function openViewer(page: Page): Promise<Locator> {
  await diffButton(page).click();
  const v = viewer(page);
  await expect(v).toBeVisible();
  return v;
}

export async function chooseView(page: Page, name: "Unified" | "Split" | "Review") {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

/** A file's section by its path. */
export function fileSection(v: Locator, path: string): Locator {
  return v.locator("section.dv-file").filter({ hasText: path }).first();
}

export const PRAISE = "src/praise.ts";

/** The rendered colour of a design token, by painting it on a probe. */
export async function tokenColour(page: Page, token: string): Promise<string> {
  return await page.evaluate((t) => {
    const probe = document.createElement("div");
    probe.style.background = `var(${t})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  }, token);
}

function channels(colour: string): [number, number, number] {
  const m = colour.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) throw new Error(`not an rgb colour: ${colour}`);
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

export function contrast(a: string, b: string): number {
  const lum = (colour: string) => {
    const [r, g, bl] = channels(colour).map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export function css(loc: Locator, prop: string): Promise<string> {
  return loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
}

/**
 * Answers the diff read with one file of `n` separate changes (a replaced line each, context
 * between). The recorded scenarios hold five changes; this is the same wire shape, a read and
 * not a snapshot, for a change map far past the recorded size.
 */
export async function serveManyChanges(page: Page, n: number) {
  const lines: DiffFile["hunks"][number]["lines"] = [];
  let at = 1;
  for (let i = 0; i < n; i++) {
    lines.push({ kind: "context", old: at, new: at, text: `const keep${i} = ${i};` });
    lines.push({ kind: "del", old: at + 1, new: null, text: `const old${i} = ${i};` });
    lines.push({ kind: "add", old: null, new: at + 1, text: `const new${i} = ${i};` });
    at += 2;
  }
  const file = {
    path: "src/many.ts",
    oldPath: null,
    status: "modified",
    binary: false,
    additions: n,
    deletions: n,
    hunks: [
      {
        header: `@@ -1,${at - 1} +1,${at - 1} @@`,
        oldStart: 1,
        oldLines: at - 1,
        newStart: 1,
        newLines: at - 1,
        lines,
      },
    ],
  };
  const body = JSON.stringify({
    base: "HEAD (2b3752a)",
    scope: "uncommitted",
    fingerprint: "many200",
    files: [file],
  });
  await page.route(/\/api\/sessions\/\d+\/diff\?/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body }),
  );
}
