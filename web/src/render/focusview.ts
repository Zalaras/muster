// Focus's main-area toggle and sizenote — split
// out of render/sessions.ts (both are called only by features/focus.ts,
// not by anything the rail/tile card builders in render/sessions.ts own).

export interface FocusMainElements {
  emptyEl: HTMLElement;
  slotEl: HTMLElement;
}

/** Toggles Focus's main area between the honest empty state and the terminal slot — the
 * slot's contents (a TerminalSurface's root) are features/surfaces.ts's job, not
 * this module's (docs/conventions.md: DOM here, sockets/pane lifecycle in features/surfaces.ts). */
export function renderFocusMain(elements: FocusMainElements, hasSessions: boolean): void {
  elements.emptyEl.hidden = hasSessions;
  elements.slotEl.hidden = !hasSessions;
}

/** The one writer for the main slot's `hidden` beyond `renderFocusMain`'s own initial
 * "no sessions at all" default above — `features/focus.ts`'s `renderView` overrides that
 * default once it knows which of dead/docs/terminal the slot is actually showing, calling
 * this instead of assigning `.hidden` on the element itself. */
export function setMainSlotHidden(el: HTMLElement, hidden: boolean): void {
  el.hidden = hidden;
}

/** The sizenote line: `<cols>×<rows> · one live client · geometry owned by this
 * pane`. `null` geometry (no focused session, or one not yet laid out) hides the line
 * entirely rather than rendering a half-formed one — unless `reserving`, which shows an
 * NBSP placeholder instead of hiding: `features/focus.ts` sets this the instant a
 * terminal surface mounts, before its `refit()` (which needs the line's real height
 * already reserved) can report the real geometry. Must stay a literal NBSP (U+00A0), not
 * an ASCII space: `.sizenote` is flex, and a flex item holding only collapsible
 * whitespace renders at zero height. */
export function renderSizenote(
  el: HTMLElement,
  geometry: { cols: number; rows: number } | null,
  opts?: { reserving: boolean },
): void {
  if (!geometry) {
    if (opts?.reserving) {
      el.hidden = false;
      el.textContent = " ";
      return;
    }
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = `${geometry.cols}×${geometry.rows} · one live client · geometry owned by this pane`;
}
