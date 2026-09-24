// Plan auto-update, UI Specifications > Text rules: the Settings dialog's Updates section
// (`#settings-update`) plus the masthead Settings-button badge and the restart confirm's
// body. DOM only, mirroring render/confirm.ts's shape (elements in, handlers in, a
// controller out) for the restart confirm dialog specifically — a precedent reuse
// (docs/conventions.md's "precedent check for cross-cutting UI concerns"): the restart
// confirm is structurally the same "named session action confirm" concern End/Remove
// already solved (showModal()/close(), a body rebuilt from data, Confirm/Cancel wired to
// one target captured at open time). `UpdateViewModel` below is this module's render
// contract — `features/updateview.ts`'s `buildUpdateViewModel` is its one producer (review
// seed B7: that derivation is a DOM-free decision with one controller caller, so it lives
// beside `features/update.ts`, not here).
import type { RestartImpactShell } from "../api/update";

export interface UpdateViewModel {
  running: string;
  available: string;
  toggleDisabled: boolean;
  buttonsVisible: boolean;
  updateEnabled: boolean;
  restartEnabled: boolean;
  restartLabel: string;
  status: string;
  /** REQ-9/INV-6: `available != null && installed == null`. */
  badged: boolean;
  /** `aria-busy` on `#settings-update` while an apply phase is in flight. */
  busy: boolean;
  /** REQ-10 (plan rail-card-improvements-2): `Check now`'s own `disabled` state —
   * `update.canCheck` and no check of its own already in flight. Independent of
   * `prefs.updateCheck`/`updateEnabled` — a user-initiated check runs regardless of the
   * daily-check toggle (REQ-8). */
  checkEnabled: boolean;
  /** Whether this window's own `Check now` request is in flight — `aria-busy` on the
   * button, same shape as `busy` above for the apply buttons. */
  checkBusy: boolean;
}

export interface UpdateSectionElements {
  section: HTMLElement;
  runningEl: HTMLElement;
  availableEl: HTMLElement;
  toggle: HTMLInputElement;
  statusEl: HTMLElement;
  applyBtn: HTMLButtonElement;
  restartBtn: HTMLButtonElement;
  /** REQ-10 (plan rail-card-improvements-2): `#update-check-button`, the first child of
   * `.update-actions` (Testable UI Elements). */
  checkBtn: HTMLButtonElement;
}

/** Applies one `UpdateViewModel` to the Updates section's DOM. Never writes
 * `toggle.checked` (see the field's own doc comment) — only its `disabled` state, which
 * (unlike `checked`) depends on `install`, something only this view model carries. */
export function renderUpdateSection(elements: UpdateSectionElements, vm: UpdateViewModel): void {
  elements.runningEl.textContent = vm.running;
  elements.availableEl.textContent = vm.available;
  elements.toggle.disabled = vm.toggleDisabled;
  elements.statusEl.textContent = vm.status;
  elements.applyBtn.hidden = !vm.buttonsVisible;
  elements.restartBtn.hidden = !vm.buttonsVisible;
  elements.applyBtn.disabled = !vm.updateEnabled;
  elements.restartBtn.disabled = !vm.restartEnabled;
  elements.restartBtn.textContent = vm.restartLabel;
  elements.checkBtn.disabled = !vm.checkEnabled;
  if (vm.checkBusy) {
    elements.checkBtn.setAttribute("aria-busy", "true");
  } else {
    elements.checkBtn.removeAttribute("aria-busy");
  }
  if (vm.busy) {
    elements.section.setAttribute("aria-busy", "true");
  } else {
    elements.section.removeAttribute("aria-busy");
  }
}

/** REQ-9: the masthead Settings button's badge dot plus its accessible name/data
 * attribute — `#settings-button .update-dot` (aria-hidden, so never located by role). */
export function renderSettingsBadge(button: HTMLButtonElement, badged: boolean): void {
  const dot = button.querySelector<HTMLElement>(".update-dot");
  if (badged) {
    button.setAttribute("aria-label", "Settings, update available");
    button.dataset["update"] = "available";
    if (dot) dot.hidden = false;
  } else {
    button.removeAttribute("aria-label");
    delete button.dataset["update"];
    if (dot) dot.hidden = true;
  }
}

/** REQ-11: the restart confirm's body, naming the plain-terminal shells that will close
 * (or saying none are open) — Claude sessions always keep running (INV-5). */
export function renderRestartImpact(el: HTMLElement, shells: readonly RestartImpactShell[]): void {
  if (shells.length === 0) {
    el.textContent =
      "No plain-terminal shells are open. Claude sessions keep running and are re-adopted after the restart.";
    return;
  }
  const noun = shells.length === 1 ? "shell" : "shells";
  const titles = shells.map((shell) => shell.title ?? "untitled").join(", ");
  el.textContent = `${shells.length} plain-terminal ${noun} will close: ${titles}. Claude sessions keep running and are re-adopted after the restart.`;
}

export interface RestartConfirmElements {
  dialog: HTMLDialogElement;
  body: HTMLElement;
  confirmBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
}

export interface RestartConfirmHandlers {
  onConfirm: () => void;
}

export interface RestartConfirmController {
  open: (shells: readonly RestartImpactShell[]) => void;
  close: () => void;
}

/** REQ-11's confirm dialog (`#update-restart-dialog`) — modelled on render/confirm.ts's
 * End/Remove dialogs: showModal()/close(), body rebuilt from data at open time, Confirm
 * fires the handler after closing. */
export function initRestartConfirm(
  elements: RestartConfirmElements,
  handlers: RestartConfirmHandlers,
): RestartConfirmController {
  elements.cancelBtn.addEventListener("click", () => elements.dialog.close());
  elements.confirmBtn.addEventListener("click", () => {
    elements.dialog.close();
    handlers.onConfirm();
  });

  return {
    open(shells) {
      renderRestartImpact(elements.body, shells);
      if (!elements.dialog.open) elements.dialog.showModal();
    },
    close() {
      if (elements.dialog.open) elements.dialog.close();
    },
  };
}
