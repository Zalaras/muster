// REQ-9 (plan new-ui-design-colors): the Settings dialog — DOM + wiring only, no store
// access (main.ts owns the PUT and the "the prefs broadcast is the only source of the
// checked radio" invariant, INV-7). Modelled on render/confirm.ts's controller shape:
// elements in, handlers in, {open, close, setChecked} out.
import type { ThemeChoice } from "../theme";

export interface SettingsDialogElements {
  dialog: HTMLDialogElement;
  themeRadios: HTMLInputElement[];
  closeBtn: HTMLButtonElement;
  // Plan auto-update: the Updates section's toggle and two apply buttons — wiring only
  // (change/click listeners); their visible/disabled/label state is render/update.ts's
  // `renderUpdateSection`'s job, called separately by main.ts on every render pass.
  updateToggle: HTMLInputElement;
  applyBtn: HTMLButtonElement;
  restartBtn: HTMLButtonElement;
}

export interface SettingsDialogHandlers {
  /** Fires immediately on change (REQ-9: "no Save") — main.ts turns this into a
   * fire-and-forget `PUT /api/prefs`. Never updates the checked radio itself; that only
   * ever happens via `setChecked`, driven by the next `prefs`/`snapshot` broadcast. */
  onChooseTheme: (theme: ThemeChoice) => void;
  /** Plan auto-update: the Updates section's checkbox change handler — same
   * "fire-and-forget, no optimistic update" shape as `onChooseTheme` (W10). */
  onToggleUpdateCheck: (checked: boolean) => void;
  /** Plan auto-update: `POST /api/update/apply {}` (User Flow 2). */
  onUpdate: () => void;
  /** Plan auto-update: opens the restart-impact confirm (User Flow 3) — main.ts owns the
   * `GET /api/update/restart-impact` round trip and the confirm dialog itself. */
  onUpdateAndRestart: () => void;
}

export interface SettingsDialogController {
  open: () => void;
  close: () => void;
  /** INV-7: the checked radio always reflects the daemon's last `prefs` broadcast.
   * `theme` is the raw pref string — a name none of the four radios carry (a renamed
   * theme, or no snapshot yet) leaves every radio unchecked, matching edge case 6's
   * "honest, and the next pick fixes it". `updateCheck` (plan auto-update) is the Updates
   * toggle's own `prefs.updateCheck`-only source of truth — same INV-7 discipline, one
   * more field on the same broadcast-driven call. */
  setChecked: (theme: string, updateCheck: boolean) => void;
}

function isThemeChoice(value: string): value is ThemeChoice {
  return value === "follow" || value === "instrument" || value === "dark" || value === "light";
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
  elements.applyBtn.addEventListener("click", () => handlers.onUpdate());
  elements.restartBtn.addEventListener("click", () => handlers.onUpdateAndRestart());

  return {
    open() {
      if (!elements.dialog.open) elements.dialog.showModal();
    },
    close() {
      if (elements.dialog.open) elements.dialog.close();
    },
    setChecked(theme, updateCheck) {
      for (const radio of elements.themeRadios) {
        radio.checked = radio.value === theme;
      }
      elements.updateToggle.checked = updateCheck;
    },
  };
}
