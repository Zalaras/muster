import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type ScratchDaemon,
  settleFor,
  test,
} from "./helpers/fixtures";
import { envelopedSessionStart, rawPostToolUse } from "./helpers/payloads";
import {
  bodyPlaceholder,
  docBar,
  fileEntry,
  navToggle,
  popOutLink,
  readerNav,
  readerRegion,
  readerRegionInTile,
  renderedBody,
} from "./helpers/reader";
import {
  activeElementTag,
  type Box,
  barMetrics,
  bodyScrollTop,
  bottom,
  boxOf,
  closeSearch,
  expectCurrentMatchInView,
  expectFindState,
  expectInCorner,
  expectNoHighlights,
  FIND_FILES,
  type FindFixture,
  installFindKeyLog,
  matchCount,
  nextMatch,
  previousMatch,
  readFindKeyLog,
  readHighlights,
  right,
  samePosition,
  scrollBodyToEnd,
  searchBox,
  searchIcon,
  tagActiveElement,
  tallBody,
  waitForFindKeys,
  writeFindFixtures,
} from "./helpers/reader-search";
import {
  envelopeOpts,
  launchSession,
  scratchDirectory,
  type SessionObject,
} from "./helpers/session";
import { mainheadSurfaceButton, tileSurfaceButton } from "./helpers/shell";
import { openSettingsDialog, settingsCloseButton, themeRadio } from "./helpers/theme";

// Plan docs-search-bar — REQ-1 through REQ-13, INV-1 through INV-5, acceptance E1-E17.
// Fixture plan (plan.md header): every test takes the test-scoped `daemon` fixture — a
// fresh scratch daemon per test — because the reader auto-opens on "the only session" in
// Focus, and the Tiles density and the Write-hook rewrites are asserted per daemon.
//
// The daemon and tmux are real throughout; only Claude Code is faked, through
// envelopedSessionStart / rawPostToolUse (a real `claude` never runs here, CLAUDE.md hard
// rule). The find bar does not exist yet: every test below asserts new behaviour, so this
// file's authoring-mode gate is collection only (`npx playwright test --list`).
//
// Highlights are read through `CSS.highlights` (helpers/reader-search.ts) and classified by
// structure, never by the two registered names, which are web-impl's. Cmd+F is pressed as
// `Meta+KeyF` (the matching is on `event.code`, kb:adr/shortcuts-option-command-family-off-reserved-chords)
// and its default-prevented verdict is read from a capture-phase log: Playwright's headless
// Chromium has no find UI to observe, so "the browser's own find does not open" is the
// event's `defaultPrevented`. Whether a real Chrome lets a page prevent the chord is a
// reviewer-verified measurement the suite cannot prove (plan Carried-over measurements).

/** Asserts the highlighted text of the all-matches set, in document order: an oracle that
 * changes with the query even when two queries produce the same count. */
async function expectHighlightedText(region: Locator, texts: string[]): Promise<void> {
  await expect
    .poll(async () => (await readHighlights(region)).all.map((r) => r.text))
    .toEqual(texts);
}

interface Opened {
  region: Locator;
  claudeId: string;
  session: SessionObject;
}

/** Launches a session in `dir`, switches Focus to the docs surface and opens `file`. */
async function openFocusDoc(
  page: Page,
  daemon: ScratchDaemon,
  title: string,
  dir: string,
  file: FindFixture,
): Promise<Opened> {
  await page.goto(daemon.dashboardUrl);
  await installFindKeyLog(page);
  const session = await launchSession(page, daemon, { directory: dir, title });
  const claudeId = `claude-${title}`;
  await page.request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
  });
  await mainheadSurfaceButton(page, "docs").click();
  const region = readerRegion(page, title);
  await fileEntry(region, file.name).click();
  await expect(renderedBody(region).locator("h1")).toHaveText(file.heading, { timeout: 15_000 });
  return { region, claudeId, session };
}

/** Clicks the icon and waits for the query box to hold focus. */
async function openBar(region: Locator): Promise<void> {
  await searchIcon(region).click();
  await expect(searchBox(region)).toBeFocused();
}

/** Types into whatever holds focus, one real key per character. */
async function typeQuery(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text);
}

/** The first paragraph of the rendered body — somewhere a real click lands inside it. */
function bodyParagraph(region: Locator): Locator {
  return renderedBody(region).locator("p").first();
}

interface Geometry {
  body: Box;
  docbar: Box;
  rightEdge: number;
}

/** The corner geometry of one reader host: its reading area (`article.md`), its docbar and
 * the edge the icon/bar must hug — the nav's left border while the nav is open, the
 * reader's own right edge while it is collapsed. */
async function cornerGeometry(region: Locator, navOpen: boolean): Promise<Geometry> {
  const body = await boxOf(renderedBody(region));
  const docbar = await boxOf(docBar(region));
  const rightEdge = navOpen ? (await boxOf(readerNav(region))).x : right(await boxOf(region));
  return { body, docbar, rightEdge };
}

async function expectIconInCorner(region: Locator, navOpen: boolean, what: string): Promise<Box> {
  const icon = await boxOf(searchIcon(region));
  expectInCorner(what, icon, await cornerGeometry(region, navOpen));
  return icon;
}

async function expectBarInCorner(region: Locator, navOpen: boolean, what: string): Promise<Box> {
  const bar = await barMetrics(region);
  expect(bar.isReaderRoot, `${what}: the bar has its own wrapper`).toBe(false);
  expectInCorner(what, bar.box, await cornerGeometry(region, navOpen));
  return bar.box;
}

/** Launches `entries` as sessions, switches to Tiles at `density`, and opens each tile's
 * docs surface on its file. At 3×2 the nav starts collapsed, so the file is picked with the
 * nav opened through its toggle and the nav is collapsed again afterwards. */
async function openTileReaders(
  page: Page,
  daemon: ScratchDaemon,
  entries: { title: string; dir: string; file: FindFixture }[],
  density: "2×2" | "3×2",
): Promise<Locator[]> {
  await page.goto(daemon.dashboardUrl);
  await installFindKeyLog(page);
  const sessions = [];
  for (const entry of entries) {
    sessions.push(await launchSession(page, daemon, { directory: entry.dir, title: entry.title }));
  }
  await page.keyboard.press("Meta+Backslash");
  await expect(page.locator("#view-tiles")).toBeVisible();
  await page.getByRole("button", { name: density }).click();
  await expect(page.getByRole("button", { name: density })).toHaveAttribute("aria-pressed", "true");
  const regions: Locator[] = [];
  for (const [i, entry] of entries.entries()) {
    const session = sessions[i];
    if (session === undefined) throw new Error("session missing");
    await tileSurfaceButton(page, session.id, "docs").click();
    const region = readerRegionInTile(page, session.id);
    await expect(region).toBeVisible({ timeout: 15_000 });
    if (density === "3×2") await navToggle(region).click();
    await fileEntry(region, entry.file.name).click();
    await expect(renderedBody(region).locator("h1")).toHaveText(entry.file.heading, {
      timeout: 15_000,
    });
    if (density === "3×2") await navToggle(region).click();
    regions.push(region);
  }
  return regions;
}

async function popOut(region: Locator, context: BrowserContext): Promise<Page> {
  const [popup] = await Promise.all([context.waitForEvent("page"), popOutLink(region).click()]);
  await popup.waitForLoadState();
  return popup;
}

// ── E1, E2, E3: the icon, the bar and the corner ───────────────────────────────────────

test("clicking Search document opens the bar with the query box focused, the icon hidden and the other controls present (E1, REQ-3, REQ-6)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-e1", dir, FIND_FILES.main);

    await expect(searchIcon(region)).toBeVisible();
    await expect(searchBox(region)).toBeHidden();

    await searchIcon(region).click();

    await expect(searchBox(region)).toBeVisible();
    await expect(searchBox(region)).toBeFocused();
    await expect(searchIcon(region)).toBeHidden();
    await expect(matchCount(region)).toHaveText("No results");
    await expect(previousMatch(region)).toBeVisible();
    await expect(nextMatch(region)).toBeVisible();
    await expect(closeSearch(region)).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("with the nav open the search icon sits inside the reading area below the docbar, left of the nav's border, and stays put while the body scrolls (E2, REQ-1, REQ-2, INV-3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-e2", dir, FIND_FILES.tall);

    await expect(readerNav(region)).toBeVisible();
    await expect(searchIcon(region)).toBeVisible();
    const before = await expectIconInCorner(region, true, "icon, nav open");

    const scrolled = await scrollBodyToEnd(region);
    expect(scrolled, "the body really scrolled").toBeGreaterThan(0);
    const after = await boxOf(searchIcon(region));
    expect(
      samePosition(before, after),
      `icon moved from ${before.x},${before.y} to ${after.x},${after.y}`,
    ).toBe(true);
  } finally {
    await cleanup();
  }
});

test("collapsing and reopening the nav moves the open bar between the nav's border and the reader's right edge, keeping the query and count (E3, REQ-2, INV-3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-e3", dir, FIND_FILES.tall);

    await openBar(region);
    await typeQuery(page, "needle");
    await expectFindState(region, { index: 1, total: 3 });
    await expectBarInCorner(region, true, "bar, nav open");

    await navToggle(region).click();
    await expect(readerNav(region)).toBeHidden();
    await expectBarInCorner(region, false, "bar, nav collapsed");
    await expect(searchBox(region)).toHaveValue("needle");
    await expectFindState(region, { index: 1, total: 3 });

    await navToggle(region).click();
    await expect(readerNav(region)).toBeVisible();
    await expectBarInCorner(region, true, "bar, nav reopened");
    await expect(searchBox(region)).toHaveValue("needle");
    await expectFindState(region, { index: 1, total: 3 });

    // The icon follows the same corner once the bar is closed with the nav collapsed.
    await navToggle(region).click();
    await expect(readerNav(region)).toBeHidden();
    await searchBox(region).click();
    await page.keyboard.press("Escape");
    await expect(searchIcon(region)).toBeVisible();
    await expectIconInCorner(region, false, "icon, nav collapsed");
  } finally {
    await cleanup();
  }
});

test("with no document rendered there is no search icon and Cmd+F is left to the browser, and opening a file brings the icon (REQ-1, REQ-10, States)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    await page.goto(daemon.dashboardUrl);
    await installFindKeyLog(page);
    await launchSession(page, daemon, { directory: dir, title: "find-empty" });
    await mainheadSurfaceButton(page, "docs").click();
    const region = readerRegion(page, "find-empty");
    await expect(bodyPlaceholder(region)).toBeVisible({ timeout: 15_000 });
    await expect(searchIcon(region)).toBeHidden();

    await renderedBody(region).click();
    await expect(renderedBody(region)).toBeFocused();
    await page.keyboard.press("Meta+KeyF");
    const keys = await waitForFindKeys(page, 1);
    expect(keys[0]?.defaultPrevented).toBe(false);
    await expect(searchBox(region)).toHaveCount(0);

    await fileEntry(region, FIND_FILES.main.name).click();
    await expect(renderedBody(region).locator("h1")).toHaveText(FIND_FILES.main.heading, {
      timeout: 15_000,
    });
    await expect(searchIcon(region)).toBeVisible();
  } finally {
    await cleanup();
  }
});

// ── E4, E5, E6: what matches ───────────────────────────────────────────────────────────

test("searching the open file's basename counts only the occurrences in the body, not the docbar or the nav (E4, INV-2, REQ-4)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-e4", dir, FIND_FILES.main);
    const basename = FIND_FILES.main.name;

    // The basename is on screen outside the body, so a whole-reader count would exceed 2.
    await expect(docBar(region)).toContainText(basename);
    await expect(readerNav(region)).toContainText(basename);

    await openBar(region);
    await typeQuery(page, basename);

    await expectFindState(region, { index: 1, total: 2 });
    // The independent oracle: the body's own text, lower-cased.
    const bodyOccurrences = await renderedBody(region).evaluate(
      (el, q) => (el.textContent ?? "").toLowerCase().split(q).length - 1,
      basename,
    );
    expect(bodyOccurrences).toBe(2);
    const highlights = await readHighlights(region);
    expect(highlights.all.map((r) => r.text.toLowerCase())).toEqual([basename, basename]);
  } finally {
    await cleanup();
  }
});

test("a query present in a frontmatter value, a paragraph in another case and a code block reads 1 of 3 with three highlight ranges and one current (E5, REQ-4, REQ-5, REQ-6)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-e5", dir, FIND_FILES.main);

    await openBar(region);
    await typeQuery(page, "quokka");

    await expectFindState(region, { index: 1, total: 3 });
    const h = await readHighlights(region);
    expect(h.all.map((r) => r.text)).toEqual(["quokka", "QUOKKA", "Quokka"]);
    expect(h.current.map((r) => r.text)).toEqual(["quokka"]);
  } finally {
    await cleanup();
  }
});

test("a query of regex metacharacters matches as literal text, case-insensitively (REQ-4, edge cases 1-2)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-literal", dir, FIND_FILES.literal);

    await openBar(region);
    await typeQuery(page, "a.c");
    // `a.c` and `A.C` only: as a pattern it would also take `abc`.
    await expectFindState(region, { index: 1, total: 2 });
    await expectHighlightedText(region, ["a.c", "A.C"]);

    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await typeQuery(page, "a*c");
    await expectFindState(region, { index: 1, total: 1 });
    await expectHighlightedText(region, ["a*c"]);

    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await typeQuery(page, "(x)");
    // The count (1 of 1) equals the previous query's, so only the matched text proves the
    // debounced re-run has landed on this query.
    await expectHighlightedText(region, ["(x)"]);
    await expectFindState(region, { index: 1, total: 1 });
  } finally {
    await cleanup();
  }
});

test("a query present only in a rendered mermaid node label reads 1 of 1 and highlights the SVG text (E6, REQ-4, REQ-5)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-e6", dir, FIND_FILES.diagram);
    await expect(renderedBody(region).locator("figure.diagram svg")).toBeVisible({
      timeout: 15_000,
    });

    await openBar(region);
    await typeQuery(page, "zorblax");

    await expectFindState(region, { index: 1, total: 1 });
    const h = await readHighlights(region);
    expect(h.all.map((r) => [r.text, r.inSvg])).toEqual([["Zorblax", true]]);
  } finally {
    await cleanup();
  }
});

// ── E7, E8: Cmd+F ──────────────────────────────────────────────────────────────────────

test("clicking in the body and pressing Cmd+F opens the bar, and pressing it again refocuses the query box with its text selected, both default-prevented (E7, REQ-10, INV-4)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-e7", dir, FIND_FILES.main);

    await bodyParagraph(region).click();
    await expect(renderedBody(region)).toBeFocused();
    await page.keyboard.press("Meta+KeyF");
    await expect(searchBox(region)).toBeFocused();
    await expect(searchIcon(region)).toBeHidden();
    const first = await waitForFindKeys(page, 1);
    expect(first.map((k) => k.defaultPrevented)).toEqual([true]);

    await typeQuery(page, "quokka");
    await expectFindState(region, { index: 1, total: 3 });

    await bodyParagraph(region).click();
    await expect(renderedBody(region)).toBeFocused();
    await page.keyboard.press("Meta+KeyF");
    await expect(searchBox(region)).toBeFocused();
    const selected = () =>
      searchBox(region).evaluate((el) => {
        const input = el as HTMLInputElement;
        return { value: input.value, start: input.selectionStart, end: input.selectionEnd };
      });
    expect(await selected()).toEqual({ value: "quokka", start: 0, end: 6 });
    const second = await waitForFindKeys(page, 2);
    expect(second.map((k) => k.defaultPrevented)).toEqual([true, true]);

    // From inside the query box too: collapse the selection with a real key, press again.
    await page.keyboard.press("End");
    expect((await selected()).start).toBe(6);
    await page.keyboard.press("Meta+KeyF");
    expect(await selected()).toEqual({ value: "quokka", start: 0, end: 6 });
    const third = await waitForFindKeys(page, 3);
    expect(third.map((k) => k.defaultPrevented)).toEqual([true, true, true]);
  } finally {
    await cleanup();
  }
});

test("Cmd+F with focus on a rail card or on the page body is not default-prevented and opens no bar (E8, REQ-10, INV-4)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-e8", dir, FIND_FILES.main);
    await expect(searchIcon(region)).toBeVisible();

    const railPin = page.locator('#sessions [data-testid="session-card"] button.pin').first();
    await railPin.focus();
    await expect(railPin).toBeFocused();
    await page.keyboard.press("Meta+KeyF");
    const onRail = await waitForFindKeys(page, 1);
    expect(onRail.map((k) => k.defaultPrevented)).toEqual([false]);
    await expect(searchBox(region)).toHaveCount(0);
    await expect(searchIcon(region)).toBeVisible();

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page.locator("body")).toBeFocused();
    await page.keyboard.press("Meta+KeyF");
    const onPage = await waitForFindKeys(page, 2);
    expect(onPage.map((k) => k.defaultPrevented)).toEqual([false, false]);
    await expect(searchBox(region)).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

// ── E9: the body is never mutated ──────────────────────────────────────────────────────

test("opening, typing, stepping and closing the bar leave the body's innerHTML identical for every source shape (E9, INV-1, REQ-5)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const shapes: { state: string; file: FindFixture; query: string }[] = [
      { state: "no frontmatter", file: FIND_FILES.plain, query: "alpha" },
      { state: "frontmatter table", file: FIND_FILES.flat, query: "quokka" },
      { state: "frontmatter raw fallback", file: FIND_FILES.raw, query: "quokka" },
      { state: "rendered diagram", file: FIND_FILES.diagram, query: "zorblax" },
    ];
    const first = shapes[0];
    if (first === undefined) throw new Error("no shapes");
    const { region } = await openFocusDoc(page, daemon, "find-e9", dir, first.file);
    const innerHTML = () => renderedBody(region).evaluate((el) => el.innerHTML);

    for (const shape of shapes) {
      await fileEntry(region, shape.file.name).click();
      await expect(renderedBody(region).locator("h1")).toHaveText(shape.file.heading, {
        timeout: 15_000,
      });
      if (shape.file === FIND_FILES.diagram) {
        await expect(renderedBody(region).locator("figure.diagram svg")).toBeVisible({
          timeout: 15_000,
        });
      }
      const before = await innerHTML();

      await openBar(region);
      expect(await innerHTML(), `${shape.state}: after opening`).toBe(before);
      await typeQuery(page, shape.query);
      await expect(matchCount(region)).toHaveText(/^\d+ of \d+$/);
      expect(await innerHTML(), `${shape.state}: after typing`).toBe(before);
      await page.keyboard.press("Enter");
      await page.keyboard.press("Shift+Enter");
      expect(await innerHTML(), `${shape.state}: after stepping`).toBe(before);
      await page.keyboard.press("Escape");
      await expect(searchBox(region)).toBeHidden();
      await settleFor(page, 300);
      expect(await innerHTML(), `${shape.state}: after closing`).toBe(before);
    }
  } finally {
    await cleanup();
  }
});

// ── E10, REQ-7, REQ-8: scrolling and stepping ──────────────────────────────────────────

test("the open bar keeps its viewport position when the body scrolls, and each step scrolls the current match into the body's visible box (E10, INV-3, REQ-8)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-e10", dir, FIND_FILES.tall);

    await openBar(region);
    await typeQuery(page, "needle");
    await expectFindState(region, { index: 1, total: 3 });
    const bar = await barMetrics(region);

    await page.keyboard.press("Enter");
    await expectFindState(region, { index: 2, total: 3 });
    await expectCurrentMatchInView(region);
    const midScroll = await bodyScrollTop(region);
    expect(midScroll, "match 2 is below the fold, so the step scrolled").toBeGreaterThan(0);

    await page.keyboard.press("Enter");
    await expectFindState(region, { index: 3, total: 3 });
    await expectCurrentMatchInView(region);
    expect(await bodyScrollTop(region)).toBeGreaterThan(midScroll);

    await scrollBodyToEnd(region);
    const after = await barMetrics(region);
    expect(
      samePosition(bar.box, after.box),
      `bar moved from ${bar.box.x},${bar.box.y} to ${after.box.x},${after.box.y}`,
    ).toBe(true);
  } finally {
    await cleanup();
  }
});

test("Enter and Next match step forward, Shift+Enter and Previous match step back, both wrapping at the ends and keeping the current match in view (REQ-8)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-step", dir, FIND_FILES.tall);

    await openBar(region);
    await typeQuery(page, "needle");
    await expectFindState(region, { index: 1, total: 3 });

    await page.keyboard.press("Enter");
    await expectFindState(region, { index: 2, total: 3 });
    await expectCurrentMatchInView(region);
    await page.keyboard.press("Enter");
    await expectFindState(region, { index: 3, total: 3 });
    await expectCurrentMatchInView(region);
    await page.keyboard.press("Enter");
    await expectFindState(region, { index: 1, total: 3 });
    await expectCurrentMatchInView(region);

    await page.keyboard.press("Shift+Enter");
    await expectFindState(region, { index: 3, total: 3 });
    await expectCurrentMatchInView(region);
    await page.keyboard.press("Shift+Enter");
    await expectFindState(region, { index: 2, total: 3 });

    await nextMatch(region).click();
    await expectFindState(region, { index: 3, total: 3 });
    await nextMatch(region).click();
    await expectFindState(region, { index: 1, total: 3 });
    await previousMatch(region).click();
    await expectFindState(region, { index: 3, total: 3 });
    await expectCurrentMatchInView(region);
    await previousMatch(region).click();
    await expectFindState(region, { index: 2, total: 3 });
  } finally {
    await cleanup();
  }
});

test("typing scrolls the first match into the body, counts update per key, an empty query clears the highlights and reads No results, and so does a miss (REQ-6, REQ-7)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-live", dir, FIND_FILES.deep);
    expect(await bodyScrollTop(region)).toBe(0);

    await openBar(region);
    await typeQuery(page, "needle");
    await expectFindState(region, { index: 1, total: 2 });
    expect(
      await bodyScrollTop(region),
      "the first match (paragraph 50) was scrolled to",
    ).toBeGreaterThan(0);
    await expectCurrentMatchInView(region);

    // Live: dropping the last letter still matches the same two words.
    await page.keyboard.press("Backspace");
    await expectFindState(region, { index: 1, total: 2 });

    // That count equals the one before it, so it cannot tell a re-run from a stale read: a
    // query that matches nothing and then the shorter one again can.
    await typeQuery(page, "x");
    await expect(matchCount(region)).toHaveText("No results");
    await page.keyboard.press("Backspace");
    await expectFindState(region, { index: 1, total: 2 });
    await expectHighlightedText(region, ["Needl", "Needl"]);

    for (let i = 0; i < 5; i += 1) await page.keyboard.press("Backspace");
    await expect(searchBox(region)).toHaveValue("");
    await expect(matchCount(region)).toHaveText("No results");
    await expectNoHighlights(region);
    await expect(searchBox(region)).toBeVisible();

    await typeQuery(page, "zzzz");
    await expect(matchCount(region)).toHaveText("No results");
    await expectNoHighlights(region);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Shift+Enter");
    await expect(matchCount(region)).toHaveText("No results");
  } finally {
    await cleanup();
  }
});

// ── The current match is readable: clear of the bar, inside every scroll box ───────────

/** Steps `steps` matches forward from the first, asserting after each that the count reads
 * `i of total` and the current match is placed where the user can read it. */
async function stepInView(
  page: Page,
  region: Locator,
  total: number,
  steps: number,
): Promise<void> {
  for (let i = 1; i <= steps; i += 1) {
    await expectFindState(region, { index: i, total });
    await expectCurrentMatchInView(region);
    if (i < steps) await page.keyboard.press("Enter");
  }
}

/** The widest horizontal scroll offset among `locator` and its ancestors up to the reader
 * body — non-zero when stepping scrolled any code block, table or the body itself sideways. */
async function sidewaysScroll(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    let widest = 0;
    for (let node: Element | null = el; node; node = node.parentElement) {
      widest = Math.max(widest, node.scrollLeft);
      if (node.matches("article.md")) break;
    }
    return widest;
  });
}

test("with the bar open the first line of the body sits below it, returns when the bar closes, and every match of a heading that wraps is readable in Focus (E10, REQ-7, REQ-8)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-crowd", dir, FIND_FILES.crowd);
    const heading = renderedBody(region).locator("h1");
    const restingTop = (await boxOf(heading)).y;

    await openBar(region);
    const open = await barMetrics(region);
    await expect
      .poll(async () => (await boxOf(heading)).y, "the first line clears the open bar")
      .toBeGreaterThanOrEqual(bottom(open.box) - 0.5);

    await page.keyboard.press("Escape");
    await expect(searchBox(region)).toBeHidden();
    await expect
      .poll(async () => (await boxOf(heading)).y, "the first line returns once the bar closes")
      .toBeCloseTo(restingTop, 0);

    await openBar(region);
    await typeQuery(page, "heron");
    await stepInView(page, region, 40, 12);
  } finally {
    await cleanup();
  }
});

test("a heading of forty matches is readable at every step in a 3×2 tile, where the first lines run under the bar without the clearance (E15, REQ-7, REQ-8)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const [region] = await openTileReaders(
      page,
      daemon,
      [{ title: "find-crowd32", dir, file: FIND_FILES.crowd }],
      "3×2",
    );
    if (region === undefined) throw new Error("no tile reader");
    await openBar(region);
    await typeQuery(page, "heron");
    await stepInView(page, region, 40, 14);
  } finally {
    await cleanup();
  }
});

test("a heading of forty matches is readable at every step in a 2×2 tile (E15, REQ-7, REQ-8)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const [region] = await openTileReaders(
      page,
      daemon,
      [{ title: "find-crowd22", dir, file: FIND_FILES.crowd }],
      "2×2",
    );
    if (region === undefined) throw new Error("no tile reader");
    await openBar(region);
    await typeQuery(page, "heron");
    await stepInView(page, region, 40, 14);
  } finally {
    await cleanup();
  }
});

test("a match in the frontmatter table at the very top of the body is readable in Focus and in a 3×2 tile, not under the bar (REQ-7)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-front", dir, FIND_FILES.frontline);
    await openBar(region);
    await typeQuery(page, "heron");
    await expectFindState(region, { index: 1, total: 2 });
    await expect(
      renderedBody(region).locator("table"),
      "the frontmatter renders as the first table",
    ).toContainText("heron");
    expect(await bodyScrollTop(region)).toBe(0);
    await expectCurrentMatchInView(region);
    await page.keyboard.press("Enter");
    await expectFindState(region, { index: 2, total: 2 });
    await expectCurrentMatchInView(region);
    await page.keyboard.press("Enter");
    await expectFindState(region, { index: 1, total: 2 });
    await expectCurrentMatchInView(region);
  } finally {
    await cleanup();
  }
});

test("a match in the frontmatter table at the top of a 3×2 tile's body is readable, not under the bar (REQ-7)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const [region] = await openTileReaders(
      page,
      daemon,
      [{ title: "find-front32", dir, file: FIND_FILES.frontline }],
      "3×2",
    );
    if (region === undefined) throw new Error("no tile reader");
    await openBar(region);
    await typeQuery(page, "heron");
    await expectFindState(region, { index: 1, total: 2 });
    await expect(renderedBody(region).locator("table")).toContainText("heron");
    await expectCurrentMatchInView(region);
    await page.keyboard.press("Enter");
    await expectFindState(region, { index: 2, total: 2 });
    await expectCurrentMatchInView(region);
  } finally {
    await cleanup();
  }
});

test("stepping scrolls sideways to a match at the end of a long code line and of a wide table, and back, in Focus (REQ-8)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-wide", dir, FIND_FILES.wide);
    const code = renderedBody(region).locator("pre");
    const table = renderedBody(region).locator("table");
    expect(await sidewaysScroll(code), "the code line starts unscrolled").toBe(0);
    expect(await sidewaysScroll(table), "the table starts unscrolled").toBe(0);

    await openBar(region);
    await typeQuery(page, "far");
    await expectFindState(region, { index: 1, total: 2 });
    expect((await readHighlights(region)).current[0]?.text.toLowerCase()).toBe("far");
    await expectCurrentMatchInView(region);
    expect(await sidewaysScroll(code), "match 1 is at the end of the code line").toBeGreaterThan(0);

    await page.keyboard.press("Enter");
    await expectFindState(region, { index: 2, total: 2 });
    await expectCurrentMatchInView(region);
    expect(await sidewaysScroll(table), "match 2 is in the last column").toBeGreaterThan(0);

    await page.keyboard.press("Shift+Enter");
    await expectFindState(region, { index: 1, total: 2 });
    await expectCurrentMatchInView(region);
    await page.keyboard.press("Shift+Enter");
    await expectFindState(region, { index: 2, total: 2 });
    await expectCurrentMatchInView(region);
  } finally {
    await cleanup();
  }
});

test("stepping scrolls sideways to a match at the end of a long code line and of a wide table in a 3×2 tile (REQ-8, E15)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const [region] = await openTileReaders(
      page,
      daemon,
      [{ title: "find-wide32", dir, file: FIND_FILES.wide }],
      "3×2",
    );
    if (region === undefined) throw new Error("no tile reader");
    await openBar(region);
    await typeQuery(page, "far");
    await expectFindState(region, { index: 1, total: 2 });
    await expectCurrentMatchInView(region);
    expect(await sidewaysScroll(renderedBody(region).locator("pre"))).toBeGreaterThan(0);

    await page.keyboard.press("Enter");
    await expectFindState(region, { index: 2, total: 2 });
    await expectCurrentMatchInView(region);
    expect(await sidewaysScroll(renderedBody(region).locator("table"))).toBeGreaterThan(0);
  } finally {
    await cleanup();
  }
});

test("opening a file with a diagram under an open bar reveals the first match inside the diagram once it has rendered (E12, REQ-12)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-latediag", dir, FIND_FILES.plain);
    await openBar(region);
    await typeQuery(page, "zorblax");
    await expect(matchCount(region)).toHaveText("No results");

    await fileEntry(region, FIND_FILES.lateDiagram.name).click();
    await expect(renderedBody(region).locator("h1")).toHaveText(FIND_FILES.lateDiagram.heading, {
      timeout: 15_000,
    });
    await expect(renderedBody(region).locator("figure.diagram svg")).toBeVisible({
      timeout: 15_000,
    });

    await expectFindState(region, { index: 1, total: 3 });
    await expect
      .poll(async () => {
        const h = await readHighlights(region);
        return { inSvg: h.current[0]?.inSvg, placement: h.currentPlacement };
      })
      .toEqual({ inSvg: true, placement: "ok" });
    expect(
      await bodyScrollTop(region),
      "the diagram sits below the thirty paragraphs, so reaching it scrolled",
    ).toBeGreaterThan(0);
  } finally {
    await cleanup();
  }
});

test("the query box shows no native clear button, where a plain search input does (E1, REQ-3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-clear", dir, FIND_FILES.tall);
    await openBar(region);
    await typeQuery(page, "needle");
    await expectFindState(region, { index: 1, total: 3 });
    // The clear button is drawn by the browser inside the box's right edge while it holds
    // text and focus, so the oracle is pixels: that strip with text must equal the same strip
    // empty. A stock search input proves the strip does differ when the button is there.
    const strip = async (box: Box) =>
      page.screenshot({
        clip: { x: box.x + box.width - 22, y: box.y + 3, width: 18, height: box.height - 6 },
      });
    const withText = await strip(await boxOf(searchBox(region)));
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await expect(searchBox(region)).toHaveValue("");
    const empty = await strip(await boxOf(searchBox(region)));
    expect(
      withText.equals(empty),
      "the focused query box with text draws nothing in its right edge",
    ).toBe(true);

    await page.evaluate(() => {
      const stock = document.createElement("input");
      stock.type = "search";
      stock.id = "stock-search-probe";
      stock.style.cssText =
        "position:fixed;left:20px;top:20px;width:160px;height:28px;z-index:99999;font-size:12px";
      document.body.append(stock);
      stock.value = "needle";
      stock.focus();
    });
    const probe = page.locator("#stock-search-probe");
    const stockWithText = await strip(await boxOf(probe));
    await probe.evaluate((el) => {
      (el as HTMLInputElement).value = "";
    });
    const stockEmpty = await strip(await boxOf(probe));
    expect(
      stockWithText.equals(stockEmpty),
      "the oracle sees a stock search input's clear button",
    ).toBe(false);
    await probe.evaluate((el) => el.remove());
  } finally {
    await cleanup();
  }
});

// ── Focus survives activation (every focusable control) ────────────────────────────────

test("each find control keeps keyboard focus on the same node across activation by a real key and a one-second tick (REQ-3, REQ-8, REQ-9, E13)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-focus", dir, FIND_FILES.tall);

    // The icon: focused, then activated with Enter. The bar opens and the query box takes
    // focus; it must still be that node after a tick.
    await renderedBody(region).focus();
    await tagActiveElement(page, "body");
    await searchIcon(region).focus();
    await expect(searchIcon(region)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(searchBox(region)).toBeFocused();
    await tagActiveElement(page, "box");
    await settleFor(page, 1200);
    await expect(searchBox(region)).toBeFocused();
    expect(await activeElementTag(page)).toBe("box");

    // The query box: typing and Enter step without rebuilding it.
    await typeQuery(page, "needle");
    await expectFindState(region, { index: 1, total: 3 });
    await page.keyboard.press("Enter");
    await expectFindState(region, { index: 2, total: 3 });
    await settleFor(page, 1200);
    await expect(searchBox(region)).toBeFocused();
    expect(await activeElementTag(page)).toBe("box");

    // Next match: Enter then Space each step exactly once, and the button keeps focus.
    await nextMatch(region).focus();
    await expect(nextMatch(region)).toBeFocused();
    await tagActiveElement(page, "next");
    await page.keyboard.press("Enter");
    await expectFindState(region, { index: 3, total: 3 });
    await settleFor(page, 1200);
    await expect(nextMatch(region)).toBeFocused();
    expect(await activeElementTag(page)).toBe("next");
    await page.keyboard.press("Space");
    await expectFindState(region, { index: 1, total: 3 });
    expect(await activeElementTag(page)).toBe("next");

    // Previous match.
    await previousMatch(region).focus();
    await expect(previousMatch(region)).toBeFocused();
    await tagActiveElement(page, "prev");
    await page.keyboard.press("Enter");
    await expectFindState(region, { index: 3, total: 3 });
    await settleFor(page, 1200);
    await expect(previousMatch(region)).toBeFocused();
    expect(await activeElementTag(page)).toBe("prev");
    await page.keyboard.press("Space");
    await expectFindState(region, { index: 2, total: 3 });
    expect(await activeElementTag(page)).toBe("prev");

    // Close search: activating it hands focus to the body, which keeps it across a tick.
    await closeSearch(region).focus();
    await expect(closeSearch(region)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(searchBox(region)).toBeHidden();
    await expect(searchIcon(region)).toBeVisible();
    await expect(renderedBody(region)).toBeFocused();
    await settleFor(page, 1200);
    await expect(renderedBody(region)).toBeFocused();
    expect(await activeElementTag(page)).toBe("body");
  } finally {
    await cleanup();
  }
});

// ── E13: closing ───────────────────────────────────────────────────────────────────────

test("Escape closes the bar, empties both highlights, shows the icon and leaves focus on the body (E13, REQ-9)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-e13", dir, FIND_FILES.main);

    await openBar(region);
    await typeQuery(page, "quokka");
    await expectFindState(region, { index: 1, total: 3 });

    await page.keyboard.press("Escape");

    await expect(searchBox(region)).toBeHidden();
    await expect(searchIcon(region)).toBeVisible();
    await expectNoHighlights(region);
    await expect(renderedBody(region)).toBeFocused();
    // Highlight registry is document-global: nothing of this reader's is left in it.
    const leftover = await page.evaluate(() => {
      let n = 0;
      for (const highlight of (
        CSS as unknown as { highlights: Map<string, Set<unknown>> }
      ).highlights.values()) {
        n += highlight.size;
      }
      return n;
    });
    expect(leftover).toBe(0);
  } finally {
    await cleanup();
  }
});

test("clicking Close search closes the bar, clears the highlights and returns the icon, and reopening starts from the last query's matches (REQ-9)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-close", dir, FIND_FILES.main);

    await openBar(region);
    await typeQuery(page, "quokka");
    await expectFindState(region, { index: 1, total: 3 });

    await closeSearch(region).click();

    await expect(searchBox(region)).toBeHidden();
    await expect(searchIcon(region)).toBeVisible();
    await expectNoHighlights(region);
    await expect(renderedBody(region)).toBeFocused();

    await openBar(region);
    await typeQuery(page, "alpha");
    await expect(matchCount(region)).toHaveText("No results");
  } finally {
    await cleanup();
  }
});

// ── E11, E12: the document changes under an open bar ───────────────────────────────────

test("rewriting the open file with a Write hook re-runs the query, keeps the ordinal when it fits, clamps it when it does not, reads No results at zero, and never scrolls the body (E11, REQ-11)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region, claudeId } = await openFocusDoc(page, daemon, "find-e11", dir, FIND_FILES.tall);
    const tall = join(dir, FIND_FILES.tall.name);
    const writeHook = () =>
      page.request.post(daemon.ingestURL("hook"), {
        data: rawPostToolUse(claudeId, { toolName: "Write", filePath: tall }),
      });

    await openBar(region);
    await typeQuery(page, "needle");
    await page.keyboard.press("Enter");
    await expectFindState(region, { index: 2, total: 3 });
    const scrollBefore = await bodyScrollTop(region);
    expect(scrollBefore).toBeGreaterThan(0);

    // Same shape, one word edited at the top: still three matches, ordinal 2 kept.
    const edited = tallBody(FIND_FILES.tall.heading, 80, [3, 40, 78]).replace(
      "Paragraph 1 holds a filler",
      "Paragraph 1 holds a edited",
    );
    await writeFile(tall, edited);
    await writeHook();
    await expect(renderedBody(region)).toContainText("holds a edited", { timeout: 15_000 });
    await expectFindState(region, { index: 2, total: 3 });
    await settleFor(page, 500);
    expect(await bodyScrollTop(region)).toBe(scrollBefore);
    await expect(searchBox(region)).toHaveValue("needle");

    // Two of the three needles removed: ordinal 2 clamps to the only match.
    await writeFile(tall, tallBody(FIND_FILES.tall.heading, 80, [3, 40, 78], [40, 78]));
    await writeHook();
    await expect(renderedBody(region)).toContainText("Noodle", { timeout: 15_000 });
    await expectFindState(region, { index: 1, total: 1 });

    // None left: the bar stays open and says so.
    await writeFile(tall, tallBody(FIND_FILES.tall.heading, 80, [3, 40, 78], [3, 40, 78]));
    await writeHook();
    await expect(matchCount(region)).toHaveText("No results", { timeout: 15_000 });
    await expect(searchBox(region)).toBeVisible();
    await expect(searchBox(region)).toHaveValue("needle");
    await expectNoHighlights(region);
  } finally {
    await cleanup();
  }
});

test("opening another file with the bar open keeps the bar and query, re-runs them against the new file at 1 of n and scrolls to the first match (E12, REQ-12)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-e12", dir, FIND_FILES.tall);

    await openBar(region);
    await typeQuery(page, "needle");
    await page.keyboard.press("Enter");
    await expectFindState(region, { index: 2, total: 3 });

    await fileEntry(region, FIND_FILES.deep.name).click();
    await expect(renderedBody(region).locator("h1")).toHaveText(FIND_FILES.deep.heading, {
      timeout: 15_000,
    });

    await expect(searchBox(region)).toBeVisible();
    await expect(searchBox(region)).toHaveValue("needle");
    await expectFindState(region, { index: 1, total: 2 });
    expect(await bodyScrollTop(region), "paragraph 50 is below the fold").toBeGreaterThan(0);
    await expectCurrentMatchInView(region);
  } finally {
    await cleanup();
  }
});

// ── E14: the pop-out ───────────────────────────────────────────────────────────────────

test("the pop-out shows the icon, opens the bar on click and on Cmd+F, and highlights as in Focus (E14, REQ-1, REQ-3, REQ-10, INV-4)", async ({
  page,
  daemon,
  context,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-e14", dir, FIND_FILES.main);
    const popup = await popOut(region, context);
    await installFindKeyLog(popup);
    const popRegion = readerRegion(popup, "find-e14");
    await expect(popRegion).toBeVisible({ timeout: 15_000 });
    await expect(renderedBody(popRegion).locator("h1")).toHaveText(FIND_FILES.main.heading, {
      timeout: 15_000,
    });

    await expect(searchIcon(popRegion)).toBeVisible();
    await searchIcon(popRegion).click();
    await expect(searchBox(popRegion)).toBeFocused();
    await expect(searchIcon(popRegion)).toBeHidden();
    await popup.keyboard.type("quokka");
    await expectFindState(popRegion, { index: 1, total: 3 });
    const h = await readHighlights(popRegion);
    expect(h.all.map((r) => r.text)).toEqual(["quokka", "QUOKKA", "Quokka"]);
    expect(h.current).toHaveLength(1);

    await popup.keyboard.press("Escape");
    await expect(searchBox(popRegion)).toBeHidden();
    await expectNoHighlights(popRegion);

    await bodyParagraph(popRegion).click();
    await expect(renderedBody(popRegion)).toBeFocused();
    await popup.keyboard.press("Meta+KeyF");
    await expect(searchBox(popRegion)).toBeFocused();
    const keys = await waitForFindKeys(popup, 1);
    expect(keys.map((k) => k.defaultPrevented)).toEqual([true]);
    // The dashboard page the pop-out came from saw none of it.
    expect(await readFindKeyLog(page)).toEqual([]);
  } finally {
    await cleanup();
  }
});

test("in the pop-out the icon and the open bar hug the reading area's corner with the nav open and collapsed, and stay put while the body scrolls (INV-3)", async ({
  page,
  daemon,
  context,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-popcorner", dir, FIND_FILES.tall);
    const popup = await popOut(region, context);
    const popRegion = readerRegion(popup, "find-popcorner");
    await expect(renderedBody(popRegion).locator("h1")).toHaveText(FIND_FILES.tall.heading, {
      timeout: 15_000,
    });
    await expect(readerNav(popRegion)).toBeVisible();

    const iconOpen = await expectIconInCorner(popRegion, true, "pop-out icon, nav open");
    await scrollBodyToEnd(popRegion);
    expect(samePosition(iconOpen, await boxOf(searchIcon(popRegion)))).toBe(true);
    await renderedBody(popRegion).evaluate((el) => {
      el.scrollTop = 0;
    });

    await openBar(popRegion);
    await popup.keyboard.type("needle");
    await expectFindState(popRegion, { index: 1, total: 3 });
    const barOpen = await expectBarInCorner(popRegion, true, "pop-out bar, nav open");
    await scrollBodyToEnd(popRegion);
    expect(samePosition(barOpen, (await barMetrics(popRegion)).box)).toBe(true);

    await navToggle(popRegion).click();
    await expect(readerNav(popRegion)).toBeHidden();
    await expectBarInCorner(popRegion, false, "pop-out bar, nav collapsed");
    await expectFindState(popRegion, { index: 1, total: 3 });
    await searchBox(popRegion).click();
    await popup.keyboard.press("Escape");
    await expect(searchIcon(popRegion)).toBeVisible();
    await expectIconInCorner(popRegion, false, "pop-out icon, nav collapsed");
  } finally {
    await cleanup();
  }
});

// ── Plan search-bar-text-length: the count never leaves a blank gap ───────────────────

/** The bar's box in each count state — empty query, `1 of 3`, a miss — so a count that
 * changes length can be seen moving the bar's left edge. */
async function barBoxPerCountState(page: Page, region: Locator): Promise<Box[]> {
  const boxes: Box[] = [];
  await expect(matchCount(region)).toHaveText("No results");
  boxes.push((await barMetrics(region)).box);
  await typeQuery(page, "needle");
  await expectFindState(region, { index: 1, total: 3 });
  boxes.push((await barMetrics(region)).box);
  await typeQuery(page, "zzzz");
  await expect(matchCount(region)).toHaveText("No results");
  boxes.push((await barMetrics(region)).box);
  return boxes;
}

function expectOneWidth(boxes: Box[], what: string): void {
  const [first, ...rest] = boxes;
  if (first === undefined) throw new Error("no bar boxes");
  for (const box of rest) {
    expect(Math.abs(box.x - first.x), `${what}: left edge`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(box.width - first.width), `${what}: width`).toBeLessThanOrEqual(0.5);
  }
}

test("in Focus the opened bar's count reads No results, and the bar keeps one width across an empty query, a count and a miss (search-bar-text-length REQ-1, REQ-3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-width", dir, FIND_FILES.tall);
    await openBar(region);
    expectOneWidth(await barBoxPerCountState(page, region), "Focus");
  } finally {
    await cleanup();
  }
});

test("in a 3×2 tile the bar keeps one width across an empty query, a count and a miss (search-bar-text-length REQ-1, REQ-3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const [region] = await openTileReaders(
      page,
      daemon,
      [{ title: "find-width-tile", dir, file: FIND_FILES.tall }],
      "3×2",
    );
    if (region === undefined) throw new Error("no tile reader");
    await openBar(region);
    expectOneWidth(await barBoxPerCountState(page, region), "compact tile");
  } finally {
    await cleanup();
  }
});

// ── E15: tiles ─────────────────────────────────────────────────────────────────────────

test("in a 3×2 tile with the nav collapsed the icon and the open bar sit inside the tile's reading area with no horizontal overflow (E15, REQ-1, REQ-2, INV-3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const [region] = await openTileReaders(
      page,
      daemon,
      [{ title: "find-e15", dir, file: FIND_FILES.tall }],
      "3×2",
    );
    if (region === undefined) throw new Error("no tile reader");
    await expect(readerNav(region)).toHaveCount(0);

    await expect(searchIcon(region)).toBeVisible();
    const iconBox = await expectIconInCorner(region, false, "tile icon, nav collapsed");
    await scrollBodyToEnd(region);
    expect(samePosition(iconBox, await boxOf(searchIcon(region)))).toBe(true);
    await renderedBody(region).evaluate((el) => {
      el.scrollTop = 0;
    });

    await openBar(region);
    await typeQuery(page, "needle");
    await expectFindState(region, { index: 1, total: 3 });
    const barBox = await expectBarInCorner(region, false, "tile bar, nav collapsed");
    const bar = await barMetrics(region);
    expect(bar.scrollWidth, "the bar has no horizontal overflow").toBeLessThanOrEqual(
      bar.clientWidth,
    );
    for (const control of [
      searchBox(region),
      matchCount(region),
      previousMatch(region),
      nextMatch(region),
      closeSearch(region),
    ]) {
      const box = await boxOf(control);
      expect(box.x, "control inside the bar (left)").toBeGreaterThanOrEqual(barBox.x - 0.5);
      expect(right(box), "control inside the bar (right)").toBeLessThanOrEqual(right(barBox) + 0.5);
    }
    await scrollBodyToEnd(region);
    expect(samePosition(barBox, (await barMetrics(region)).box)).toBe(true);
  } finally {
    await cleanup();
  }
});

test("in a 2×2 tile with the nav open the icon and the open bar sit left of the nav's border inside the reading area (INV-3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const [region] = await openTileReaders(
      page,
      daemon,
      [{ title: "find-tile22", dir, file: FIND_FILES.tall }],
      "2×2",
    );
    if (region === undefined) throw new Error("no tile reader");
    await expect(readerNav(region)).toBeVisible();

    const iconBox = await expectIconInCorner(region, true, "tile icon, nav open");
    await scrollBodyToEnd(region);
    expect(samePosition(iconBox, await boxOf(searchIcon(region)))).toBe(true);
    await renderedBody(region).evaluate((el) => {
      el.scrollTop = 0;
    });

    await openBar(region);
    await typeQuery(page, "needle");
    await expectFindState(region, { index: 1, total: 3 });
    await expectBarInCorner(region, true, "tile bar, nav open");
    const bar = await barMetrics(region);
    expect(bar.scrollWidth).toBeLessThanOrEqual(bar.clientWidth);
  } finally {
    await cleanup();
  }
});

test("a tile's find bar carries the same controls as Focus's at a smaller type size (REQ-1)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const focus = await openFocusDoc(page, daemon, "find-compact", dir, FIND_FILES.main);
    await openBar(focus.region);
    const focusSize = await searchBox(focus.region).evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).fontSize),
    );

    await page.keyboard.press("Escape");
    await page.keyboard.press("Meta+Backslash");
    await expect(page.locator("#view-tiles")).toBeVisible();
    await page.getByRole("button", { name: "2×2" }).click();
    await tileSurfaceButton(page, focus.session.id, "docs").click();
    const region = readerRegionInTile(page, focus.session.id);
    await expect(region).toBeVisible({ timeout: 15_000 });
    await fileEntry(region, FIND_FILES.main.name).click();
    await expect(renderedBody(region).locator("h1")).toHaveText(FIND_FILES.main.heading, {
      timeout: 15_000,
    });

    await openBar(region);
    await expect(previousMatch(region)).toBeVisible();
    await expect(nextMatch(region)).toBeVisible();
    await expect(closeSearch(region)).toBeVisible();
    await expect(matchCount(region)).toBeAttached();
    const tileSize = await searchBox(region).evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).fontSize),
    );
    expect(tileSize, `tile ${tileSize}px vs Focus ${focusSize}px`).toBeLessThan(focusSize);
  } finally {
    await cleanup();
  }
});

// ── E16, E17: two tile readers ─────────────────────────────────────────────────────────

test("with two tile readers, clicking in one body and pressing Cmd+F opens that tile's bar only, default-prevented (E16, REQ-10, INV-4)", async ({
  page,
  daemon,
}) => {
  const [a, b] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await Promise.all([writeFindFixtures(a.path), writeFindFixtures(b.path)]);
    const [regionA, regionB] = await openTileReaders(
      page,
      daemon,
      [
        { title: "find-e16-a", dir: a.path, file: FIND_FILES.main },
        { title: "find-e16-b", dir: b.path, file: FIND_FILES.tall },
      ],
      "2×2",
    );
    if (regionA === undefined || regionB === undefined) throw new Error("missing tile reader");

    await bodyParagraph(regionA).click();
    await expect(renderedBody(regionA)).toBeFocused();
    await page.keyboard.press("Meta+KeyF");
    await expect(searchBox(regionA)).toBeFocused();
    await expect(searchBox(regionB)).toHaveCount(0);
    await expect(searchIcon(regionB)).toBeVisible();
    const afterA = await waitForFindKeys(page, 1);
    expect(afterA.map((k) => k.defaultPrevented)).toEqual([true]);

    await bodyParagraph(regionB).click();
    await expect(renderedBody(regionB)).toBeFocused();
    await page.keyboard.press("Meta+KeyF");
    await expect(searchBox(regionB)).toBeFocused();
    await expect(searchBox(regionA)).toBeVisible();
    const afterB = await waitForFindKeys(page, 2);
    expect(afterB.map((k) => k.defaultPrevented)).toEqual([true, true]);
  } finally {
    await Promise.all([a.cleanup(), b.cleanup()]);
  }
});

test("with two tile readers searching different queries, stepping or closing one leaves the other's count and highlight ranges unchanged (E17, INV-5, REQ-5, REQ-9)", async ({
  page,
  daemon,
}) => {
  const [a, b] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await Promise.all([writeFindFixtures(a.path), writeFindFixtures(b.path)]);
    const [regionA, regionB] = await openTileReaders(
      page,
      daemon,
      [
        { title: "find-e17-a", dir: a.path, file: FIND_FILES.main },
        { title: "find-e17-b", dir: b.path, file: FIND_FILES.tall },
      ],
      "2×2",
    );
    if (regionA === undefined || regionB === undefined) throw new Error("missing tile reader");

    await openBar(regionA);
    await typeQuery(page, "quokka");
    await expectFindState(regionA, { index: 1, total: 3 });
    await openBar(regionB);
    await typeQuery(page, "needle");
    await expectFindState(regionB, { index: 1, total: 3 });
    // B opening and typing left A exactly as it was.
    await expectFindState(regionA, { index: 1, total: 3 });
    await expect(searchBox(regionA)).toHaveValue("quokka");
    const aSnapshot = JSON.stringify(await readHighlights(regionA));
    expect((await readHighlights(regionA)).all.map((r) => r.text)).toEqual([
      "quokka",
      "QUOKKA",
      "Quokka",
    ]);
    expect((await readHighlights(regionB)).all.map((r) => r.text.toLowerCase())).toEqual([
      "needle",
      "needle",
      "needle",
    ]);

    // Step B: A is untouched.
    await page.keyboard.press("Enter");
    await expectFindState(regionB, { index: 2, total: 3 });
    await expectFindState(regionA, { index: 1, total: 3 });
    expect(JSON.stringify(await readHighlights(regionA))).toBe(aSnapshot);

    // Step A: B keeps where it was.
    await nextMatch(regionA).click();
    await expectFindState(regionA, { index: 2, total: 3 });
    await expectFindState(regionB, { index: 2, total: 3 });
    const aSteppedSnapshot = JSON.stringify(await readHighlights(regionA));
    const bSteppedSnapshot = JSON.stringify(await readHighlights(regionB));

    // Close B: A keeps its count and ranges, B has none left.
    await searchBox(regionB).click();
    await page.keyboard.press("Escape");
    await expect(searchBox(regionB)).toBeHidden();
    await expectNoHighlights(regionB);
    await expectFindState(regionA, { index: 2, total: 3 });
    expect(JSON.stringify(await readHighlights(regionA))).toBe(aSteppedSnapshot);

    // Reopen B on a new query: A still unchanged, and B's ranges are its own.
    await openBar(regionB);
    await typeQuery(page, "paragraph");
    await expect(matchCount(regionB)).toHaveText(/^1 of \d+$/);
    // Reopening restores the old query, so the count regex alone is satisfied by the stale
    // "1 of 3"; the highlighted text proves the typed query has been searched.
    await expect.poll(async () => (await readHighlights(regionB)).all.length).toBeGreaterThan(3);
    expect((await readHighlights(regionB)).all.map((r) => r.text.toLowerCase())).toContain(
      "paragraph",
    );
    await expectFindState(regionA, { index: 2, total: 3 });
    expect(JSON.stringify(await readHighlights(regionA))).toBe(aSteppedSnapshot);
    expect(bSteppedSnapshot).not.toBe(JSON.stringify(await readHighlights(regionB)));
  } finally {
    await Promise.all([a.cleanup(), b.cleanup()]);
  }
});

// ── REQ-13: tokens in every theme ──────────────────────────────────────────────────────

test("the open bar's ground, border and type follow the design tokens in the instrument, dark and light themes (REQ-13)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-tokens", dir, FIND_FILES.main);
    await openBar(region);
    await typeQuery(page, "quokka");

    for (const theme of ["Instrument", "Dark", "Light"] as const) {
      const dialog = await openSettingsDialog(page);
      await themeRadio(dialog, theme).check();
      await settingsCloseButton(dialog).click();
      await expect(dialog).toBeHidden();
      await expectFindState(region, { index: 1, total: 3 });

      const s = await region.evaluate((host) => {
        const input = host.querySelector(`input[type="search"][aria-label="Search document"]`);
        const close = host.querySelector(`button[aria-label="Close search"]`);
        if (!input || !close) throw new Error("the find bar is not open");
        let bar: Element | null = input;
        while (bar && !bar.contains(close)) bar = bar.parentElement;
        if (!bar) throw new Error("no bar wrapper");
        const probe = document.createElement("div");
        document.body.append(probe);
        const resolve = (
          css: string,
          prop: "backgroundColor" | "borderTopColor" | "fontFamily" | "fontSize",
        ) => {
          probe.style.cssText = css;
          return getComputedStyle(probe)[prop];
        };
        const barStyle = getComputedStyle(bar);
        const inputStyle = getComputedStyle(input);
        const out = {
          bg: barStyle.backgroundColor,
          raised: resolve("background: var(--bg-raised)", "backgroundColor"),
          border: barStyle.borderTopColor,
          borderWidth: Number.parseFloat(barStyle.borderTopWidth),
          edge: resolve("border: 1px solid var(--edge)", "borderTopColor"),
          font: inputStyle.fontFamily,
          mono: resolve("font-family: var(--mono)", "fontFamily"),
          size: inputStyle.fontSize,
          sizes: [
            resolve("font-size: var(--fs-xs)", "fontSize"),
            resolve("font-size: var(--fs-2xs)", "fontSize"),
          ],
        };
        probe.remove();
        return out;
      });
      expect(s.bg, `${theme}: bar ground is --bg-raised`).toBe(s.raised);
      expect(s.borderWidth, `${theme}: bar has a border`).toBeGreaterThan(0);
      expect(s.border, `${theme}: bar border is --edge`).toBe(s.edge);
      expect(s.font, `${theme}: query box is mono`).toBe(s.mono);
      expect(s.sizes, `${theme}: query box is mono xs or 2xs`).toContain(s.size);
    }
  } finally {
    await cleanup();
  }
});

// ── Review cycle 2, Browser Minor 1: opening or closing the bar never moves scrolled text ──

type ScrollSpot = "mid" | "end" | "near-end";

/** How far short of its end the "near-end" case rests: inside the padding change the bar
 * adds (22 px Focus, 28 px compact), where the cycle 3 defect moved the text by part of it. */
const END_GAP = 10;

async function distanceFromEnd(region: Locator): Promise<number> {
  return renderedBody(region).evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
}

/** Scrolls the body so paragraph 15 sits mid-viewport (or, for `where` "end" and "near-end",
 * to the last paragraph at the end of the body and 10 px short of it), then opens the bar and closes it
 * again by Escape and by the close button, asserting that paragraph's viewport y is the
 * one it had before — right after each flip and again after a render tick. Opening adds a
 * top padding to the body (so the first line clears the bar at scrollTop 0); a scrolled
 * body must absorb it, or every line jumps by the padding. `owner` is the page the region
 * lives on (the pop-out is a second page). */
async function expectScrolledTextStillAcrossBar(
  owner: Page,
  region: Locator,
  where: ScrollSpot = "mid",
): Promise<void> {
  const paragraph = renderedBody(region).locator("p", {
    hasText: where === "mid" ? "Paragraph 15 holds" : "Paragraph 80 holds",
  });
  if (where === "mid") {
    await paragraph.evaluate((el) => {
      el.scrollIntoView({ block: "center", behavior: "instant" });
    });
  } else {
    await renderedBody(region).evaluate(
      (el, gap) => {
        el.scrollTop = el.scrollHeight - el.clientHeight - gap;
      },
      where === "end" ? 0 : END_GAP,
    );
  }
  await expect
    .poll(() => bodyScrollTop(region), "the body is scrolled away from its top")
    .toBeGreaterThan(0);
  await settleFor(owner, 300);
  const resting = (await boxOf(paragraph)).y;
  if (where === "end") {
    expect(await distanceFromEnd(region), "the body rests at its very end").toBeLessThan(1);
  }

  const stillAt = async (what: string): Promise<void> => {
    expect((await boxOf(paragraph)).y, `${what}: the paragraph has not moved`).toBeCloseTo(
      resting,
      0,
    );
    await settleFor(owner, 1100);
    expect(
      (await boxOf(paragraph)).y,
      `${what}, a render tick later: the paragraph has not moved`,
    ).toBeCloseTo(resting, 0);
    if (where === "end") {
      expect(
        await distanceFromEnd(region),
        `${what}: the body is still at its very end`,
      ).toBeLessThan(1);
    }
  };

  await openBar(region);
  await stillAt("bar opened");
  await owner.keyboard.press("Escape");
  await expect(searchBox(region)).toBeHidden();
  await stillAt("bar closed by Escape");

  await openBar(region);
  await stillAt("bar reopened");
  await closeSearch(region).click();
  await expect(searchBox(region)).toBeHidden();
  await stillAt("bar closed by the close button");
}

test("opening and closing the bar with the body scrolled keeps a paragraph at the same viewport y in Focus (Browser Minor 1, INV-3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-still-focus", dir, FIND_FILES.tall);
    await expectScrolledTextStillAcrossBar(page, region);
  } finally {
    await cleanup();
  }
});

test("opening and closing the bar with the body scrolled keeps a paragraph at the same viewport y in the pop-out (Browser Minor 1, INV-3)", async ({
  page,
  daemon,
  context,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const { region } = await openFocusDoc(page, daemon, "find-still-pop", dir, FIND_FILES.tall);
    const popup = await popOut(region, context);
    const popRegion = readerRegion(popup, "find-still-pop");
    await expect(renderedBody(popRegion).locator("h1")).toHaveText(FIND_FILES.tall.heading, {
      timeout: 15_000,
    });
    await expectScrolledTextStillAcrossBar(popup, popRegion);
  } finally {
    await cleanup();
  }
});

test("opening and closing the bar with the body scrolled keeps a paragraph at the same viewport y in a 2×2 tile (Browser Minor 1, INV-3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const [region] = await openTileReaders(
      page,
      daemon,
      [{ title: "find-still-t22", dir, file: FIND_FILES.tall }],
      "2×2",
    );
    if (region === undefined) throw new Error("no tile reader");
    await expectScrolledTextStillAcrossBar(page, region);
  } finally {
    await cleanup();
  }
});

test("opening and closing the bar with the body scrolled keeps a paragraph at the same viewport y in a 3×2 tile (Browser Minor 1, INV-3)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await writeFindFixtures(dir);
    const [region] = await openTileReaders(
      page,
      daemon,
      [{ title: "find-still-t32", dir, file: FIND_FILES.tall }],
      "3×2",
    );
    if (region === undefined) throw new Error("no tile reader");
    await expectScrolledTextStillAcrossBar(page, region);
  } finally {
    await cleanup();
  }
});

// ── Review cycle 3, Correctness Minor 2 / Browser Minor 1: the end of the body ────────────

for (const spot of ["end", "near-end"] as const) {
  const label = spot === "end" ? "at the end of its body" : "10 px short of the end of its body";

  test(`closing the bar with the body ${label} keeps the last paragraph at the same viewport y in Focus (Browser Minor 1, INV-3)`, async ({
    page,
    daemon,
  }) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await writeFindFixtures(dir);
      const { region } = await openFocusDoc(
        page,
        daemon,
        `find-${spot}-focus`,
        dir,
        FIND_FILES.tall,
      );
      await expectScrolledTextStillAcrossBar(page, region, spot);
    } finally {
      await cleanup();
    }
  });

  test(`closing the bar with the body ${label} keeps the last paragraph at the same viewport y in the pop-out (Browser Minor 1, INV-3)`, async ({
    page,
    daemon,
    context,
  }) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await writeFindFixtures(dir);
      const { region } = await openFocusDoc(page, daemon, `find-${spot}-pop`, dir, FIND_FILES.tall);
      const popup = await popOut(region, context);
      const popRegion = readerRegion(popup, `find-${spot}-pop`);
      await expect(renderedBody(popRegion).locator("h1")).toHaveText(FIND_FILES.tall.heading, {
        timeout: 15_000,
      });
      await expectScrolledTextStillAcrossBar(popup, popRegion, spot);
    } finally {
      await cleanup();
    }
  });

  for (const density of ["2×2", "3×2"] as const) {
    test(`closing the bar with the body ${label} keeps the last paragraph at the same viewport y in a ${density} tile (Browser Minor 1, INV-3)`, async ({
      page,
      daemon,
    }) => {
      const { path: dir, cleanup } = await scratchDirectory();
      try {
        await writeFindFixtures(dir);
        const [region] = await openTileReaders(
          page,
          daemon,
          [
            {
              title: `find-${spot}-t${density === "2×2" ? "22" : "32"}`,
              dir,
              file: FIND_FILES.tall,
            },
          ],
          density,
        );
        if (region === undefined) throw new Error("no tile reader");
        await expectScrolledTextStillAcrossBar(page, region, spot);
      } finally {
        await cleanup();
      }
    });
  }
}
