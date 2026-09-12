// Locator helpers for the Settings dialog's Updates section and the restart confirm
// dialog (plan auto-update). Structure and Testable UI Elements transcribed from the
// plan's DOM snippet and its table — id/CSS locators where the table pins an id
// directly (`#update-running`, `#update-status`, `#update-restart-button`, …), role +
// accessible name where it pins those instead (the checkbox, the exact-named "Update"
// button, the confirm dialog's two buttons). The masthead Settings button and the
// dialog wrapper itself are `helpers/theme.ts`'s `settingsButton`/`settingsDialog`/
// `openSettingsDialog` — reused, not redefined: `getByRole("button", { name:
// "Settings" })`'s default substring match already covers the badged accessible name
// "Settings, update available" (REQ-9), and the dialog's own accessible name ("Settings")
// is unaffected by the new Updates fieldset inside it.
import type { Locator, Page } from "@playwright/test";

/** `#settings-button .update-dot` — visible iff badged (REQ-9/INV-6). `aria-hidden`,
 * so never located by role. */
export function settingsBadgeDot(page: Page): Locator {
  return page.locator("#settings-button .update-dot");
}

/** `fieldset#settings-update` — the Updates section as a whole; carries
 * `aria-busy="true"` while an apply phase is in flight (Text rules). */
export function updateSection(dialog: Locator): Locator {
  return dialog.locator("#settings-update");
}

/** `<dd id="update-running">` — the Running readout (Text rules table). */
export function updateRunningReadout(dialog: Locator): Locator {
  return dialog.locator("#update-running");
}

/** `<dd id="update-available">` — the Available readout (Text rules table). */
export function updateAvailableReadout(dialog: Locator): Locator {
  return dialog.locator("#update-available");
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

/** `#update-apply-button`, exact accessible name "Update" — `exact: true` so it never
 * matches "Update and restart"/"Restart now". Absent for a `dev` install (REQ-13). */
export function updateApplyButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Update", exact: true });
}

/** `#update-restart-button` — located by id rather than role+name, because its
 * accessible name changes ("Update and restart" -> "Restart now" after a swap, REQ-25).
 * Absent for a `dev` install (REQ-13). */
export function updateRestartButton(dialog: Locator): Locator {
  return dialog.locator("#update-restart-button");
}

/** `#update-restart-dialog`, named via its own `<h2>` "Restart musterd?"
 * (`aria-labelledby`, Testable UI Elements). */
export function restartConfirmDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Restart musterd?" });
}

/** `#update-restart-body` — the shells-that-will-close summary (REQ-11). */
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
