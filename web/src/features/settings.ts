// REQ-9 (plan new-ui-design-colors): the Settings dialog controller — locates the elements,
// wires the PUT and the "the prefs broadcast is the only source of the checked radio"
// invariant (INV-7). The dialog's own DOM/wiring is `render/settings.ts`'s
// `initSettingsDialog` (review seed B9: that "elements in, handlers in, controller out"
// shape lives in `render/`, matching render/confirm.ts and render/update.ts's
// `initRestartConfirm`).
import type { App } from "../app";
import { requestPrefs } from "../api/prefs";
import { requireElement, requireElements } from "../dom";
import { initSettingsDialog, type SettingsDialogElements } from "../render/settings";

/** REQ-2's controller entry: locates the Settings button + dialog, wires it to
 * `deps.update`'s shared elements/methods, and self-registers the `status`/`prefs`
 * subscriptions the dialog needs (plan code-breakup vocabulary: "settings"). */
// W6/INV-4: structural, not a sibling import of UpdateHandle from the update module.
export function initSettings(
  app: App,
  deps: {
    update: {
      toggle: HTMLInputElement;
      applyBtn: HTMLButtonElement;
      restartBtn: HTMLButtonElement;
      checkBtn: HTMLButtonElement;
      apply(): void;
      applyAndRestart(): void;
      check(): void;
    };
  },
): void {
  const settingsButtonEl = requireElement<HTMLButtonElement>("#settings-button");
  const elements: SettingsDialogElements = {
    dialog: requireElement<HTMLDialogElement>("#settings-dialog"),
    themeRadios: requireElements<HTMLInputElement>('#settings-dialog input[name="theme"]'),
    closeBtn: requireElement<HTMLButtonElement>("#settings-close-button"),
    updateToggle: deps.update.toggle,
    applyBtn: deps.update.applyBtn,
    restartBtn: deps.update.restartBtn,
    checkBtn: deps.update.checkBtn,
    railActivityRadios: requireElements<HTMLInputElement>(
      '#settings-dialog input[name="railActivity"]',
    ),
  };
  const controller = initSettingsDialog(elements, {
    onChooseTheme: (theme) => requestPrefs({ theme }),
    onToggleUpdateCheck: (checked) => requestPrefs({ updateCheck: checked }),
    onUpdate: () => deps.update.apply(),
    onUpdateAndRestart: () => deps.update.applyAndRestart(),
    onCheckNow: () => deps.update.check(),
    onChooseRailActivity: (railActivity) => requestPrefs({ railActivity }),
  });

  settingsButtonEl.addEventListener("click", () => controller.open());

  app.on("prefs", (prefs) =>
    controller.setChecked(prefs.theme, prefs.updateCheck, prefs.railActivity),
  );
  // States (new-ui-design-colors): "Daemon down ... The Settings dialog closes with the
  // other dialogs ... since a PUT cannot land."
  app.on("status", () => controller.close());
}
