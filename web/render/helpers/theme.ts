// Locators for the Settings dialog: the masthead button,
// the dialog, its Close, the Theme fieldset's legend and four radios, and the two `<html>`
// theme attributes. Pure DOM — the dialog opens client-side and the attributes are what a
// prefs state paints — so both tiers use it: the render specs here directly (a fieldset's
// radios and the attributes for a given prefs state), the E2E journeys through
// `web/e2e/helpers/theme.ts`, which re-exports it beside the daemon-side config helpers.
import type { Locator, Page } from "./harness";

/** Masthead button — `#settings-button`, text "Settings", placed after `#issue-button`.
 * The only masthead control with that accessible name. */
export function settingsButton(page: Page): Locator {
  return page.getByRole("button", { name: "Settings" });
}

/** `#settings-dialog` itself, named via `aria-labelledby="settings-dialog-title"` →
 * "Settings". */
export function settingsDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Settings" });
}

/** Clicks the masthead button and returns the now-open dialog locator. */
export async function openSettingsDialog(page: Page): Promise<Locator> {
  await settingsButton(page).click();
  return settingsDialog(page);
}

/** Settings dialog's own Close button — scoped to `#settings-dialog` since the issue
 * dialog also has a "Close" (Testable UI Elements note). */
export function settingsCloseButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Close" });
}

/** The `<legend>Theme</legend>` inside `fieldset.seg` — no implicit ARIA role, per the
 * Testable UI Elements table's own note ("e2e-specs picks the locator"). */
export function themeLegend(dialog: Locator): Locator {
  return dialog.locator("legend", { hasText: "Theme" });
}

export type ThemeRadioLabel = "Follow Claude Code" | "Instrument" | "Dark" | "Light";

/** One of the four theme radios, scoped to the dialog — native `<label>` wrapping
 * `<input type="radio">` gives each its accessible name from the label text. */
export function themeRadio(dialog: Locator, label: ThemeRadioLabel): Locator {
  return dialog.getByRole("radio", { name: label });
}

/** All four theme radios in DOM order — the order is pinned: Follow, Instrument,
 * Dark, Light. */
export function themeRadios(dialog: Locator): Locator {
  return dialog.locator('input[type="radio"][name="theme"]');
}

/** `html[data-theme]` — always one of the registry names, never "follow". */
export async function htmlTheme(page: Page): Promise<string | null> {
  return await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
}

/** `html[data-claude-family]` — "light" | "dark" | "unknown". */
export async function htmlClaudeFamily(page: Page): Promise<string | null> {
  return await page.evaluate(() => document.documentElement.getAttribute("data-claude-family"));
}
