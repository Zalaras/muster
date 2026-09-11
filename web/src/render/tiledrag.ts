// Tiles grid drag-to-reorder wiring (plan move-tiles REQ-4/REQ-5/REQ-6). Thin wrapper
// over the generalised `render/dragreorder.ts` (plan order-sidebar) — kept as its own
// module, with this exact exported signature, so `tiledrag.test.ts` (which pins the
// pre-blur focus-snapshot sequencing this module's caller depends on) keeps compiling
// and passing unchanged (docs/conventions.md: impl agents never edit tests).
//
// The tile grid's handle is `.thead` — only a drag that starts there reorders the grid;
// the body/footer are not drag handles. See `dragreorder.ts`'s header comment for the
// full mechanism (pre-blur focus capture, foreign-drag tolerance, `draggable="false"`
// items never starting a drag).

import { installDragReorder } from "./dragreorder";
import type { FocusedControl } from "./focus";

/** Installs delegated drag-to-reorder listeners on `gridEl` (plan move-tiles DOM spec).
 * `onMove` is called with (draggedId, targetId, focusedBeforeDrag) on a valid tile-on-tile
 * drop; the caller (features/tiles.ts) applies `moveTile` and re-renders. Safe to call
 * exactly once per grid element's lifetime — the grid element itself is never replaced
 * (`#tiles-grid` is a fixed container `features/tiles.ts`'s `renderView`/`reconcileTilesGrid`
 * fill/empty). */
export function installTileDrag(
  gridEl: HTMLElement,
  onMove: (draggedId: number, targetId: number, focusedBeforeDrag: FocusedControl | null) => void,
): void {
  installDragReorder(gridEl, { itemSelector: "article.tile", handleSelector: ".thead", onMove });
}
