// The Stop/Remove confirm dialogs (kb:adr/actions-placement-mainhead-and-card-rows) — two
// `<dialog>` elements modelled on features/launch.ts's `#launch-dialog` (same
// `showModal()`/`close()` pattern, same reliance on the browser's own native
// Escape-cancels-a-modal-dialog behaviour, which needs no code here to satisfy). DOM +
// wiring only: the actual Stop/Remove HTTP calls are features/actions.ts's dispatcher's job
// (it owns the session store and decides what happens next), which also composes each
// dialog's title, body and confirm label (`features/actionscopy.ts`'s single-session copy and
// `features/groupscopy.ts`'s batch copy — DOM-free decisions with one controller caller, so they
// live beside it, not here) and passes them in. One dialog serves one session or a batch
// (kb:adr/actions-bulk-stop-remove-are-daemon-batches): it holds the ids it was opened for and
// hands them back whole.

export interface ConfirmDialogElements {
  endDialog: HTMLDialogElement;
  endTitle: HTMLElement;
  endBody: HTMLElement;
  endConfirmBtn: HTMLButtonElement;
  endCancelBtn: HTMLButtonElement;
  removeDialog: HTMLDialogElement;
  removeTitle: HTMLElement;
  removeBody: HTMLElement;
  removeConfirmBtn: HTMLButtonElement;
  removeCancelBtn: HTMLButtonElement;
}

export interface ConfirmDialogHandlers {
  onConfirmEnd: (ids: readonly number[]) => void;
  onConfirmRemove: (ids: readonly number[]) => void;
}

/** What one open of a confirm dialog shows and acts on. */
export interface ConfirmRequest {
  ids: readonly number[];
  title: string;
  body: string;
  confirmLabel: string;
}

export interface ConfirmDialogs {
  openEnd: (request: ConfirmRequest) => void;
  openRemove: (request: ConfirmRequest) => void;
  /** States: "Daemon down ... Dialogs, if open, close." */
  closeAll: () => void;
}

interface DialogParts {
  dialog: HTMLDialogElement;
  title: HTMLElement;
  body: HTMLElement;
  confirmBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
}

/** Wires one dialog's buttons once and returns its `open`. The ids live in this closure, so a
 * confirm acts on exactly what the dialog was last opened for. */
function wireDialog(
  parts: DialogParts,
  onConfirm: (ids: readonly number[]) => void,
): (request: ConfirmRequest) => void {
  let targetIds: readonly number[] = [];
  parts.cancelBtn.addEventListener("click", () => parts.dialog.close());
  parts.confirmBtn.addEventListener("click", () => {
    const ids = targetIds;
    parts.dialog.close();
    if (ids.length > 0) onConfirm(ids);
  });
  return (request) => {
    targetIds = request.ids;
    parts.title.textContent = request.title;
    parts.body.textContent = request.body;
    parts.confirmBtn.textContent = request.confirmLabel;
    if (!parts.dialog.open) parts.dialog.showModal();
  };
}

export function initConfirmDialogs(
  elements: ConfirmDialogElements,
  handlers: ConfirmDialogHandlers,
): ConfirmDialogs {
  const openEnd = wireDialog(
    {
      dialog: elements.endDialog,
      title: elements.endTitle,
      body: elements.endBody,
      confirmBtn: elements.endConfirmBtn,
      cancelBtn: elements.endCancelBtn,
    },
    handlers.onConfirmEnd,
  );
  const openRemove = wireDialog(
    {
      dialog: elements.removeDialog,
      title: elements.removeTitle,
      body: elements.removeBody,
      confirmBtn: elements.removeConfirmBtn,
      cancelBtn: elements.removeCancelBtn,
    },
    handlers.onConfirmRemove,
  );

  return {
    openEnd,
    openRemove,
    closeAll() {
      if (elements.endDialog.open) elements.endDialog.close();
      if (elements.removeDialog.open) elements.removeDialog.close();
    },
  };
}
