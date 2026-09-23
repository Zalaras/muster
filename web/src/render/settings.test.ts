// initSettingsDialog is wiring only (elements in, handlers in, controller out — no
// document.createElement anywhere in the module), matching render/confirm.ts's and
// render/update.ts's initRestartConfirm precedent, so it's exercised the same way: plain
// fakes recording listeners/state, no jsdom (docs/conventions.md defers DOM construction to
// Playwright).
import { describe, expect, it, vi } from "vitest";
import type { SettingsDialogElements, SettingsDialogHandlers } from "./settings";
import { initSettingsDialog } from "./settings";

/** A minimal `<dialog>` fake — matches render/update.test.ts's fakeDialog. */
function fakeDialog(): HTMLDialogElement {
  const dialog = {
    open: false,
    showModal: () => {
      dialog.open = true;
    },
    close: () => {
      dialog.open = false;
    },
  };
  return dialog as unknown as HTMLDialogElement;
}

/** A fake button recording its one `click` listener. */
function fakeClickButton(): HTMLButtonElement & { click: () => void } {
  let handler: (() => void) | null = null;
  return {
    addEventListener: (type: string, listener: () => void) => {
      if (type === "click") handler = listener;
    },
    click: () => handler?.(),
  } as unknown as HTMLButtonElement & { click: () => void };
}

/** A fake radio/checkbox: `fireChange()` simulates the browser dispatching `change` after
 * the caller has already set `.checked`/`.value`, matching real radio-group semantics. */
function fakeInput(value: string, checked = false): HTMLInputElement & { fireChange: () => void } {
  let handler: (() => void) | null = null;
  const input = {
    value,
    checked,
    addEventListener: (type: string, listener: () => void) => {
      if (type === "change") handler = listener;
    },
    fireChange: () => handler?.(),
  };
  return input as unknown as HTMLInputElement & { fireChange: () => void };
}

function fakeElements(): SettingsDialogElements & {
  themeRadios: (HTMLInputElement & { fireChange: () => void })[];
  railActivityRadios: (HTMLInputElement & { fireChange: () => void })[];
  updateToggle: HTMLInputElement & { fireChange: () => void };
  closeBtn: HTMLButtonElement & { click: () => void };
  checkBtn: HTMLButtonElement & { click: () => void };
  applyBtn: HTMLButtonElement & { click: () => void };
  restartBtn: HTMLButtonElement & { click: () => void };
} {
  return {
    dialog: fakeDialog(),
    themeRadios: [fakeInput("follow"), fakeInput("dark"), fakeInput("light")],
    closeBtn: fakeClickButton(),
    updateToggle: fakeInput("", false),
    applyBtn: fakeClickButton(),
    restartBtn: fakeClickButton(),
    checkBtn: fakeClickButton(),
    railActivityRadios: [
      fakeInput("turn"),
      fakeInput("prompt"),
      fakeInput("reply"),
      fakeInput("both"),
    ],
  };
}

function fakeHandlers(): SettingsDialogHandlers {
  return {
    onChooseTheme: vi.fn(),
    onToggleUpdateCheck: vi.fn(),
    onUpdate: vi.fn(),
    onUpdateAndRestart: vi.fn(),
    onCheckNow: vi.fn(),
    onChooseRailActivity: vi.fn(),
  };
}

describe("initSettingsDialog — close/open", () => {
  it("close button closes the dialog", () => {
    const els = fakeElements();
    els.dialog.open = true;
    initSettingsDialog(els, fakeHandlers());
    els.closeBtn.click();
    expect(els.dialog.open).toBe(false);
  });

  it("open() shows the modal only when not already open", () => {
    const els = fakeElements();
    const controller = initSettingsDialog(els, fakeHandlers());
    let showModalCalls = 0;
    const original = els.dialog.showModal.bind(els.dialog);
    els.dialog.showModal = () => {
      showModalCalls += 1;
      original();
    };
    controller.open();
    controller.open();
    expect(showModalCalls).toBe(1);
  });

  it("close() is a no-op when already closed", () => {
    const els = fakeElements();
    const controller = initSettingsDialog(els, fakeHandlers());
    expect(() => controller.close()).not.toThrow();
    expect(els.dialog.open).toBe(false);
  });
});

describe("initSettingsDialog — theme radios (REQ-9: fires immediately, no Save)", () => {
  it("calls onChooseTheme with the checked radio's value", () => {
    const els = fakeElements();
    const handlers = fakeHandlers();
    initSettingsDialog(els, handlers);
    const darkRadio = els.themeRadios[1]!;
    darkRadio.checked = true;
    darkRadio.fireChange();
    expect(handlers.onChooseTheme).toHaveBeenCalledWith("dark");
  });

  it("ignores a change event on a radio that isn't actually checked", () => {
    const els = fakeElements();
    const handlers = fakeHandlers();
    initSettingsDialog(els, handlers);
    const darkRadio = els.themeRadios[1]!;
    darkRadio.checked = false;
    darkRadio.fireChange();
    expect(handlers.onChooseTheme).not.toHaveBeenCalled();
  });

  it("ignores a checked radio whose value isn't a known theme (isThemeChoice guard)", () => {
    const els = fakeElements();
    els.themeRadios.push(fakeInput("bogus", true));
    const handlers = fakeHandlers();
    initSettingsDialog(els, handlers);
    els.themeRadios[3]!.fireChange();
    expect(handlers.onChooseTheme).not.toHaveBeenCalled();
  });
});

describe("initSettingsDialog — rail activity radios (REQ-13, INV-4)", () => {
  it("calls onChooseRailActivity with the checked radio's value", () => {
    const els = fakeElements();
    const handlers = fakeHandlers();
    initSettingsDialog(els, handlers);
    const replyRadio = els.railActivityRadios[2]!;
    replyRadio.checked = true;
    replyRadio.fireChange();
    expect(handlers.onChooseRailActivity).toHaveBeenCalledWith("reply");
  });

  it("ignores a checked radio whose value isn't a known rail activity", () => {
    const els = fakeElements();
    els.railActivityRadios.push(fakeInput("bogus", true));
    const handlers = fakeHandlers();
    initSettingsDialog(els, handlers);
    els.railActivityRadios[4]!.fireChange();
    expect(handlers.onChooseRailActivity).not.toHaveBeenCalled();
  });
});

describe("initSettingsDialog — Updates section wiring (plan auto-update, rail-card-improvements-2)", () => {
  it("onToggleUpdateCheck receives the toggle's current checked state", () => {
    const els = fakeElements();
    const handlers = fakeHandlers();
    initSettingsDialog(els, handlers);
    els.updateToggle.checked = true;
    els.updateToggle.fireChange();
    expect(handlers.onToggleUpdateCheck).toHaveBeenCalledWith(true);
    els.updateToggle.checked = false;
    els.updateToggle.fireChange();
    expect(handlers.onToggleUpdateCheck).toHaveBeenCalledWith(false);
  });

  it("wires checkBtn/applyBtn/restartBtn clicks to onCheckNow/onUpdate/onUpdateAndRestart", () => {
    const els = fakeElements();
    const handlers = fakeHandlers();
    initSettingsDialog(els, handlers);
    els.checkBtn.click();
    els.applyBtn.click();
    els.restartBtn.click();
    expect(handlers.onCheckNow).toHaveBeenCalledTimes(1);
    expect(handlers.onUpdate).toHaveBeenCalledTimes(1);
    expect(handlers.onUpdateAndRestart).toHaveBeenCalledTimes(1);
  });
});

describe("initSettingsDialog — setChecked (INV-7: the broadcast is the only source of the checked radio)", () => {
  it("checks exactly the theme radio matching the given theme, the toggle, and the rail-activity radio", () => {
    const els = fakeElements();
    const controller = initSettingsDialog(els, fakeHandlers());
    controller.setChecked("dark", true, "prompt");
    expect(els.themeRadios.map((r) => r.checked)).toEqual([false, true, false]);
    expect(els.updateToggle.checked).toBe(true);
    expect(els.railActivityRadios.map((r) => r.checked)).toEqual([false, true, false, false]);
  });

  it("leaves every theme radio unchecked for a theme name none of them carry (edge case 6: renamed theme / no snapshot yet)", () => {
    const els = fakeElements();
    for (const radio of els.themeRadios) radio.checked = true; // simulate a stale prior check
    const controller = initSettingsDialog(els, fakeHandlers());
    controller.setChecked("some-removed-theme", false, "turn");
    expect(els.themeRadios.every((r) => !r.checked)).toBe(true);
  });
});
