// The Updates section, restart confirm, Settings badge, and apply handlers (plan
// code-breakup vocabulary: "update"; plan auto-update). No dependency on any other
// controller — `settings.ts` depends on this module's exposed elements/methods instead.
import type { App } from "../app";
import { applyUpdate, fetchRestartImpact } from "../api";
import { requireElement } from "../dom";
import {
  buildUpdateViewModel,
  initRestartConfirm,
  renderSettingsBadge,
  renderUpdateSection,
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
  /** Plan auto-update User Flow 2: `POST /api/update/apply {}`. */
  apply(): void;
  /** Plan auto-update User Flow 3: fetch the restart impact, then open the confirm. */
  applyAndRestart(): void;
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
  };

  let currentUpdate: UpdateInfo | null = null;
  let currentPrefs: Prefs | null = null;

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
  app.onRender(() => {
    const vm = buildUpdateViewModel(currentUpdate, currentPrefs);
    renderUpdateSection(updateSectionElements, vm);
    renderSettingsBadge(settingsButtonEl, vm.badged);
  });

  return {
    toggle: updateSectionElements.toggle,
    applyBtn: updateSectionElements.applyBtn,
    restartBtn: updateSectionElements.restartBtn,
    apply,
    applyAndRestart,
  };
}
