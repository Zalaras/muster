// Locator + oracle helpers for plan resume-and-dangerously-allow: the launch dialog's
// New | Resume tab pair, the Resume tab's past-session list, the bypass Start-in segment
// and warning, and the danger chip shared by the rail card, the Focus mainhead and a
// tile header. Structure and Testable UI Elements transcribed from the plan's DOM
// section and table — role + accessible name where the table pins one, a plain locator
// (by id/class) where it explicitly leaves the choice to us (the past-session region's
// `region` role is not asserted; the chip carries no role at all).
import type { Locator, Page } from "@playwright/test";
import type { ScratchDaemon } from "./daemon";
import { escapeForRegExp } from "./picker";

/** `<span role="tablist" aria-label="Session kind">` in `#launch-dialog h2`. */
export function sessionKindTablist(dialog: Locator): Locator {
  return dialog.getByRole("tablist", { name: "Session kind" });
}

/** The `New` tab (`#launch-tab-new`) — always the selected tab on a fresh dialog open
 * (REQ-7), regardless of which tab a previous open was left on. */
export function newTab(dialog: Locator): Locator {
  return dialog.getByRole("tab", { name: "New" });
}

/** The `Resume` tab (`#launch-tab-resume`). */
export function resumeTab(dialog: Locator): Locator {
  return dialog.getByRole("tab", { name: "Resume" });
}

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
 * A past-session row, matched the same way `picker.ts`'s `childEntry` matches a browse
 * entry: `textContent` concatenates every span with no separator (title, optional chip
 * text, age, last prompt), so an exact match would break the moment any real fixture
 * carries an age or last-prompt suffix — anchor on the title as a leading substring.
 */
export function pastSessionRow(dialog: Locator, title: string): Locator {
  return pastList(dialog).getByRole("button", {
    name: new RegExp(`^${escapeForRegExp(title)}`),
  });
}

/** The danger chip — `<span class="chip-danger">bypass</span>` — inside any container
 * that can host it: a rail/strip card, `.mainhead`, or a tile's `.thead`. Scoped by the
 * caller (e.g. `bypassChip(railCard(page, title))`, `bypassChip(page.locator("#mainhead"))`,
 * `bypassChip(liveTile(page, title))`). */
export function bypassChip(container: Locator): Locator {
  return container.locator(".chip-danger");
}

export interface RepoObject {
  id: number;
  path: string;
  name: string;
  isGit: boolean;
  branch: string | null;
  pinned: boolean;
  lastLaunchedAt: string;
  launchCount: number;
  lastModel: string | null;
  lastPermissionMode: string | null;
}

/** `GET /api/repos` (kb:anchor/repos.list), using the page's already-authed cookie —
 * REQ-15's oracle for "records the directory in Recent without overwriting its
 * remembered model/mode". */
export async function getRepos(page: Page, daemon: ScratchDaemon): Promise<RepoObject[]> {
  const res = await page.request.get(`${daemon.baseURL}/api/repos`);
  if (res.status() !== 200) {
    throw new Error(`GET /api/repos failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as RepoObject[];
}

/**
 * Posts the resume-from-list request form directly (`{directory, resumeSessionId}`, no
 * `title`/`model`/`permissionMode` — kb:anchor/sessions.create's second request shape),
 * for a test asserting an error status/body a disabled row's UI can't be clicked into
 * (REQ-9's already_open). Returns the raw status/body regardless of outcome — unlike
 * `helpers/session.ts`'s `launchSession`, which throws on anything but 201.
 */
export async function postResume(
  page: Page,
  daemon: ScratchDaemon,
  body: { directory: string; resumeSessionId: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await page.request.post(`${daemon.baseURL}/api/sessions`, { data: body });
  return { status: res.status(), body: (await res.json()) as Record<string, unknown> };
}
