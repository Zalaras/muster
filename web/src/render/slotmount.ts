// The "put this root in that slot, or empty it" idiom, shared by
// features/focus.ts's main slot (reader, then terminal surface) and features/tiles.ts's
// per-tile body slot (reader, then terminal surface). Pure DOM, no state of its own
// (render/CLAUDE.md's render-state rule) — the slot element itself is the only state,
// held by the caller.

/** Mounts `root` into `slot` iff it isn't already the slot's one child, and empties the
 * slot when `root` is `null` — never a redundant `replaceChildren` that would otherwise
 * re-parent (and, for a live `TerminalSurface`, blur) an already-mounted node on every
 * render pass. */
export function mountSlotRoot(slot: HTMLElement, root: HTMLElement | null): void {
  if (root === null) {
    slot.replaceChildren();
    return;
  }
  if (slot.firstElementChild !== root) slot.replaceChildren(root);
}
