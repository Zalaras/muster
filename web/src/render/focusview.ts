// Focus's main-area toggle and sizenote — split
// out of render/sessions.ts (both are called only by features/focus.ts,
// not by anything the rail/tile card builders in render/sessions.ts own).

export interface FocusMainElements {
  emptyEl: HTMLElement;
}

/** Toggles Focus's honest "no sessions at all" empty state. The main slot's own
 * `hidden` is decided entirely by `setMainSlotHidden` below, from `features/focus.ts`'s
 * `renderView` — every one of its branches (no focused session, dead, docs, terminal)
 * calls that once it knows which of them the slot is actually showing, so this function
 * never touches the slot itself: one writer for one piece of state. */
export function renderFocusMain(elements: FocusMainElements, hasSessions: boolean): void {
  elements.emptyEl.hidden = hasSessions;
}

/** The main slot's one `hidden` writer — `features/focus.ts`'s `renderView` calls this
 * instead of assigning `.hidden` on the element itself, from every branch that decides
 * what the slot is currently showing. */
export function setMainSlotHidden(el: HTMLElement, hidden: boolean): void {
  el.hidden = hidden;
}

/** The sizenote line: `<cols>×<rows> · one live client · geometry owned by this
 * pane`. `null` geometry (no focused session, or one not yet laid out) hides the line
 * entirely rather than rendering a half-formed one — unless `reserving`, which writes a
 * literal NBSP (U+00A0) placeholder below instead of hiding: `features/focus.ts` sets
 * this the instant a terminal surface mounts, before its `refit()` (which needs the
 * line's real height already reserved) can report the real geometry. It must be the NBSP
 * and not an ASCII space: `.sizenote` is flex, and a flex item holding only collapsible
 * whitespace renders at zero height, which would leave nothing for `refit()` to reserve
 * against. */
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
