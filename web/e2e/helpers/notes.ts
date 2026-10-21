// Locators and oracles for plan session-notes: the Focus header's note glyph, the note panel
// in both forms, the card marker, and `PUT /api/sessions/{id}/note` (kb:anchor/sessions.note).
// Roles and names are the plan's Testable UI Elements rows. The rail card's marker carries only
// visually hidden text `Has a note`, so it is located by that text and counted, never asserted
// visible: a visually hidden node is not what the developer sees, the node's presence is.
import type { Locator, Page } from "@playwright/test";
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
