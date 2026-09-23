// The opaque signal that marks an in-progress browser drag as "one of muster's own
// reorder drags" (rail cards, tiles) rather than a foreign drop (a dragged file, or
// text) — render/dragreorder.ts sets it on dragstart, terminal/pane.ts checks for its
// presence to bail out of a drag crossing over a live terminal without claiming it as a
// file drop, rather than treating it as a foreign text drop (a plain "text/plain" MIME
// would be indistinguishable from a real dragged text selection, which uses that exact
// same standard type). Nothing reads the *value* stored under this MIME — the drop
// handler resolves the dragged id from its own module state instead — so the string
// itself is opaque and only its presence in `dataTransfer.types` is ever checked.
// Neither module owns the other, so the constant lives at the top level instead of
// inside either one's directory, matching dom.ts/theme.ts/shortcuts.ts's existing
// top-level-leaf shape.
export const DRAG_MIME = "application/x-muster-drag-id";
