import { expect, test } from "./helpers/fixtures";
import {
  bodyRailDensity,
  cardName,
  cardRepoLine,
  newSessionButton,
  railDensityButton,
  railDensityGroup,
} from "./helpers/railcards";
import { railSortSelect } from "./helpers/railorder";
import { launchSession, scratchDirectory, sessionCard } from "./helpers/session";

// Plan rail-card-improvements — REQ-1 through REQ-6, REQ-15 (card layout, rail-head
// density and the single masthead New session button). Plan acceptance: E2, E7, E11,
// E12. Fixture plan header: this file asserts prefs (daemon-global) and the masthead
// button in both views, so every test takes the per-test `daemon` fixture
// (helpers/fixtures.ts) — `railDensity` is daemon-global and one test opens a second
// window.

test("the masthead's New session button opens the dialog from Focus and Tiles, Opt+Cmd+N still opens it, and no other launcher exists (E2, INV-3)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);

  // REQ-6/INV-3: exactly one New session button in the whole DOM, and the old Tiles
  // toolbar button is gone entirely.
  await expect(page.locator("#new-session-button")).toHaveCount(1);
  await expect(page.locator("#tiles-new-session-button")).toHaveCount(0);

  const btn = newSessionButton(page);
  await expect(btn).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "New session" });

  await btn.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Tiles", exact: true }).click();
  await expect(newSessionButton(page)).toBeVisible();
  await newSessionButton(page).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  await page.keyboard.press("Alt+Meta+KeyN");
  await expect(dialog).toBeVisible();
});

test("an empty rail still shows the sort select and the density control with an empty count (edge case 22)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await expect(railSortSelect(page)).toBeVisible();
  await expect(railDensityGroup(page)).toBeVisible();
  await expect(page.locator("#rail-count")).toHaveText("");
  await expect(page.locator("#main-empty")).toContainText("No sessions yet");
});

test("clicking Compact echoes to body[data-rail-density], persists across a reload, mirrors to a second window, applies to the Tiles strip, and is unaffected while the daemon is down (E7)", async ({
  page,
  browser,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await expect.poll(() => bodyRailDensity(page)).toBe("comfortable");
  await expect(railDensityButton(page, "comfortable")).toHaveAttribute("aria-pressed", "true");

  const contextB = await browser.newContext();
  try {
    const pageB = await contextB.newPage();
    await pageB.goto(daemon.dashboardUrl);

    await railDensityButton(page, "compact").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("compact");
    await expect(railDensityButton(page, "compact")).toHaveAttribute("aria-pressed", "true");
    await expect(railDensityButton(page, "comfortable")).toHaveAttribute("aria-pressed", "false");

    // Window B never clicked anything — it must follow purely from the `prefs`
    // broadcast (INV-4 pattern, theme.spec.ts precedent).
    await expect.poll(() => bodyRailDensity(pageB)).toBe("compact");

    await page.reload();
    await expect.poll(() => bodyRailDensity(page)).toBe("compact");

    // REQ-1: the Tiles strip renders the same template and follows the same density
    // rules.
    await page.getByRole("button", { name: "Tiles", exact: true }).click();
    await expect(page.locator("body")).toHaveAttribute("data-rail-density", "compact");
    await page.getByRole("button", { name: "Focus", exact: true }).click();
    await expect(page.getByRole("button", { name: "Focus", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await daemon.kill();
    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible({ timeout: 15_000 });

    // REQ-15/no-optimistic-state: a failed PUT changes nothing on screen.
    await railDensityButton(page, "expanded").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("compact");
    await expect(railDensityButton(page, "compact")).toHaveAttribute("aria-pressed", "true");
    await expect(railDensityButton(page, "expanded")).toHaveAttribute("aria-pressed", "false");
  } finally {
    await contextB.close();
  }
});

test("a long title wraps to multiple lines in comfortable density and clamps to one line in compact, with title attributes on .name and .r2 throughout (E11)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const longTitle =
      "a very long session title that should need more than one line to display in full at the rail's fixed column width";
    await launchSession(page, daemon, { directory: dir, title: longTitle });

    const card = sessionCard(page, longTitle);
    const name = cardName(card);
    await expect(name).toHaveAttribute("title", longTitle);

    const lineHeight = await name.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    const comfortableHeight = await name.evaluate((el) => el.getBoundingClientRect().height);
    expect(comfortableHeight).toBeGreaterThan(lineHeight * 1.5);

    await railDensityButton(page, "compact").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("compact");

    const compactHeight = await name.evaluate((el) => el.getBoundingClientRect().height);
    expect(compactHeight).toBeLessThanOrEqual(lineHeight * 1.5);
    await expect(name).toHaveAttribute("title", longTitle);

    // REQ-2: `.r2` (the repo/branch line) always carries `title` equal to its own text,
    // in every density.
    const repoLine = cardRepoLine(card);
    const repoText = await repoLine.innerText();
    await expect(repoLine).toHaveAttribute("title", repoText);
  } finally {
    await cleanup();
  }
});

test("in compact density a long title is truly ellipsized within the card, not overflowing it (review cycle 1 Major 1, REQ-4)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const longTitle =
      "a compact-density title long enough that it must be ellipsized rather than clipped mid-word or left overflowing the card";
    await launchSession(page, daemon, { directory: dir, title: longTitle });

    const card = sessionCard(page, longTitle);
    const name = cardName(card);

    // Comfortable is the reference render (REQ-4): nothing truncates, so the same title
    // wraps to more than one line.
    const lineHeight = await name.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    const comfortableHeight = await name.evaluate((el) => el.getBoundingClientRect().height);
    expect(comfortableHeight).toBeGreaterThan(lineHeight * 1.5);

    await railDensityButton(page, "compact").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("compact");

    // Review cycle 1 Major 1: `.name` is a bare `<span>` inside the block `.r1`, so
    // without a block-level `display` it computes `inline`, on which a declared
    // `overflow`/`text-overflow` never applies — the pre-fix render let the title overflow
    // the card instead of ellipsizing. `display: inline` also reports zero for
    // scrollWidth/clientWidth, so the overflow check below only holds once `display` is
    // block-level.
    const metrics = await name.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        display: cs.display,
        textOverflow: cs.textOverflow,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      };
    });
    expect(metrics.display).not.toBe("inline");
    expect(metrics.textOverflow).toBe("ellipsis");
    // The title text still logically overflows its own box — exactly what `text-overflow`
    // clips to an ellipsis — even though nothing is visible past the edge.
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);

    const nameBox = await name.evaluate((el) => el.getBoundingClientRect());
    const cardBox = await card.evaluate((el) => el.getBoundingClientRect());
    // Pre-fix, the inline box let its content overflow both `.r1` and the card silently
    // (measured ~281px past the card's right edge in review); the fix keeps the title's
    // own box inside the card's.
    expect(nameBox.right).toBeLessThanOrEqual(cardBox.right + 1);

    const compactHeight = await name.evaluate((el) => el.getBoundingClientRect().height);
    expect(compactHeight).toBeLessThanOrEqual(lineHeight * 1.5);
    await expect(name).toHaveAttribute("title", longTitle);
  } finally {
    await cleanup();
  }
});

test("a card's End button keeps focus and node identity when a density button is clicked (E12, REQ-15)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "density-focus-e12" });

    const card = sessionCard(page, "density-focus-e12");
    await expect(card).toBeVisible();
    const endBtn = card.getByRole("button", { name: "End" });
    await endBtn.focus();
    await expect(endBtn).toBeFocused();
    await endBtn.evaluate((el) => {
      (el as HTMLElement & { __e2eTag?: string }).__e2eTag = "original-end-btn";
    });

    await railDensityButton(page, "expanded").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("expanded");

    await expect(endBtn).toBeFocused();
    const stillTagged = await endBtn.evaluate(
      (el) => (el as HTMLElement & { __e2eTag?: string }).__e2eTag === "original-end-btn",
    );
    expect(stillTagged).toBe(true);
  } finally {
    await cleanup();
  }
});
