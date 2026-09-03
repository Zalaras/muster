// Document-level foreign-drag/drop guard (plan file-drop-fix REQ-1). Every browser opens
// a dropped file by default unless something calls `preventDefault()` on both `dragover`
// and `drop`; before this plan nothing in `web/src/` did so outside the tile/rail reorder
// and the terminal surface's own drop target, so a file released anywhere else on the
// dashboard (masthead, rail, dialogs, a dead-session surface, an empty grid slot)
// navigated the whole tab away from Muster.
//
// A more specific handler always runs first: `dragover`/`drop` fire on the original
// target and bubble up through every ancestor before reaching `document` — a terminal
// surface's own listener (terminal/pane.ts) or a tile/rail reorder container's listener
// (render/dragreorder.ts) is an ancestor of (or the same element as) wherever the pointer
// actually is, so its `preventDefault()` call, when it claims the event, has already run
// by the time this document-level listener sees it. Checking `event.defaultPrevented`
// first is therefore sufficient to never re-claim (or interfere with) an already-handled
// drag — no MIME sniffing needed here (W9/REQ-9).
export function installDropGuard(doc: Document): void {
  doc.addEventListener("dragover", (event) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
  });

  doc.addEventListener("drop", (event) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
  });
}
