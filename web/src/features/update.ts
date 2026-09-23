// The Updates section, restart confirm, Settings badge, and apply handlers (plan
// code-breakup vocabulary: "update"; plan auto-update). No dependency on any other
// controller — `settings.ts` depends on this module's exposed elements/methods instead.
import type { App } from "../app";
import { applyUpdate, checkForUpdate, fetchRestartImpact } from "../api";
import { requireElement } from "../dom";
import {
  buildUpdateViewModel,
  initRestartConfirm,
  renderSettingsBadge,
  renderUpdateSection,
  type CheckState,
  type RestartConfirmController,
  type UpdateSectionElements,
} from "../render/update";
import type { Prefs, UpdateInfo } from "../protocol";

export interface UpdateHandle {
  /** For `settings.ts`'s `SettingsDialogElements` — the same DOM nodes, shared so the
   * Settings dialog can wire their listeners while this module owns their rendered
   * state. */
  readonly toggle: HTMLInputElement;
  readonly applyBtn: HTMLButtonElement;
  readonly restartBtn: HTMLButtonElement;
  /** REQ-10 (plan rail-card-improvements-2): `#update-check-button`, same
   * shared-element-shape reason as the three above — `settings.ts` wires its `click`. */
  readonly checkBtn: HTMLButtonElement;
  /** Plan auto-update User Flow 2: `POST /api/update/apply {}`. */
  apply(): void;
  /** Plan auto-update User Flow 3: fetch the restart impact, then open the confirm. */
  applyAndRestart(): void;
  /** REQ-7/REQ-13 (plan rail-card-improvements-2): `POST /api/update/check`. A no-op
   * while this window's own check is already in flight (W4/edge case 16) — `settings.ts`
   * fires this straight from the button's click handler, same shape as `apply`. */
  check(): void;
}

export function initUpdate(app: App): UpdateHandle {
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
  let currentPrefs: Prefs | null = null;
  // REQ-10/REQ-12/REQ-13: this window's own `Check now` request state — never derived
  // from `UpdateInfo` (see render/update.ts's `CheckState` doc comment).
  const checkState: CheckState = { inFlight: false, error: null };

  function apply(): void {
    void applyUpdate(false).then((result) => {
      if (!result.ok)
        console.error(
          `POST /api/update/apply failed: ${result.error.code} ${result.error.message}`,
        );
    });
  }

  function applyAndRestart(): void {
    void fetchRestartImpact().then((result) => {
      if (!result.ok) {
        console.error(
          `GET /api/update/restart-impact failed: ${result.error.code} ${result.error.message}`,
        );
        return;
      }
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
    void applyUpdate(true).then((result) => {
      if (!result.ok)
        console.error(
          `POST /api/update/apply failed: ${result.error.code} ${result.error.message}`,
        );
    });
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

  app.on("snapshot", (snapshot) => {
    currentUpdate = snapshot.update;
  });
  app.on("update", (update) => {
    currentUpdate = update;
  });
  app.on("prefs", (prefs) => {
    currentPrefs = prefs;
  });
  // States: "the Settings dialog closes ... the confirm dialog closes too" — a request
  // against a dead daemon can't be confirmed as done.
  app.on("status", () => restartConfirm.close());

  // Render phase 3 (UI Specifications > Render phase order).
  app.onRender((frame) => {
    const vm = buildUpdateViewModel(currentUpdate, currentPrefs, frame.now, checkState);
    renderUpdateSection(updateSectionElements, vm);
    renderSettingsBadge(settingsButtonEl, vm.badged);
  });

  return {
    toggle: updateSectionElements.toggle,
    applyBtn: updateSectionElements.applyBtn,
    restartBtn: updateSectionElements.restartBtn,
    checkBtn: updateSectionElements.checkBtn,
    apply,
    applyAndRestart,
    check,
  };
}
