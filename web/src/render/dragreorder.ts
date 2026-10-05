// Generalised drag-to-reorder wiring, shared by the Tiles grid
// (kb:adr/tiles-drag-reorder-header-handle-insert-shift) and the rail
// (kb:adr/rail-whole-card-drag-drop-decides-pin), where it is installed twice on the one
// container: for cards (features/rail.ts) and for section headers (features/groups.ts,
// kb:adr/rail-section-headers-drag-in-both-sort-modes). DOM-only: maps pointer/DnD events to
// numeric ids and calls back into the caller (features/tiles.ts for the Tiles grid,
// features/rail.ts and features/groups.ts for the rail), which owns the reorder math
// (sessions/live.ts's `moveTile`, sessions/railorder.ts's `moveCard`, sessions/sections.ts's
// `moveSection`) — this module has no Session or store knowledge at all.
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
// never fires `dragstart` for it — attention-mode rail cards rely on exactly this, not
// on any check here.
//
// Two installs on one container tell their drags apart by their own `draggingId`: a drag one of
// them did not start never sets it, so that install claims nothing of it. Both carry `DRAG_MIME`
// (an internal reorder drag is an internal reorder drag to the drop guard and the terminal).
//
// `draggingId` is module-level per call (one container, one drag at a time) and doubles
// as the "is a drag from this container in progress" flag: `dragover` only calls
// `preventDefault()` while it is set, which is what lets the browser's own drop event
// fire for an in-container drag while leaving a foreign drag (a file, text from outside
// the page) to the browser's default handling (this drag already carries a
// Muster-specific MIME type — kb:adr/drop-reorder-drag-mime-custom-type — which is what
// lets `render/dropguard.ts` tell a genuinely foreign drag from one of these).
//
// Pre-blur focus capture: a drag's initiating
// `mousedown` blurs whatever control currently has focus anywhere in the container to
// `<body>` as the browser's own default action for that mousedown — and it does so
// before `dragstart` ever fires, so by the time a `drop` lands and the caller's own
// reconciler calls `captureFocusedControl`, focus is already gone and there is nothing
// to restore. The event handler for `mousedown` itself still runs before that default
// blur action is applied, so this module captures the focused control right there — via
// the same `captureFocusedControl` helper the reconcilers already use — and hands it to
// `onMove` so the caller can feed it to the reconciler's existing restore step instead of
// a (by-then-too-late) live capture. This module still has no `Session`/store knowledge:
// `captureFocusedControl` is a generic DOM helper keyed on data attributes, not
// Session objects, exactly like the ids this module already maps.

import { DRAG_MIME } from "../dragmime";
import { captureFocusedControl, type FocusedControl } from "./focuskeep";

export interface DragReorderOptions {
  /** Selects the draggable item element from any descendant target (e.g. "article.tile",
   * "article.card"). Items are matched via `Element.closest`. */
  itemSelector: string;
  /** Restricts `mousedown`/`dragstart` to a descendant match (e.g. ".thead") — omit to
   * let the whole item be the handle. */
  handleSelector?: string;
  /** The `data-` key (camelCase, as `dataset` reads it) holding an item's numeric id. Defaults
   * to `sessionId`; the rail's section headers use `sectionId`. */
  idAttribute?: string;
  /** Called on a valid item-on-item drop with the dragged id, the drop target's id, and
   * the pre-blur focus snapshot (or null if nothing was focused). */
  onMove: (draggedId: number, targetId: number, focusedBeforeDrag: FocusedControl | null) => void;
  /** Drop targets that are not items — a section's header or body, for a card dragged onto it.
   * An item under the pointer wins; otherwise a drop inside a zone calls `onDropZone` with the
   * zone's key, read from the `data-` key `zoneKeyAttribute` names (camelCase, as `dataset`
   * reads it). All three are given or none. */
  dropZoneSelector?: string;
  zoneKeyAttribute?: string;
  onDropZone?: (
    draggedId: number,
    zoneKey: string,
    focusedBeforeDrag: FocusedControl | null,
  ) => void;
}

function itemOf(target: EventTarget | null, itemSelector: string): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest(itemSelector);
}

function idOf(item: HTMLElement | null, idAttribute: string): number | null {
  if (!item) return null;
  const raw = item.dataset[idAttribute];
  if (raw === undefined) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

function isFromHandle(
  target: EventTarget | null,
  itemSelector: string,
  handleSelector: string | undefined,
): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(handleSelector ?? itemSelector) !== null;
}

/** Installs delegated drag-to-reorder listeners on `container`, generalising the
 * original tile-only drag wiring to also serve the rail. Safe to call once per kind of drag per
 * container element's lifetime — the container itself is never replaced, only its
 * children are reconciled. Callers: `features/tiles.ts` (the Tiles grid, handle
 * `.thead`), `features/rail.ts` (the rail's cards, whole card as handle) and
 * `features/groups.ts` (the rail's section headers). */
export function installDragReorder(container: HTMLElement, options: DragReorderOptions): void {
  const { itemSelector, handleSelector, onMove, dropZoneSelector, zoneKeyAttribute, onDropZone } =
    options;
  const idAttribute = options.idAttribute ?? "sessionId";
  const sessionIdOf = (item: HTMLElement | null): number | null => idOf(item, idAttribute);
  const zoneOf = (target: EventTarget | null): HTMLElement | null =>
    dropZoneSelector ? itemOf(target, dropZoneSelector) : null;
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
    // drag is left to the browser's default (no preventDefault, no drop-target class).
    if (draggingId === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });

  container.addEventListener("dragenter", (event) => {
    if (draggingId === null) return;
    // An item under the pointer takes the highlight; failing that, the zone around it.
    const item = itemOf(event.target, itemSelector);
    if (item && sessionIdOf(item) === draggingId) return;
    const target = item ?? zoneOf(event.target);
    if (target && target !== dropTarget) {
      clearDropTarget();
      dropTarget = target;
      target.classList.add("drop-target");
    }
  });

  container.addEventListener("dragleave", (event) => {
    if (draggingId === null || !dropTarget) return;
    // Only clear when actually leaving the current drop-target item (not just moving
    // between its descendants), and only if the pointer isn't moving into a descendant.
    const related = event.relatedTarget;
    if (
      dropTarget.contains(event.target as Node) &&
      !(related instanceof Node && dropTarget.contains(related))
    ) {
      clearDropTarget();
    }
  });

  container.addEventListener("drop", (event) => {
    if (draggingId === null) return;
    event.preventDefault();
    const targetItem = itemOf(event.target, itemSelector);
    const targetId = sessionIdOf(targetItem);
    const zoneKey =
      targetItem || zoneKeyAttribute === undefined
        ? undefined
        : zoneOf(event.target)?.dataset[zoneKeyAttribute];
    const sourceId = draggingId;
    const preDragFocus = focusedBeforeDrag;
    clearDragState();
    if (zoneKey !== undefined) {
      onDropZone?.(sourceId, zoneKey, preDragFocus);
      return;
    }
    if (targetId === null || sourceId === targetId) return;
    onMove(sourceId, targetId, preDragFocus);
  });

  container.addEventListener("dragend", () => {
    // Fires on drop OR an aborted drag (Escape, dropped outside any valid target);
    // always safe to clear here since `drop`'s own handler already
    // cleared state on a successful reorder.
    clearDragState();
  });
}
