// Locator helpers for the new-session-dialog Finder-style picker (plan new-session-dialog).
//
// Structure transcribed from `plans/new-session-dialog/mockup.html` (the design
// authority) and the plan's Testable UI Elements table — not from the pre-rebuild M1
// dialog, whose Browse…/Up/Use-this-folder flow this plan removes outright. Kept as a
// shared module (rather than duplicated locators in launch.spec.ts and
// tiles-launch.spec.ts) since both files drive the same picker.
import type { Locator, Page } from "@playwright/test";

/** The launch dialog itself — `aria-labelledby` gives it the accessible name "New
 * session" (the `⌥⌘N` kbd beside the heading text is `aria-hidden`, so it never joins the
 * accessible name). */
export function launchDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "New session" });
}

/** Clicks the rail's "New session" button and returns the now-open dialog locator. */
export async function openLaunchDialog(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "New session" }).click();
  return launchDialog(page);
}

/** `<aside aria-label="Recent directories">`. */
export function recentsSidebar(dialog: Locator): Locator {
  return dialog.getByRole("complementary", { name: "Recent directories" });
}

/** A recent's button, matched on the leading `.dir-name` text — the accessible name's
 * textContent is `<name><branch-or—><age>` with no separators (Testable UI Elements),
 * so an exact match would break on the first real MRU entry with a branch or age. */
export function recentButton(dialog: Locator, name: string): Locator {
  return recentsSidebar(dialog).getByRole("button", { name: new RegExp(`^${escapeForRegExp(name)}`) });
}

/** `<nav id="browse-crumbs" aria-label="Path">`. */
export function crumbsNav(dialog: Locator): Locator {
  return dialog.getByRole("navigation", { name: "Path" });
}

/** An ancestor crumb — a clickable button whose accessible name is the exact path
 * component (root is literally `/`). */
export function crumbButton(dialog: Locator, name: string): Locator {
  return crumbsNav(dialog).getByRole("button", { name, exact: true });
}

/** The non-clickable current-directory crumb (`<span aria-current="location">`) — no
 * role is asserted per the plan's Testable UI Elements table. */
export function currentCrumb(dialog: Locator): Locator {
  return dialog.locator('#browse-crumbs [aria-current="location"]');
}

/** A child-listing entry. Identical pattern to the pre-rebuild subdirectory button: the
 * `.chev` glyph is `aria-hidden`, so it never joins the accessible name; the optional
 * `(git)` suffix is additive. */
export function childEntry(dialog: Locator, name: string): Locator {
  return dialog.locator("#browse-dirs").getByRole("button", { name: new RegExp(`^${escapeForRegExp(name)}( \\(git\\))?$`) });
}

/** `#launch-target`'s `<b>` — the selection readout (INV-1: always equals the listed
 * path and the `POST /api/sessions` body). */
export function launchTargetPath(dialog: Locator): Locator {
  return dialog.locator("#launch-target b");
}

/** `#launch-target`'s `.branch` span (` · <branch>`, present only when the selection
 * came from a recent with a non-null branch — REQ-17). */
export function launchTargetBranch(dialog: Locator): Locator {
  return dialog.locator("#launch-target .branch");
}

/** `#launch-error` (role=alert). */
export function launchError(dialog: Locator): Locator {
  return dialog.locator("#launch-error");
}

/** Escapes a string for safe interpolation into a `RegExp` — directory basenames here
 * come from `mkdtemp` (word characters and hyphens only) so this is mostly defensive. */
export function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Composes `#browse-crumbs`'s full path from its ancestor `<button data-path>`s plus the
 * current `<span aria-current="location">`'s own text — INV-1's third leg: this must
 * equal both the `#launch-target b` readout and the path `POST /api/sessions` would send,
 * at every point while the dialog is open (review cycle 1 Major 5: the suite previously
 * only ever checked the crumb bar's *basename*, `currentCrumb`, which can't catch a stale
 * or off-by-one ancestor chain — this reads the full chain instead).
 *
 * At the filesystem root there are zero ancestor buttons and the current span's text is
 * already `"/"`; naively joining that with `"/"` produces a `"//"` artifact that isn't in
 * the app (confirmed by hand against the real dialog per the plan's Manual Verification),
 * so that case is handled by returning the current text unchanged. */
export async function composedCrumbPath(dialog: Locator): Promise<string> {
  const buttons = crumbsNav(dialog).locator("button[data-path]");
  const count = await buttons.count();
  const currentText = ((await currentCrumb(dialog).textContent()) ?? "").trim();
  if (count === 0) {
    return currentText;
  }
  const lastPath = await buttons.nth(count - 1).getAttribute("data-path");
  if (lastPath === "/") {
    return `/${currentText}`;
  }
  return `${lastPath}/${currentText}`;
}
