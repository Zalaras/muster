// End/Resume/Remove/Pin dispatcher, their confirm dialogs, and the dead-pane snapshot
// cache (kb:adr/process-one-name-per-feature: "actions"). Every mainhead,
// rail card, tile footer and dead-surface cap routes through `dispatch`. This module
// carries no dead-surface API of its own — `features/focus.ts` and `features/tiles.ts`
// each hand `surfaces.select` their own `deadSurfaceRefsFor` lookup directly, since each
// is the only one that knows what a dead surface looks like in its own view.
import type { App } from "../app";
import { endSession, fetchPane, pinSession, removeSession, resumeSession } from "../api/sessions";
import { requireElement } from "../dom";
import { renderActionError } from "../render/actionerror";
import { initConfirmDialogs, type ConfirmDialogs } from "../render/confirm";
import { endDialogBody, removeDialogBody } from "./actionscopy";
import type { PaneState, SessionAction } from "../sessions/card";
import type { Session } from "../protocol/session";

/** DOM builders take data in, they don't go fetch it, so this fetch trigger lives here,
 * not in `render/dead.ts`. Wraps `GET /api/sessions/{id}/pane` into the
 * three-state `PaneState` `render/dead.ts`'s `renderDeadSurface` takes. `no_snapshot` (and,
 * defensively, any other error) both read as "missing" — the dead surface never
 * distinguishes a genuine no-capture-yet from an unexpected error, it just shows the
 * honest "no snapshot captured" text either way. */
export async function loadPane(id: number): Promise<PaneState> {
  const result = await fetchPane(id);
  if (result.ok)
    return { status: "ok", text: result.value.text, capturedAt: result.value.capturedAt };
  return { status: "missing" };
}

export interface ActionsHandle {
  dispatch(action: SessionAction, id: number): void;
  /** Session-focusing shortcuts no-op while a modal `<dialog>` other than
   * the launch dialog is open. */
  isBlockingDialogOpen(): boolean;
  ensurePaneFetch(id: number): void;
  paneState(id: number): PaneState;
  /** Strips a removed session from the store and fans out `sessionRemoved` to
   * every other feature's own cleanup, then renders. Called from the WS `sessionRemoved`
   * message and from a successful `DELETE /api/sessions/:id`. */
  handleRemoved(id: number): void;
}

export function initActions(app: App): ActionsHandle {
  const deadPaneCache = new Map<number, PaneState>();
  const previousAlive = new Map<number, boolean>();
  const actionErrorEl = requireElement<HTMLElement>("#action-error");

  /** The one path that touches `#action-error` — a failed End/Resume/Remove
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

  /** Prunes the dead-pane tracking maps to the current session id set, then invalidates
   * any cache entry whose session just transitioned alive -> dead this pass. */
  function updateDeadPaneTracking(sessions: readonly Session[]): void {
    forgetSessionsNotIn(new Set(sessions.map((s) => s.id)));
    for (const session of sessions) {
      const wasAlive = previousAlive.get(session.id);
      if (wasAlive === true && !session.alive) deadPaneCache.delete(session.id);
      previousAlive.set(session.id, session.alive);
    }
  }
  // Render phase 1 (main.ts's numbered render-phase order).
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
  // http.ts's `logApiFailure` already logs a failed request under its own route;
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
      confirmDialogs.openEnd(session, endDialogBody(session));
    } else if (action === "remove") {
      confirmDialogs.openRemove(session, removeDialogBody(session));
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

  // Any non-connected status (disconnected, daemon down) closes an open confirm dialog,
  // so a stale End/Remove confirmation can't be actioned against a dropped connection.
  app.on("status", () => confirmDialogs.closeAll());

  return {
    dispatch,
    isBlockingDialogOpen() {
      return Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]")).some(
        (dialog) => dialog.id !== "launch-dialog",
      );
    },
    ensurePaneFetch,
    paneState,
    handleRemoved,
  };
}
