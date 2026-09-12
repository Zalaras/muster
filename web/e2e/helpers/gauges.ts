// Locator helpers for the m3-gauges E2E suite (plan m3-gauges).
//
// Structural class-name guesses here are grounded in the plan's Implementation Notes
// ("masthead markup: follow mockups/a-instrument.html lines 199-202 structurally —
// `.gauge` -> `.lbl`/`.bar > i`/`.num`/`.resets`, `.model`"; "the card row follows lines
// 236-298 (`.ctx > i`, `%`, `.tok`, `.compact`)") and docs/design/design-system.md's
// settled threshold classes (a masthead bar takes `warn`, a context track takes `hot`,
// both at >=60% used, settled 2026-08-23). The existing usage-readout ids
// (#usage-5h/#usage-7d, web/index.html) and the `.r3`/`.ctxinfo` containers are M2-era
// markup this plan explicitly upgrades in place rather than replaces (Testable UI
// Elements: "existing element upgraded").
//
// None of this is verified against real DOM yet — authoring mode, the implementation
// doesn't exist. Validate mode repairs these against whatever web-impl actually ships;
// several locators here deliberately hedge across two or three plausible markups via
// `.or()` for exactly that reason.
import type { Locator, Page } from "@playwright/test";

export type Bucket = "5h" | "7d";

/** The masthead usage-readout container for one bucket — the existing `#usage-5h` /
 * `#usage-7d` ids, upgraded in place (Testable UI Elements table). */
export function mastheadBucket(page: Page, bucket: Bucket): Locator {
  return page.locator(`#usage-${bucket}`);
}

/** The bucket's track-fill element (mockup: `.bar > i`) — present only when the bucket
 * is known; INV-3 requires zero track markup at all for a null bucket. */
export function mastheadBucketTrack(page: Page, bucket: Bucket): Locator {
  return mastheadBucket(page, bucket).locator("i");
}

/** Matches iff the bucket's gauge bar carries the >=60%-used `warn` class
 * (design-system §6, settled 2026-08-23) — checked on a nested `.bar`, a bare `.warn`
 * descendant, or the bucket container itself, whichever web-impl actually applies it to. */
export function mastheadBucketWarn(page: Page, bucket: Bucket): Locator {
  const b = mastheadBucket(page, bucket);
  return b
    .locator(".bar.warn")
    .or(b.locator(".warn"))
    .or(page.locator(`#usage-${bucket}.warn`));
}

/** The masthead's model readout (REQ-12) — new in M3, no id exists yet in index.html.
 * The Testable UI Elements table explicitly defers this locator choice to e2e-specs
 * ("picks the locator against the real DOM"); best guess is the `.model` class the
 * Implementation Notes name explicitly, scoped under the masthead. */
export function mastheadModelReadout(page: Page): Locator {
  return page.locator(".masthead-right .model, .masthead .model, [data-testid='masthead-model']");
}

/** A rail/strip card's context row (`.r3`) — existing M1/M2 element; REQ-13 upgrades its
 * content and adds track markup, not its container or class. */
export function cardContextRow(card: Locator): Locator {
  return card.locator(".r3");
}

/** The card context row's track-fill element (mockup: `.ctx > i`), present only when
 * context is known (INV-3). */
export function cardContextTrack(card: Locator): Locator {
  return cardContextRow(card).locator("i");
}

/** Matches iff the card's context track carries the >=60%-used `hot` class. */
export function cardContextHot(card: Locator): Locator {
  const row = cardContextRow(card);
  return row.locator(".ctx.hot").or(row.locator(".hot"));
}

/** A tile's context-info span (`.ctxinfo`) — existing M2 element, same in-place upgrade
 * as `.r3`. */
export function tileContextInfo(tile: Locator): Locator {
  return tile.locator(".ctxinfo");
}

/** The tile context-info's track-fill element. */
export function tileContextTrack(tile: Locator): Locator {
  return tileContextInfo(tile).locator("i");
}

// --- Plan usage-model-bar (2026-08-30): the third masthead readout, the per-model
// weekly ("Fable") window fetched by musterd itself (`GET /api/oauth/usage`), unlike
// the two buckets above which come from the status line. Unlike `mastheadModelReadout`
// above, this plan's Testable UI Elements table PINS the container id (`#usage-model-week`),
// the select's accessible name (`aria-label="Usage model"`), and the refresh button's
// accessible name (`"Refresh usage"`) directly in the plan's own markup snippet — so
// these locators are not hedged guesses the way the pre-existing ones in this file are.

/** The model-week readout container (Testable UI Elements: `#usage-model-week`,
 * `.usage-readout`; gains `.stale` when `modelScopedError` is non-null, INV-2/E5). */
export function mastheadModelWeek(page: Page): Locator {
  return page.locator("#usage-model-week");
}

/** The model-week readout's percent text (`.num`) — `"NN%"` or `"unknown"`. */
export function mastheadModelWeekPercent(page: Page): Locator {
  return mastheadModelWeek(page).locator(".num");
}

/** The model-week readout's track-fill element (`.bar > i`) — absent whenever `.num`
 * reads "unknown" (INV-2). */
export function mastheadModelWeekTrack(page: Page): Locator {
  return mastheadModelWeek(page).locator(".bar i");
}

/** Matches iff the model-week bar carries the >=60%-used `warn` class (design-system
 * §6, reused here per REQ-9). */
export function mastheadModelWeekWarn(page: Page): Locator {
  return mastheadModelWeek(page).locator(".bar.warn");
}

/** The model-week readout's reset suffix (`.resets`) — present only when the selected
 * model is known. */
export function mastheadModelWeekResets(page: Page): Locator {
  return mastheadModelWeek(page).locator(".resets");
}

/** The model-choosing `<select>` (Testable UI Elements: role `combobox`, accessible
 * name "Usage model" via `aria-label`; `disabled` when `modelScoped` is null/empty). */
export function mastheadModelSelect(page: Page): Locator {
  return page.getByRole("combobox", { name: "Usage model" });
}

/** The refresh button beside the model-week readout (Testable UI Elements: role
 * `button`, accessible name "Refresh usage"; `aria-busy="true"` while a refresh from
 * either the button or `POST /api/usage/refresh` is pending). */
export function mastheadUsageRefreshButton(page: Page): Locator {
  return page.getByRole("button", { name: "Refresh usage" });
}
