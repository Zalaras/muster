// Plan auto-update, UI Specifications > Text rules: the Settings dialog's Updates section
// (`#settings-update`) plus the masthead Settings-button badge and the restart confirm's
// body. `buildUpdateViewModel` is pure so every Text-rules row can be table-tested (W5)
// without a DOM; everything else here is DOM-only, mirroring render/confirm.ts's shape
// (elements in, handlers in, a controller out) for the restart confirm dialog specifically
// — a precedent reuse (docs/conventions.md's "precedent check for cross-cutting UI
// concerns"): the restart confirm is structurally the same "named session action confirm"
// concern End/Remove already solved (showModal()/close(), a body rebuilt from data,
// Confirm/Cancel wired to one target captured at open time).
import type { RestartImpactShell } from "../api";
import type { Prefs, UpdateInfo } from "../protocol";

/** Every apply phase during which a request is genuinely in flight — REQ-10's
 * `aria-busy="true"` and the "phase not in flight" clause of the Buttons-enabled rule. */
const IN_FLIGHT_PHASES: ReadonlySet<string> = new Set([
  "downloading",
  "verifying",
  "installing",
  "restarting",
]);

export interface UpdateViewModel {
  running: string;
  available: string;
  /** Text rules > Toggle: `checked iff prefs.updateCheck` — kept here for W5's full
   * table-test contract, even though the DOM write of `.checked` happens through
   * settings.ts's `setChecked` (INV-7's "only ever from the prefs broadcast" discipline,
   * same code path the theme radios already use — see features/settings.ts's `prefs`
   * subscription, which calls `setChecked`).
   * `renderUpdateSection` below never reads this field. */
  toggleChecked: boolean;
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
}

/** The "Available" readout (UI Specifications > Text rules table). A development build and
 * a disabled check each say so rather than showing a version, so the row never implies a
 * check that did not happen. */
function availableText(update: UpdateInfo, updateCheck: boolean, isDev: boolean): string {
  if (isDev) return "not checked (development build)";
  if (!updateCheck) return "checking disabled";
  if (update.available !== null) return `v${update.available}`;
  if (update.checkedAt === null) return "not checked yet";
  return "up to date";
}

/** The status line under the buttons (UI Specifications > Text rules table). Apply-phase
 * progress wins over the "installed, awaiting restart" line, which in turn wins over a
 * standing remedy. */
function statusText(update: UpdateInfo): string {
  switch (update.apply.phase) {
    case "downloading":
      return `Downloading v${update.apply.version ?? ""}…`;
    case "verifying":
      return `Verifying v${update.apply.version ?? ""}…`;
    case "installing":
      return `Installing v${update.apply.version ?? ""}…`;
    case "restarting":
      return "Restarting musterd…";
    case "failed":
      return `Update failed: ${update.apply.error ?? ""}`;
    case "done":
      return `Updated to v${update.installed ?? ""}. Restart musterd to finish.`;
    default:
      if (update.installed !== null) {
        return `Updated to v${update.installed ?? ""}. Restart musterd to finish.`;
      }
      return update.remedy ?? "";
  }
}

/** UI Specifications > Text rules table. `update === null` covers both "before the first
 * snapshot" (the dialog can't be open then anyway — nothing in features/settings.ts opens
 * it before a user click) and edge case 32's permanent
 * case, a pre-plan daemon that never sends `update` at all: renders the same
 * unknown-shaped, no-badge, no-buttons state `parseSnapshot` already tolerates rather than
 * throwing. */
export function buildUpdateViewModel(
  update: UpdateInfo | null,
  prefs: Prefs | null,
): UpdateViewModel {
  const updateCheck = prefs?.updateCheck ?? true;

  if (!update) {
    return {
      running: "unknown",
      available: "not checked yet",
      toggleChecked: updateCheck,
      toggleDisabled: true,
      buttonsVisible: false,
      updateEnabled: false,
      restartEnabled: false,
      restartLabel: "Update and restart",
      status: "",
      badged: false,
      busy: false,
    };
  }

  const isDev = update.install === "dev";
  const running = isDev ? `${update.running} (development build)` : `v${update.running}`;

  const available = availableText(update, updateCheck, isDev);

  const phase = update.apply.phase;
  const inFlight = IN_FLIGHT_PHASES.has(phase);
  const baseEnabled =
    update.install === "installer" &&
    !inFlight &&
    (update.available !== null || update.installed !== null);
  const updateEnabled = baseEnabled && update.installed === null;
  const restartLabel = update.installed !== null ? "Restart now" : "Update and restart";

  const status = statusText(update);

  return {
    running,
    available,
    toggleChecked: updateCheck,
    toggleDisabled: isDev,
    buttonsVisible: !isDev,
    updateEnabled,
    restartEnabled: baseEnabled,
    restartLabel,
    status,
    badged: update.available !== null && update.installed === null,
    busy: inFlight,
  };
}

export interface UpdateSectionElements {
  section: HTMLElement;
  runningEl: HTMLElement;
  availableEl: HTMLElement;
  toggle: HTMLInputElement;
  statusEl: HTMLElement;
  applyBtn: HTMLButtonElement;
  restartBtn: HTMLButtonElement;
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
