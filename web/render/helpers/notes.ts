// Locators and layout oracles for plan session-notes: the Focus header's note glyph, the note
// panel in both forms, the card / tile marker and the hover tip. Pure DOM — no daemon, no fixture
// knowledge — so the render spec uses it directly. Roles and names are the plan's Testable UI
// Elements rows; the marker carries only visually hidden text `Has a note`, so it is located by
// the `.mk` slot and counted while not `hidden`.
import type { Locator, Page } from "./harness";

/** The Focus header's note glyph: `<button aria-label="Note">`; `exact` keeps it apart from
 * the rename trigger, whose name is the session title. */
export function noteGlyph(page: Page): Locator {
  return page.locator("#mainhead").getByRole("button", { name: "Note", exact: true });
}

/** The anchored or popped-out panel: a non-modal `role="dialog"` named `Note`. */
export function notePanel(page: Page): Locator {
  return page.getByRole("dialog", { name: "Note", exact: true });
}

export function noteEditor(page: Page): Locator {
  return notePanel(page).getByRole("textbox", { name: "Note text" });
}

export function noteStatus(page: Page): Locator {
  return notePanel(page).getByRole("status");
}

export function popOutNote(page: Page): Locator {
  return notePanel(page).getByRole("button", { name: "Pop out note" });
}

export function popInNote(page: Page): Locator {
  return notePanel(page).getByRole("button", { name: "Pop in note" });
}

/** The panel's rendered (view-mode) body. */
export function noteBody(page: Page): Locator {
  return notePanel(page).locator(".bd");
}

/** The marker inside a card or tile header, only while shown (`hidden` removed). */
export function shownMarker(host: Locator): Locator {
  return host.locator(".mk:not([hidden])");
}

/** The marker hover tip: the shared `role="tooltip"` whose text starts with `Note`. */
export function noteTip(page: Page): Locator {
  return page.getByRole("tooltip").filter({ hasText: /^Note/ });
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("boxOf: the element has no box");
  return box;
}

/** The main slot the popped panel must stay inside: `.main` below the Focus header and the
 * effort strip, above the size note. Read from the live layout, never a constant. */
export async function mainSlot(page: Page): Promise<Box> {
  return await page.evaluate(() => {
    const shown = (el: Element | null): el is HTMLElement =>
      el instanceof HTMLElement && el.getClientRects().length > 0;
    const main = (document.querySelector(".main") as HTMLElement).getBoundingClientRect();
    let top = main.top;
    let bottom = main.bottom;
    for (const sel of ["#mainhead", "#effort-strip"]) {
      const el = document.querySelector(sel);
      if (shown(el)) top = Math.max(top, el.getBoundingClientRect().bottom);
    }
    const size = document.querySelector("#sizenote");
    if (shown(size)) bottom = Math.min(bottom, size.getBoundingClientRect().top);
    return { x: main.left, y: top, width: main.width, height: bottom - top };
  });
}

const EPS = 0.75;

/** A description of how `inner` leaves `outer`, or null when it lies inside it. */
export function escapes(inner: Box, outer: Box): string | null {
  const problems: string[] = [];
  if (inner.x < outer.x - EPS) problems.push(`left ${inner.x} < ${outer.x}`);
  if (inner.y < outer.y - EPS) problems.push(`top ${inner.y} < ${outer.y}`);
  if (inner.x + inner.width > outer.x + outer.width + EPS) {
    problems.push(`right ${inner.x + inner.width} > ${outer.x + outer.width}`);
  }
  if (inner.y + inner.height > outer.y + outer.height + EPS) {
    problems.push(`bottom ${inner.y + inner.height} > ${outer.y + outer.height}`);
  }
  return problems.length === 0 ? null : problems.join("; ");
}

/** A token's resolved colour, as the browser computes it for `color`. */
export async function tokenColor(page: Page, token: string): Promise<string> {
  return await page.evaluate((t) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${t})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, token);
}
