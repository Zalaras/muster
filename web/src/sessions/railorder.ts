// Pure drop math for manual rail reordering
// (kb:adr/rail-order-daemon-owned-per-session-fields). No DOM, no socket —
// render/dragreorder.ts's delegated listeners call this via features/rail.ts.
// The insert-and-shift reorder itself is `sessions/reorder.ts`'s `insertAtDragTarget`,
// shared with `sessions/live.ts`'s `moveTile` for the Tiles grid; this module adds only
// the rail's own `pinnedCount` derivation on top.
//
// `ordered` is the currently displayed manual-mode order (sessions/sort.ts's
// `orderRail(sessions, "manual")`), which is always pinned-block-then-unpinned-block.
// Removing the dragged entry preserves that two-block shape (removing one member from
// either block cannot un-contiguous the other), and re-inserting it immediately before
// the target — the target's own block membership unchanged — merges the dragged entry
// into the target's block. `pinnedCount` is therefore always the size of a genuine
// prefix of the resulting `ids`, which is exactly the shape `PUT /api/sessions/order`
// (kb:anchor/sessions.order) expects.
import { insertAtDragTarget } from "./reorder";

export interface RailOrderItem {
  id: number;
  pinned: boolean;
}

export interface MoveCardResult {
  ids: number[];
  pinnedCount: number;
}

/**
 * Reorders `ordered` via `insertAtDragTarget` (the dragged entry takes on the target's
 * `pinned` value at the drop) and returns `null` for a self-drop or when either id is
 * absent (both are no-ops the caller should ignore, not a reorder). Never mutates
 * `ordered`.
 *
 * Because `ordered` is always pinned-block-then-unpinned-block (sessions/sort.ts's
 * `orderRail(sessions, "manual")`) and the dragged entry always lands directly adjacent
 * to the target — inheriting the target's own `pinned` value — the result stays exactly
 * as contiguous: the dragged entry either extends the target's block by one at the exact
 * seam it was inserted, never straddling it.
 */
export function moveCard(
  ordered: readonly RailOrderItem[],
  draggedId: number,
  targetId: number,
): MoveCardResult | null {
  const target = ordered.find((s) => s.id === targetId);
  const reordered = insertAtDragTarget(ordered, (s) => s.id, draggedId, targetId);
  if (!reordered || !target) return null;

  const pinnedCount = reordered.reduce((count, item) => {
    const effectivePinned = item.id === draggedId ? target.pinned : item.pinned;
    return effectivePinned ? count + 1 : count;
  }, 0);

  return { ids: reordered.map((s) => s.id), pinnedCount };
}
