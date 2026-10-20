// Locators the shortcut specs route a chord's effect through: the launch dialog ⌥⌘N opens,
// its New | Resume tab pair, and the Focus header's session name a focusing chord moves. Pure
// DOM — no daemon, no fixture knowledge — so both tiers use it: the render specs here
// directly, the E2E journeys through `web/e2e/helpers/picker.ts` (the dialog pair) and
// `web/e2e/helpers/resume.ts` (the tabs), which re-export them.
import type { Locator, Page } from "./harness";

/** The launch dialog itself — `aria-labelledby` gives it the accessible name "New
 * session" (the `⌥⌘N` kbd beside the heading text is `aria-hidden`, so it never joins the
 * accessible name). */
export function launchDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "New session" });
}

/** Clicks the rail's "New session" button and returns the now-open dialog locator. */
export async function openLaunchDialog(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "New session" }).click();
  return launchDialog(page);
}

/** The `New` tab (`#launch-tab-new`) — always the selected tab on a fresh dialog open
 * (plan resume-and-dangerously-allow REQ-7), regardless of which tab a previous open was
 * left on. */
export function newTab(dialog: Locator): Locator {
  return dialog.getByRole("tab", { name: "New" });
}

/** The `Resume` tab (`#launch-tab-resume`). */
export function resumeTab(dialog: Locator): Locator {
  return dialog.getByRole("tab", { name: "Resume" });
}

/** `#mainhead .name` — the Focus header's session name, which a focusing chord changes. */
export function mainheadName(page: Page): Locator {
  return page.locator("#mainhead .name");
}
