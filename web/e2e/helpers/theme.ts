// Locator + oracle helpers for the Settings dialog and theme attributes (plan
// new-ui-design-colors). Structure and Testable UI Elements transcribed from the plan's
// DOM snippet and its table — role + accessible name where the table pins one (Settings
// button/dialog, the four radios, Close), a plain locator where it explicitly leaves the
// choice to us (the `<legend>` has no reliable role).
import type { Page } from "@playwright/test";

// The Settings button, dialog, opener and Close, the Theme legend and radios and the two
// `<html>` theme attributes are pure DOM and live in the render tier's helper
// (web/render/helpers/theme.ts, where the theme properties re-levelled on 2026-10-20 read
// them); the journeys here reach them through this re-export.
export {
  htmlClaudeFamily,
  htmlTheme,
  openSettingsDialog,
  settingsButton,
  settingsCloseButton,
  settingsDialog,
  themeLegend,
  themeRadio,
  type ThemeRadioLabel,
  themeRadios,
} from "../../render/helpers/theme";

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
export async function readThemeHintStorage(
  page: Page,
): Promise<{ theme?: string; family?: string } | null> {
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
