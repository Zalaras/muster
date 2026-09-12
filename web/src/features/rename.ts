// The mainhead's rename editor and the shared getSession/onCommit pair every tile's own
// editor uses (plan code-breakup vocabulary: "rename"; plan ui-text-and-focus REQ-13/14).
// `deps.focus.nameEl` is the one thing this module needs from `focus.ts` — attached once,
// here, at startup, unlike a tile's editor, which `render/tiles.ts`'s `buildTile` attaches
// per tile using `tileRenameHandlers` below.
import type { App } from "../app";
import { putTitle } from "../api";
import { attachRenameEditor, type RenameEditorController } from "../render/rename";
import type { TileRenameHandlers } from "../render/tiles";
import type { TitleCommand } from "../sessions/rename";

export interface RenameHandle {
  /** The shared pair every tile's own editor adapts into its per-tile shape
   * (`render/tiles.ts`'s `buildTile`). */
  readonly tileRenameHandlers: TileRenameHandlers;
}

// W6/INV-4: structural, not a sibling import of FocusHandle from the focus module —
// this module only ever touches focus's `nameEl`.
export function initRename(app: App, deps: { focus: { nameEl: HTMLElement } }): RenameHandle {
  /** REQ-13/REQ-14: the one `putTitle` dispatcher both the mainhead's editor and every
   * tile's editor route through — fire-and-forget; the resulting `sessionUpsert` (or
   * nothing, on a failed request) drives the redraw, never a locally-typed title. */
  function handleRenameCommit(id: number, command: TitleCommand): void {
    const title = command.kind === "set" ? command.title : null;
    void putTitle(id, title).then((result) => {
      if (!result.ok)
        console.error(
          `PUT /api/sessions/${id}/title failed: ${result.error.code} ${result.error.message}`,
        );
    });
  }

  const mainheadRename: RenameEditorController = attachRenameEditor(deps.focus.nameEl, {
    getSession: () => app.store.values().find((s) => s.id === app.state.focusedId) ?? null,
    onCommit: handleRenameCommit,
  });

  const tileRenameHandlers: TileRenameHandlers = {
    getSession: (id) => app.store.values().find((s) => s.id === id) ?? null,
    onCommit: handleRenameCommit,
  };

  // review m4-reconcile Critical 1 / ui-text-and-focus: cancels the mainhead's open
  // rename editor, with no request sent either way, on every trigger that must not let a
  // blur-driven commit through — a disconnect, a `view` change arriving over the wire, or
  // a direct mousedown on the Focus/Tiles masthead buttons (views.ts's own guard).
  app.on("cancelRenames", () => mainheadRename.cancel());
  app.on("status", () => mainheadRename.cancel());
  // focusChanged: today's `setFocusedId` always cancelled the mainhead editor first.
  app.on("focusChanged", () => mainheadRename.cancel());

  return { tileRenameHandlers };
}
