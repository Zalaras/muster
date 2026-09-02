// Locator + oracle helpers for the Settings dialog and theme attributes (plan
// new-ui-design-colors). Structure and Testable UI Elements transcribed from the plan's
// DOM snippet and its table — role + accessible name where the table pins one (Settings
// button/dialog, the four radios, Close), a plain locator where it explicitly leaves the
// choice to us (the `<legend>` has no reliable role).
import type { Locator, Page } from "@playwright/test";

/** Masthead button — `#settings-button`, text "Settings", placed after `#issue-button`
 * (REQ-9). The only masthead control with that accessible name. */
export function settingsButton(page: Page): Locator {
  return page.getByRole("button", { name: "Settings" });
}

/** `#settings-dialog` itself, named via `aria-labelledby="settings-dialog-title"` →
 * "Settings" (REQ-9). */
export function settingsDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Settings" });
}

/** Clicks the masthead button and returns the now-open dialog locator. */
export async function openSettingsDialog(page: Page): Promise<Locator> {
  await settingsButton(page).click();
  return settingsDialog(page);
}

/** The `<legend>Theme</legend>` inside `fieldset.seg` — no implicit ARIA role, per the
 * Testable UI Elements table's own note ("e2e-specs picks the locator"). */
export function themeLegend(dialog: Locator): Locator {
  return dialog.locator("legend", { hasText: "Theme" });
}

export type ThemeRadioLabel = "Follow Claude Code" | "Instrument" | "Dark" | "Light";

/** One of the four theme radios, scoped to the dialog — native `<label>` wrapping
 * `<input type="radio">` gives each its accessible name from the label text (REQ-9). */
export function themeRadio(dialog: Locator, label: ThemeRadioLabel): Locator {
  return dialog.getByRole("radio", { name: label });
}

/** All four theme radios in DOM order — REQ-9/E2 pins the order: Follow, Instrument,
 * Dark, Light. */
export function themeRadios(dialog: Locator): Locator {
  return dialog.locator('input[type="radio"][name="theme"]');
}

/** Settings dialog's own Close button — scoped to `#settings-dialog` since the issue
 * dialog also has a "Close" (Testable UI Elements note). */
export function settingsCloseButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Close" });
}

/** `html[data-theme]` — always one of the registry names, never "follow" (REQ-7/INV-1). */
export async function htmlTheme(page: Page): Promise<string | null> {
  return await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
}

/** `html[data-claude-family]` — "light" | "dark" | "unknown" (REQ-15/INV-2). */
export async function htmlClaudeFamily(page: Page): Promise<string | null> {
  return await page.evaluate(() => document.documentElement.getAttribute("data-claude-family"));
}

/**
 * Resolves a CSS custom property to the browser's own normalized computed value (e.g.
 * `rgb(18, 20, 28)`), by setting it on a throwaway, invisible probe element and reading
 * `getComputedStyle` back — so a test can compare a real element's computed `color` or
 * `background-color` against a token's value without hand-converting hex to rgb() itself
 * (the browser does the conversion identically for both, so string equality is a valid
 * oracle). `prop` selects which CSS property carries the token's value on the probe.
 */
export async function resolvedCssVar(
  page: Page,
  varName: string,
  prop: "color" | "background-color" = "color",
): Promise<string> {
  return await page.evaluate(
    ({ varName, prop }) => {
      const probe = document.createElement("div");
      probe.style.setProperty(prop, `var(${varName})`);
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).getPropertyValue(prop);
      probe.remove();
      return value;
    },
    { varName, prop },
  );
}

/**
 * Builds the scratch `-claude-config-file` fixture content (`ScratchDaemonOptions`'
 * `claudeConfigContent` / `ScratchDaemon.writeClaudeConfig`).
 *
 * The JSON key is `"theme"` — confirmed against `internal/claudecode/theme.go`'s
 * `claudeConfig` struct tag (`Theme *string \`json:"theme"\``), which daemon-impl
 * measured directly against the real, pinned Claude Code binary (2.1.258) and the real
 * config file's key list. `theme === undefined` yields a keyless-but-valid JSON object
 * (edge case 2: key absent -> ThemeDark).
 */
export function claudeConfigJSON(theme?: string): string {
  if (theme === undefined) return "{}";
  return JSON.stringify({ theme });
}

/** `localStorage["muster.theme-hint"]`, parsed — REQ-11's hint the head script reads
 * before first paint. `null` when absent or unparseable. */
export async function readThemeHintStorage(page: Page): Promise<{ theme?: string; family?: string } | null> {
  return await page.evaluate(() => {
    try {
      const raw = window.localStorage.getItem("muster.theme-hint");
      if (!raw) return null;
      return JSON.parse(raw) as { theme?: string; family?: string };
    } catch {
      return null;
    }
  });
}
