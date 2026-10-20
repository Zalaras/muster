// The rename feature's mainhead editor (plan ui-text-and-focus REQ-13): the field that
// replaces the heading's rename trigger while an edit is open. Pure DOM — opening the field
// touches no API — so both tiers use it: the render spec here directly, the E2E journeys
// through `web/e2e/helpers/session.ts`, which re-exports it beside the tile variants.
import { mainheadHeading } from "./focus";
import type { Locator, Page } from "./harness";

/**
 * The mainhead's rename field — present only while editing (`aria-label="Session
 * title"`, REQ-13). Scoped to the heading so it can never collide with a tile's own
 * field when both happen to be attached in the DOM.
 */
export function mainheadRenameField(page: Page): Locator {
  return mainheadHeading(page).getByRole("textbox", { name: "Session title" });
}
