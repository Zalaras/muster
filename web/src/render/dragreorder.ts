// Generalised drag-to-reorder wiring (plan order-sidebar, generalising plan move-tiles'
// tiledrag.ts). DOM-only: maps pointer/DnD events to session ids and calls back into the
// caller (main.ts), which owns the reorder math (sessions/live.ts's `moveTile` for the
// Tiles grid, sessions/railorder.ts's `moveCard` for the rail) — this module has no
// Session or store knowledge at all (W11), exactly like tiledrag.ts's original
// separation of chrome-DOM from view-model.
//
// Delegated listeners on `container` (not per-item) so a freshly built item (a
// promotion, a backfill, a newly-built rail card) is draggable/droppable with no extra
// wiring — `installDragReorder` is called once per container, at startup.
//
// `handleSelector` restricts which descendant a `mousedown`/`dragstart` must land inside
// to count as this container's drag: the Tiles grid passes ".thead" (only the tile's
// header is a handle); the rail passes none, so the whole card is the handle — any
// mousedown/dragstart inside a matched item counts. An item carrying `draggable="false"`
// never starts a drag regardless of this module's wiring, because the browser itself
// never fires `dragstart` for it (plan order-sidebar REQ-10) — attention-mode rail cards
// rely on exactly this, not on any check here.
//
// `draggingId` is module-level per call (one container, one drag at a time) and doubles
// as the "is a drag from this container in progress" flag: `dragover` only calls
// `preventDefault()` while it is set, which is what lets the browser's own drop event
// fire for an in-container drag while leaving a foreign drag (a file, text from outside
// the page) to the browser's default handling (plan edge case 3).
//
// Pre-blur focus capture (carried over from tiledrag.ts, plan move-tiles E2E validate
// attempt 1 / plan order-sidebar's "Carried-over measurements"): a drag's initiating
// `mousedown` blurs whatever control currently has focus anywhere in the container to
// `<body>` as the browser's own default action for that mousedown — and it does so
// before `dragstart` ever fires, so by the time a `drop` lands and the caller's own
// reconciler calls `captureFocusedControl`, focus is already gone and there is nothing
// to restore. The event handler for `mousedown` itself still runs before that default
// blur action is applied, so this module captures the focused control right there — via
// the same `captureFocusedControl` helper the reconcilers already use — and hands it to
// `onMove` so the caller can feed it to the reconciler's existing restore step instead of
// a (by-then-too-late) live capture. This module still has no `Session`/store knowledge
// (W11): `captureFocusedControl` is a generic DOM helper keyed on data attributes, not
// Session objects, exactly like the ids this module already maps.

import { captureFocusedControl, type FocusedControl } from "./focus";

// Plan file-drop-fix, edge case 1: exported so a terminal surface's own drag handlers
// (terminal/pane.ts) can positively identify "this drag is an internal tile/rail reorder
// crossing over me" and bail without claiming it (INV-3), rather than treating it as a
// foreign text drop (REQ-10) — which a plain "text/plain" MIME would be indistinguishable
// from, since real dragged text uses that exact same standard type. Nothing reads the
// *value* stored under this MIME (the drop handler above resolves the dragged id from its
// own `draggingId` module state instead — see the header comment), so the string itself
// is opaque and only its presence in `dataTransfer.types` is ever checked.
export const DRAG_MIME = "application/x-muster-drag-id";

export interface DragReorderOptions {
  /** Selects the draggable item element from any descendant target (e.g. "article.tile",
   * "article.card"). Items are matched via `Element.closest`. */
  itemSelector: string;
  /** Restricts `mousedown`/`dragstart` to a descendant match (e.g. ".thead") — omit to
   * let the whole item be the handle. */
  handleSelector?: string;
  /** Called on a valid item-on-item drop with the dragged id, the drop target's id, and
   * the pre-blur focus snapshot (or null if nothing was focused). */
  onMove: (draggedId: number, targetId: number, focusedBeforeDrag: FocusedControl | null) => void;
}

function itemOf(target: EventTarget | null, itemSelector: string): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest(itemSelector);
}

function sessionIdOf(item: HTMLElement | null): number | null {
  if (!item) return null;
  const raw = item.dataset["sessionId"];
  if (raw === undefined) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

function isFromHandle(target: EventTarget | null, itemSelector: string, handleSelector: string | undefined): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(handleSelector ?? itemSelector) !== null;
}

/** Installs delegated drag-to-reorder listeners on `container` (plan order-sidebar
 * REQ-10/REQ-11, generalising plan move-tiles' `installTileDrag`). Safe to call exactly
 * once per container element's lifetime — the container itself is never replaced, only
 * its children are reconciled. */
export function installDragReorder(container: HTMLElement, options: DragReorderOptions): void {
  const { itemSelector, handleSelector, onMove } = options;
  let draggingId: number | null = null;
  let dragItem: HTMLElement | null = null;
  let dropTarget: HTMLElement | null = null;
  // Snapshot taken on the drag's initiating `mousedown`, before the browser's own blur
  // default action fires — see header comment. Reset whenever a drag ends (successfully
  // or not) so a stale snapshot never survives to a later, unrelated drag.
  let focusedBeforeDrag: FocusedControl | null = null;

  function clearDropTarget(): void {
    if (dropTarget) dropTarget.classList.remove("drop-target");
    dropTarget = null;
  }

  function clearDragState(): void {
    if (dragItem) dragItem.classList.remove("dragging");
    dragItem = null;
    draggingId = null;
    focusedBeforeDrag = null;
    clearDropTarget();
  }

  container.addEventListener("mousedown", (event) => {
    // Only a mousedown that could plausibly start a drag (inside the handle) is worth
    // capturing for — same guard as `dragstart` below. This fires for every such
    // mousedown, including ones that never turn into a real drag; that's harmless, since
    // the snapshot is only ever read by `drop` below and is overwritten by the very next
    // `mousedown` otherwise.
    if (!isFromHandle(event.target, itemSelector, handleSelector)) return;
    focusedBeforeDrag = captureFocusedControl(container);
  });

  container.addEventListener("dragstart", (event) => {
    if (!isFromHandle(event.target, itemSelector, handleSelector)) return;
    const item = itemOf(event.target, itemSelector);
    const id = sessionIdOf(item);
    if (!item || id === null) return;

    draggingId = id;
    dragItem = item;
    item.classList.add("dragging");
    event.dataTransfer?.setData(DRAG_MIME, String(id));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  });

  container.addEventListener("dragover", (event) => {
    // Only claim the drop while a drag from this container is in progress — a foreign
    // drag (plan edge case 3) is left to the browser's default (no preventDefault, no
    // drop-target class).
    if (draggingId === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });

  container.addEventListener("dragenter", (event) => {
    if (draggingId === null) return;
    const item = itemOf(event.target, itemSelector);
    if (!item || sessionIdOf(item) === draggingId) return;
    if (item !== dropTarget) {
      clearDropTarget();
      dropTarget = item;
      item.classList.add("drop-target");
    }
  });

  container.addEventListener("dragleave", (event) => {
    if (draggingId === null || !dropTarget) return;
    // Only clear when actually leaving the current drop-target item (not just moving
    // between its descendants), and only if the pointer isn't moving into a descendant.
    const related = event.relatedTarget;
    if (dropTarget.contains(event.target as Node) && !(related instanceof Node && dropTarget.contains(related))) {
      clearDropTarget();
    }
  });

  container.addEventListener("drop", (event) => {
    if (draggingId === null) return;
    event.preventDefault();
    const targetItem = itemOf(event.target, itemSelector);
    const targetId = sessionIdOf(targetItem);
    const sourceId = draggingId;
    const preDragFocus = focusedBeforeDrag;
    clearDragState();
    if (targetId === null || sourceId === targetId) return;
    onMove(sourceId, targetId, preDragFocus);
  });

  container.addEventListener("dragend", () => {
    // Fires on drop OR an aborted drag (Escape, dropped outside any valid target — plan
    // edge cases 2/3); always safe to clear here since `drop`'s own handler already
    // cleared state on a successful reorder.
    clearDragState();
  });
}
