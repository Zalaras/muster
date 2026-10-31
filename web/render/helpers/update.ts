// Locators for the Settings dialog's Updates section: the masthead
// badge dot, the Available readout and the three action buttons. Pure DOM — no daemon, no
// fixture knowledge — so both tiers use it: the render spec here directly
// (`web/render/update.spec.ts`), the E2E journeys through `web/e2e/helpers/update.ts`,
// which re-exports them beside the restart-confirm dialog's locators. The masthead
// Settings button and the dialog wrapper are `./theme`'s `settingsButton`/`settingsDialog`/
// `openSettingsDialog`. Structure and Testable UI Elements transcribed from the plan's DOM
// snippet and its table — id/CSS locators where the table pins an id directly, role +
// accessible name where it pins those instead.
import type { Locator, Page } from "./harness";

/** `#settings-button .update-dot` — visible iff badged. `aria-hidden`,
 * so never located by role. */
export function settingsBadgeDot(page: Page): Locator {
  return page.locator("#settings-button .update-dot");
}

/** `<dd id="update-available">` — the Available readout (Text rules table). */
export function updateAvailableReadout(dialog: Locator): Locator {
  return dialog.locator("#update-available");
}

/** `#update-apply-button`, exact accessible name "Update" — `exact: true` so it never
 * matches "Update and restart"/"Restart now". Absent for a `dev` install. */
export function updateApplyButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Update", exact: true });
}

/** `#update-check-button`, accessible name
 * "Check now" — the first child of `.update-actions`, ahead of `updateApplyButton`.
 * Disabled whenever `canCheck` is false or a check of its own is in flight. */
export function updateCheckButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Check now", exact: true });
}

/** `#update-restart-button` — located by id rather than role+name, because its
 * accessible name changes ("Update and restart" -> "Restart now" after a swap).
 * Absent for a `dev` install. */
export function updateRestartButton(dialog: Locator): Locator {
  return dialog.locator("#update-restart-button");
}
