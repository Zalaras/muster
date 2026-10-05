// Pure drop math for manual rail reordering
// (kb:adr/rail-order-daemon-owned-per-session-fields). No DOM, no socket —
// render/dragreorder.ts's delegated listeners call this via features/rail.ts.
// The insert-and-shift reorder itself is `sessions/reorder.ts`'s `insertAtDragTarget`,
// shared with `sessions/live.ts`'s `moveTile` for the Tiles grid; this module adds the rail's
// own `pinnedCount` derivation and the move between sections on top.
//
// The pinned-before-unpinned invariant holds within a section
// (kb:adr/rail-pin-invariant-scoped-per-section), so a drop is computed against the target
// card's own section only. `ordered` is every card in manual display order
// (sessions/sections.ts's `buildSections(..., "manual")` flattened), each section a pinned
// block then an unpinned block. Removing the dragged entry preserves that two-block shape, and
// re-inserting it immediately beside the target — the target's own block membership unchanged —
// merges the dragged entry into the target's block. `pinnedCount` is therefore always the size of a
// genuine prefix of the resulting `ids`, which is exactly the shape `PUT /api/sessions/order`
// (kb:anchor/sessions.order) expects.
import { insertAtDragTarget } from "./reorder";

export interface RailOrderItem {
  id: number;
  pinned: boolean;
  /** The section the card sits in; `null` is Ungrouped. */
  groupId: number | null;
}

export interface MoveCardResult {
  /** The target section's cards in their new order, the dragged one among them. */
  ids: number[];
  pinnedCount: number;
  /** The target card's section: the dragged card joins it. */
  groupId: number | null;
}

/**
 * Drops `draggedId` onto `targetId` and returns the target section's new order, or `null` for a
 * self-drop or when either id is absent (both are no-ops the caller should ignore, not a
 * reorder). Never mutates `ordered`.
 *
 * Within one section it is `insertAtDragTarget`'s insert-and-shift. From another section the
 * dragged card is not in the list yet, so it is inserted immediately before the target. Either
 * way the dragged entry takes on the target's `pinned` value at the drop, so the result stays
 * exactly as contiguous: it extends the target's block by one at the exact seam it was inserted,
 * never straddling it.
 */
export function moveCard(
  ordered: readonly RailOrderItem[],
  draggedId: number,
  targetId: number,
): MoveCardResult | null {
  const target = ordered.find((s) => s.id === targetId);
  const dragged = ordered.find((s) => s.id === draggedId);
  if (!target || !dragged || draggedId === targetId) return null;

  const section = ordered.filter((s) => s.groupId === target.groupId);
  const targetIndex = section.findIndex((s) => s.id === targetId);
  const reordered =
    dragged.groupId === target.groupId
      ? insertAtDragTarget(section, (s) => s.id, draggedId, targetId)
      : [...section.slice(0, targetIndex), dragged, ...section.slice(targetIndex)];
  if (!reordered) return null;

  const pinnedCount = reordered.reduce((count, item) => {
    const effectivePinned = item.id === draggedId ? target.pinned : item.pinned;
    return effectivePinned ? count + 1 : count;
  }, 0);

  return { ids: reordered.map((s) => s.id), pinnedCount, groupId: target.groupId };
}
