// The one insert-and-shift reorder rule shared by the rail's manual drag
// (railorder.ts's `moveCard`) and the Tiles grid's drag (live.ts's `moveTile`) — both
// remove a dragged id and reinsert it at the drop target's index, either direction.

/**
 * Removes the item identified by `draggedId` from `items` and reinserts it at
 * `targetId`'s index in the ORIGINAL array (insert-and-shift, either direction: a forward
 * drag — dragged originally before target — lands the dragged entry immediately AFTER the
 * target; a backward drag lands it immediately BEFORE). Indexing the post-removal array
 * instead would silently land forward drags one slot early, since removing the dragged
 * entry first shifts every later index — including the target's own — down by one before
 * it's read. Returns `null` for a self-drop or when either id is absent from `items`
 * (identified via `id`). Never mutates `items`.
 */
export function insertAtDragTarget<T>(
  items: readonly T[],
  id: (item: T) => number,
  draggedId: number,
  targetId: number,
): T[] | null {
  if (draggedId === targetId) return null;
  const dragged = items.find((item) => id(item) === draggedId);
  const targetIndex = items.findIndex((item) => id(item) === targetId);
  if (!dragged || targetIndex === -1) return null;

  const result = items.filter((item) => id(item) !== draggedId);
  result.splice(targetIndex, 0, dragged);
  return result;
}
