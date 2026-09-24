// The Settings dialog's DOM + wiring (kb:spec/settings) — split out of
// features/settings.ts (this "elements in, handlers in, controller out"
// shape matches its siblings render/confirm.ts and render/update.ts's
// `initRestartConfirm`, which already live here). `features/settings.ts` owns the PUT and
// the "the prefs broadcast is the only source of the checked radio" invariant; this
// module never touches `app` or the network. The Updates section's own
// toggle/apply/restart/check buttons are no longer wired here — `features/update.ts` wires
// its own elements, so `settings` carries no `update` dependency at all.
import { isThemeChoice, type ThemeChoice } from "../theme";
import { isRailActivity, type RailActivity } from "../protocol/prefs";
import { checkRadioValue } from "../dom";

export interface SettingsDialogElements {
  dialog: HTMLDialogElement;
  themeRadios: HTMLInputElement[];
  closeBtn: HTMLButtonElement;
  // The "Rail card shows" fieldset's four radios (kb:spec/rail).
  railActivityRadios: HTMLInputElement[];
}

export interface SettingsDialogHandlers {
  /** Fires immediately on change ("no Save") — this module turns this into a
   * fire-and-forget `PUT /api/prefs`. Never updates the checked radio itself; that only
   * ever happens via `setChecked`, driven by the next `prefs`/`snapshot` broadcast. */
  onChooseTheme: (theme: ThemeChoice) => void;
  /** Fires immediately on change, same
   * fire-and-forget/no-optimistic-update shape as `onChooseTheme`. */
  onChooseRailActivity: (mode: RailActivity) => void;
}

export interface SettingsDialogController {
  open: () => void;
  close: () => void;
  /** The checked radio always reflects the daemon's last `prefs` broadcast
   * (kb:adr/theme-pref-follows-claude-until-picked). `theme` is the raw pref string — a
   * name none of the four radios carry (a renamed
   * theme, or no snapshot yet) leaves every radio unchecked — honest, and the next pick
   * fixes it. `railActivity` follows the same
   * discipline — the checked radio follows the broadcast, never the click. */
  setChecked: (theme: string, railActivity: RailActivity) => void;
}

export function initSettingsDialog(
  elements: SettingsDialogElements,
  handlers: SettingsDialogHandlers,
): SettingsDialogController {
  elements.closeBtn.addEventListener("click", () => elements.dialog.close());

  for (const radio of elements.themeRadios) {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      if (isThemeChoice(radio.value)) handlers.onChooseTheme(radio.value);
    });
  }

  for (const radio of elements.railActivityRadios) {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      if (isRailActivity(radio.value)) handlers.onChooseRailActivity(radio.value);
    });
  }

  return {
    open() {
      if (!elements.dialog.open) elements.dialog.showModal();
    },
    close() {
      if (elements.dialog.open) elements.dialog.close();
    },
    setChecked(theme, railActivity) {
      checkRadioValue(elements.themeRadios, theme);
      checkRadioValue(elements.railActivityRadios, railActivity);
    },
  };
}
