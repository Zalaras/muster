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
  fileEntry,
  navToggle,
  popOutLink,
  readerNav,
  readerRegion,
  renderedBody,
} from "./helpers/reader";
import {
  barMetrics,
  bodyScrollTop,
  boxOf,
  closeSearch,
  distanceFromEnd,
  expectBarInCorner,
  expectFindState,
  expectIconInCorner,
  expectNoHighlights,
  FIND_FILES,
  type FindFixture,
  installFindKeyLog,
  matchCount,
  readFindKeyLog,
  readHighlights,
  samePosition,
  scrollBodyToEnd,
  searchBox,
  searchIcon,
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
import { mainheadSurfaceButton } from "./helpers/shell";

// Plan docs-search-bar — the journeys of REQ-1 through REQ-13, INV-1 through INV-5: the
// Write hook re-rendering the open file under the bar (E11) and the pop-out (E14, INV-3,
// Browser Minor 1), a second page the render harness cannot serve. Every display property —
// the icon and the bar in the reading area's corner, what matches and what is highlighted,
// Cmd+F in Focus and in two tiles, stepping and scrolling, the count's one width, the tokens
// per theme, the body's innerHTML and scroll position across the bar — moved to
// `web/render/reader-find.spec.ts` on 2026-10-20 (plans/_audit/test-audit-2026-10-20-relevel.md),
// against the `find-docs*` fixtures whose documents are the ones `writeFindFixtures` writes.
// Fixture plan (plan.md header): every test takes the test-scoped `daemon` fixture — a
// fresh scratch daemon per test — because the reader auto-opens on "the only session" in
// Focus, and the Write-hook rewrites are asserted per daemon.
//
// The daemon and tmux are real throughout; only Claude Code is faked, through
// envelopedSessionStart / rawPostToolUse (a real `claude` never runs here, CLAUDE.md hard
// rule).
//
// Highlights are read through `CSS.highlights` (web/render/helpers/reader-find.ts) and
// classified by structure, never by the two registered names, which are web-impl's. Cmd+F is
// pressed as `Meta+KeyF` (the matching is on `event.code`,
// kb:adr/shortcuts-option-command-family-off-reserved-chords) and its default-prevented
// verdict is read from a capture-phase log: Playwright's headless Chromium has no find UI to
// observe, so "the browser's own find does not open" is the event's `defaultPrevented`.
// Whether a real Chrome lets a page prevent the chord is a reviewer-verified measurement the
// suite cannot prove (plan Carried-over measurements).

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

async function popOut(region: Locator, context: BrowserContext): Promise<Page> {
  const [popup] = await Promise.all([context.waitForEvent("page"), popOutLink(region).click()]);
  await popup.waitForLoadState();
  return popup;
}

// ── E11: the document changes under an open bar ────────────────────────────────────────

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

// ── E14: the pop-out ───────────────────────────────────────────────────────────────────
//
// The pop-out is a second page (`doc.html`), and the render harness installs its routes on
// the first page only, so these stay E2E: the pop-out loads from the daemon or not at all.

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

// ── Review cycle 2, Browser Minor 1: opening or closing the bar never moves scrolled text ──

type ScrollSpot = "mid" | "end" | "near-end";

/** How far short of its end the "near-end" case rests: inside the padding change the bar
 * adds (22 px Focus, 28 px compact), where the cycle 3 defect moved the text by part of it. */
const END_GAP = 10;

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

// ── Review cycle 3, Correctness Minor 2 / Browser Minor 1: the end of the body ────────────

for (const spot of ["end", "near-end"] as const) {
  const label = spot === "end" ? "at the end of its body" : "10 px short of the end of its body";

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
}
