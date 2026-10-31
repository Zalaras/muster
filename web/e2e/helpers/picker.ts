// Locator helpers for the launch dialog's Finder-style picker, shared by launch.spec.ts
// and tiles-launch.spec.ts since both drive the same picker. What is here is the browse
// pane — crumbs, the child listing, the Launch-in readout — whose every state is a
// `GET /api/browse` answer only a live daemon gives.
import type { Locator } from "@playwright/test";

// The dialog locator and its opener are the render tier's (web/render/helpers/shortcuts.ts,
// where ⌥⌘N's render spec needs them); the Recent sidebar, the two error lines and the
// regex escape are the render tier's too (web/render/helpers/launch.ts, where the dialog's
// static properties re-levelled on 2026-10-20 read them). Re-exported so a locator is
// written once for both tiers.
export { launchDialog, openLaunchDialog } from "../../render/helpers/shortcuts";
export {
  escapeForRegExp,
  launchError,
  modelError,
  recentButton,
  recentsSidebar,
} from "../../render/helpers/launch";
import { escapeForRegExp } from "../../render/helpers/launch";

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
  return dialog
    .locator("#browse-dirs")
    .getByRole("button", { name: new RegExp(`^${escapeForRegExp(name)}( \\(git\\))?$`) });
}

/** `#launch-target`'s `<b>` — the selection readout (always equals the listed
 * path and the `POST /api/sessions` body). */
export function launchTargetPath(dialog: Locator): Locator {
  return dialog.locator("#launch-target b");
}

/** `#launch-target`'s suffix span (` · <branch>`, present only when the selection came
 * from a recent with a non-null branch). Renamed from `.branch` to `.suffix`
 * when the same `<b>`/suffix pair was reused for the
 * Resume tab's own footer (`renderResumeFooter`, ` in <path>`) — the class can't stay
 * named for New's own git-branch meaning once the Resume tab writes into it too. Same
 * element, same toggled-`hidden`/text-content behaviour, only the class changed. */
export function launchTargetBranch(dialog: Locator): Locator {
  return dialog.locator("#launch-target .suffix");
}

/** Composes `#browse-crumbs`'s full path from its ancestor `<button data-path>`s plus the
 * current `<span aria-current="location">`'s own text — the third leg: this must
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
