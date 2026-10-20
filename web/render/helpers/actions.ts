// Locators for the actions feature (plan m4-reconcile REQ-5 to REQ-16): the Stop and Remove
// confirm dialogs, and Focus's dead-session surface with its end bar and cap. Pure DOM — the
// dialogs open client-side and the dead surface is static markup — so the render spec reads
// them against a fixture; the E2E journeys (web/e2e/actions.spec.ts) inline the same roles.
import type { Locator, Page } from "./harness";

/** The End confirm dialog, named by its heading. */
export function stopDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Stop session?" });
}

/** The Remove confirm dialog, named by its heading. */
export function removeDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Remove session?" });
}

/** Focus's one dead-session surface (`#dead-surface`, web/index.html). */
export function deadSurface(page: Page): Locator {
  return page.locator("#dead-surface");
}

/** The dead surface's centred cap: "session ended", the cap body and its Resume. */
export function deadCap(page: Page): Locator {
  return deadSurface(page).locator(".endcap");
}

/** The reason a Resume with no Claude id to resume carries as its hover title
 * (web/src/sessions/card.ts's `resumeDisabledReason`). */
export const NO_CLAUDE_ID_REASON =
  "Can't resume — this session never started a Claude conversation.";
