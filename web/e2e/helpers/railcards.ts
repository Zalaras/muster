// Locators for plan rail-card-improvements: the restructured card template (REQ-1, a
// state row first, then a wrapping title, repo line, context row and two activity
// lines), the rail-head density control (REQ-5) and the masthead's single New session
// button (REQ-6). The card/strip container itself is `helpers/session.ts`'s
// `sessionCard` / `helpers/railorder.ts`'s `railCard` — this file only adds locators for
// what moved or is new inside that same template, mirroring `helpers/theme.ts`'s split
// (one small locator file per plan, reusing the shared container locators).
import type { Locator, Page } from "@playwright/test";

export type RailDensity = "compact" | "comfortable" | "expanded";

const DENSITY_LABEL: Record<RailDensity, string> = {
  compact: "Compact",
  comfortable: "Comfortable",
  expanded: "Expanded",
};

/**
 * The rail head's density control (REQ-5): `#rail-density`, `role="group"
 * aria-label="Card density"` — distinct from the Tiles toolbar's own pre-existing
 * `role="group" aria-label="Density"` (2×2/3×2 grid density; `web/index.html`), which
 * this plan does not touch.
 */
export function railDensityGroup(page: Page): Locator {
  return page.getByRole("group", { name: "Card density" });
}

/** One density button, by its `aria-label` (REQ-5: Compact / Comfortable / Expanded). */
export function railDensityButton(page: Page, density: RailDensity): Locator {
  return railDensityGroup(page).getByRole("button", { name: DENSITY_LABEL[density] });
}

/** `body[data-rail-density]` — written only from the `prefs` broadcast (REQ-3, INV-4),
 * never from the click, mirroring `helpers/theme.ts`'s `htmlTheme`. */
export async function bodyRailDensity(page: Page): Promise<string | null> {
  return await page.evaluate(() => document.body.getAttribute("data-rail-density"));
}

/**
 * The masthead's one New session button (REQ-6): `#new-session-button`, scoped to
 * `header.masthead` so it can never resolve to a stray same-name button elsewhere.
 * Unlike `tiles-launch.spec.ts`'s retired `#tiles-new-session-button` (removed by this
 * plan) or its own view-scoped locator, this single button stays mounted — and visible —
 * across both views (REQ-6, INV-3).
 */
export function newSessionButton(page: Page): Locator {
  return page.locator("header.masthead").getByRole("button", { name: "New session" });
}

/** REQ-1's state row: `.r0`, holding the badge, timer and pin control. */
export function cardStateRow(card: Locator): Locator {
  return card.locator(".r0");
}

/** REQ-1/REQ-2: the card's title, `.name` — carries a `title` attribute equal to the
 * display title on every render. */
export function cardName(card: Locator): Locator {
  return card.locator(".name");
}

/** REQ-1/REQ-2: the repo and branch line, `.r2` — carries a `title` attribute equal to
 * its own text on every render. */
export function cardRepoLine(card: Locator): Locator {
  return card.locator(".r2");
}

/** REQ-14: the user's-prompt activity line, `.activity.you` (text `/^(on|you): /`,
 * `hidden` when null). */
export function cardActivityYou(card: Locator): Locator {
  return card.locator(".activity.you");
}

/** REQ-14: Claude's-reply activity line, `.activity.claude` (text `/^claude: /`,
 * `hidden` when null). */
export function cardActivityClaude(card: Locator): Locator {
  return card.locator(".activity.claude");
}

/** REQ-13: the Settings dialog's new fieldset legend — `fieldset.seg`, `<legend>Rail
 * card shows</legend>`, no implicit ARIA role (mirrors `helpers/theme.ts`'s
 * `themeLegend`). */
export function railActivityLegend(dialog: Locator): Locator {
  return dialog.locator("legend", { hasText: "Rail card shows" });
}

export type RailActivityLabel = "Turn-aware" | "Your prompt" | "Claude's reply" | "Both";

/** One of REQ-13's four `railActivity` radios, scoped to the Settings dialog —
 * `input[name="railActivity"]`, accessible name from its wrapping `<label>`. */
export function railActivityRadio(dialog: Locator, label: RailActivityLabel): Locator {
  return dialog.getByRole("radio", { name: label });
}

/** All four `railActivity` radios in DOM order (REQ-13: Turn-aware, Your prompt,
 * Claude's reply, Both). */
export function railActivityRadios(dialog: Locator): Locator {
  return dialog.locator('input[type="radio"][name="railActivity"]');
}
