// The issue feature's masthead button and dialog (plan issue-capture REQ-1). Pure DOM — the
// button's presence per view is a display property — so both tiers use it: the render spec
// here directly, the E2E journeys through `web/e2e/helpers/issue.ts`, which re-exports it
// beside the dialog's form locators (every one of those needs the capture POST the dialog
// fires on open, which only the daemon answers).
import type { Locator, Page } from "./harness";

/** Masthead button — `aria-label="File an issue"` overrides the visible text "Issue"
 * (Testable UI Elements). */
export function issueButton(page: Page): Locator {
  return page.getByRole("button", { name: "File an issue" });
}

/** `#issue-dialog` itself, named via `aria-labelledby="issue-dialog-title"` → "File an
 * issue" — a distinct accessible name from the masthead button's (avoids a locator
 * collision per the plan's own note). */
export function issueDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "File an issue" });
}

/** Clicks the masthead button and returns the now-open dialog locator. */
export async function openIssueDialog(page: Page): Promise<Locator> {
  await issueButton(page).click();
  return issueDialog(page);
}
