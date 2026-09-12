// REQ-14 (plan m4-reconcile): the End/Remove confirm dialogs — two `<dialog>` elements
// modelled on features/launch.ts's `#launch-dialog` (same `showModal()`/`close()` pattern,
// same reliance on the browser's native Escape-cancels-a-modal-dialog behaviour, which
// needs no code here to satisfy). DOM + wiring only: the actual End/Remove HTTP calls are
// features/actions.ts's dispatcher's job (it owns the session store and decides what happens next).
import type { Session } from "../protocol";
import { buildCardViewModel } from "../sessions/card";

export interface ConfirmDialogElements {
  endDialog: HTMLDialogElement;
  endBody: HTMLElement;
  endConfirmBtn: HTMLButtonElement;
  endCancelBtn: HTMLButtonElement;
  removeDialog: HTMLDialogElement;
  removeBody: HTMLElement;
  removeConfirmBtn: HTMLButtonElement;
  removeCancelBtn: HTMLButtonElement;
}

export interface ConfirmDialogHandlers {
  onConfirmEnd: (id: number) => void;
  onConfirmRemove: (id: number) => void;
}

export interface ConfirmDialogs {
  openEnd: (session: Session) => void;
  openRemove: (session: Session) => void;
  /** States: "Daemon down ... Dialogs, if open, close." */
  closeAll: () => void;
}

function sessionLabel(session: Session, now: Date): string {
  const title = session.title ?? "untitled";
  return `${title} — ${buildCardViewModel(session, now).repoLine}`;
}

/** REQ-14's End dialog copy: names the session, says it stays as ended and can be
 * resumed. */
export function renderEndDialogBody(el: HTMLElement, session: Session, now: Date): void {
  el.textContent =
    `${sessionLabel(session, now)}. Kills the tmux pane and the claude inside it. The card stays in the rail ` +
    "as ended — Resume can pick the conversation back up if this was a slip.";
}

/** REQ-14's Remove dialog copy: it disappears and cannot be resumed from here, plus —
 * only when the target is still alive — "ends the session first" (E9's exact phrase). */
export function renderRemoveDialogBody(el: HTMLElement, session: Session, now: Date): void {
  const endsFirst = session.alive ? " This ends the session first." : "";
  el.textContent =
    `${sessionLabel(session, now)}.${endsFirst} Deletes it from Muster for good — the card disappears and it ` +
    "can no longer be resumed from here.";
}

export function initConfirmDialogs(
  elements: ConfirmDialogElements,
  handlers: ConfirmDialogHandlers,
): ConfirmDialogs {
  let endTargetId: number | null = null;
  let removeTargetId: number | null = null;

  elements.endCancelBtn.addEventListener("click", () => elements.endDialog.close());
  elements.endConfirmBtn.addEventListener("click", () => {
    const id = endTargetId;
    elements.endDialog.close();
    if (id !== null) handlers.onConfirmEnd(id);
  });

  elements.removeCancelBtn.addEventListener("click", () => elements.removeDialog.close());
  elements.removeConfirmBtn.addEventListener("click", () => {
    const id = removeTargetId;
    elements.removeDialog.close();
    if (id !== null) handlers.onConfirmRemove(id);
  });

  return {
    openEnd(session) {
      endTargetId = session.id;
      renderEndDialogBody(elements.endBody, session, new Date());
      if (!elements.endDialog.open) elements.endDialog.showModal();
    },
    openRemove(session) {
      removeTargetId = session.id;
      renderRemoveDialogBody(elements.removeBody, session, new Date());
      if (!elements.removeDialog.open) elements.removeDialog.showModal();
    },
    closeAll() {
      if (elements.endDialog.open) elements.endDialog.close();
      if (elements.removeDialog.open) elements.removeDialog.close();
    },
  };
}
