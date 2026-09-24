// One positioning routine for every keyed, ordered set of session-id roots this dashboard
// reconciles into a container — the rail, the strip and (via features/tiles.ts) the Tiles
// grid (a DOM reorder belongs in `render/`, per conventions § Composition roots, never
// hand-rolled inside a controller). Positioning only: building/updating each entry's
// content and removing whatever fell out of the new order are the caller's job, done
// before this runs.
import { restoreFocusedControl, type FocusedControl } from "./focuskeep";

/** One entry already built or updated for this pass — `id` is the reconciliation key,
 * `root` is the mounted element to position. */
export interface KeyedReorderEntry {
  id: number;
  root: HTMLElement;
}

/**
 * Positions `entries`' roots inside `container`, in order, reusing whatever is already
 * mounted — `insertBefore` only ever runs for a root that isn't already in its desired
 * slot, so a steady container touches no DOM at all here. `focused` is the control the
 * caller captured (`captureFocusedControl`, or a pre-blur snapshot) *before* it built or
 * updated any entry's content — capture has to happen that early because a content update
 * can itself blur a focused descendant (a rebuilt `.acts-row`, say), not just this
 * function's own `insertBefore` calls (render/CLAUDE.md's insertBefore gotcha) — so capture
 * is never this function's own job, only restore is.
 */
export function reconcileKeyedOrder(
  container: HTMLElement,
  entries: readonly KeyedReorderEntry[],
  focused: FocusedControl | null,
): void {
  let previous: HTMLElement | null = null;
  for (const { root } of entries) {
    const desiredNext: Element | null = previous
      ? previous.nextElementSibling
      : container.firstElementChild;
    if (desiredNext !== root) container.insertBefore(root, desiredNext);
    previous = root;
  }

  const byId = new Map(entries.map((entry) => [entry.id, entry.root]));
  restoreFocusedControl(focused, (id) => byId.get(id));
}
