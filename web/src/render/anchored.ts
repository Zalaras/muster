// The one placement routine for a panel appended to `document.body` beside an anchor: below the
// anchor when it fits, above when it does not, and kept inside the viewport. Shared by the menu
// (`menu.ts`) and the group popover (`grouppopover.ts`); a caller whose panel is wider than the
// room to the anchor's right asks for `alignRight`, and the left edge is clamped either way.

/** Minimum distance kept between the panel and every viewport edge. */
const EDGE_GAP = 8;
/** Distance between the anchor and the panel. */
const ANCHOR_GAP = 4;

export interface PlacementOptions {
  /** When the panel would run past the right edge starting at the anchor's left, line its right
   * edge up with the anchor's instead. Default: keep the left edge and clamp. */
  alignRight?: boolean;
}

export function placeAnchored(
  panel: HTMLElement,
  anchor: HTMLElement,
  options: PlacementOptions = {},
): void {
  const box = anchor.getBoundingClientRect();
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  const overflowsRight = box.left + width > window.innerWidth - EDGE_GAP;
  const left = options.alignRight === true && overflowsRight ? box.right - width : box.left;
  const below = box.bottom + ANCHOR_GAP;
  const top =
    below + height > window.innerHeight - EDGE_GAP ? box.top - ANCHOR_GAP - height : below;
  panel.style.left = `${Math.max(EDGE_GAP, Math.min(left, window.innerWidth - width - EDGE_GAP))}px`;
  panel.style.top = `${Math.max(EDGE_GAP, top)}px`;
}
