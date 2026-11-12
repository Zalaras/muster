// What the reader nav's claude section shows for a recorded daemon state (plan claude-tmp-files,
// mockup B): the folded summary row and its chips, the unfolded plan and scratch rows, the
// section on an ended session, the docbar `tmp` badge, and the fold's memory. The daemon-side
// behaviour (hooks moving the folder, re-fetches) is web/e2e/reader-scratch.spec.ts.
import { railCardByTitle } from "./helpers/card-location";
import {
  type Dashboard,
  expect,
  type Locator,
  type Page,
  type RenderFixture,
  settleFor,
  test,
} from "./helpers/harness";
import {
  barFileName,
  barPath,
  filesHeaderToggle,
  navToggle,
  navTreeSection,
  noPlanText,
  outlineEntries,
  planSlotEntry,
  readerNav,
  readerRegion,
  readerRegionInTile,
} from "./helpers/reader";
import { mainheadSurfaceButton, tileSurfaceButton } from "./helpers/reader-find";
import {
  claudeSummary,
  docbarBadge,
  expectNavReachesEveryRow,
  expectSectionsNaturalHeight,
  planChip,
  type RecordedScratch,
  rowAge,
  scratchBadge,
  scratchRow,
  scratchRows,
  tmpChip,
  unfoldClaude,
} from "./helpers/reader-scratch";

const SCRATCH = "reader-docs-scratch";
const ENDED = "reader-docs-scratch-ended";
const ONLY = "reader-docs-scratch-only";
const NO_PLAN = "reader-docs";
const TITLE = "reader";

function scratchOf(fixture: RenderFixture): RecordedScratch {
  const listing = fixture.reader[0]?.listing as { scratch: RecordedScratch | null } | undefined;
  if (!listing?.scratch) throw new Error(`${fixture.scenario} records no scratch block`);
  return listing.scratch;
}

async function openDocs(
  page: Page,
  dashboard: Dashboard,
  scenario: string,
): Promise<{ region: Locator; fixture: RenderFixture }> {
  const fixture = await dashboard.open(scenario);
  await railCardByTitle(page, TITLE).click();
  await mainheadSurfaceButton(page, "docs").click();
  const region = readerRegion(page, TITLE);
  await expect(region).toBeVisible();
  return { region, fixture };
}

/** The scratch rows' relative paths in DOM order, from each row's absolute-path title. */
async function rowPaths(region: Locator, dir: string): Promise<string[]> {
  const titles = await scratchRows(region).evaluateAll((els) =>
    els.map((el) => el.getAttribute("title") ?? ""),
  );
  return titles.map((t) => t.slice(dir.length + 1));
}

test("folded by default: the summary row reads claude with a plan chip and a 3 tmp chip, and no plan or scratch row is in the DOM (R1, REQ-7, REQ-8, INV-3)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openDocs(page, dashboard, SCRATCH);
  const summary = claudeSummary(region);
  await expect(summary).toBeVisible();
  await expect(summary).toHaveAttribute("aria-expanded", "false");
  await expect(summary).toContainText(/claude/i);
  await expect(planChip(region)).toHaveText("plan");
  await expect(planChip(region)).not.toHaveClass(/\boff\b/);
  await expect(tmpChip(region)).toHaveText("3 tmp");
  await expect(planSlotEntry(region)).toHaveCount(0);
  await expect(scratchRows(region)).toHaveCount(0);
});

test("unfolded: the plan row then the scratch rows in the listing's order, each with a tmp badge and an age, the non-markdown file absent (R2, REQ-9, REQ-13, INV-3)", async ({
  page,
  dashboard,
}) => {
  const { region, fixture } = await openDocs(page, dashboard, SCRATCH);
  const scratch = scratchOf(fixture);
  await claudeSummary(region).click();
  await expect(claudeSummary(region)).toHaveAttribute("aria-expanded", "true");

  await expect(planSlotEntry(region)).toBeVisible();
  await expect(rowAge(planSlotEntry(region))).toHaveText(/^(now|\d+[mhd] ago)$/);
  await expect(scratchRows(region)).toHaveCount(scratch.files.length);
  expect(await rowPaths(region, scratch.dir)).toEqual(scratch.files.map((f) => f.path));
  // the chips stay on the summary row while open, so they must still agree with the rows (kb:adr/reader-claude-chips-stay-when-unfolded)
  await expect(tmpChip(region)).toHaveText(`${scratch.files.length} tmp`);
  await expect(planChip(region)).toHaveText("plan");

  for (const file of scratch.files) {
    const row = scratchRow(region, file.path);
    await expect(row).toBeVisible();
    await expect(scratchBadge(row)).toHaveText("tmp");
    // kb:adr/reader-scratch-row-age-bare: a scratch row's age is the bare bucket, no `ago`
    await expect(rowAge(row)).toHaveText(/^(now|\d+[mhd])$/);
    await expect(row).toHaveAttribute("title", `${scratch.dir}/${file.path}`);
  }

  // the plan row sits above every scratch row
  const planBox = await planSlotEntry(region).boundingBox();
  const firstScratch = await scratchRows(region).first().boundingBox();
  expect(planBox && firstScratch && planBox.y < firstScratch.y).toBe(true);
  // non-markdown and tasks/ output are never rows
  await expect(readerNav(region).getByText(/\.json|\.output/)).toHaveCount(0);
});

test("row ages come from the recorded modification times: bare on a scratch row, `ago` on the plan row (R2, REQ-9, REQ-13, W4)", async ({
  page,
  dashboard,
}) => {
  const { region, fixture } = await openDocs(page, dashboard, SCRATCH);
  const scratch = scratchOf(fixture);
  await claudeSummary(region).click();
  // The clock starts at the epoch and every mtime is the epoch plus minutes: ten minutes on,
  // each row reads its own distance from now.
  await settleFor(page, 10 * 60_000);
  const recording = fixture.reader[0];
  if (!recording) throw new Error("no reader recording");
  const planAt = (recording.listing as { plan: { modifiedAt: string } }).plan.modifiedAt;
  const minutes = (iso: string): number =>
    10 - (new Date(iso).getTime() - new Date("2026-01-01T00:00:00Z").getTime()) / 60_000;
  for (const file of scratch.files) {
    await expect(rowAge(scratchRow(region, file.path))).toHaveText(`${minutes(file.modifiedAt)}m`);
  }
  await expect(rowAge(planSlotEntry(region))).toHaveText(`${minutes(planAt)}m ago`);
});

test("a session without a plan or scratch files shows a dimmed no plan chip and no tmp chip; unfolded says no plan yet only (R3, REQ-7, REQ-9, INV-3)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openDocs(page, dashboard, NO_PLAN);
  await expect(planChip(region)).toHaveText("no plan");
  await expect(planChip(region)).toHaveClass(/\boff\b/);
  await expect(planChip(region)).toHaveCSS("opacity", "0.45");
  await expect(tmpChip(region)).toHaveCount(0);

  await claudeSummary(region).click();
  await expect(noPlanText(region)).toHaveText("no plan yet");
  await expect(planSlotEntry(region)).toHaveCount(0);
  await expect(scratchRows(region)).toHaveCount(0);
});

test("an ended session keeps the claude section: the plan and the scratch rows are present and open (R4, REQ-12)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open(ENDED);
  expect(fixture.snapshot.sessions.map((s) => s.alive)).toEqual([false]);
  await railCardByTitle(page, TITLE).click();
  await expect(page.locator("#dead-surface")).toBeVisible();
  await mainheadSurfaceButton(page, "docs").click();
  const region = readerRegion(page, TITLE);
  await expect(region).toBeVisible();

  const scratch = scratchOf(fixture);
  await expect(claudeSummary(region)).toBeVisible();
  await expect(planChip(region)).toHaveText("plan");
  await expect(tmpChip(region)).toHaveText(`${scratch.files.length} tmp`);
  await claudeSummary(region).click();
  await expect(planSlotEntry(region)).toBeVisible();
  await expect(scratchRows(region)).toHaveCount(scratch.files.length);

  await planSlotEntry(region).click();
  await expect(planSlotEntry(region)).toHaveAttribute("aria-current", "true");
  const first = scratchRow(region, scratch.files[0]!.path);
  await first.click();
  await expect(first).toHaveAttribute("aria-current", "true");
  await expect(docbarBadge(region)).toHaveText("tmp");
});

test("opening a scratch row shows the tmp badge, its absolute path and aria-current on that row only (R6, REQ-10)", async ({
  page,
  dashboard,
}) => {
  const { region, fixture } = await openDocs(page, dashboard, SCRATCH);
  const scratch = scratchOf(fixture);
  await claudeSummary(region).click();
  const target = scratch.files[scratch.files.length - 1]!;
  const row = scratchRow(region, target.path);
  await row.click();

  await expect(docbarBadge(region)).toBeVisible();
  await expect(docbarBadge(region)).toHaveText("tmp");
  // kb:adr/reader-scratch-badge-neutral-not-teal: a dashed border marks tmp, never the teal
  await expect(docbarBadge(region)).toHaveCSS("border-top-style", "dashed");
  await expect(scratchBadge(row)).toHaveCSS("border-top-style", "dashed");
  await expect(barFileName(region)).toHaveText(target.path.split("/").pop() ?? "");
  await expect(barPath(region)).toHaveText(`${scratch.dir}/${target.path}`);
  await expect(row).toHaveAttribute("aria-current", "true");
  await expect(readerNav(region).locator('button.f[aria-current="true"]')).toHaveCount(1);

  // switching to the plan moves the mark and the badge
  await planSlotEntry(region).click();
  await expect(docbarBadge(region)).toHaveText("plan");
  await expect(row).not.toHaveAttribute("aria-current", "true");
  await expect(planSlotEntry(region)).toHaveAttribute("aria-current", "true");
});

test("a session with one scratch file and no plan reads no plan and 1 tmp (R7, REQ-7, INV-3)", async ({
  page,
  dashboard,
}) => {
  const { region, fixture } = await openDocs(page, dashboard, ONLY);
  expect(scratchOf(fixture).files).toHaveLength(1);
  await expect(planChip(region)).toHaveText("no plan");
  await expect(planChip(region)).toHaveClass(/\boff\b/);
  await expect(tmpChip(region)).toHaveText("1 tmp");

  await claudeSummary(region).click();
  await expect(noPlanText(region)).toHaveText("no plan yet");
  await expect(scratchRows(region)).toHaveCount(1);
});

test("the whole summary row toggles, chips included, and the fold is remembered per session across a reload (REQ-8, W1)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openDocs(page, dashboard, SCRATCH);
  // a click on a chip is a click on the row
  await tmpChip(region).click();
  await expect(claudeSummary(region)).toHaveAttribute("aria-expanded", "true");
  await expect(scratchRows(region)).toHaveCount(3);
  await planChip(region).click();
  await expect(claudeSummary(region)).toHaveAttribute("aria-expanded", "false");
  await expect(scratchRows(region)).toHaveCount(0);

  await unfoldClaude(region);
  await page.reload();
  await railCardByTitle(page, TITLE).click();
  await mainheadSurfaceButton(page, "docs").click();
  const again = readerRegion(page, TITLE);
  await expect(claudeSummary(again)).toHaveAttribute("aria-expanded", "true");
  await expect(scratchRows(again)).toHaveCount(3);
});

test("the claude section sits above the Files header (R2, REQ-7)", async ({ page, dashboard }) => {
  const { region } = await openDocs(page, dashboard, SCRATCH);
  await claudeSummary(region).click();
  const summaryBox = await claudeSummary(region).boundingBox();
  const filesBox = await readerNav(region).getByRole("button", { name: "Files" }).boundingBox();
  expect(summaryBox && filesBox && summaryBox.y < filesBox.y).toBe(true);
});

// A layout rule holds across its width range, not at one width
// (kb:lesson/layout-invariant-needs-its-width-range).
for (const width of [1440, 1100, 900, 700, 560]) {
  test(`at ${width}px every summary and scratch row fits inside the nav, the nested path ellipsized with its absolute path in the title (R5, REQ-9)`, async ({
    page,
    dashboard,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { region, fixture } = await openDocs(page, dashboard, SCRATCH);
    const scratch = scratchOf(fixture);
    await claudeSummary(region).click();
    await expect(scratchRows(region)).toHaveCount(scratch.files.length);

    const navBox = await readerNav(region).boundingBox();
    if (!navBox) throw new Error("no nav box");
    const rows = [
      claudeSummary(region),
      planSlotEntry(region),
      ...(await scratchRows(region).all()),
    ];
    for (const row of rows) {
      const box = await row.boundingBox();
      if (!box) throw new Error("no row box");
      expect(box.x).toBeGreaterThanOrEqual(navBox.x - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(navBox.x + navBox.width + 0.5);
    }
    const noScroll = await readerNav(region).evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(noScroll).toBe(true);
    const nested = scratchRow(region, "options.md");
    await expect(nested).toHaveAttribute("title", `${scratch.dir}/notes/options.md`);
    const label = nested.locator(".nm");
    await expect(label).toHaveCSS("text-overflow", "ellipsis");
    await expect(label).toHaveCSS("overflow", "hidden");
  });
}

// The compact 3x2 tile is the narrowest host of the claude section.
for (const width of [1440, 1100, 900]) {
  test(`at ${width}px in a compact 3x2 tile the claude section fits inside the nav and its rows are clipped (R5, REQ-9)`, async ({
    page,
    dashboard,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await dashboard.open("reader-docs-scratch-tiles-3x2");
    expect(fixture.snapshot.prefs).toMatchObject({ view: "tiles", density: "3x2" });
    const scratch = scratchOf(fixture);
    const session = fixture.snapshot.sessions.find((s) => s.title === TITLE);
    if (!session) throw new Error("no reader session in fixture");
    await tileSurfaceButton(page, session.id, "docs").click();
    const region = readerRegionInTile(page, session.id);
    await expect(region).toBeVisible();
    // the compact tile starts with the nav collapsed
    await navToggle(region).click();
    await expect(readerNav(region)).toBeVisible();
    await claudeSummary(region).click();
    await expect(scratchRows(region)).toHaveCount(scratch.files.length);

    const navBox = await readerNav(region).boundingBox();
    if (!navBox) throw new Error("no nav box");
    const rows = [
      claudeSummary(region),
      planSlotEntry(region),
      ...(await scratchRows(region).all()),
    ];
    for (const row of rows) {
      const box = await row.boundingBox();
      if (!box) throw new Error("no row box");
      expect(box.x).toBeGreaterThanOrEqual(navBox.x - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(navBox.x + navBox.width + 0.5);
    }
    expect(await readerNav(region).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const nested = scratchRow(region, "options.md");
    await expect(nested).toHaveAttribute("title", `${scratch.dir}/notes/options.md`);
    await expect(nested.locator(".nm")).toHaveCSS("text-overflow", "ellipsis");
  });
}

// kb:adr/reader-nav-scrolls-as-one-column (supersedes reader-nav-sections-shrink-without-floor):
// the tree, the outline and the claude section's rows take their natural height and never shrink;
// `.rnav` is the one scroller. These tests replaced the per-section "keep a scrollable box"
// model, which the developer's decision withdrew; every host view is measured
// (kb:lesson/surface-never-measured-against-its-host).
const LARGE = "reader-docs-scratch-large";
const LARGE_TILES = "reader-docs-scratch-large-tiles-3x2";

async function openTile(page: Page, dashboard: Dashboard, scenario: string): Promise<Locator> {
  const fixture = await dashboard.open(scenario);
  const session = fixture.snapshot.sessions.find((s) => s.title === TITLE);
  if (!session) throw new Error("no reader session in fixture");
  await tileSurfaceButton(page, session.id, "docs").click();
  const region = readerRegionInTile(page, session.id);
  await expect(region).toBeVisible();
  await navToggle(region).click();
  await expect(readerNav(region)).toBeVisible();
  return region;
}

async function openOutline(region: Locator): Promise<void> {
  await unfoldClaude(region);
  await planSlotEntry(region).click();
  await expect(planSlotEntry(region)).toHaveAttribute("aria-current", "true");
  await expect(outlineEntries(region).first()).toBeAttached();
}

async function foldClaude(region: Locator): Promise<void> {
  if ((await claudeSummary(region).getAttribute("aria-expanded")) === "true") {
    await claudeSummary(region).click();
  }
  await expect(claudeSummary(region)).toHaveAttribute("aria-expanded", "false");
}

/** `.scratch-rows` is a 0px box, or absent, when folded or empty. */
async function expectScratchStripEmpty(region: Locator): Promise<void> {
  const h = await readerNav(region).evaluate((el) => {
    const s = el.querySelector(".scratch-rows");
    return s ? s.getBoundingClientRect().height : 0;
  });
  expect(h).toBe(0);
}

/** A row is whole inside the nav's current scroll window. */
async function rowInsideNav(row: Locator): Promise<boolean> {
  return row.evaluate((el) => {
    const b = (el.closest(".rnav") as HTMLElement).getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5;
  });
}

async function expectNaturalAndReachable(region: Locator, folded: boolean): Promise<void> {
  await openOutline(region);
  if (folded) await foldClaude(region);
  const nav = readerNav(region);
  await expectSectionsNaturalHeight(nav);
  await expectNavReachesEveryRow(nav, claudeSummary(region));
  if (folded) {
    await expectScratchStripEmpty(region);
  } else {
    await expect(scratchRows(region)).toHaveCount(3);
    expect(await nav.locator(".scratch-rows").evaluate((e) => e.clientHeight)).toBeGreaterThan(0);
    // every scratch row is reachable by scrolling the nav
    await nav.evaluate((el) => {
      el.scrollTop = 0;
    });
    for (const row of await scratchRows(region).all()) {
      await row.scrollIntoViewIfNeeded();
      expect(await rowInsideNav(row)).toBe(true);
    }
  }
}

for (const height of [900, 600, 450]) {
  test(`unfolded in Focus at ${height}px tall the Files tree, Outline and scratch rows take natural height and the nav scrolls as one column (R5, REQ-9)`, async ({
    page,
    dashboard,
  }) => {
    await page.setViewportSize({ width: 1440, height });
    const { region } = await openDocs(page, dashboard, SCRATCH);
    await openOutline(region);
    await expect(scratchRows(region)).toHaveCount(3);
    await expectSectionsNaturalHeight(readerNav(region));
    await readerNav(region).evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await rowInsideNav(outlineEntries(region).last())).toBe(true);
    await readerNav(region).evaluate((el) => {
      el.scrollTop = 0;
    });
    expect(await rowInsideNav(scratchRows(region).last())).toBe(true);
  });
}

for (const height of [900, 600]) {
  test(`unfolded in a compact 3x2 tile at ${height}px tall the Files tree, Outline and scratch rows take natural height and the nav scrolls as one column (R5, REQ-9)`, async ({
    page,
    dashboard,
  }) => {
    await page.setViewportSize({ width: 1440, height });
    const region = await openTile(page, dashboard, "reader-docs-scratch-tiles-3x2");
    await openOutline(region);
    await expect(scratchRows(region)).toHaveCount(3);
    await expectSectionsNaturalHeight(readerNav(region));
    await readerNav(region).evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await rowInsideNav(outlineEntries(region).last())).toBe(true);
  });
}

for (const height of [900, 600, 360]) {
  for (const folded of [false, true]) {
    test(`${folded ? "folded" : "unfolded"} in Focus at ${height}px tall every section takes natural height and the nav scrolls to the last tree and outline rows (R5, REQ-9)`, async ({
      page,
      dashboard,
    }) => {
      await page.setViewportSize({ width: 1440, height });
      const { region } = await openDocs(page, dashboard, LARGE);
      await expectNaturalAndReachable(region, folded);
    });
  }
}

for (const height of [600, 450]) {
  for (const folded of [false, true]) {
    test(`${folded ? "folded" : "unfolded"} in a compact 3x2 tile at ${height}px tall every section takes natural height and the nav scrolls to the last tree and outline rows (R5, REQ-9)`, async ({
      page,
      dashboard,
    }) => {
      await page.setViewportSize({ width: 1440, height });
      const region = await openTile(page, dashboard, LARGE_TILES);
      await expectNaturalAndReachable(region, folded);
    });
  }
}

test("with no plan and no scratch files the unfolded claude section leaves no empty scratch strip (R3, REQ-9)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openDocs(page, dashboard, NO_PLAN);
  await unfoldClaude(region);
  await expect(scratchRows(region)).toHaveCount(0);
  await expectScratchStripEmpty(region);
});

test("the large fixture has three scratch files and a populated Files tree (R5, REQ-9)", async ({
  page,
  dashboard,
}) => {
  const { region, fixture } = await openDocs(page, dashboard, LARGE);
  expect(scratchOf(fixture).files).toHaveLength(3);
  await unfoldClaude(region);
  await expect(scratchRows(region)).toHaveCount(3);
  expect(await navTreeSection(region).locator("button").count()).toBeGreaterThan(10);
});

// #67 restored: the Files header's folder path wraps instead of clamping, in every host.
async function expectDirWraps(region: Locator): Promise<void> {
  const dir = filesHeaderToggle(region).locator(".dir");
  await expect(dir).toBeVisible();
  const m = await dir.evaluate((el) => {
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
    return {
      lineClamp: cs.getPropertyValue("-webkit-line-clamp"),
      textOverflow: cs.textOverflow,
      clipped: el.scrollHeight > el.clientHeight + 1,
      height: el.getBoundingClientRect().height,
      lh,
    };
  });
  expect(m.lineClamp).not.toBe("1");
  expect(m.textOverflow).not.toBe("ellipsis");
  expect(m.clipped).toBe(false);
  expect(m.height).toBeGreaterThan(m.lh * 1.5);
}

test("in Focus the Files header's folder path wraps rather than clamping (R5, REQ-9, #67)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openDocs(page, dashboard, LARGE);
  await unfoldClaude(region);
  await expectDirWraps(region);
});

test("in a compact tile the Files header's folder path wraps rather than clamping (R5, REQ-9, #67)", async ({
  page,
  dashboard,
}) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  const region = await openTile(page, dashboard, "reader-docs-scratch-tiles-3x2");
  await unfoldClaude(region);
  await expectDirWraps(region);
});
