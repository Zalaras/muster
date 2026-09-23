// REQ-14 (plan m4-reconcile): the End/Remove confirm dialogs — two `<dialog>` elements
// modelled on features/launch.ts's `#launch-dialog` (same `showModal()`/`close()` pattern,
// same reliance on the browser's own native Escape-cancels-a-modal-dialog behaviour, which
// needs no code here to satisfy). DOM + wiring only: the actual End/Remove HTTP calls are
// features/actions.ts's dispatcher's job (it owns the session store and decides what
// happens next), which also composes each dialog's body text
// (`features/actionscopy.ts`'s `endDialogBody`/`removeDialogBody` — review seed B7: that
// copy composition is a DOM-free decision with one controller caller, so it lives beside
// it, not here) and passes it in.
import type { Session } from "../protocol/session";

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
  openEnd: (session: Session, bodyText: string) => void;
  openRemove: (session: Session, bodyText: string) => void;
  /** States: "Daemon down ... Dialogs, if open, close." */
  closeAll: () => void;
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
    openEnd(session, bodyText) {
      endTargetId = session.id;
      elements.endBody.textContent = bodyText;
      if (!elements.endDialog.open) elements.endDialog.showModal();
    },
    openRemove(session, bodyText) {
      removeTargetId = session.id;
      elements.removeBody.textContent = bodyText;
      if (!elements.removeDialog.open) elements.removeDialog.showModal();
    },
    closeAll() {
      if (elements.endDialog.open) elements.endDialog.close();
      if (elements.removeDialog.open) elements.removeDialog.close();
    },
  };
}
