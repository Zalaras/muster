// Pure drop math for manual rail reordering (plan order-sidebar REQ-11). No DOM, no
// socket — render/dragreorder.ts's delegated listeners call this via main.ts, exactly
// like sessions/live.ts's `moveTile` for the Tiles grid (docs/conventions.md: keep
// state-derivation logic in pure modules separate from DOM code).
//
// `ordered` is the currently displayed manual-mode order (sessions/sort.ts's
// `orderRail(sessions, "manual")`), which is always pinned-block-then-unpinned-block.
// Removing the dragged entry preserves that two-block shape (removing one member from
// either block cannot un-contiguous the other), and re-inserting it immediately before
// the target — the target's own block membership unchanged — merges the dragged entry
// into the target's block. `pinnedCount` is therefore always the size of a genuine
// prefix of the resulting `ids`, which is exactly the shape `PUT /api/sessions/order`
// (docs/protocol.md §3.11) expects.
export interface RailOrderItem {
  id: number;
  pinned: boolean;
}

export interface MoveCardResult {
  ids: number[];
  pinnedCount: number;
}

/**
 * Removes `draggedId` from `ordered` and reinserts it at `targetId`'s original index
 * (insert-and-shift, either direction — same convention, and the same "read the index
 * from the ORIGINAL array" requirement, as `sessions/live.ts`'s `moveTile`: a forward
 * drag — dragged originally before target — lands the dragged entry immediately AFTER
 * the target; a backward drag lands it immediately BEFORE. See `moveTile`'s own header
 * comment for why indexing the post-removal array instead silently lands forward drags
 * one slot early), taking on the target's `pinned` value at the drop. Returns `null` for
 * a self-drop or when either id is absent (plan edge case 2). Never mutates `ordered`.
 *
 * Because `ordered` is always pinned-block-then-unpinned-block (sessions/sort.ts's
 * `orderRail(sessions, "manual")`) and the dragged entry always lands directly adjacent
 * to the target — inheriting the target's own `pinned` value — the result stays exactly
 * as contiguous: the dragged entry either extends the target's block by one at the exact
 * seam it was inserted, never straddling it.
 */
export function moveCard(ordered: readonly RailOrderItem[], draggedId: number, targetId: number): MoveCardResult | null {
  if (draggedId === targetId) return null;
  const dragged = ordered.find((s) => s.id === draggedId);
  const target = ordered.find((s) => s.id === targetId);
  if (!dragged || !target) return null;

  const targetIndex = ordered.findIndex((s) => s.id === targetId);
  const withoutDragged = ordered.filter((s) => s.id !== draggedId);
  const reordered = [...withoutDragged];
  reordered.splice(targetIndex, 0, dragged);

  const pinnedCount = reordered.reduce((count, item) => {
    const effectivePinned = item.id === draggedId ? target.pinned : item.pinned;
    return effectivePinned ? count + 1 : count;
  }, 0);

  return { ids: reordered.map((s) => s.id), pinnedCount };
}
