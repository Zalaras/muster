// Stop/Resume/Remove/Pin dispatcher, their confirm dialogs, and the dead-pane snapshot
// cache (kb:adr/process-one-name-per-feature: "actions"). Every mainhead,
// rail card, tile footer and dead-surface cap routes through `dispatch`. This module
// carries no dead-surface API of its own — `features/focus.ts` and `features/tiles.ts`
// each hand `surfaces.select` their own `deadSurfaceRefsFor` lookup directly, since each
// is the only one that knows what a dead surface looks like in its own view.
import type { App } from "../app";
import {
  endSession,
  endSessions,
  fetchPane,
  pinSession,
  removeSession,
  removeSessions,
  resumeSession,
} from "../api/sessions";
import { requireElement } from "../dom";
import { renderActionError } from "../render/actionerror";
import { initConfirmDialogs, type ConfirmDialogs } from "../render/confirm";
import type { ApiResult } from "../api/http";
import type { BatchResult } from "../protocol/batch";
import {
  END_CONFIRM_LABEL,
  END_DIALOG_TITLE,
  endDialogBody,
  REMOVE_CONFIRM_LABEL,
  REMOVE_DIALOG_TITLE,
  removeDialogBody,
} from "./actionscopy";
import { batchPlan } from "./batchplan";
import {
  batchReport,
  removeManyBody,
  removeManyConfirm,
  removeManyTitle,
  stopManyBody,
  stopManyConfirm,
  stopManyTitle,
} from "./groupscopy";
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

/** Where a batch came from: a rail selection, or one group's Stop all… (whose dialog adds that
 * the group stays). */
export type BatchOrigin = "selection" | "group";

export interface ActionsHandle {
  dispatch(action: SessionAction, id: number): void;
  /** The batch Stop / Remove (kb:adr/actions-bulk-stop-remove-are-daemon-batches): confirms with
   * the count, then one daemon call covers every id; a partial result is reported in the
   * action-error line, and the resulting upserts and removals reach the rail by their own
   * broadcasts. */
  dispatchMany(action: "end" | "remove", ids: readonly number[], origin: BatchOrigin): void;
  /** The one writer of `#action-error`: another controller's failed daemon call (a group move, a
   * rename) shows its message here, and its next success clears it. `null` clears. */
  showError(message: string | null): void;
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

  /** The one path that touches `#action-error` — a failed Stop/Resume/Remove
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

  // Whether the confirm dialog now open was opened for a batch. Written by `dispatch` and
  // `dispatchMany` as they open it, read by the confirm handlers.
  let confirmingBatch = false;

  /** The batch's one outcome path: a failed request shows its error; an answered one shows the
   * partial-result phrase, or clears the line when it did everything. */
  function settleBatch(result: ApiResult<BatchResult>): void {
    showActionError(result.ok ? batchReport(result.value) : result.error.message);
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
    confirmingBatch = false;
    if (action === "end") {
      confirmDialogs.openEnd({
        ids: [id],
        title: END_DIALOG_TITLE,
        body: endDialogBody(session),
        confirmLabel: END_CONFIRM_LABEL,
      });
    } else if (action === "remove") {
      confirmDialogs.openRemove({
        ids: [id],
        title: REMOVE_DIALOG_TITLE,
        body: removeDialogBody(session),
        confirmLabel: REMOVE_CONFIRM_LABEL,
      });
    } else if (action === "pin") {
      doPin(session.id, !session.pinned);
    } else {
      void doResume(id);
    }
  }

  function dispatchMany(
    action: "end" | "remove",
    ids: readonly number[],
    origin: BatchOrigin,
  ): void {
    const plan = batchPlan(action, ids, app.store.values());
    if (plan === null) return;
    confirmingBatch = true;
    if (action === "end") {
      confirmDialogs.openEnd({
        ids: plan.ids,
        title: stopManyTitle(plan.ids.length),
        body: stopManyBody(origin === "group"),
        confirmLabel: stopManyConfirm(plan.ids.length),
      });
      return;
    }
    confirmDialogs.openRemove({
      ids: plan.ids,
      title: removeManyTitle(plan.ids.length),
      body: removeManyBody(plan.live),
      confirmLabel: removeManyConfirm(plan.ids.length),
    });
  }

  const confirmDialogs: ConfirmDialogs = initConfirmDialogs(
    {
      endDialog: requireElement<HTMLDialogElement>("#end-dialog"),
      endTitle: requireElement<HTMLElement>("#end-dialog-title"),
      endBody: requireElement<HTMLElement>("#end-dialog-body"),
      endConfirmBtn: requireElement<HTMLButtonElement>("#end-confirm-button"),
      endCancelBtn: requireElement<HTMLButtonElement>("#end-cancel-button"),
      removeDialog: requireElement<HTMLDialogElement>("#remove-dialog"),
      removeTitle: requireElement<HTMLElement>("#remove-dialog-title"),
      removeBody: requireElement<HTMLElement>("#remove-dialog-body"),
      removeConfirmBtn: requireElement<HTMLButtonElement>("#remove-confirm-button"),
      removeCancelBtn: requireElement<HTMLButtonElement>("#remove-cancel-button"),
    },
    {
      onConfirmEnd: (ids) => {
        if (confirmingBatch) void endSessions(ids).then(settleBatch);
        else if (ids[0] !== undefined) doEnd(ids[0]);
      },
      onConfirmRemove: (ids) => {
        if (confirmingBatch) void removeSessions(ids).then(settleBatch);
        else if (ids[0] !== undefined) doRemove(ids[0]);
      },
    },
  );

  // Any non-connected status (disconnected, daemon down) closes an open confirm dialog,
  // so a stale Stop/Remove confirmation can't be actioned against a dropped connection.
  app.on("status", () => confirmDialogs.closeAll());

  return {
    dispatch,
    dispatchMany,
    showError: showActionError,
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
