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

function wireDialog<T>(
  parts: DialogParts,
  onConfirm: (target: T) => void,
): (target: T, copy: Omit<ConfirmRequest, "ids">) => void {
  let held: { target: T } | null = null;
  parts.cancelBtn.addEventListener("click", () => parts.dialog.close());
  parts.confirmBtn.addEventListener("click", () => {
    const current = held;
    parts.dialog.close();
    if (current !== null) onConfirm(current.target);
  });
  return (target, copy) => {
    held = { target };
    parts.title.textContent = copy.title;
    parts.body.textContent = copy.body;
    parts.confirmBtn.textContent = copy.confirmLabel;
    if (!parts.dialog.open) parts.dialog.showModal();
  };
}

function wireIdsDialog(
  parts: DialogParts,
  onConfirm: (ids: readonly number[]) => void,
): (request: ConfirmRequest) => void {
  const open = wireDialog<readonly number[]>(parts, (ids) => {
    if (ids.length > 0) onConfirm(ids);
  });
  return (request) => open(request.ids, request);
}

export function initConfirmDialogs(
  elements: ConfirmDialogElements,
  handlers: ConfirmDialogHandlers,
): ConfirmDialogs {
  const openEnd = wireIdsDialog(
    {
      dialog: elements.endDialog,
      title: elements.endTitle,
      body: elements.endBody,
      confirmBtn: elements.endConfirmBtn,
      cancelBtn: elements.endCancelBtn,
    },
    handlers.onConfirmEnd,
  );
  const openRemove = wireIdsDialog(
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

export interface CloseTerminalDialogElements {
  dialog: HTMLDialogElement;
  title: HTMLElement;
  body: HTMLElement;
  confirmBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
}

export interface TerminalTarget {
  id: number;
  n: number;
}

export interface CloseTerminalDialog {
  open: (target: TerminalTarget, name: string) => void;
  closeIfOpen: () => void;
}

export function initCloseTerminalDialog(
  elements: CloseTerminalDialogElements,
  onConfirm: (target: TerminalTarget) => void,
): CloseTerminalDialog {
  const open = wireDialog<TerminalTarget>(elements, onConfirm);
  return {
    open(target, name) {
      open(target, {
        title: `Close ${name}?`,
        body: `${name} is running a command. Closing it ends the command.`,
        confirmLabel: "Close terminal",
      });
    },
    closeIfOpen() {
      if (elements.dialog.open) elements.dialog.close();
    },
  };
}
