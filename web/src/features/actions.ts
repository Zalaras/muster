// End/Resume/Remove/Pin dispatcher, their confirm dialogs, and the dead-pane snapshot
// cache (plan code-breakup vocabulary: "actions"; plan m4-reconcile). Every mainhead,
// rail card, tile footer and dead-surface cap routes through `dispatch`.
//
// `deps.getFocusDeadSurfaceRefs`/`deps.getTileDeadSurfaceRefs` are lazy thunks, not eager
// values: `actions` is constructed before `focus`/`tiles` exist (main.ts's init order —
// both of them depend on `actions`, e.g. for `dispatch`/`ensurePaneFetch`), so main.ts
// passes `(id) => focus.deadSurfaceRefsFor(id)` / `(id) => tiles.deadSurfaceRefsFor(id)`
// closures that only resolve the real `const` when `findDeadSurfaceRefs` is actually
// called, well after every controller has finished construction (never during it). Review
// Major 9: each closure asks the view that owns the markup, rather than this module
// querying a tile's `.dead-surface` itself — `focus`/`tiles` are the only two places that
// know what a dead surface looks like in their own view.
import type { App } from "../app";
import { endSession, fetchPane, pinSession, removeSession, resumeSession } from "../api/sessions";
import { requireElement } from "../dom";
import type { DeadSurfaceRefs, PaneState } from "../render/dead";
import { renderActionError } from "../render/actionerror";
import { initConfirmDialogs, type ConfirmDialogs } from "../render/confirm";
import { endDialogBody, removeDialogBody } from "./actionscopy";
import type { SessionAction } from "../sessions/card";
import type { Session } from "../protocol/session";

/** Review seed B8: `render/dead.ts` used to also own this fetch trigger — DOM builders
 * take data in, they don't go fetch it. Wraps `GET /api/sessions/{id}/pane` into the
 * three-state `PaneState` `render/dead.ts`'s `renderDeadSurface` takes. `no_snapshot` (and,
 * defensively, any other error) both read as "missing" — the dead surface never
 * distinguishes a genuine no-capture-yet from an unexpected error, it just shows the
 * honest "no snapshot captured" text either way (edge case 13). */
export async function loadPane(id: number): Promise<PaneState> {
  const result = await fetchPane(id);
  if (result.ok)
    return { status: "ok", text: result.value.text, capturedAt: result.value.capturedAt };
  return { status: "missing" };
}

export interface ActionsDeps {
  /** `null` unless `id` is currently shown as Focus's dead surface. */
  getFocusDeadSurfaceRefs(id: number): DeadSurfaceRefs | null;
  /** `null` unless `id` currently has a dead tile mounted. */
  getTileDeadSurfaceRefs(id: number): DeadSurfaceRefs | null;
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
  const actionErrorEl = requireElement<HTMLElement>("#action-error");

  /** REQ-17/W2: the one path that touches `#action-error` — a failed End/Resume/Remove
   * writes its message, the next successful one of the three clears it. */
  function showActionError(message: string | null): void {
    renderActionError(actionErrorEl, message);
  }

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
  // http.ts's `logApiFailure` already logs a failed request under its own route (e-m5);
  // this module's job is only `showActionError`'s UI-visible half.
  function doPin(id: number, pinned: boolean): void {
    void pinSession(id, pinned);
  }

  function doEnd(id: number): void {
    void endSession(id).then((result) => {
      if (!result.ok) {
        showActionError(result.error.message);
        return;
      }
      showActionError(null);
      app.store.upsert(result.value);
      app.render();
    });
  }

  async function doResume(id: number): Promise<void> {
    const result = await resumeSession(id);
    if (!result.ok) {
      showActionError(result.error.message);
      return;
    }
    showActionError(null);
    app.store.upsert(result.value);
    app.render();
  }

  function doRemove(id: number): void {
    void removeSession(id).then((result) => {
      if (!result.ok) {
        showActionError(result.error.message);
        return;
      }
      showActionError(null);
      handleRemoved(id);
    });
  }

  function dispatch(action: SessionAction, id: number): void {
    const session = app.store.values().find((s) => s.id === id);
    if (!session) return;
    if (action === "end") {
      confirmDialogs.openEnd(session, endDialogBody(session, new Date()));
    } else if (action === "remove") {
      confirmDialogs.openRemove(session, removeDialogBody(session, new Date()));
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
      return deps.getFocusDeadSurfaceRefs(id) ?? deps.getTileDeadSurfaceRefs(id);
    },
    ensurePaneFetch,
    paneState,
    handleRemoved,
  };
}
