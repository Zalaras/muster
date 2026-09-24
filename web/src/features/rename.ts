// The shared getSession/onCommit pair every rename editor uses — the mainhead's
// (features/focus.ts) and every tile's (features/tiles.ts's `render/tiles.ts`'s
// `buildTile`). This module holds no editor of its own and touches no DOM: each host
// attaches its own `render/rename.ts` editor(s) directly, using the handlers here.
import type { App } from "../app";
import { putTitle } from "../api/sessions";
import type { RenameEditorHandlers } from "../render/rename";
import type { TileRenameHandlers } from "../render/tiles";
import type { TitleCommand } from "../sessions/rename";

export interface RenameHandle {
  /** The shared pair every tile's own editor adapts into its per-tile shape
   * (`render/tiles.ts`'s `buildTile`). */
  readonly tileRenameHandlers: TileRenameHandlers;
  /** The mainhead's own getSession/onCommit pair — `features/focus.ts` attaches its one
   * editor with this directly. */
  readonly mainheadRenameHandlers: RenameEditorHandlers;
}

export function initRename(app: App): RenameHandle {
  /** The one `putTitle` dispatcher both the mainhead's editor and every tile's editor
   * route through — fire-and-forget; the resulting `sessionUpsert` (or nothing, on a
   * failed request) drives the redraw, never a locally-typed title
   * (kb:adr/rename-muster-owned-title-override-wins). */
  function handleRenameCommit(id: number, command: TitleCommand): void {
    const title = command.kind === "set" ? command.title : null;
    void putTitle(id, title);
  }

  const tileRenameHandlers: TileRenameHandlers = {
    getSession: (id) => app.store.values().find((s) => s.id === id) ?? null,
    onCommit: handleRenameCommit,
  };

  const mainheadRenameHandlers: RenameEditorHandlers = {
    getSession: () => app.store.values().find((s) => s.id === app.state.focusedId) ?? null,
    onCommit: handleRenameCommit,
  };

  return { tileRenameHandlers, mainheadRenameHandlers };
}
