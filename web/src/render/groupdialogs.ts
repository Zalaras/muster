// The two group dialogs: Delete group… (what happens to its sessions) and New group from a
// selection (the one place a group is named in a dialog, because its sessions already exist —
// kb:adr/rail-new-group-is-named-before-it-exists). Elements and handlers in, a controller out —
// `render/confirm.ts`'s shape. DOM and form wiring only: features/groupsdialogs.ts composes the text
// (`features/groupscopy.ts`), decides what a confirm sends and handles the daemon's answer.
//
// Both are modal `<dialog>`s, so the browser's own Escape-cancels-a-modal behaviour needs no code
// here, and `features/actions.ts`'s `isBlockingDialogOpen` already counts them (the shortcuts stay
// inert while one is open).
import { fillOptions } from "./options";

/** A group the sessions of a deleted one can move to. */
export interface DeleteTarget {
  id: number;
  name: string;
}

export type DeleteChoiceValue = "ungroup" | "move" | "remove";

export interface DeleteGroupElements {
  dialog: HTMLDialogElement;
  title: HTMLElement;
  body: HTMLElement;
  choices: HTMLElement;
  radios: Record<DeleteChoiceValue, HTMLInputElement>;
  labels: Record<DeleteChoiceValue, HTMLElement>;
  hints: Record<DeleteChoiceValue, HTMLElement>;
  /** The whole "another group" row — absent (not just disabled) when no other group exists. */
  moveRow: HTMLElement;
  target: HTMLSelectElement;
  confirmBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
}

export interface DeleteGroupRequest {
  title: string;
  body: string;
  confirmLabel: string;
  labels: Record<DeleteChoiceValue, { label: string; hint: string }>;
  /** The group has members, so there is a choice to make; false is the single-line empty case. */
  hasMembers: boolean;
  targets: readonly DeleteTarget[];
  connected: boolean;
}

export interface DeleteGroupHandlers {
  /** `to` is the target group's id, present only for `move`. */
  onConfirm: (choice: DeleteChoiceValue, to: number | null) => void;
}

export interface DeleteGroupDialog {
  open: (request: DeleteGroupRequest) => void;
  close: () => void;
}

const CHOICES: readonly DeleteChoiceValue[] = ["ungroup", "move", "remove"];

function fillTargets(select: HTMLSelectElement, targets: readonly DeleteTarget[]): void {
  fillOptions(
    select,
    targets.map((t) => ({ value: String(t.id), label: t.name })),
  );
}

export function initDeleteGroupDialog(
  elements: DeleteGroupElements,
  handlers: DeleteGroupHandlers,
): DeleteGroupDialog {
  elements.cancelBtn.addEventListener("click", () => elements.dialog.close());
  elements.confirmBtn.addEventListener("click", () => {
    const choice = CHOICES.find((c) => elements.radios[c].checked) ?? "ungroup";
    const to = choice === "move" ? Number(elements.target.value) : null;
    elements.dialog.close();
    handlers.onConfirm(choice, to !== null && Number.isFinite(to) ? to : null);
  });
  // Picking a target is choosing to move: the select sits beside its radio, not inside its label.
  elements.target.addEventListener("focus", () => {
    elements.radios.move.checked = true;
  });

  return {
    open(request) {
      elements.title.textContent = request.title;
      elements.body.textContent = request.body;
      elements.confirmBtn.textContent = request.confirmLabel;
      elements.confirmBtn.disabled = !request.connected;
      elements.choices.hidden = !request.hasMembers;
      for (const choice of CHOICES) {
        elements.labels[choice].textContent = request.labels[choice].label;
        elements.hints[choice].textContent = request.labels[choice].hint;
        elements.radios[choice].checked = choice === "ungroup";
      }
      elements.moveRow.hidden = request.targets.length === 0;
      fillTargets(elements.target, request.targets);
      if (!elements.dialog.open) elements.dialog.showModal();
    },
    close() {
      if (elements.dialog.open) elements.dialog.close();
    },
  };
}

export interface NewGroupElements {
  dialog: HTMLDialogElement;
  title: HTMLElement;
  form: HTMLFormElement;
  input: HTMLInputElement;
  error: HTMLElement;
  createBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
}

export interface NewGroupRequest {
  title: string;
  /** Creates the group; resolves to the daemon's refusal message, or `null` when it was created
   * (the dialog then closes). Only ever called with a non-empty, trimmed name. */
  submit: (name: string) => Promise<string | null>;
}

export interface NewGroupDialog {
  open: (request: NewGroupRequest) => void;
  close: () => void;
}

export function initNewGroupDialog(elements: NewGroupElements): NewGroupDialog {
  let submit: NewGroupRequest["submit"] | null = null;
  let sending = false;

  function showError(message: string | null): void {
    elements.error.textContent = message ?? "";
    elements.error.hidden = message === null;
  }

  elements.cancelBtn.addEventListener("click", () => elements.dialog.close());
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = elements.input.value.trim();
    if (name === "" || sending || !submit) {
      elements.input.focus();
      return;
    }
    sending = true;
    elements.createBtn.disabled = true;
    void submit(name).then((refusal) => {
      sending = false;
      elements.createBtn.disabled = false;
      if (refusal === null) elements.dialog.close();
      else showError(refusal);
    });
  });
  elements.input.addEventListener("input", () => showError(null));

  return {
    open(request) {
      submit = request.submit;
      sending = false;
      elements.createBtn.disabled = false;
      elements.title.textContent = request.title;
      elements.input.value = "";
      showError(null);
      if (!elements.dialog.open) elements.dialog.showModal();
      elements.input.focus();
    },
    close() {
      if (elements.dialog.open) elements.dialog.close();
    },
  };
}
