// Plan ui-text-and-focus — REQ-6/REQ-7 (the type ramp, #19). Plan acceptance: E10.
// REQ-4/REQ-5 (contrast floors) and REQ-8 (terminal untouched) are gated by `make
// contrast` and a grep (Automated Checks W3/W8), not E2E — nothing here duplicates
// those. `--fs-root`/`--fs-base` do not exist on `:root` as of this authoring pass
// (style.css still hardcodes a 61-literal font-size scale and a 14px body) — this test
// is EXPECTED TO FAIL until web-impl lands REQ-6/REQ-7. Collection-only gate.
import { expect, test } from "@playwright/test";
import { startScratchDaemon } from "./helpers/daemon";
import { launchSession, scratchDirectory } from "./helpers/session";

test("the root font size is 15px, and a rail card's title renders at the fs-base step, on a fresh load (E10)", async ({
  page,
}) => {
  const daemon = await startScratchDaemon();
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "type-scale-e10" });

    const rootFontSize = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    expect(rootFontSize).toBe("15px");

    // Ramp mapping (Implementation Notes): today's 13.5px/14px literals collapse onto
    // `--fs-base` (1rem) — at a 15px root that resolves to 15px. The rail card's title
    // (`.name`) is exactly the element sessions.spec.ts already treats as the card's
    // title text.
    const card = page.getByTestId("session-card").filter({ hasText: "type-scale-e10" });
    const titleFontSize = await card.locator(".name").evaluate((el) => getComputedStyle(el).fontSize);
    expect(titleFontSize).toBe("15px");
  } finally {
    await cleanup();
    await daemon.teardown();
  }
});
