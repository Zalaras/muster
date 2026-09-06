// Plan ui-text-and-focus — REQ-6/REQ-7 (the type ramp, #19). Plan acceptance: E10.
// REQ-4/REQ-5 (contrast floors) and REQ-8 (terminal untouched) are gated by `make
// contrast` and a grep (Automated Checks W3/W8), not E2E — nothing here duplicates
// those. One test, so it takes the per-test `daemon` fixture (helpers/fixtures.ts).
import { expect, test } from "./helpers/fixtures";
import { launchSession, scratchDirectory } from "./helpers/session";

test("the root font size is 15px, and a rail card's title renders at the fs-base step, on a fresh load (E10)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "type-scale-e10" });

    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
      .toBe("15px");

    // Ramp mapping (Implementation Notes): today's 13.5px/14px literals collapse onto
    // `--fs-base` (1rem) — at a 15px root that resolves to 15px. The rail card's title
    // (`.name`) is exactly the element sessions.spec.ts already treats as the card's
    // title text.
    const card = page.getByTestId("session-card").filter({ hasText: "type-scale-e10" });
    await expect(card.locator(".name")).toHaveCSS("font-size", "15px");
  } finally {
    await cleanup();
  }
});
