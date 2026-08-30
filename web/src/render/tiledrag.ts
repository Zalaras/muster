// Tiles grid drag-to-reorder wiring (plan move-tiles REQ-4/REQ-5/REQ-6). DOM-only: maps
// pointer/DnD events to session ids and calls back into main.ts, which owns `tilesLive`
// and the reorder math (`sessions/live.ts`'s `moveTile`) — this module has no Session or
// store knowledge at all (W10), exactly like tiles.ts's separation of chrome-DOM from
// view-model.
//
// Delegated listeners on the grid container (not per-tile) so a freshly built tile (a
// promotion, a backfill) is draggable/droppable with no extra wiring — `installTileDrag`
// is called once, at startup, on `#tiles-grid`.
//
// `draggingId` is module-level (one grid, one drag at a time) and doubles as the "is a
// tile drag in progress" flag: `dragover` only calls `preventDefault()` while it is set,
// which is what lets the browser's own drop event fire for a tile-on-tile drag while
// leaving a foreign drag (a file, text from outside the page) to the browser's default
// handling (plan edge case 10).
//
// E2E validate attempt 1 (REQ-10/E6): a drag's initiating `mousedown` on `.thead` blurs
// whatever control currently has focus anywhere in the grid to `<body>` as the browser's
// own default action for that mousedown — and it does so before `dragstart` ever fires,
// so by the time a `drop` lands and `main.ts`'s `reconcileTilesGrid` calls
// `captureFocusedControl`, focus is already gone and there is nothing to restore. The
// event handler for `mousedown` itself still runs before that default blur action is
// applied, so this module captures the focused control right there — via the same
// `captureFocusedControl` helper `reconcileTilesGrid` already uses — and hands it to
// `onMove` so the caller can feed it to the reconciler's existing restore step instead of
// a (by-then-too-late) live capture. This module still has no `Session`/store knowledge
// (W10): `captureFocusedControl` is a generic DOM helper keyed on data attributes, not
// Session objects, exactly like the ids this module already maps.

import { captureFocusedControl, type FocusedControl } from "./focus";

const DRAG_MIME = "text/plain";

function tileOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest("article.tile");
}

function sessionIdOf(tile: HTMLElement | null): number | null {
  if (!tile) return null;
  const raw = tile.dataset["sessionId"];
  if (raw === undefined) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

/** Installs delegated drag-to-reorder listeners on `gridEl` (plan move-tiles DOM spec).
 * `onMove` is called with (draggedId, targetId) on a valid tile-on-tile drop; the caller
 * (main.ts) applies `moveTile` and re-renders. Safe to call exactly once per grid
 * element's lifetime — the grid element itself is never replaced (`#tiles-grid` is a
 * fixed container main.ts fills/empties, per `renderTilesView`). */
export function installTileDrag(
  gridEl: HTMLElement,
  onMove: (draggedId: number, targetId: number, focusedBeforeDrag: FocusedControl | null) => void,
): void {
  let draggingId: number | null = null;
  let dragTile: HTMLElement | null = null;
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
    if (dragTile) dragTile.classList.remove("dragging");
    dragTile = null;
    draggingId = null;
    focusedBeforeDrag = null;
    clearDropTarget();
  }

  gridEl.addEventListener("mousedown", (event) => {
    // Only a mousedown that could plausibly start a tile drag (inside a `.thead`) is
    // worth capturing for — same guard as `dragstart` below. This fires for every such
    // mousedown, including ones that never turn into a real drag; that's harmless, since
    // the snapshot is only ever read by `drop` below and is overwritten by the very next
    // `mousedown` otherwise.
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(".thead")) return;
    focusedBeforeDrag = captureFocusedControl(gridEl);
  });

  gridEl.addEventListener("dragstart", (event) => {
    // REQ-4: only a drag that started inside a `.thead` is a tile reorder — the body/
    // footer are not drag handles.
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(".thead")) return;
    const tile = tileOf(target);
    const id = sessionIdOf(tile);
    if (!tile || id === null) return;

    draggingId = id;
    dragTile = tile;
    tile.classList.add("dragging");
    event.dataTransfer?.setData(DRAG_MIME, String(id));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  });

  gridEl.addEventListener("dragover", (event) => {
    // Only claim the drop while a tile drag from this grid is in progress — a foreign
    // drag (plan edge case 10) is left to the browser's default (no preventDefault, no
    // drop-target class).
    if (draggingId === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });

  gridEl.addEventListener("dragenter", (event) => {
    if (draggingId === null) return;
    const tile = tileOf(event.target);
    if (!tile || sessionIdOf(tile) === draggingId) return;
    if (tile !== dropTarget) {
      clearDropTarget();
      dropTarget = tile;
      tile.classList.add("drop-target");
    }
  });

  gridEl.addEventListener("dragleave", (event) => {
    if (draggingId === null || !dropTarget) return;
    // Only clear when actually leaving the current drop-target tile (not just moving
    // between its descendants), and only if the pointer isn't moving into a descendant.
    const related = event.relatedTarget;
    if (dropTarget.contains(event.target as Node) && !(related instanceof Node && dropTarget.contains(related))) {
      clearDropTarget();
    }
  });

  gridEl.addEventListener("drop", (event) => {
    if (draggingId === null) return;
    event.preventDefault();
    const targetTile = tileOf(event.target);
    const targetId = sessionIdOf(targetTile);
    const sourceId = draggingId;
    const preDragFocus = focusedBeforeDrag;
    clearDragState();
    if (targetId === null || sourceId === targetId) return;
    onMove(sourceId, targetId, preDragFocus);
  });

  gridEl.addEventListener("dragend", () => {
    // Fires on drop OR an aborted drag (Escape, dropped outside any valid target — plan
    // edge cases 3/4); always safe to clear here since `drop`'s own handler already
    // cleared state on a successful reorder.
    clearDragState();
  });
}
