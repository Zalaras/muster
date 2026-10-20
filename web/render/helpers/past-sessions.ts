// Locators for the launch dialog's Resume tab (plan resume-and-dangerously-allow): the
// Session kind tablist, the past-session section and its list, filter and rows, and the
// footer readout both tabs write into. Pure DOM — no daemon, no fixture knowledge — so both
// tiers use it: the render spec here directly (`web/render/past-sessions.spec.ts`), the
// E2E journeys through `web/e2e/helpers/resume.ts`, which re-exports them. The tab pair
// itself is `./shortcuts`'s (`newTab`, `resumeTab`). Structure and Testable UI Elements
// transcribed from the plan's DOM section and table — role + accessible name where the
// table pins one, a plain locator (by id/class) where it explicitly leaves the choice to
// us (the past-session region's `region` role is not asserted).
import type { Locator } from "./harness";
import { escapeForRegExp } from "./launch";

/** `<span role="tablist" aria-label="Session kind">` in `#launch-dialog h2`. */
export function sessionKindTablist(dialog: Locator): Locator {
  return dialog.getByRole("tablist", { name: "Session kind" });
}

/** `#launch-target` — the footer selection readout, `Launch in <path>` on New,
 * `Resume <title> in <path>` on Resume. */
export function launchTarget(dialog: Locator): Locator {
  return dialog.locator("#launch-target");
}

/** `<section id="past-sessions" hidden aria-label="Past sessions">` — the `region` role
 * is deliberately not asserted (Testable UI Elements: "region role not asserted"). */
export function pastSessionsSection(dialog: Locator): Locator {
  return dialog.locator("#past-sessions");
}

/** `<input id="past-filter" type="search" aria-label="Filter sessions">` — a native
 * `type="search"` input carries the `searchbox` role implicitly. */
export function pastFilterInput(dialog: Locator): Locator {
  return dialog.getByRole("searchbox", { name: "Filter sessions" });
}

/** `<div id="past-list">` — holds the row buttons, or the loading/empty/no-match/error
 * line as plain text. */
export function pastList(dialog: Locator): Locator {
  return dialog.locator("#past-list");
}

/** The list head text, `Claude sessions in <dir name> · <count>`. */
export function pastListHead(dialog: Locator): Locator {
  return pastSessionsSection(dialog).locator(":scope > div").first();
}

/**
 * A past-session row, matched the same way `web/e2e/helpers/picker.ts`'s `childEntry`
 * matches a browse entry: `textContent` concatenates every span with no separator (title,
 * optional chip text, age, last prompt), so an exact match would break the moment any real
 * fixture carries an age or last-prompt suffix — anchor on the title as a leading substring.
 */
export function pastSessionRow(dialog: Locator, title: string): Locator {
  return pastList(dialog).getByRole("button", {
    name: new RegExp(`^${escapeForRegExp(title)}`),
  });
}
