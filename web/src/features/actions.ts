// End/Resume/Remove/Pin dispatcher, their confirm dialogs, and the dead-pane snapshot
// cache (plan code-breakup vocabulary: "actions"; plan m4-reconcile). Every mainhead,
// rail card, tile footer and dead-surface cap routes through `dispatch`.
//
// `deps.focusDeadSurfaceRefs`/`deps.tileBodySlot` are lazy thunks, not eager values:
// `actions` is constructed before `focus`/`tiles` exist (main.ts's init order — both of
// them depend on `actions`, e.g. for `dispatch`/`ensurePaneFetch`), so main.ts passes
// `() => focus.deadSurfaceRefs` / `(id) => tiles.bodySlotFor(id)` closures that only
// resolve the real `const` when `findDeadSurfaceRefs` is actually called, well after
// every controller has finished construction (never during it).
import type { App } from "../app";
import { endSession, pinSession, removeSession, resumeSession } from "../api";
import { requireElement } from "../dom";
import {
  collectDeadSurfaceRefs,
  loadPane,
  type DeadSurfaceRefs,
  type PaneState,
} from "../render/dead";
import { initConfirmDialogs, type ConfirmDialogs } from "../render/confirm";
import type { SessionAction } from "../render/sessions";
import type { Session } from "../protocol";

export interface ActionsDeps {
  focusDeadSurfaceRefs(): DeadSurfaceRefs;
  tileBodySlot(id: number): HTMLElement | null;
}

export interface ActionsHandle {
  dispatch(action: SessionAction, id: number): void;
  /** Edge case 8: session-focusing shortcuts no-op while a modal `<dialog>` other than
   * the launch dialog is open. */
  isBlockingDialogOpen(): boolean;
  /** Review plain-terminal-session Major 1: locates the dead surface currently
   * displayed for `id`'s `claude` segment, if any, for routing a spawn-failure notice. */
  findDeadSurfaceRefs(id: number): DeadSurfaceRefs | null;
  ensurePaneFetch(id: number): void;
  paneState(id: number): PaneState;
  /** REQ-15: strips a removed session from the store and fans out `sessionRemoved` to
   * every other feature's own cleanup, then renders. Called from the WS `sessionRemoved`
   * message and from a successful `DELETE /api/sessions/:id`. */
  handleRemoved(id: number): void;
}

export function initActions(app: App, deps: ActionsDeps): ActionsHandle {
  const deadPaneCache = new Map<number, PaneState>();
  const previousAlive = new Map<number, boolean>();

  function ensurePaneFetch(id: number): void {
    if (deadPaneCache.has(id)) return;
    deadPaneCache.set(id, { status: "loading" });
    void loadPane(id).then((state) => {
      deadPaneCache.set(id, state);
      app.render();
    });
  }

  function paneState(id: number): PaneState {
    return deadPaneCache.get(id) ?? { status: "loading" };
  }

  /** Prunes the dead-pane tracking maps to the current session id set, then invalidates
   * any cache entry whose session just transitioned alive -> dead this pass. */
  /** Drops both per-session maps' entries for sessions the store no longer carries, so a
   * removed id cannot leak a stale liveness flag or a stale captured pane. */
  function forgetSessionsNotIn(ids: ReadonlySet<number>): void {
    for (const id of previousAlive.keys()) {
      if (!ids.has(id)) previousAlive.delete(id);
    }
    for (const id of deadPaneCache.keys()) {
      if (!ids.has(id)) deadPaneCache.delete(id);
    }
  }

  function updateDeadPaneTracking(sessions: readonly Session[]): void {
    forgetSessionsNotIn(new Set(sessions.map((s) => s.id)));
    for (const session of sessions) {
      const wasAlive = previousAlive.get(session.id);
      if (wasAlive === true && !session.alive) deadPaneCache.delete(session.id);
      previousAlive.set(session.id, session.alive);
    }
  }
  // Render phase 1 (UI Specifications > Render phase order).
  app.onRender((frame) => updateDeadPaneTracking(frame.sessions));

  function handleRemoved(id: number): void {
    app.store.remove(id);
    app.emit("sessionRemoved", id);
    app.render();
  }
  app.on("sessionRemoved", (removedId) => {
    deadPaneCache.delete(removedId);
    previousAlive.delete(removedId);
  });

  /** Fire-and-forget, no optimistic state — the resulting `sessionUpsert`s (or nothing,
   * on a failed request) drive the redraw. */
  function doPin(id: number, pinned: boolean): void {
    void pinSession(id, pinned).then((result) => {
      if (!result.ok)
        console.error(
          `PUT /api/sessions/${id}/pin failed: ${result.error.code} ${result.error.message}`,
        );
    });
  }

  function doEnd(id: number): void {
    void endSession(id).then((result) => {
      if (!result.ok) {
        console.error(
          `POST /api/sessions/${id}/end failed: ${result.error.code} ${result.error.message}`,
        );
        return;
      }
      app.store.upsert(result.value);
      app.render();
    });
  }

  async function doResume(id: number): Promise<void> {
    const result = await resumeSession(id);
    if (!result.ok) {
      console.error(
        `POST /api/sessions/${id}/resume failed: ${result.error.code} ${result.error.message}`,
      );
      return;
    }
    app.store.upsert(result.value);
    app.render();
  }

  function doRemove(id: number): void {
    void removeSession(id).then((result) => {
      if (!result.ok) {
        console.error(
          `DELETE /api/sessions/${id} failed: ${result.error.code} ${result.error.message}`,
        );
        return;
      }
      handleRemoved(id);
    });
  }

  function dispatch(action: SessionAction, id: number): void {
    const session = app.store.values().find((s) => s.id === id);
    if (!session) return;
    if (action === "end") {
      confirmDialogs.openEnd(session);
    } else if (action === "remove") {
      confirmDialogs.openRemove(session);
    } else if (action === "pin") {
      doPin(session.id, !session.pinned);
    } else {
      void doResume(id);
    }
  }

  const confirmDialogs: ConfirmDialogs = initConfirmDialogs(
    {
      endDialog: requireElement<HTMLDialogElement>("#end-dialog"),
      endBody: requireElement<HTMLElement>("#end-dialog-body"),
      endConfirmBtn: requireElement<HTMLButtonElement>("#end-confirm-button"),
      endCancelBtn: requireElement<HTMLButtonElement>("#end-cancel-button"),
      removeDialog: requireElement<HTMLDialogElement>("#remove-dialog"),
      removeBody: requireElement<HTMLElement>("#remove-dialog-body"),
      removeConfirmBtn: requireElement<HTMLButtonElement>("#remove-confirm-button"),
      removeCancelBtn: requireElement<HTMLButtonElement>("#remove-cancel-button"),
    },
    {
      onConfirmEnd: doEnd,
      onConfirmRemove: doRemove,
    },
  );

  // States (m4-reconcile): "Daemon down ... Dialogs, if open, close."
  app.on("status", () => confirmDialogs.closeAll());

  return {
    dispatch,
    isBlockingDialogOpen() {
      return Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]")).some(
        (dialog) => dialog.id !== "launch-dialog",
      );
    },
    findDeadSurfaceRefs(id) {
      if (app.state.view === "focus" && app.state.focusedId === id)
        return deps.focusDeadSurfaceRefs();
      const tileDeadEl = deps.tileBodySlot(id)?.querySelector<HTMLElement>(".dead-surface") ?? null;
      return tileDeadEl ? collectDeadSurfaceRefs(tileDeadEl) : null;
    },
    ensurePaneFetch,
    paneState,
    handleRemoved,
  };
}
