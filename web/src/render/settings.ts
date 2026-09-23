// REQ-9 (plan new-ui-design-colors): the Settings dialog's DOM + wiring — split out of
// features/settings.ts (review seed B9: this "elements in, handlers in, controller out"
// shape matches its siblings render/confirm.ts and render/update.ts's
// `initRestartConfirm`, which already live here). `features/settings.ts` owns the PUT and
// the "the prefs broadcast is the only source of the checked radio" invariant (INV-7); this
// module never touches `app` or the network.
import { isThemeChoice, type ThemeChoice } from "../theme";
import { isRailActivity, type RailActivity } from "../protocol/prefs";

export interface SettingsDialogElements {
  dialog: HTMLDialogElement;
  themeRadios: HTMLInputElement[];
  closeBtn: HTMLButtonElement;
  // Plan auto-update: the Updates section's toggle and two apply buttons — wiring only
  // (change/click listeners); their visible/disabled/label state is render/update.ts's
  // `renderUpdateSection`'s job, called separately by features/update.ts on every render pass.
  updateToggle: HTMLInputElement;
  applyBtn: HTMLButtonElement;
  restartBtn: HTMLButtonElement;
  // Plan rail-card-improvements-2 (REQ-10): `#update-check-button` — same wiring-only
  // shape as the two apply buttons above.
  checkBtn: HTMLButtonElement;
  // Plan rail-card-improvements (REQ-13): the "Rail card shows" fieldset's four radios.
  railActivityRadios: HTMLInputElement[];
}

export interface SettingsDialogHandlers {
  /** Fires immediately on change (REQ-9: "no Save") — this module turns this into a
   * fire-and-forget `PUT /api/prefs`. Never updates the checked radio itself; that only
   * ever happens via `setChecked`, driven by the next `prefs`/`snapshot` broadcast. */
  onChooseTheme: (theme: ThemeChoice) => void;
  /** Plan auto-update: the Updates section's checkbox change handler — same
   * "fire-and-forget, no optimistic update" shape as `onChooseTheme` (W10). */
  onToggleUpdateCheck: (checked: boolean) => void;
  /** Plan auto-update: `POST /api/update/apply {}`. */
  onUpdate: () => void;
  /** Plan auto-update: opens the restart-impact confirm (User Flow 3) — features/update.ts
   * owns the `GET /api/update/restart-impact` round trip and the confirm dialog itself. */
  onUpdateAndRestart: () => void;
  /** REQ-7/REQ-10 (plan rail-card-improvements-2): `POST /api/update/check` — same
   * fire-and-forget shape as `onUpdate`; features/update.ts's `check` owns the in-flight
   * guard (W4). */
  onCheckNow: () => void;
  /** Plan rail-card-improvements (REQ-13): fires immediately on change, same
   * fire-and-forget/no-optimistic-update shape as `onChooseTheme` (INV-4). */
  onChooseRailActivity: (mode: RailActivity) => void;
}

export interface SettingsDialogController {
  open: () => void;
  close: () => void;
  /** INV-7: the checked radio always reflects the daemon's last `prefs` broadcast.
   * `theme` is the raw pref string — a name none of the four radios carry (a renamed
   * theme, or no snapshot yet) leaves every radio unchecked, matching edge case 6's
   * "honest, and the next pick fixes it". `updateCheck` (plan auto-update) is the Updates
   * toggle's own `prefs.updateCheck`-only source of truth — same INV-7 discipline, one
   * more field on the same broadcast-driven call. `railActivity` (REQ-13) is the fourth,
   * same discipline again — the checked radio follows the broadcast, never the click. */
  setChecked: (theme: string, updateCheck: boolean, railActivity: RailActivity) => void;
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

  elements.updateToggle.addEventListener("change", () => {
    handlers.onToggleUpdateCheck(elements.updateToggle.checked);
  });
  elements.checkBtn.addEventListener("click", () => handlers.onCheckNow());
  elements.applyBtn.addEventListener("click", () => handlers.onUpdate());
  elements.restartBtn.addEventListener("click", () => handlers.onUpdateAndRestart());

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
    setChecked(theme, updateCheck, railActivity) {
      for (const radio of elements.themeRadios) {
        radio.checked = radio.value === theme;
      }
      elements.updateToggle.checked = updateCheck;
      for (const radio of elements.railActivityRadios) {
        radio.checked = radio.value === railActivity;
      }
    },
  };
}
