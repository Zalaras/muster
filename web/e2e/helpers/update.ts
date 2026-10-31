// Locator helpers for the Settings dialog's Updates section and the restart confirm
// dialog (plan auto-update). Structure and Testable UI Elements transcribed from the
// plan's DOM snippet and its table — id/CSS locators where the table pins an id
// directly (`#update-running`, `#update-status`, `#update-restart-button`, …), role +
// accessible name where it pins those instead (the checkbox, the exact-named "Update"
// button, the confirm dialog's two buttons). The masthead Settings button and the
// dialog wrapper itself are `helpers/theme.ts`'s `settingsButton`/`settingsDialog`/
// `openSettingsDialog` — reused, not redefined: `getByRole("button", { name:
// "Settings" })`'s default substring match already covers the badged accessible name
// "Settings, update available", and the dialog's own accessible name ("Settings")
// is unaffected by the new Updates fieldset inside it.
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// The badge dot, the Available readout and the three action buttons are pure DOM and live
// in the render tier's helper (web/render/helpers/update.ts, where the dev-build and
// Check-now display properties re-levelled on 2026-10-20 read them); the journeys here
// reach them through this re-export.
export {
  settingsBadgeDot,
  updateApplyButton,
  updateAvailableReadout,
  updateCheckButton,
  updateRestartButton,
} from "../../render/helpers/update";
import { updateRestartButton } from "../../render/helpers/update";

/** `fieldset#settings-update` — the Updates section as a whole; carries
 * `aria-busy="true"` while an apply phase is in flight (Text rules). */
export function updateSection(dialog: Locator): Locator {
  return dialog.locator("#settings-update");
}

/** `<dd id="update-running">` — the Running readout (Text rules table). */
export function updateRunningReadout(dialog: Locator): Locator {
  return dialog.locator("#update-running");
}

/** `#update-check-toggle` — native checkbox + `<label>` gives it the accessible name
 * "Check for updates daily" (Testable UI Elements). */
export function updateCheckToggle(dialog: Locator): Locator {
  return dialog.getByRole("checkbox", { name: "Check for updates daily" });
}

/** `#update-status`, `role="status"` — the only status-role element inside the Settings
 * dialog (confirmed against today's `web/index.html`: nothing else in `#settings-dialog`
 * carries that role). */
export function updateStatusLine(dialog: Locator): Locator {
  return dialog.getByRole("status");
}

/** `#update-restart-dialog`, named via its own `<h2>` "Restart musterd?"
 * (`aria-labelledby`, Testable UI Elements). */
export function restartConfirmDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Restart musterd?" });
}

/** `#update-restart-body` — the shells-that-will-close summary. */
export function restartConfirmBody(dialog: Locator): Locator {
  return dialog.locator("#update-restart-body");
}

/** `#update-restart-confirm`, exact accessible name "Restart" — `exact: true` so it
 * never matches the dialog's own "Restart musterd?" heading text via a loose role
 * query. */
export function restartConfirmButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Restart", exact: true });
}

/** `#update-restart-cancel`, accessible name "Cancel". */
export function restartConfirmCancelButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Cancel" });
}

/** Clicks `updateRestartButton` and returns the now-open confirm dialog locator —
 * mirrors `helpers/theme.ts`'s `openSettingsDialog`. */
export async function openUpdateRestartConfirm(
  page: Page,
  settingsDialogLocator: Locator,
): Promise<Locator> {
  await updateRestartButton(settingsDialogLocator).click();
  return restartConfirmDialog(page);
}

/** Asserts an unmanaged remedy's `#update-status` line is contained inside the Settings
 * dialog, not clipped past its edge: the status line's right edge sits at or left of the
 * dialog's own right edge, and the dialog itself never grows a horizontal scrollbar
 * (`scrollWidth == clientWidth`). Both are the exact oracle review-browser measured for
 * the dialog-overflow defect (`#update-status` 437–957 against the dialog's 420–860,
 * `scrollWidth 536 > clientWidth 438`) — `toHaveText` alone never exercises either box. */
export async function expectRemedyContained(dialog: Locator): Promise<void> {
  const dialogBox = await dialog.boundingBox();
  const statusBox = await updateStatusLine(dialog).boundingBox();
  if (!dialogBox || !statusBox) {
    throw new Error("expectRemedyContained: dialog or status line has no box (not visible?)");
  }
  expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(dialogBox.x + dialogBox.width);

  const overflow = await dialog.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(overflow.scrollWidth).toBe(overflow.clientWidth);
}
