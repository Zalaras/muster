// Locators and oracles for plan session-notes: the Focus header's note glyph, the note panel
// in both forms, the card marker, and `PUT /api/sessions/{id}/note` (kb:anchor/sessions.note).
// Roles and names are the plan's Testable UI Elements rows. The rail card's marker carries only
// visually hidden text `Has a note`, so it is located by that text and counted, never asserted
// visible: a visually hidden node is not what the developer sees, the node's presence is.
import type { BrowserContext, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { ScratchDaemon } from "./daemon";
import { findSession, getState } from "./session";

/** The Focus header's note glyph: `<button aria-label="Note">`, the first child of `.idrow`.
 * `exact` keeps it apart from the rename trigger, whose name is the session title. */
export function noteGlyph(page: Page): Locator {
  return page.locator("#mainhead").getByRole("button", { name: "Note", exact: true });
}

/** The anchored or the popped-out panel: a non-modal `role="dialog"` named `Note`. */
export function notePanel(page: Page): Locator {
  return page.getByRole("dialog", { name: "Note", exact: true });
}

/** The raw-text editor, present only in edit mode. */
export function noteEditor(page: Page): Locator {
  return notePanel(page).getByRole("textbox", { name: "Note text" });
}

/** The panel's `role="status"` text: `unsaved, musterd unreachable`, empty otherwise. */
export function noteStatus(page: Page): Locator {
  return notePanel(page).getByRole("status");
}

export function popOutButton(page: Page): Locator {
  return notePanel(page).getByRole("button", { name: "Pop out note" });
}

export function popInButton(page: Page): Locator {
  return notePanel(page).getByRole("button", { name: "Pop in note" });
}

export function closeNoteButton(page: Page): Locator {
  return notePanel(page).getByRole("button", { name: "Close note" });
}

/** The empty-note line shown in view mode while the note is null. */
export function emptyNoteLine(page: Page): Locator {
  return notePanel(page).getByText("No note yet. Click to write one (markdown).");
}

/** The note marker inside a rail card (or strip card): its visually hidden `Has a note`. */
export function cardNoteMarker(card: Locator): Locator {
  return card.getByText("Has a note");
}

/** `PUT /api/sessions/{id}/note` with the page's authed cookie; throws on anything but 204. */
export async function putNoteViaApi(
  page: Page,
  daemonBaseURL: string,
  id: number,
  note: string | null,
): Promise<void> {
  const res = await page.request.put(`${daemonBaseURL}/api/sessions/${id}/note`, {
    data: { note },
  });
  if (res.status() !== 204) {
    throw new Error(`note PUT failed: ${res.status()} ${await res.text()}`);
  }
}

/** The session's `note` as `GET /api/state` serves it right now, for polling. */
export async function noteOnWire(
  page: Page,
  daemon: ScratchDaemon,
  id: number,
): Promise<string | null> {
  return findSession(await getState(page, daemon), id).note;
}

/** Whether the focused element is the panel itself or inside it. */
export async function activeElementInsideNotePanel(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const active = document.activeElement;
    return active?.closest('[role="dialog"][aria-label="Note"]') != null;
  });
}

/** Drags with the real pointer: down at (x, y), moves in steps, up at (x + dx, y + dy). */
export async function dragPointer(
  page: Page,
  x: number,
  y: number,
  dx: number,
  dy: number,
): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

export interface PanelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The Open in window control, in either form of the panel: `<button aria-label="Open note in window">`. */
export function openInWindowButton(page: Page): Locator {
  return notePanel(page).getByRole("button", { name: "Open note in window" });
}

/** The pages of `context` that are note windows (`/note.html?session=<id>`). */
export function noteWindows(context: BrowserContext): Page[] {
  return context.pages().filter((p) => new URL(p.url()).pathname.endsWith("/note.html"));
}

/** Presses Open in window with a real click and resolves with the popup it opens, loaded. */
export async function openNoteWindow(page: Page): Promise<Page> {
  const [popup] = await Promise.all([page.waitForEvent("popup"), openInWindowButton(page).click()]);
  await popup.waitForLoadState();
  return popup;
}

/** The note window's rendered note: `role="group"` named `Rendered note`, as in the panel. */
export function windowRendered(win: Page): Locator {
  return win.getByRole("group", { name: "Rendered note" });
}

/** The note window's editor: `<textarea aria-label="Note text">`, present only while editing. */
export function windowEditor(win: Page): Locator {
  return win.getByRole("textbox", { name: "Note text" });
}

/** The note window's `role="status"`: empty, `connecting…` or `unsaved, musterd unreachable`.
 * The removed notice is a `role="status"` too, so while the window shows it this reads that. */
export function windowStatus(win: Page): Locator {
  return win.getByRole("status");
}

/** The empty-note line in the note window. */
export function windowEmptyLine(win: Page): Locator {
  return win.getByText("No note yet. Click to write one (markdown).");
}

/** The notice a note window shows once its session is gone. */
export function windowRemovedNotice(win: Page): Locator {
  return win.getByRole("status").filter({ hasText: "This session has been removed." });
}

/** Waits until the window shows `title` in its header and document title and its socket has
 * said hello (the status is empty, no longer `connecting…`). */
export async function expectWindowReady(win: Page, title: string): Promise<void> {
  await expect(win.locator("body")).toContainText(new RegExp(`Note\\s*·\\s*${title}`));
  await expect(win).toHaveTitle(`Note · ${title}`);
  await expect(windowStatus(win)).toHaveText("");
}

/** The popped-out or anchored panel's box. */
export async function panelBox(page: Page): Promise<PanelBox> {
  const box = await notePanel(page).boundingBox();
  if (!box) throw new Error("note panel has no box");
  return box;
}

/** Re-reads the panel's box and reports `same` or how far it is off `want`; for use inside a
 * retry so a stale position times out instead of passing. */
export async function panelBoxDiff(page: Page, want: PanelBox): Promise<string> {
  const box = await notePanel(page).boundingBox();
  if (!box) return "no box";
  const off = [box.x - want.x, box.y - want.y, box.width - want.width, box.height - want.height];
  return off.every((d) => Math.abs(d) <= 1) ? "same" : `off by ${off.map(Math.round).join(",")}`;
}

/** Moves the popped-out panel with a header drag and resizes it from its bottom-right corner, so
 * its rectangle differs from the first-pop-out default in position and size. */
export async function moveAndResizePanel(
  page: Page,
  dx: number,
  dy: number,
  resize: [number, number] = [-40, -30],
): Promise<PanelBox> {
  const initial = await panelBox(page);
  await dragPointer(page, initial.x + 24, initial.y + 12, dx, dy);
  await expect
    .poll(
      async () => {
        const box = await panelBox(page);
        return Math.round(box.x - initial.x) !== 0 || Math.round(box.y - initial.y) !== 0;
      },
      { message: "the header drag moved the panel" },
    )
    .toBe(true);
  const moved = await panelBox(page);
  await dragPointer(
    page,
    moved.x + moved.width - 2,
    moved.y + moved.height - 2,
    resize[0],
    resize[1],
  );
  await expect
    .poll(async () => (await panelBox(page)).width < moved.width, {
      message: "the corner drag resized the panel",
    })
    .toBe(true);
  return await panelBox(page);
}

/** Opens the focused session's anchored panel from the glyph and pops it out. */
export async function popOutFromGlyph(page: Page): Promise<void> {
  await noteGlyph(page).click();
  await popOutButton(page).click();
  await expect(popInButton(page)).toBeVisible();
}
