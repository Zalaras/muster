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

/** The sizenote line: `<cols>×<rows> · one live client · geometry owned by this
 * pane`. `null` geometry (no focused session, or one not yet laid out) hides the line
 * entirely rather than rendering a half-formed one. */
export function renderSizenote(
  el: HTMLElement,
  geometry: { cols: number; rows: number } | null,
): void {
  if (!geometry) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = `${geometry.cols}×${geometry.rows} · one live client · geometry owned by this pane`;
}
