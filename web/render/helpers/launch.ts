// Locators for the launch dialog's own controls — the Recent sidebar, the two error lines,
// the Effort row and the bypass Start-in segment with its warning and the primary button's
// face — plus the danger chip the launch leaves on every hosting surface. Pure DOM — no
// daemon, no fixture knowledge — so both tiers use it: the render spec here directly
// (`web/render/launch.spec.ts`), the E2E journeys through `web/e2e/helpers/picker.ts`,
// `web/e2e/helpers/resume.ts` and `web/e2e/helpers/effort.ts`, which re-export them. The
// dialog itself and its opener are `./shortcuts`'s (`launchDialog`, `openLaunchDialog`).
//
// What stays in `web/e2e/helpers/picker.ts` is the browse pane — crumbs, the child listing,
// the Launch-in readout — whose every state is a `GET /api/browse` answer the render harness
// does not serve (plans/_audit/relevel/classify-launch-update.md).
import type { Locator } from "./harness";

/** Escapes a string for safe interpolation into a `RegExp` — directory basenames here
 * come from `mkdtemp` (word characters and hyphens only) so this is mostly defensive. */
export function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- the Recent sidebar ---

/** `<aside aria-label="Recent directories">`. */
export function recentsSidebar(dialog: Locator): Locator {
  return dialog.getByRole("complementary", { name: "Recent directories" });
}

/** A recent's button, matched on the leading `.dir-name` text — the accessible name's
 * textContent is `<name><branch-or—><age>` with no separators (Testable UI Elements),
 * so an exact match would break on the first real MRU entry with a branch or age. */
export function recentButton(dialog: Locator, name: string): Locator {
  return recentsSidebar(dialog).getByRole("button", {
    name: new RegExp(`^${escapeForRegExp(name)}`),
  });
}

// --- the error lines ---

/** `#launch-error` (role=alert). */
export function launchError(dialog: Locator): Locator {
  return dialog.locator("#launch-error");
}

/** `#model-error` — the Model row's invalid-field message (plan
 * maintainability-regressions REQ-8/9). Its `⚠` glyph sits in its own `aria-hidden` span,
 * so callers match its text with `toHaveText(/regex/)` (a substring test) rather than an
 * exact string, since the glyph is still part of `textContent` even though it is excluded
 * from the accessible name. */
export function modelError(dialog: Locator): Locator {
  return dialog.locator("#model-error");
}

// --- the Effort row (plan effort) ---

/** The five levels `--effort` accepts and the dialog offers beyond `default`
 * (kb:fact/effort-flag-values). */
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;

/** `<div role="radiogroup" aria-label="Effort">` — mandated like Model and Start in. */
export function effortRadiogroup(dialog: Locator): Locator {
  return dialog.getByRole("radiogroup", { name: "Effort" });
}

/** One Effort radio. `exact` matters: `high` is a substring of `xhigh`. */
export function effortRadio(dialog: Locator, name: "default" | (typeof EFFORT_LEVELS)[number]) {
  return effortRadiogroup(dialog).getByRole("radio", { name, exact: true });
}

/** The pointer target of one Effort segment: its `<label>`, which a real click lands on. */
export function effortSegment(dialog: Locator, name: string): Locator {
  return effortRadiogroup(dialog).locator("label", { hasText: new RegExp(`^\\s*${name}\\s*$`) });
}

/** Picks an Effort level through the dialog the way a developer does: a pointer click on its segment. */
export async function pickEffort(dialog: Locator, name: string): Promise<void> {
  await effortSegment(dialog, name).click();
}

// --- the bypass segment and the primary button (plan resume-and-dangerously-allow) ---

/** `#bypass-warning` — hidden except while the bypass radio is checked. Its exact
 * `textContent` per the Testable UI Elements table (the `<b>` wrapping the first two
 * words joins the text, not a separate node Playwright would need to skip). */
export function bypassWarning(dialog: Locator): Locator {
  return dialog.locator("#bypass-warning");
}

/** The bypass radio in the Start-in radiogroup — native `<input type="radio">`, labelled
 * "bypass" (no "s"), distinct from the danger chip's own text. */
export function bypassRadio(dialog: Locator): Locator {
  return dialog.getByRole("radio", { name: "bypass" });
}

/** `#launch-button` — keeps its id across all four faces (Launch / Launch without
 * checks / Resume / Resume without checks); class carries `key` or `key-danger`. */
export function launchPrimaryButton(dialog: Locator): Locator {
  return dialog.locator("#launch-button");
}

/** The danger chip — `<span class="chip-danger">bypass</span>` — inside any container
 * that can host it: a rail/strip card, `.mainhead`, or a tile's `.thead`. Scoped by the
 * caller (e.g. `bypassChip(railCard(page, title))`, `bypassChip(page.locator("#mainhead"))`,
 * `bypassChip(liveTile(page, title))`). */
export function bypassChip(container: Locator): Locator {
  return container.locator(".chip-danger");
}
