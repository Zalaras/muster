// reader — the display properties of plans markdown-viewing (REQ-1 through REQ-28, INV-1
// through INV-8, acceptance E1-E29), markdown-render-fixes, frontmatter, mermaid-support
// (REQ-1 through REQ-15, acceptance E2-E15), reader-expanded-persists and the review
// cycles, re-levelled from web/e2e/reader.spec.ts and web/e2e/reader-mermaid.spec.ts on
// 2026-10-20 (plans/_audit/test-audit-2026-10-20-relevel.md): what the docs surface shows
// for a listing and documents the fixture carries — the nav tree, the outline, the docbar,
// the rendered body, its sanitization, frontmatter, diagrams and their modal — in Focus and
// in Tiles at both densities. The documents come from the `reader-docs*` and
// `reader-diagrams*` fixtures' reader recording
// (kb:adr/process-render-fixtures-record-reader-documents); the view and the density are
// the fixture's prefs. Nothing here changes daemon state: opening the docs surface and a
// file touches only the two recorded GETs.
//
// Stays E2E: every Write hook (the changed dot, the freshness cue, a re-render), a held or
// delayed listing/file response, a vanished directory (409), a file over the cap (413),
// confinement (404), a daemon kill or restart, the /clear rebinds and the plan-mode scan,
// anything on a live tmux pane, a theme or view change (a pref round-trip whose broadcast
// the harness never sends), and every test that opens the pop-out through its link: the
// pop-out is a second page, and the harness installs its routes on the first page only.
import { railCardByTitle } from "./helpers/card-location";
import {
  type Dashboard,
  expect,
  loadFixture,
  type Locator,
  type Page,
  RENDER_ORIGIN,
  settleFor,
  type RenderFixture,
  test,
} from "./helpers/harness";
import {
  barFileName,
  barPath,
  barPlanBadge,
  bodyLoadingPlaceholder,
  bodyPlaceholder,
  canvasTransform,
  diagramCanvas,
  diagramClose,
  diagramDialog,
  diagramDialogRaw,
  diagramErrorLine,
  diagramFigure,
  diagramFigures,
  diagramStage,
  diagramZoomIn,
  diagramZoomOut,
  diagramZoomReset,
  docBar,
  enlargeButton,
  fileEntry,
  filesHeaderToggle,
  filterBox,
  FM_RAW_INNER,
  folderEntry,
  freshnessCue,
  frontmatterFallback,
  frontmatterKeyCell,
  frontmatterKeyCells,
  frontmatterTable,
  frontmatterValueCell,
  INTERLEAVED_DOCUMENT,
  keptMermaidSource,
  LARGE_TREE,
  LARGE_TREE_DOCUMENTS,
  LONG_NAMES,
  MARKDOWN_TREE_DOCUMENTS,
  MERMAID_DOCUMENTS,
  navLabelLayout,
  navOutlineSection,
  navToggle,
  navTreeSection,
  noPlanText,
  OriginRequestTracker,
  outlineEntries,
  outlineEntry,
  outlineHeaderToggle,
  planHeaderRow,
  planSlotEntry,
  READER_DOCUMENTS,
  READER_PLAN_BODY,
  type ReaderDocument,
  readerNav,
  readerRegion,
  readerRegionInTile,
  renderedBody,
} from "./helpers/reader";
import { mainheadSurfaceButton, tileSurfaceButton } from "./helpers/reader-find";
import { terminalRegion } from "./helpers/surfaces";
import { liveTileById } from "./helpers/tiles";

/** The one-session scenarios: an idle session titled `reader` on a plain directory holding
 * the markdown tree and every inline document, in Focus and in Tiles at each density; the
 * same checkout with a plan named from the transcript; the same checkout ended. */
const FOCUS = "reader-docs";
const TILES_2X2 = "reader-docs-tiles-2x2";
const TILES_3X2 = "reader-docs-tiles-3x2";
const PLAN = "reader-docs-plan";
const ENDED = "reader-docs-ended";
/** Twenty files and a thirty-heading document, in Focus and in Tiles at 2×2. */
const LARGE = "reader-docs-large";
const LARGE_TILES_2X2 = "reader-docs-large-tiles-2x2";
/** The mermaid documents, in Focus, in Tiles at 3×2, and as a pair `reader-a`/`reader-b`. */
const DIAGRAMS = "reader-diagrams";
const DIAGRAMS_TILES_3X2 = "reader-diagrams-tiles-3x2";
const DIAGRAMS_PAIR_2X2 = "reader-diagrams-pair-2x2";
const TITLE = "reader";

const TREE_SCENARIOS = [FOCUS, TILES_2X2, TILES_3X2, PLAN, ENDED];
const LARGE_SCENARIOS = [LARGE, LARGE_TILES_2X2];
const DIAGRAM_SCENARIOS = [DIAGRAMS, DIAGRAMS_TILES_3X2, DIAGRAMS_PAIR_2X2];

/** The fixture session with `title`, by id. */
function sessionIdTitled(fixture: RenderFixture, title: string): number {
  const session = fixture.snapshot.sessions.find((s) => s.title === title);
  if (!session) throw new Error(`fixture ${fixture.scenario} has no session titled ${title}`);
  return session.id;
}

/** The recorded listing of the fixture's one session. */
function listingOf(fixture: RenderFixture): {
  directory: string;
  plan: { path: string; exists: boolean } | null;
} {
  const [recording] = fixture.reader;
  if (!recording) throw new Error(`fixture ${fixture.scenario} carries no reader recording`);
  return recording.listing as { directory: string; plan: { path: string; exists: boolean } | null };
}

/** Opens `scenario`, clicks the `reader` session's rail card and switches Focus to the docs
 * surface. The reader region is returned visible; nothing is open yet. */
async function openFocusReader(
  page: Page,
  dashboard: Dashboard,
  scenario = FOCUS,
): Promise<{ region: Locator; fixture: RenderFixture; id: number }> {
  const fixture = await dashboard.open(scenario);
  expect(fixture.snapshot.prefs.view).toBe("focus");
  const id = sessionIdTitled(fixture, TITLE);
  await railCardByTitle(page, TITLE).click();
  await mainheadSurfaceButton(page, "docs").click();
  const region = readerRegion(page, TITLE);
  await expect(region).toBeVisible();
  return { region, fixture, id };
}

/** Opens a Tiles scenario at `density` (its pref) and opens the titled session's tile docs
 * surface. The reader region is returned visible; nothing is open yet. */
async function openTileReader(
  page: Page,
  dashboard: Dashboard,
  scenario: string,
  density: "2×2" | "3×2",
  title = TITLE,
): Promise<{ region: Locator; fixture: RenderFixture; id: number }> {
  const fixture = await dashboard.open(scenario);
  expect(fixture.snapshot.prefs).toMatchObject({
    view: "tiles",
    density: density === "2×2" ? "2x2" : "3x2",
  });
  await expect(page.locator("#view-tiles")).toBeVisible();
  await expect(page.getByRole("button", { name: density })).toHaveAttribute("aria-pressed", "true");
  const id = sessionIdTitled(fixture, title);
  await tileSurfaceButton(page, id, "docs").click();
  const region = readerRegionInTile(page, id);
  await expect(region).toBeVisible();
  return { region, fixture, id };
}

// ── The fixtures carry the E2E suite's documents ───────────────────────────────────────

function basenames(docs: readonly ReaderDocument[]): string[] {
  return docs.map((d) => d.path.split("/").pop() ?? d.path).sort();
}

/** Asserts one recording lists exactly `docs` (the `.md` ones, by basename) and serves each
 * with the bytes the helper holds, plus `extra` paths with their bodies. */
function expectRecordingHolds(
  scenario: string,
  recording: RenderFixture["reader"][number],
  docs: readonly ReaderDocument[],
  extra: { path: string; body: string }[] = [],
): void {
  const listing = recording.listing as { directory: string; files: { path: string }[] };
  // The walk lists `.md` files and skips dot-directories (kb:spec/reader), so `notes.txt`
  // and `.hidden/secret.md` are written but never listed.
  const markdown = docs.filter(
    (d) =>
      d.path.toLowerCase().endsWith(".md") &&
      !d.path.split("/").some((segment) => segment.startsWith(".")),
  );
  expect(
    listing.files.map((f) => f.path).sort(),
    `${scenario}: session ${recording.sessionId} lists the markdown documents and nothing else`,
  ).toEqual(markdown.map((d) => d.path).sort());
  expect(
    recording.files.map((f) => f.path.split("/").pop()).sort(),
    `${scenario}: every listed document is recorded`,
  ).toEqual([...basenames(markdown), ...extra.map((e) => e.path.split("/").pop())].sort());
  for (const doc of markdown) {
    const file = recording.files.find((f) => f.path === `${listing.directory}/${doc.path}`);
    expect(file?.body, `${scenario}: ${doc.path}`).toBe(doc.body);
  }
  for (const e of extra) {
    const file = recording.files.find((f) => f.path === e.path);
    expect(file?.body, `${scenario}: ${e.path}`).toBe(e.body);
  }
}

/** Asserts every session of each scenario records `docs`, and — when `planBody` is given —
 * a plan that exists with that body; otherwise no plan at all. */
async function expectFixturesHold(
  scenarios: string[],
  docs: readonly ReaderDocument[],
  planBody: string | null,
): Promise<void> {
  for (const scenario of scenarios) {
    const fixture = await loadFixture(scenario);
    expect(fixture.reader.length, `${scenario}: one recording per session`).toBe(
      fixture.snapshot.sessions.length,
    );
    for (const recording of fixture.reader) {
      const listing = recording.listing as { plan: { path: string; exists: boolean } | null };
      if (planBody === null) expect(listing.plan, `${scenario}: no plan`).toBeNull();
      else expect(listing.plan?.exists, `${scenario}: the plan exists`).toBe(true);
      const extra =
        planBody !== null && listing.plan ? [{ path: listing.plan.path, body: planBody }] : [];
      expectRecordingHolds(scenario, recording, docs, extra);
    }
  }
}

test("every reader fixture records each document the E2E helper writes with the same bytes, and only the markdown ones outside dot-directories (fixture identity)", async () => {
  const tree = [...Object.values(MARKDOWN_TREE_DOCUMENTS), ...Object.values(READER_DOCUMENTS)];
  await expectFixturesHold(
    TREE_SCENARIOS.filter((s) => s !== PLAN),
    tree,
    null,
  );
  await expectFixturesHold([PLAN], tree, READER_PLAN_BODY);
  await expectFixturesHold(LARGE_SCENARIOS, LARGE_TREE_DOCUMENTS, null);
  await expectFixturesHold(
    DIAGRAM_SCENARIOS,
    [...Object.values(MERMAID_DOCUMENTS), INTERLEAVED_DOCUMENT],
    null,
  );
});

// ── markdown-viewing: the surface, the plan slot, the tree ─────────────────────────────

test("Focus mainhead gains a docs segment; selecting it shows the reader and hides the Claude terminal, and selecting claude restores it (E1, REQ-1, REQ-2)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open(FOCUS);
  expect(fixture.snapshot.prefs.view).toBe("focus");
  await railCardByTitle(page, TITLE).click();
  await expect(terminalRegion(page, TITLE)).toBeVisible();

  const docsBtn = mainheadSurfaceButton(page, "docs");
  await expect(docsBtn).toBeVisible();

  await docsBtn.click();
  await expect(readerRegion(page, TITLE)).toBeVisible();
  await expect(terminalRegion(page, TITLE)).toHaveCount(0);
  await expect(docsBtn).toHaveAttribute("aria-pressed", "true");

  await mainheadSurfaceButton(page, "claude").click();
  await expect(terminalRegion(page, TITLE)).toBeVisible();
  await expect(readerRegion(page, TITLE)).toHaveCount(0);
});

test("a session whose transcript names an existing plan file opens it automatically with the plan badge and full path (E3, REQ-7, REQ-9, REQ-4)", async ({
  page,
  dashboard,
}) => {
  const { region, fixture } = await openFocusReader(page, dashboard, PLAN);
  const plan = listingOf(fixture).plan;
  if (!plan?.exists) throw new Error("the plan fixture names no existing plan");
  const planPath = plan.path;

  await expect(barPlanBadge(region)).toBeVisible();
  await expect(barFileName(region)).toHaveText(planPath.split("/").pop() ?? "");
  await expect(barPath(region)).toHaveText(planPath);
  await expect(planSlotEntry(region)).toHaveAttribute("aria-current", "true");
});

test("a session whose transcript names no plan shows no plan yet and lists the directory's files (E4, REQ-9)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openFocusReader(page, dashboard);
  await expect(noPlanText(region)).toHaveText("no plan yet");
  await expect(fileEntry(region, "TODO.md")).toBeVisible();
});

test("the tree lists exactly the fixture's markdown files, folders collapsed with counts, and expanding reveals children (E6, REQ-10)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openFocusReader(page, dashboard);

  await expect(fileEntry(region, "TODO.md")).toBeVisible();
  await expect(folderEntry(region, "docs")).toBeVisible();
  await expect(fileEntry(region, "notes.txt")).toHaveCount(0);
  await expect(fileEntry(region, "secret.md")).toHaveCount(0);

  await folderEntry(region, "docs").click();
  await expect(folderEntry(region, "adr")).toBeVisible();
  await folderEntry(region, "adr").click();
  await expect(fileEntry(region, "x.md")).toBeVisible();
});

test("typing in the filter narrows the tree to matching files with ancestors expanded, and clearing restores the collapsed tree (E7, REQ-11)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openFocusReader(page, dashboard);
  await expect(fileEntry(region, "TODO.md")).toBeVisible();
  await expect(fileEntry(region, "x.md")).toHaveCount(0);

  await filterBox(region).fill("x.md");
  await expect(fileEntry(region, "x.md")).toBeVisible();
  await expect(fileEntry(region, "TODO.md")).toHaveCount(0);

  await filterBox(region).fill("");
  await expect(fileEntry(region, "TODO.md")).toBeVisible();
  await expect(fileEntry(region, "x.md")).toHaveCount(0);
});

test("the open file carries aria-current, moving to whichever file is opened (E8, REQ-12)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openFocusReader(page, dashboard);
  await expect(fileEntry(region, "TODO.md")).toBeVisible();

  await fileEntry(region, "TODO.md").click();
  await expect(fileEntry(region, "TODO.md")).toHaveAttribute("aria-current", "true");

  await folderEntry(region, "docs").click();
  await folderEntry(region, "adr").click();
  await fileEntry(region, "x.md").click();
  await expect(fileEntry(region, "x.md")).toHaveAttribute("aria-current", "true");
  await expect(fileEntry(region, "TODO.md")).not.toHaveAttribute("aria-current", "true");
});

test("before any write hook for the open file, no freshness cue element exists (E11, REQ-24)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openFocusReader(page, dashboard);
  await fileEntry(region, "TODO.md").click();
  await expect(renderedBody(region)).toContainText("TODO");
  await expect(freshnessCue(region)).toHaveCount(0);
});

// ── markdown-viewing: the rendered body ────────────────────────────────────────────────

test("a file with a GFM table, task list and fenced code renders a table, disabled checkboxes and a code block (E15, REQ-5)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openFocusReader(page, dashboard);
  await fileEntry(region, "gfm.md").click();
  const body = renderedBody(region);
  await expect(body.locator("table")).toBeVisible();
  await expect(body.locator('input[type="checkbox"]')).toHaveCount(2);
  await expect(body.locator('input[type="checkbox"]').first()).toBeDisabled();
  await expect(body.locator("pre code")).toBeVisible();
});

test("a file containing a script element, an onerror attribute and a javascript: link renders with none of them present (E16, REQ-22)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openFocusReader(page, dashboard);
  await fileEntry(region, "unsafe.md").click();
  const body = renderedBody(region);
  await expect(body).toContainText("Unsafe");
  await expect(body.locator("script")).toHaveCount(0);
  await expect(body.locator("[onerror]")).toHaveCount(0);
  await expect(body.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { __readerXss?: boolean }).__readerXss),
  ).toBeUndefined();
});

test("the outline lists the file's headings, clicking one scrolls the body, and scrolling moves aria-current (E17, REQ-14)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openFocusReader(page, dashboard);
  await fileEntry(region, "long.md").click();
  await expect(outlineEntry(region, "Bottom")).toBeVisible();

  await outlineEntry(region, "Bottom").click();
  await expect(outlineEntry(region, "Bottom")).toHaveAttribute("aria-current", "true");

  await renderedBody(region).evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(outlineEntry(region, "Top")).toHaveAttribute("aria-current", "true");
});

test("a long file or folder name truncates with an ellipsis and a long heading wraps, all inside the nav (#67)", async ({
  page,
  dashboard,
}) => {
  const { folder, file, heading } = LONG_NAMES;
  const { region } = await openFocusReader(page, dashboard);
  const nav = readerNav(region);
  await folderEntry(region, folder).click();
  await fileEntry(region, file).click();
  await expect(outlineEntry(region, heading)).toBeVisible();

  for (const entry of [folderEntry(region, folder), fileEntry(region, file)]) {
    const layout = await navLabelLayout(nav, entry);
    expect(layout).toMatchObject({ textOverflow: "ellipsis", overflowX: "hidden", lines: 1 });
    expect(layout.display).not.toMatch(/flex/);
    expect(layout.overflowing).toBe(true);
    expect(layout.labelRight).toBeLessThanOrEqual(layout.navRight);
  }
  // The folder's count sits after its name — a label that never shrinks pushes it out.
  const navBox = await nav.boundingBox();
  const countBox = await folderEntry(region, folder).locator(".cnt").boundingBox();
  expect(countBox).not.toBeNull();
  expect((countBox?.x ?? 0) + (countBox?.width ?? 0)).toBeLessThanOrEqual(
    (navBox?.x ?? 0) + (navBox?.width ?? 0),
  );

  // The files header carries the checkout's full path — long, with unbroken segments —
  // so it wraps inside the panel too.
  const dirHeader = await navLabelLayout(nav, filesHeaderToggle(region));
  expect(dirHeader.overflowing).toBe(false);
  expect(dirHeader.labelRight).toBeLessThanOrEqual(dirHeader.navRight);

  const outline = await navLabelLayout(nav, outlineEntry(region, heading));
  expect(outline.lines).toBeGreaterThan(1);
  expect(outline.overflowing).toBe(false);
  expect(outline.labelRight).toBeLessThanOrEqual(outline.navRight);
});

test("a repeated heading gets deduplicated ids so each outline entry scrolls to its own heading (edge case 26, REQ-14)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openFocusReader(page, dashboard);
  await fileEntry(region, "dup.md").click();

  await expect(outlineEntry(region, "Notes")).toHaveCount(2);
  await expect(renderedBody(region).locator("#notes")).toBeVisible();
  await expect(renderedBody(region).locator("#notes-2")).toBeVisible();
});

// ── markdown-viewing: the nav's folds, the toggle, memory ──────────────────────────────

test("the Files and Outline header toggles fold independently, and the nav toggle hides and restores the whole nav (E18, REQ-14, REQ-4; markdown-render-fixes REQ-1..REQ-3)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openFocusReader(page, dashboard);
  await expect(fileEntry(region, "TODO.md")).toBeVisible();

  await filesHeaderToggle(region).click();
  await expect(filesHeaderToggle(region)).toHaveAttribute("aria-expanded", "false");
  await expect(fileEntry(region, "TODO.md")).toHaveCount(0);
  await expect(outlineHeaderToggle(region)).toHaveAttribute("aria-expanded", "true");

  // plan markdown-render-fixes REQ-1..REQ-3: one button, never hidden, whose glyph and
  // aria-expanded track the nav's own state.
  const toggle = navToggle(region);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveText("›");
  await toggle.click();
  await expect(readerNav(region)).toHaveCount(0);
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveText("‹");

  await toggle.click();
  await expect(readerNav(region)).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveText("›");
});

test("the last opened file is remembered across a reload (E19, REQ-7)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openFocusReader(page, dashboard);
  await expect(fileEntry(region, "TODO.md")).toBeVisible();
  await folderEntry(region, "docs").click();
  await folderEntry(region, "adr").click();
  await fileEntry(region, "x.md").click();
  await expect(barFileName(region)).toHaveText("x.md");

  await mainheadSurfaceButton(page, "claude").click();
  await page.reload();
  await railCardByTitle(page, TITLE).click();
  await mainheadSurfaceButton(page, "docs").click();

  await expect(barFileName(readerRegion(page, TITLE))).toHaveText("x.md");
});

test("on an ended session the plan block and the nav's plan header row are absent, opening a tree file still renders it, and the nav toggle still hides/restores the nav (E22, REQ-3; markdown-render-fixes E5, REQ-6)", async ({
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
  await expect(planSlotEntry(region)).toHaveCount(0);
  await expect(noPlanText(region)).toHaveCount(0);
  // REQ-6: the plan header row is hidden with the slot it labels — no empty padded
  // strip at the top of the nav on a dead session.
  await expect(planHeaderRow(region)).toBeHidden();

  // The nav toggle is unaffected by session liveness — still present and still works.
  const toggle = navToggle(region);
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(readerNav(region)).toHaveCount(0);
  await toggle.click();
  await expect(readerNav(region)).toBeVisible();

  await fileEntry(region, "TODO.md").click();
  await expect(renderedBody(region)).toContainText("TODO");
});

test("in Tiles at 3x2 the reader nav starts collapsed and the bar has no path, with the nav toggle still present and flush right; at 2x2 it starts open (E27, REQ-15; markdown-render-fixes E1, REQ-1/REQ-2, INV-ONE-ARROW, edge case 8)", async ({
  page,
  dashboard,
}) => {
  // 3x2: a session opened at this density starts compact — nav collapsed, no path.
  const { region: regionA } = await openTileReader(page, dashboard, TILES_3X2, "3×2");
  await expect(readerNav(regionA)).toHaveCount(0);
  await expect(barPath(regionA)).toHaveCount(0);

  // edge case 8: the compact 3x2 tile renders neither `.path` nor the file count, but
  // the nav toggle is unaffected — still exactly one, still visible, still flush right
  // against the docbar's own padded edge.
  const toggleA = navToggle(regionA);
  await expect(toggleA).toBeVisible();
  await expect(regionA.locator(".arr")).toHaveCount(1);
  const [toggleABox, barABox] = await Promise.all([
    toggleA.boundingBox(),
    docBar(regionA).boundingBox(),
  ]);
  expect(toggleABox).not.toBeNull();
  expect(barABox).not.toBeNull();
  expect(
    Math.abs(toggleABox!.x + toggleABox!.width - (barABox!.x + barABox!.width - 12)),
  ).toBeLessThanOrEqual(1);

  // 2x2: a session opened at this density starts with the nav open. The density is the
  // fixture's pref, so the 2×2 fixture is opened on the same page (deliberate difference).
  const { region: regionB } = await openTileReader(page, dashboard, TILES_2X2, "2×2");
  await expect(readerNav(regionB)).toBeVisible();
});

test("the reader nav sits beside the body as a right-hand column bounded by its host, in Focus and in a tile (review cycle 1 Critical 1, REQ-4/REQ-9/REQ-10/REQ-14)", async ({
  page,
  dashboard,
}) => {
  // Focus: `.reader` mounts into `#main-terminal-slot` (features/focus.ts) — that slot
  // is the host bounding it here. Measured pre-fix at y=487, stacked below a 980px body;
  // the grid fix puts it beside the body instead.
  const { region: focusRegion, id } = await openFocusReader(page, dashboard, LARGE);
  await expect(readerNav(focusRegion)).toBeVisible();

  // Open the 30-heading file so `.rnav .outline` has content of its own to overflow —
  // the tree overflows regardless of what's open, but the outline only ever reflects
  // the currently open file.
  await fileEntry(focusRegion, LARGE_TREE.outlineFileName).click();
  await expect(renderedBody(focusRegion)).toContainText(LARGE_TREE.lastHeading);

  const focusHostBox = await page.locator("#main-terminal-slot").boundingBox();
  const focusBodyBox = await renderedBody(focusRegion).boundingBox();
  const focusNavBox = await readerNav(focusRegion).boundingBox();
  expect(focusHostBox).not.toBeNull();
  expect(focusBodyBox).not.toBeNull();
  expect(focusNavBox).not.toBeNull();
  // Right-hand column: the nav starts at or past the body's own right edge, never below it.
  expect(focusNavBox!.x).toBeGreaterThanOrEqual(focusBodyBox!.x + focusBodyBox!.width);
  // Bounded by its host, not overflowing past the slot it is mounted into.
  expect(focusNavBox!.y + focusNavBox!.height).toBeLessThanOrEqual(
    focusHostBox!.y + focusHostBox!.height + 1,
  );

  // review cycle 2 Critical 1: bounding the nav (above) exposed `.rnav .tree`/`.rnav
  // .outline` clipping their own content — each is independently `overflow-y: auto`
  // rather than the whole nav scrolling as one column, so reachability has to be
  // measured by scrolling the OWNING element to its own `scrollHeight`, never the nav's.
  // First, confirm this fixture genuinely overflows each section (so the reachability
  // check below isn't vacuously true against content that already fit).
  const treeSection = navTreeSection(focusRegion);
  const outlineSection = navOutlineSection(focusRegion);
  await expect(fileEntry(focusRegion, LARGE_TREE.lastFileName)).toBeAttached();
  await expect(outlineEntry(focusRegion, LARGE_TREE.lastHeading)).toBeAttached();

  expect(await treeSection.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
  expect(await outlineSection.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
  const treeOverflow = await treeSection.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(treeOverflow.scrollHeight).toBeGreaterThan(treeOverflow.clientHeight);
  const outlineOverflow = await outlineSection.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(outlineOverflow.scrollHeight).toBeGreaterThan(outlineOverflow.clientHeight);

  // Now scroll each section to its own scrollHeight and confirm the last row of each is
  // actually reachable — this is what the fix made possible; before it, nothing scrolled
  // (neither the section nor `.rnav` itself) and both rows sat permanently past the fold.
  await treeSection.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const treeBox = await treeSection.boundingBox();
  const lastFileBox = await fileEntry(focusRegion, LARGE_TREE.lastFileName).boundingBox();
  expect(treeBox).not.toBeNull();
  expect(lastFileBox).not.toBeNull();
  expect(lastFileBox!.y + lastFileBox!.height).toBeLessThanOrEqual(
    treeBox!.y + treeBox!.height + 1,
  );

  await outlineSection.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const outlineBox = await outlineSection.boundingBox();
  const lastHeadingBox = await outlineEntry(focusRegion, LARGE_TREE.lastHeading).boundingBox();
  expect(outlineBox).not.toBeNull();
  expect(lastHeadingBox).not.toBeNull();
  expect(lastHeadingBox!.y + lastHeadingBox!.height).toBeLessThanOrEqual(
    outlineBox!.y + outlineBox!.height + 1,
  );

  // The same session's reader hosted by a tile. The view is the fixture's pref, so the 2×2
  // Tiles fixture is opened on the same page (deliberate difference); the tile's reader
  // re-opens the outline file from the session's browser memory, and the nav is open at
  // this density.
  await openTileReader(page, dashboard, LARGE_TILES_2X2, "2×2");
  const tile = liveTileById(page, id);
  const tileRegion = readerRegionInTile(page, id);
  await expect(tileRegion).toBeVisible();
  await expect(readerNav(tileRegion)).toBeVisible();
  await expect(renderedBody(tileRegion)).toContainText(LARGE_TREE.lastHeading);

  const tileHostBox = await tile.boundingBox();
  const tileBodyBox = await renderedBody(tileRegion).boundingBox();
  const tileNavBox = await readerNav(tileRegion).boundingBox();
  expect(tileHostBox).not.toBeNull();
  expect(tileBodyBox).not.toBeNull();
  expect(tileNavBox).not.toBeNull();
  expect(tileNavBox!.x).toBeGreaterThanOrEqual(tileBodyBox!.x + tileBodyBox!.width);
  // The worse half of Critical 1: the nav ended 25.5px past the tile's own bottom edge,
  // painting over the chrome below.
  expect(tileNavBox!.y + tileNavBox!.height).toBeLessThanOrEqual(
    tileHostBox!.y + tileHostBox!.height + 1,
  );
});

// review cycle 3 sweep: the fix restores focus by stable key across a genuinely
// structural rebuild (expand/collapse/filter). Expanding a folder changes the flattened
// entry list (kind/path/name/depth/expanded/count all feed the structural signature), which
// destroys and replaces every tree button, including the one just clicked — proven here
// by an element-handle identity check, not merely "a button matching the same name is
// focused afterwards".
test("expanding a tree folder rebuilds the section structurally and restores focus onto the new equivalent button, not the destroyed old node (review cycle 3 Major 1 sweep)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openFocusReader(page, dashboard);
  const folder = folderEntry(region, "docs");
  await expect(folder).toBeVisible();
  await expect(folder).toHaveAttribute("aria-expanded", "false");

  await folder.focus();
  await expect(folder).toBeFocused();
  const oldHandle = await folder.elementHandle();
  if (!oldHandle) throw new Error("folder button not found");

  await page.keyboard.press("Enter");
  await expect(folderEntry(region, "adr")).toBeVisible();

  // The old node is gone (a genuine structural rebuild happened)...
  expect(await page.evaluate((n) => !document.contains(n), oldHandle)).toBe(true);
  // ...and focus is NOT still "pointing at" that removed node...
  expect(await page.evaluate((n) => document.activeElement === n, oldHandle)).toBe(false);
  // ...but a new button with the same accessible name and the toggled state IS focused —
  // the restore-by-stable-key the fix implements, not mere accidental survival.
  const newFolder = folderEntry(region, "docs");
  await expect(newFolder).toBeFocused();
  await expect(newFolder).toHaveAttribute("aria-expanded", "true");
});

// ── markdown-render-fixes ───────────────────────────────────────────────────────────────

test("the reader has exactly one nav-toggle button, never hidden, whose right edge is unchanged between the nav open and collapsed (E1, REQ-1, REQ-2, INV-ONE-ARROW, INV-ARROW-FIXED)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openFocusReader(page, dashboard);
  const toggle = navToggle(region);
  await expect(toggle).toBeVisible();
  await expect(region.locator(".arr")).toHaveCount(1);

  const openBox = await toggle.boundingBox();
  expect(openBox).not.toBeNull();

  await toggle.click();
  await expect(readerNav(region)).toHaveCount(0);
  await expect(region.locator(".arr")).toHaveCount(1);
  const collapsedBox = await toggle.boundingBox();
  expect(collapsedBox).not.toBeNull();

  expect(
    Math.abs(openBox!.x + openBox!.width - (collapsedBox!.x + collapsedBox!.width)),
  ).toBeLessThanOrEqual(1);
});

test("a pop-out opened with no path query settles its body on nothing open — pick a file (E11, REQ-9)", async ({
  page,
  dashboard,
}) => {
  // The direct-navigation shape edge case 9 describes: no `pop out ↗` link exists to
  // click (nothing is open, so `popOutHref` is null). The page itself navigates to
  // `doc.html`, so the harness's routes still answer — unlike a popup window, which is a
  // second page the routes never reach.
  const fixture = await dashboard.open(FOCUS);
  const id = sessionIdTitled(fixture, TITLE);
  await page.goto(`${RENDER_ORIGIN}/doc.html?session=${id}`);
  const region = readerRegion(page, TITLE);
  await expect(bodyPlaceholder(region)).toBeVisible();
  await expect(bodyLoadingPlaceholder(region)).toHaveCount(0);
});

// ── frontmatter ─────────────────────────────────────────────────────────────────────────

test("opening a file with flat frontmatter shows a Frontmatter table as the body's first element with one row per key, and the outline's first entry is the document's first real heading (plan frontmatter E3, REQ-1, REQ-2, REQ-5, REQ-6, edge case 20)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openFocusReader(page, dashboard);
  await fileEntry(region, "front.md").click();
  const body = renderedBody(region);
  await expect(body).toContainText("Real Heading");

  await expect(frontmatterKeyCells(region)).toHaveCount(3);
  await expect(frontmatterKeyCell(region, "id")).toBeVisible();
  await expect(frontmatterValueCell(region, "id")).toHaveText(
    "reader-plan-located-by-transcript-scan",
  );
  await expect(frontmatterKeyCell(region, "tags")).toBeVisible();
  await expect(frontmatterValueCell(region, "tags")).toHaveText("[claude-code-format, store]");
  await expect(frontmatterKeyCell(region, "status")).toBeVisible();
  await expect(frontmatterValueCell(region, "status")).toHaveText("accepted");

  // REQ-5: the frontmatter table is the first child of the rendered body.
  expect(await body.evaluate((el) => el.firstElementChild?.tagName)).toBe("TABLE");

  // REQ-6: no outline entry for any frontmatter key; the outline starts at the
  // document's own first real heading and has exactly the document's two headings.
  await expect(outlineEntry(region, "id")).toHaveCount(0);
  await expect(outlineEntry(region, "tags")).toHaveCount(0);
  await expect(outlineEntries(region)).toHaveCount(2);
  await expect(outlineEntries(region).first()).toHaveText("Real Heading");

  // edge case 20: frontmatter-only file — table renders, outline is empty.
  await fileEntry(region, "only-front.md").click();
  await expect(frontmatterValueCell(region, "solo")).toHaveText("value");
  await expect(outlineEntries(region)).toHaveCount(0);
});

test("a frontmatter value carrying <img onerror> and <script> shows as literal text and no img or script element exists in the body (plan frontmatter E4, REQ-2, REQ-5, edge case 21)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openFocusReader(page, dashboard);
  await fileEntry(region, "fm-unsafe.md").click();
  const body = renderedBody(region);
  await expect(body).toContainText("Heading");

  await expect(frontmatterValueCell(region, "title")).toHaveText(
    '<img src=x onerror="window.__fmXss = true">',
  );
  await expect(frontmatterValueCell(region, "note")).toHaveText(
    "<script>window.__fmXss = true;</script>",
  );
  await expect(body.locator("img")).toHaveCount(0);
  await expect(body.locator("script")).toHaveCount(0);
  await expect(body.locator("[onerror]")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { __fmXss?: boolean }).__fmXss),
  ).toBeUndefined();
});

test("opening a file with nested-YAML frontmatter shows the raw block verbatim in pre.frontmatter and no body heading or outline entry contains frontmatter text (plan frontmatter E5, REQ-3, REQ-6, edge case 22, edge case 23)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openFocusReader(page, dashboard);
  await fileEntry(region, "fm-raw.md").click();
  const body = renderedBody(region);
  await expect(body).toContainText("Real Heading");

  await expect(frontmatterTable(region)).toHaveCount(0);
  const fallback = frontmatterFallback(region);
  await expect(fallback).toBeVisible();
  // REQ-3's "verbatim" is exact bytes, not the whitespace-normalized comparison
  // `toHaveText` performs — a raw `textContent()` equality check is the only oracle
  // that can tell a preserved newline from a collapsed one.
  await expect.poll(async () => fallback.textContent()).toBe(FM_RAW_INNER);

  // REQ-6 / edge case 23: the "# Not a real heading" line lives inside the raw block
  // and never reaches the outline or becomes a body heading.
  await expect(outlineEntry(region, "Not a real heading")).toHaveCount(0);
  await expect(outlineEntries(region)).toHaveCount(1);
  await expect(outlineEntries(region).first()).toHaveText("Real Heading");
  await expect(body.locator("h1, h2, h3, h4, h5, h6")).toHaveCount(1);
});

test("a long frontmatter key never forces article.md to scroll horizontally in a 3x2 tile with the file explorer open (correctness review cycle 1 coverage, REQ-10, W16, kb:adr/reader-frontmatter-key-column-may-break)", async ({
  page,
  dashboard,
}) => {
  // 3x2, explorer open: the browser review's Major 1 host (tile 425×316, article.md
  // 233px with the nav open) — the tile starts compact (E27's `navCollapsedDefault`),
  // then the nav toggle opens the file explorer.
  const { region } = await openTileReader(page, dashboard, TILES_3X2, "3×2");
  await expect(readerNav(region)).toHaveCount(0);
  await navToggle(region).click();
  await expect(readerNav(region)).toBeVisible();

  await fileEntry(region, "wide-key.md").click();
  const body = renderedBody(region);
  await expect(body).toContainText("Heading");
  await expect(frontmatterKeyCell(region, "verified_claude_code_version")).toBeVisible();
  await expect(
    frontmatterKeyCell(region, "an_extremely_long_frontmatter_key_used_to_test_line_wrapping"),
  ).toBeVisible();

  // REQ-10 / W16: article.md must never force horizontal scroll, whatever the key's
  // length — the key column caps and breaks instead (the ADR's accepted trade-off).
  // Poll re-reads scrollWidth and clientWidth together on each attempt so a layout
  // that is still narrowing can't pass against a stale, already-captured value.
  await expect
    .poll(async () =>
      body.evaluate((el) => (el.scrollWidth <= el.clientWidth ? "fits" : "overflows")),
    )
    .toBe("fits");
});

// ── reader-expanded-persists ────────────────────────────────────────────────────────────

test("expanded folders and folds survive selecting Claude and then Docs again (reader-expanded-persists REQ-1, REQ-2)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open(FOCUS);
  await railCardByTitle(page, TITLE).click();
  await expect(terminalRegion(page, TITLE)).toBeVisible();

  await mainheadSurfaceButton(page, "docs").click();
  const region = readerRegion(page, TITLE);
  await expect(folderEntry(region, "docs")).toBeVisible();

  await folderEntry(region, "docs").click();
  await expect(folderEntry(region, "adr")).toBeVisible();

  await outlineHeaderToggle(region).click();
  await expect(outlineHeaderToggle(region)).toHaveAttribute("aria-expanded", "false");

  await mainheadSurfaceButton(page, "claude").click();
  await expect(terminalRegion(page, TITLE)).toBeVisible();
  await expect(readerRegion(page, TITLE)).toHaveCount(0);

  await mainheadSurfaceButton(page, "docs").click();
  const back = readerRegion(page, TITLE);
  await expect(back).toBeVisible();
  await expect(folderEntry(back, "docs")).toBeVisible();
  await expect(folderEntry(back, "adr")).toBeVisible();
  await expect(outlineHeaderToggle(back)).toHaveAttribute("aria-expanded", "false");
});

// Plan reader-expanded-persists, review cycle 2 (browser Minor 1): while a filter is
// typed the tree shows every match expanded, so a folder click has no visible effect and
// must not be saved either — what a later return shows is something the developer saw.
test("a folder click while a filter is typed saves nothing that shows after switching away with the filter still typed (reader-expanded-persists REQ-3)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open(FOCUS);
  await railCardByTitle(page, TITLE).click();
  await expect(terminalRegion(page, TITLE)).toBeVisible();

  await mainheadSurfaceButton(page, "docs").click();
  const region = readerRegion(page, TITLE);
  await expect(folderEntry(region, "docs")).toBeVisible();

  // The filter shows x.md under its auto-expanded ancestors.
  await filterBox(region).click();
  await page.keyboard.type("x");
  await expect(fileEntry(region, "x.md")).toBeVisible();

  // Click the folder while filtering: no visible effect, so nothing may be saved.
  await folderEntry(region, "docs").click();
  await expect(fileEntry(region, "x.md")).toBeVisible();

  // Switch away with the filter still typed (the instance, and the filter with it, is
  // dropped): the return must show only what the developer saw — docs/ collapsed.
  await mainheadSurfaceButton(page, "claude").click();
  await expect(readerRegion(page, TITLE)).toHaveCount(0);
  await mainheadSurfaceButton(page, "docs").click();
  const back = readerRegion(page, TITLE);
  await expect(back).toBeVisible();
  await expect(folderEntry(back, "docs")).toBeVisible();
  await expect(folderEntry(back, "docs")).toHaveAttribute("aria-expanded", "false");
  await expect(folderEntry(back, "adr")).toHaveCount(0);
});

// ── mermaid-support ─────────────────────────────────────────────────────────────────────
//
// mermaid itself is real: it ships in the built dashboard bundle, and every diagram
// document below is genuine mermaid source run through the actual bundled engine in the
// browser — never simulated SVG.

/** Opens the diagrams fixture in Focus, switches to docs and opens `fileBasename`. */
async function openDiagramFile(
  page: Page,
  dashboard: Dashboard,
  fileBasename: string,
): Promise<{ region: Locator; id: number }> {
  const { region, id } = await openFocusReader(page, dashboard, DIAGRAMS);
  await fileEntry(region, fileBasename).click();
  return { region, id };
}

test("a valid flowchart fence renders as an SVG diagram with styled nodes, and the source pre is gone (E2, REQ-1)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openDiagramFile(page, dashboard, "flow.md");

  const figure = diagramFigure(region);
  await expect(figure.locator("svg")).toBeVisible();
  await expect(keptMermaidSource(region)).toHaveCount(0);

  // A styled node's fill must not be the SVG default (none/black) — mermaid's theme
  // CSS is what supplies it (Implementation Notes: "measure that the rendered diagram
  // is styled").
  const nodeFill = await figure
    .locator("svg .node rect, svg .node polygon, svg .node circle, svg .node path")
    .first()
    .evaluate((el) => getComputedStyle(el as Element).fill);
  expect(nodeFill).not.toBe("");
  expect(["none", "rgb(0, 0, 0)"]).not.toContain(nodeFill);
});

test("a malformed fence among valid ones keeps its source with a failure line while the others render (E3, REQ-6)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openDiagramFile(page, dashboard, "broken.md");

  await expect(diagramFigures(region)).toHaveCount(1);
  await expect(keptMermaidSource(region)).toHaveCount(1);
  const error = diagramErrorLine(region);
  await expect(error).toBeVisible();
  await expect(error).toHaveText(/^diagram not rendered: /);

  // DOM sketch: the failure line is the kept `<pre>`'s next sibling.
  const isNextSibling = await keptMermaidSource(region).evaluate((code) => {
    const pre = code.closest("pre");
    return pre?.nextElementSibling?.classList.contains("diagram-error") ?? false;
  });
  expect(isNextSibling).toBe(true);
});

test("script, onerror and javascript: content in a diagram's labels and click directive never reach the DOM, even under a loose init directive (E4, REQ-5)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openDiagramFile(page, dashboard, "unsafe.md");

  const body = renderedBody(region);
  await expect(body).toContainText("Unsafe");
  await expect(body.locator("script")).toHaveCount(0);
  await expect(body.locator("[onerror]")).toHaveCount(0);
  await expect(body.locator('[href^="javascript:"]')).toHaveCount(0);
  await expect(body.locator('[src^="javascript:"]')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { __readerXss?: boolean }).__readerXss),
  ).toBeUndefined();
});

test("mermaid's chunk loads lazily only for a document with a fence, and every request stays on the daemon's origin (E5, REQ-3, REQ-4)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open(DIAGRAMS);
  expect(fixture.snapshot.prefs.view).toBe("focus");
  await railCardByTitle(page, TITLE).click();
  // The page's origin stands in for the daemon's: the bundle is served from it by the
  // harness, exactly as the daemon serves it.
  const tracker = new OriginRequestTracker(page, RENDER_ORIGIN);

  await mainheadSurfaceButton(page, "docs").click();
  const region = readerRegion(page, TITLE);
  await fileEntry(region, "plain.md").click();
  await expect(renderedBody(region)).toContainText("Plain");
  tracker.assertAllSameOrigin();
  expect(tracker.scriptRequestsContaining("mermaid")).toHaveLength(0);

  await fileEntry(region, "flow.md").click();
  await expect(diagramFigure(region).locator("svg")).toBeVisible();
  tracker.assertAllSameOrigin();
  expect(tracker.scriptRequestsContaining("mermaid").length).toBeGreaterThan(0);
});

test("Enlarge diagram opens a fitted, focused modal; Escape, the backdrop and Close each close it and restore focus to the button (E8, REQ-8)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openDiagramFile(page, dashboard, "flow.md");
  const figure = diagramFigure(region);
  await expect(figure.locator("svg")).toBeVisible();
  const button = enlargeButton(figure);
  const dialog = diagramDialog(region);

  // Escape.
  await button.click();
  await expect(dialog).toBeVisible();
  await expect(diagramCanvas(dialog).locator("svg")).toBeVisible();
  const stage = diagramStage(dialog);
  await expect(stage).toHaveAttribute("data-zoom", "1.00");
  await expect(stage).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();

  // Backdrop click — the dialog is sized `calc(100vw - 32px)`/`calc(100vh - 32px)`, so
  // the viewport's corner sits outside its content box on every runner size.
  await button.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(3, 3);
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();

  // Close button.
  await button.click();
  await expect(dialog).toBeVisible();
  await diagramClose(dialog).click();
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
});

test("with two tiles open on the same diagram file, enlarging one tile's diagram opens only that tile's dialog (E9, INV-3)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open(DIAGRAMS_PAIR_2X2);
  expect(fixture.snapshot.prefs).toMatchObject({ view: "tiles", density: "2x2" });
  const idA = sessionIdTitled(fixture, "reader-a");
  const idB = sessionIdTitled(fixture, "reader-b");
  await expect(page.locator("#view-tiles")).toBeVisible();
  await expect(liveTileById(page, idA)).toBeVisible();
  await expect(liveTileById(page, idB)).toBeVisible();

  await tileSurfaceButton(page, idA, "docs").click();
  await tileSurfaceButton(page, idB, "docs").click();
  const regionA = readerRegionInTile(page, idA);
  const regionB = readerRegionInTile(page, idB);
  await fileEntry(regionA, "flow.md").click();
  await fileEntry(regionB, "flow.md").click();
  const figureA = diagramFigure(regionA);
  const figureB = diagramFigure(regionB);
  await expect(figureA.locator("svg")).toBeVisible();
  await expect(figureB.locator("svg")).toBeVisible();

  // Each reader root holds exactly one dialog, and only A's opens.
  await expect(diagramDialogRaw(regionA)).toHaveCount(1);
  await expect(diagramDialogRaw(regionB)).toHaveCount(1);
  const buttonA = enlargeButton(figureA);
  await buttonA.click();
  await expect(diagramDialog(regionA)).toBeVisible();
  await expect(diagramDialog(regionB)).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(diagramDialog(regionA)).toBeHidden();
  await expect(buttonA).toBeFocused();
});

test("a diagram wider than the body scrolls its own figure without giving article.md a horizontal scrollbar, in Focus and in a compact tile (E11, REQ-11)", async ({
  page,
  dashboard,
}) => {
  const { region: focusRegion, id } = await openDiagramFile(page, dashboard, "wide.md");
  const focusFigure = diagramFigure(focusRegion);
  await expect(focusFigure.locator("svg")).toBeVisible();

  const focusOverflow = await focusFigure.evaluate(
    (el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth,
  );
  expect(focusOverflow).toBe(true);
  const focusArticleOverflow = await renderedBody(focusRegion).evaluate(
    (el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth,
  );
  expect(focusArticleOverflow).toBe(false);

  // Same document, compact tile (3×2): the density is the fixture's pref, so the Tiles
  // fixture is opened on the same page (deliberate difference). wide.md is already open
  // (browser memory keyed by session, kb:adr/reader-memory-split-browser-and-daemon) from
  // the Focus half above — this tile's ReaderInstance auto-opens it on mount via
  // decideInitialOpen, so re-clicking the same file here would trigger a redundant
  // re-fetch/re-render that races the very assertion below.
  const { region: tileRegion, id: tileId } = await openTileReader(
    page,
    dashboard,
    DIAGRAMS_TILES_3X2,
    "3×2",
  );
  expect(tileId).toBe(id);
  const tileFigure = diagramFigure(tileRegion);
  await expect(tileFigure.locator("svg")).toBeVisible();

  const tileOverflow = await tileFigure.evaluate(
    (el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth,
  );
  expect(tileOverflow).toBe(true);
  const tileArticleOverflow = await renderedBody(tileRegion).evaluate(
    (el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth,
  );
  expect(tileArticleOverflow).toBe(false);
});

test("a file with a fence of each of the kb's eight diagram kinds, plus case, attribute, blockquote and duplicate variants, renders every one (E12, REQ-1, REQ-2)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openDiagramFile(page, dashboard, "kinds.md");

  await expect(diagramFigures(region)).toHaveCount(13);
  await expect(keptMermaidSource(region)).toHaveCount(0);
  for (let i = 0; i < 13; i += 1) {
    await expect(diagramFigure(region, i).locator("svg")).toBeVisible();
  }
});

// REGRESSION PIN: heading ids and the outline come from the reader's pre-existing
// markdown path, and the diagram pass must leave both alone — REQ-12's own text: "it runs
// after renderMarkdown has assigned ids and touches only pre > code mermaid blocks."
test("heading ids and the outline are unchanged by a document that also carries mermaid fences, valid and malformed, between its headings (REQ-12)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openDiagramFile(page, dashboard, INTERLEAVED_DOCUMENT.path);
  await expect(outlineEntry(region, "Gamma")).toBeVisible();

  await expect(outlineEntry(region, "Top")).toBeVisible();
  await expect(outlineEntry(region, "Alpha")).toBeVisible();
  await expect(outlineEntry(region, "Beta")).toBeVisible();
  await expect(renderedBody(region).locator("#top")).toBeVisible();
  await expect(renderedBody(region).locator("#alpha")).toBeVisible();
  await expect(renderedBody(region).locator("#beta")).toBeVisible();
  await expect(renderedBody(region).locator("#gamma")).toBeVisible();

  await outlineEntry(region, "Gamma").click();
  await expect(outlineEntry(region, "Gamma")).toHaveAttribute("aria-current", "true");

  await renderedBody(region).evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(outlineEntry(region, "Top")).toHaveAttribute("aria-current", "true");
});

test("in the open modal, Zoom in/out, +/-/=/0 keys and Reset zoom move data-zoom through the documented sequence, clamped to [0.25, 8] (E13, REQ-9, INV-5)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openDiagramFile(page, dashboard, "flow.md");
  const figure = diagramFigure(region);
  await expect(figure.locator("svg")).toBeVisible();
  await enlargeButton(figure).click();
  const dialog = diagramDialog(region);
  const stage = diagramStage(dialog);
  await expect(stage).toHaveAttribute("data-zoom", "1.00");

  await diagramZoomIn(dialog).click();
  await expect(stage).toHaveAttribute("data-zoom", "1.25");
  await diagramZoomOut(dialog).click();
  await expect(stage).toHaveAttribute("data-zoom", "1.00");
  await stage.press("-");
  await expect(stage).toHaveAttribute("data-zoom", "0.80");
  await diagramZoomReset(dialog).click();
  await expect(stage).toHaveAttribute("data-zoom", "1.00");

  for (let i = 0; i < 12; i += 1) await stage.press("+");
  await expect(stage).toHaveAttribute("data-zoom", "8.00");
  for (let i = 0; i < 12; i += 1) await stage.press("+");
  await expect(stage).toHaveAttribute("data-zoom", "8.00");

  for (let i = 0; i < 16; i += 1) await stage.press("-");
  await expect(stage).toHaveAttribute("data-zoom", "0.25");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await enlargeButton(figure).click();
  await expect(diagramStage(diagramDialog(region))).toHaveAttribute("data-zoom", "1.00");
});

test("in the open modal, wheel-up zooms in, a pointer drag pans the canvas by the drag delta, and Reset zoom restores fit with no pan (E14, REQ-9)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openDiagramFile(page, dashboard, "flow.md");
  const figure = diagramFigure(region);
  await expect(figure.locator("svg")).toBeVisible();
  await enlargeButton(figure).click();
  const dialog = diagramDialog(region);
  const stage = diagramStage(dialog);
  const canvas = diagramCanvas(dialog);
  await expect(stage).toBeVisible();

  const box = await stage.boundingBox();
  if (!box) throw new Error("diagram stage has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -240);
  await expect.poll(async () => Number(await stage.getAttribute("data-zoom"))).toBeGreaterThan(1.0);

  await diagramZoomReset(dialog).click();
  await expect(stage).toHaveAttribute("data-zoom", "1.00");
  let transform = await canvasTransform(canvas);
  expect(transform.x).toBe(0);
  expect(transform.y).toBe(0);

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 100, cy + 50, { steps: 5 });
  await page.mouse.up();
  transform = await canvasTransform(canvas);
  expect(transform.x).toBeCloseTo(100, 0);
  expect(transform.y).toBeCloseTo(50, 0);

  await diagramZoomReset(dialog).click();
  transform = await canvasTransform(canvas);
  expect(transform.x).toBe(0);
  expect(transform.y).toBe(0);
  await expect(stage).toHaveAttribute("data-zoom", "1.00");
});

test("a flowchart naming layout: elk in frontmatter and one naming no layout both render (E15, REQ-2)", async ({
  page,
  dashboard,
}) => {
  const { region } = await openDiagramFile(page, dashboard, "elk.md");

  await expect(diagramFigures(region)).toHaveCount(2);
  await expect(diagramFigure(region, 0).locator("svg")).toBeVisible();
  await expect(diagramFigure(region, 1).locator("svg")).toBeVisible();
  await expect(keptMermaidSource(region)).toHaveCount(0);
});

// ── reading position survives surface and session switches and a reload (plan bugs-one-batch-1
// R2, REQ-6; #109) ───────────────────────────────────────────────────────────────────────────

const LARGE_PAIR = "reader-docs-large-pair";
const READING_OFFSET = 600;

/** Opens `0-outline.md` in the docs reader of the session titled `title` and scrolls its rendered
 * body to the reading offset. */
async function scrollOutlineTo(page: Page, title: string): Promise<void> {
  const region = readerRegion(page, title);
  await expect(region).toBeVisible();
  await fileEntry(region, LARGE_TREE.outlineFileName).click();
  await expect(renderedBody(region)).toContainText(LARGE_TREE.lastHeading);
  await renderedBody(region).evaluate((el, top) => {
    el.scrollTop = top;
  }, READING_OFFSET);
  await expect
    .poll(() => renderedBody(region).evaluate((el) => el.scrollTop))
    .toBeGreaterThan(READING_OFFSET - 2);
}

async function expectScrolledBack(page: Page, title: string): Promise<void> {
  const region = readerRegion(page, title);
  await expect(region).toBeVisible();
  await expect(renderedBody(region)).toContainText(LARGE_TREE.lastHeading);
  await expect
    .poll(() => renderedBody(region).evaluate((el) => Math.round(el.scrollTop)))
    .toBeGreaterThanOrEqual(READING_OFFSET - 1);
  await expect
    .poll(() => renderedBody(region).evaluate((el) => Math.round(el.scrollTop)))
    .toBeLessThanOrEqual(READING_OFFSET + 1);
}

test("the reading position in an open document survives selecting Claude and then Docs again (R2, REQ-6, #109)", async ({
  page,
  dashboard,
}) => {
  await openFocusReader(page, dashboard, LARGE);
  await scrollOutlineTo(page, TITLE);

  await mainheadSurfaceButton(page, "claude").click();
  await expect(terminalRegion(page, TITLE)).toBeVisible();
  await expect(readerRegion(page, TITLE)).toHaveCount(0);
  await mainheadSurfaceButton(page, "docs").click();

  await expectScrolledBack(page, TITLE);
});

test("the reading position in an open document is remembered across a reload (R2, REQ-6, #109; beside E19)", async ({
  page,
  dashboard,
}) => {
  await openFocusReader(page, dashboard, LARGE);
  await scrollOutlineTo(page, TITLE);

  await mainheadSurfaceButton(page, "claude").click();
  await page.reload();
  await railCardByTitle(page, TITLE).click();
  await mainheadSurfaceButton(page, "docs").click();

  await expectScrolledBack(page, TITLE);
});

test("the reading position survives switching to another session's card and back (R2, REQ-6, #109)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open(LARGE_PAIR);
  expect(fixture.snapshot.sessions.map((s) => s.title).sort()).toEqual([
    "reader-large-a",
    "reader-large-b",
  ]);
  await railCardByTitle(page, "reader-large-a").click();
  await mainheadSurfaceButton(page, "docs").click();
  await scrollOutlineTo(page, "reader-large-a");

  await railCardByTitle(page, "reader-large-b").click();
  await expect(readerRegion(page, "reader-large-a")).toHaveCount(0);
  await railCardByTitle(page, "reader-large-a").click();

  await expectScrolledBack(page, "reader-large-a");
});

// ── the restore policy: which opens restore, and what a reader's own input does to a pending one
// (plan bugs-one-batch-1 R2, REQ-6; web-implementation Decisions) ─────────────────────────────

test("a wheel on the body after the restore moves the reading position and nothing jumps it back (R2, REQ-6)", async ({
  page,
  dashboard,
}) => {
  await openFocusReader(page, dashboard, LARGE);
  await scrollOutlineTo(page, TITLE);
  await mainheadSurfaceButton(page, "claude").click();
  await expect(readerRegion(page, TITLE)).toHaveCount(0);
  await mainheadSurfaceButton(page, "docs").click();
  await expectScrolledBack(page, TITLE);

  const body = renderedBody(readerRegion(page, TITLE));
  await body.hover();
  await page.mouse.wheel(0, -300);
  await expect
    .poll(() => body.evaluate((el) => Math.round(el.scrollTop)))
    .toBeLessThan(READING_OFFSET - 100);
  const moved = await body.evaluate((el) => Math.round(el.scrollTop));
  await settleFor(page, 600);
  expect(await body.evaluate((el) => Math.round(el.scrollTop))).toBe(moved);
});

test("a document with no stored position opens at the top, and a nav click on one with a stored position returns to it (R2, REQ-6)", async ({
  page,
  dashboard,
}) => {
  await openFocusReader(page, dashboard, LARGE);
  await scrollOutlineTo(page, TITLE);
  const region = readerRegion(page, TITLE);

  await fileEntry(region, LARGE_TREE.lastFileName).click();
  await expect(renderedBody(region)).toContainText("Body text for file 20.");
  await expect(renderedBody(region)).not.toContainText(LARGE_TREE.lastHeading);
  await expect.poll(() => renderedBody(region).evaluate((el) => el.scrollTop)).toBe(0);

  await fileEntry(region, LARGE_TREE.outlineFileName).click();
  await expectScrolledBack(page, TITLE);
});
