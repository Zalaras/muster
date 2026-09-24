// The Updates section, restart confirm, Settings badge, and apply handlers (plan
// code-breakup vocabulary: "update"; plan auto-update). No dependency on any other
// controller — review Major 7: this module now wires its own toggle/apply/restart/check
// buttons directly (features/CLAUDE.md "Owns": "each controller wires listeners on the
// elements it looked up itself"). `settings.ts` used to take an `update` dep purely to
// relay those clicks; it no longer references this module at all.
import type { App } from "../app";
import { applyUpdate, checkForUpdate, fetchRestartImpact } from "../api/update";
import { requestPrefs } from "../api/prefs";
import { requireElement } from "../dom";
import {
  initRestartConfirm,
  renderSettingsBadge,
  renderUpdateSection,
  type RestartConfirmController,
  type UpdateSectionElements,
} from "../render/update";
import { buildUpdateViewModel, type CheckState } from "./updateview";
import type { UpdateInfo } from "../protocol/update";

export function initUpdate(app: App): void {
  const settingsButtonEl = requireElement<HTMLButtonElement>("#settings-button");
  const updateSectionElements: UpdateSectionElements = {
    section: requireElement<HTMLElement>("#settings-update"),
    runningEl: requireElement<HTMLElement>("#update-running"),
    availableEl: requireElement<HTMLElement>("#update-available"),
    toggle: requireElement<HTMLInputElement>("#update-check-toggle"),
    statusEl: requireElement<HTMLElement>("#update-status"),
    applyBtn: requireElement<HTMLButtonElement>("#update-apply-button"),
    restartBtn: requireElement<HTMLButtonElement>("#update-restart-button"),
    checkBtn: requireElement<HTMLButtonElement>("#update-check-button"),
  };

  let currentUpdate: UpdateInfo | null = null;
  // REQ-10/REQ-12/REQ-13: this window's own `Check now` request state — never derived
  // from `UpdateInfo` (see render/update.ts's `CheckState` doc comment).
  const checkState: CheckState = { inFlight: false, error: null };

  // http.ts's `logApiFailure` already logs a failed request under its own route — this
  // module has nothing further to do with one (e-m5).
  function apply(): void {
    void applyUpdate(false);
  }

  function applyAndRestart(): void {
    void fetchRestartImpact().then((result) => {
      if (!result.ok) return;
      restartConfirm.open(result.value.shells);
    });
  }

  // REQ-7/REQ-8/REQ-13: runs regardless of `prefs.updateCheck` (that pref governs only
  // the daemon's own automatic schedule). A new check clears any previous failure
  // immediately, so a second press doesn't leave a stale reason on screen while the fresh
  // request is still in flight; the resulting `available`/`checkedAt` reach this window
  // via the `update` broadcast the daemon sends on success (same "response carries no
  // state, the socket does" shape `apply`/`applyAndRestart` already follow above) — this
  // call only tracks whether the *request itself* is in flight or failed.
  function check(): void {
    if (checkState.inFlight) return; // W4/edge case 16: no double-open from one window.
    checkState.inFlight = true;
    checkState.error = null;
    app.render();
    void checkForUpdate().then((result) => {
      checkState.inFlight = false;
      checkState.error = result.ok ? null : result.error.message;
      // Settling `checkState` mid-tick needs its own render (issue.ts's `takeCapture`
      // renders on both sides of its await, same shape) — otherwise a failed check's
      // reason, and the re-enabled button, wait for the next 1 s tick.
      app.render();
    });
  }

  function handleRestartConfirmed(): void {
    void applyUpdate(true);
  }

  const restartConfirm: RestartConfirmController = initRestartConfirm(
    {
      dialog: requireElement<HTMLDialogElement>("#update-restart-dialog"),
      body: requireElement<HTMLElement>("#update-restart-body"),
      confirmBtn: requireElement<HTMLButtonElement>("#update-restart-confirm"),
      cancelBtn: requireElement<HTMLButtonElement>("#update-restart-cancel"),
    },
    { onConfirm: handleRestartConfirmed },
  );

  // Review Major 7: this module wires its own Updates-section buttons — no other
  // controller reaches into these elements.
  updateSectionElements.toggle.addEventListener("change", () => {
    requestPrefs({ updateCheck: updateSectionElements.toggle.checked });
  });
  updateSectionElements.applyBtn.addEventListener("click", () => apply());
  updateSectionElements.restartBtn.addEventListener("click", () => applyAndRestart());
  updateSectionElements.checkBtn.addEventListener("click", () => check());

  app.on("snapshot", (snapshot) => {
    currentUpdate = snapshot.update;
  });
  app.on("update", (update) => {
    currentUpdate = update;
  });
  app.on("prefs", (prefs) => {
    // INV-7: the toggle's checked state only ever comes from the prefs broadcast, never
    // optimistically from its own `change` handler above — same discipline
    // `render/settings.ts`'s theme/rail-activity radios follow.
    updateSectionElements.toggle.checked = prefs.updateCheck;
  });
  // States: "the Settings dialog closes ... the confirm dialog closes too" — a request
  // against a dead daemon can't be confirmed as done.
  app.on("status", () => restartConfirm.close());

  // Render phase 3 (UI Specifications > Render phase order).
  app.onRender((frame) => {
    const vm = buildUpdateViewModel(currentUpdate, frame.now, checkState);
    renderUpdateSection(updateSectionElements, vm);
    renderSettingsBadge(settingsButtonEl, vm.badged);
  });
}
