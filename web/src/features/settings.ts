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

/** REQ-2's controller entry: locates the Settings button + dialog, wires the PUT and
 * self-registers the `status`/`prefs` subscriptions the dialog needs (plan code-breakup
 * vocabulary: "settings"). Review Major 7: no dependency on any other controller — the
 * Updates section (`features/update.ts`) wires its own toggle and buttons. */
export function initSettings(app: App): void {
  const settingsButtonEl = requireElement<HTMLButtonElement>("#settings-button");
  const elements: SettingsDialogElements = {
    dialog: requireElement<HTMLDialogElement>("#settings-dialog"),
    themeRadios: requireElements<HTMLInputElement>('#settings-dialog input[name="theme"]'),
    closeBtn: requireElement<HTMLButtonElement>("#settings-close-button"),
    railActivityRadios: requireElements<HTMLInputElement>(
      '#settings-dialog input[name="railActivity"]',
    ),
  };
  const controller = initSettingsDialog(elements, {
    onChooseTheme: (theme) => requestPrefs({ theme }),
    onChooseRailActivity: (railActivity) => requestPrefs({ railActivity }),
  });

  settingsButtonEl.addEventListener("click", () => controller.open());

  app.on("prefs", (prefs) => controller.setChecked(prefs.theme, prefs.railActivity));
  // States (new-ui-design-colors): "Daemon down ... The Settings dialog closes with the
  // other dialogs ... since a PUT cannot land."
  app.on("status", () => controller.close());
}
