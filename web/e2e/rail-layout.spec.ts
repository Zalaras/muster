import { expect, test } from "./helpers/fixtures";
import { bodyRailDensity, railDensityButton } from "./helpers/railcards";
import { pinButton } from "./helpers/railorder";
import { launchSession, scratchDirectory, sessionCard } from "./helpers/session";

// The journeys where a `railDensity` prefs
// round-trip drives the display: the density pref echoing to the body and mirroring across
// a reload, a second window and the daemon being down, and a focused control surviving
// the density re-render. The display properties — the card layout per density, the
// activity clamp, the compact gauge track, the empty state, the masthead New session button
// and the title-above-state row order — are render tests in web/render/rail.spec.ts
// (plans/_audit/relevel/rail.md). Fixture plan header: `railDensity` is daemon-global, so
// every test takes the per-test `daemon` fixture (helpers/fixtures.ts) and one opens a
// second window.

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
    // broadcast (theme.spec.ts precedent).
    await expect.poll(() => bodyRailDensity(pageB)).toBe("compact");

    await page.reload();
    await expect.poll(() => bodyRailDensity(page)).toBe("compact");

    // The Tiles strip renders the same template and follows the same density
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

    // No optimistic state: a failed PUT changes nothing on screen.
    await railDensityButton(page, "expanded").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("compact");
    await expect(railDensityButton(page, "compact")).toHaveAttribute("aria-pressed", "true");
    await expect(railDensityButton(page, "expanded")).toHaveAttribute("aria-pressed", "false");
  } finally {
    await contextB.close();
  }
});

test("a card's Pin button keeps focus and node identity when a density button is clicked (E12, REQ-15)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "density-focus-e12" });

    const card = sessionCard(page, "density-focus-e12");
    await expect(card).toBeVisible();
    // A live card no longer offers End; Pin is the
    // focusable control it still has.
    const pinBtn = pinButton(card);
    await pinBtn.focus();
    await expect(pinBtn).toBeFocused();
    await pinBtn.evaluate((el) => {
      (el as HTMLElement & { __e2eTag?: string }).__e2eTag = "original-pin-btn";
    });

    await railDensityButton(page, "expanded").click();
    await expect.poll(() => bodyRailDensity(page)).toBe("expanded");

    await expect(pinBtn).toBeFocused();
    const stillTagged = await pinBtn.evaluate(
      (el) => (el as HTMLElement & { __e2eTag?: string }).__e2eTag === "original-pin-btn",
    );
    expect(stillTagged).toBe(true);
    await expect(card.getByRole("button", { name: "Stop" })).toHaveCount(0);
  } finally {
    await cleanup();
  }
});
