// Plan auto-update: `renderUpdateSection`, `renderSettingsBadge`, `renderRestartImpact` and
// `initRestartConfirm` are DOM-facing and have no jsdom configured (docs/conventions.md
// defers DOM *construction* to Playwright) — following render/dead.test.ts's and
// render/dropguard.test.ts's precedent, they're exercised against plain fakes that record
// just enough state (`textContent`, `disabled`, `hidden`, `dataset`, attributes, a fake
// `addEventListener`/`showModal`/`close`) to assert on, never a real DOM node. The pure
// `buildUpdateViewModel` that feeds them is tested exhaustively in
// `../features/updateview.test.ts`, not here — it's used below only to build the view
// models these DOM functions render.
import { describe, expect, it, vi } from "vitest";
import type { RestartImpactShell } from "../api/update";
import type { UpdateInfo } from "../protocol/update";
import {
  initRestartConfirm,
  renderRestartImpact,
  renderSettingsBadge,
  renderUpdateSection,
  type RestartConfirmElements,
  type UpdateSectionElements,
} from "./update";
import { buildUpdateViewModel, type CheckState } from "../features/updateview";

const idleApply = { phase: "idle" as const, version: null, error: null };

const baseUpdate: UpdateInfo = {
  running: "0.10.0",
  install: "installer",
  remedy: null,
  canCheck: true,
  available: null,
  checkedAt: null,
  installed: null,
  apply: idleApply,
};

const NOW = new Date("2026-09-10T20:02:00Z");
const idleCheck: CheckState = { inFlight: false, error: null };
const busyCheck: CheckState = { inFlight: true, error: null };

function buildVm(update: UpdateInfo | null, check: CheckState = idleCheck, now: Date = NOW) {
  return buildUpdateViewModel(update, now, check);
}

// --- DOM-facing functions: plain fakes, no jsdom (see file header). ---

function fakeSectionElements(): UpdateSectionElements & {
  attrs: Map<string, string>;
  checkAttrs: Map<string, string>;
} {
  const attrs = new Map<string, string>();
  const checkAttrs = new Map<string, string>();
  return {
    section: {
      setAttribute: (name: string, value: string) => attrs.set(name, value),
      removeAttribute: (name: string) => attrs.delete(name),
    } as unknown as HTMLElement,
    runningEl: { textContent: "" } as unknown as HTMLElement,
    availableEl: { textContent: "" } as unknown as HTMLElement,
    toggle: { disabled: false } as unknown as HTMLInputElement,
    statusEl: { textContent: "" } as unknown as HTMLElement,
    applyBtn: { hidden: false, disabled: false } as unknown as HTMLButtonElement,
    restartBtn: { hidden: false, disabled: false, textContent: "" } as unknown as HTMLButtonElement,
    // REQ-10 (plan rail-card-improvements-2): `#update-check-button`.
    checkBtn: {
      disabled: false,
      setAttribute: (name: string, value: string) => checkAttrs.set(name, value),
      removeAttribute: (name: string) => checkAttrs.delete(name),
    } as unknown as HTMLButtonElement,
    attrs,
    checkAttrs,
  };
}

describe("renderUpdateSection — applies a view model to the DOM refs", () => {
  it("writes running/available text, toggle.disabled, status text, and never touches toggle.checked", () => {
    const els = fakeSectionElements();
    const vm = buildVm({
      ...baseUpdate,
      available: "0.11.0",
      checkedAt: "2026-09-10T20:00:00Z",
    });
    (els.toggle as unknown as { checked: boolean }).checked = false;
    renderUpdateSection(els, vm);
    expect(els.runningEl.textContent).toBe("v0.10.0");
    expect(els.availableEl.textContent).toBe("v0.11.0 · checked 2m ago");
    expect(els.toggle.disabled).toBe(false);
    // renderUpdateSection's own doc comment: it never writes .checked (settings.ts's
    // setChecked, driven only by the prefs/update broadcast, is the sole writer — INV-7).
    expect((els.toggle as unknown as { checked: boolean }).checked).toBe(false);
  });

  it("REQ-10: writes checkBtn.disabled from checkEnabled", () => {
    const els = fakeSectionElements();
    renderUpdateSection(els, buildVm({ ...baseUpdate, canCheck: true }, idleCheck));
    expect(els.checkBtn.disabled).toBe(false);
    renderUpdateSection(els, buildVm({ ...baseUpdate, canCheck: false }, idleCheck));
    expect(els.checkBtn.disabled).toBe(true);
  });

  it("REQ-13: sets aria-busy='true' on checkBtn while this window's own check is in flight, and removes it once it isn't", () => {
    const els = fakeSectionElements();
    renderUpdateSection(els, buildVm(baseUpdate, busyCheck));
    expect(els.checkAttrs.get("aria-busy")).toBe("true");
    renderUpdateSection(els, buildVm(baseUpdate, idleCheck));
    expect(els.checkAttrs.has("aria-busy")).toBe(false);
  });

  it("hides both buttons for a dev install", () => {
    const els = fakeSectionElements();
    const vm = buildVm({ ...baseUpdate, install: "dev" });
    renderUpdateSection(els, vm);
    expect(els.applyBtn.hidden).toBe(true);
    expect(els.restartBtn.hidden).toBe(true);
  });

  it("shows and enables both buttons when an update is available", () => {
    const els = fakeSectionElements();
    const vm = buildVm({ ...baseUpdate, available: "0.11.0" });
    renderUpdateSection(els, vm);
    expect(els.applyBtn.hidden).toBe(false);
    expect(els.applyBtn.disabled).toBe(false);
    expect(els.restartBtn.disabled).toBe(false);
  });

  it("writes the restart button's label ('Restart now' once installed)", () => {
    const els = fakeSectionElements();
    const vm = buildVm({ ...baseUpdate, installed: "0.11.0" });
    renderUpdateSection(els, vm);
    expect(els.restartBtn.textContent).toBe("Restart now");
  });

  it("sets aria-busy='true' on the section while an apply phase is in flight", () => {
    const els = fakeSectionElements();
    const vm = buildVm({
      ...baseUpdate,
      apply: { phase: "downloading", version: "0.11.0", error: null },
    });
    renderUpdateSection(els, vm);
    expect(els.attrs.get("aria-busy")).toBe("true");
  });

  it("removes aria-busy once no phase is in flight", () => {
    const els = fakeSectionElements();
    els.attrs.set("aria-busy", "true"); // simulate a previous busy render
    const vm = buildVm(baseUpdate);
    renderUpdateSection(els, vm);
    expect(els.attrs.has("aria-busy")).toBe(false);
  });
});

function fakeBadgeButton(withDot: boolean): HTMLButtonElement {
  const attrs = new Map<string, string>();
  const dataset: Record<string, string> = {};
  const dot = withDot ? ({ hidden: true } as unknown as HTMLElement) : null;
  return {
    setAttribute: (name: string, value: string) => attrs.set(name, value),
    removeAttribute: (name: string) => attrs.delete(name),
    getAttribute: (name: string) => attrs.get(name) ?? null,
    dataset,
    querySelector: () => dot,
  } as unknown as HTMLButtonElement;
}

describe("renderSettingsBadge — REQ-9's masthead badge dot and accessible name", () => {
  it("sets aria-label, data-update, and unhides the dot when badged", () => {
    const button = fakeBadgeButton(true);
    renderSettingsBadge(button, true);
    expect(button.getAttribute("aria-label")).toBe("Settings, update available");
    expect(button.dataset["update"]).toBe("available");
    expect(button.querySelector<HTMLElement>(".update-dot")?.hidden).toBe(false);
  });

  it("removes aria-label/data-update and hides the dot again when not badged", () => {
    const button = fakeBadgeButton(true);
    renderSettingsBadge(button, true);
    renderSettingsBadge(button, false);
    expect(button.getAttribute("aria-label")).toBeNull();
    expect(button.dataset["update"]).toBeUndefined();
    expect(button.querySelector<HTMLElement>(".update-dot")?.hidden).toBe(true);
  });

  it("does not throw when the dot element is missing", () => {
    const button = fakeBadgeButton(false);
    expect(() => renderSettingsBadge(button, true)).not.toThrow();
    expect(() => renderSettingsBadge(button, false)).not.toThrow();
  });
});

describe("renderRestartImpact — REQ-11's confirm body naming the plain-terminal shells", () => {
  it("says no shells are open, and that Claude sessions keep running, for an empty list", () => {
    const el = { textContent: "" } as unknown as HTMLElement;
    renderRestartImpact(el, []);
    expect(el.textContent).toBe(
      "No plain-terminal shells are open. Claude sessions keep running and are re-adopted after the restart.",
    );
  });

  it("uses singular 'shell' and names the one title for a single shell", () => {
    const el = { textContent: "" } as unknown as HTMLElement;
    const shells: RestartImpactShell[] = [{ sessionId: 3, title: "fix auth" }];
    renderRestartImpact(el, shells);
    expect(el.textContent).toBe(
      "1 plain-terminal shell will close: fix auth. Claude sessions keep running and are re-adopted after the restart.",
    );
  });

  it("uses plural 'shells' and comma-joins titles for multiple shells", () => {
    const el = { textContent: "" } as unknown as HTMLElement;
    const shells: RestartImpactShell[] = [
      { sessionId: 1, title: "fix auth" },
      { sessionId: 2, title: "spike" },
    ];
    renderRestartImpact(el, shells);
    expect(el.textContent).toBe(
      "2 plain-terminal shells will close: fix auth, spike. Claude sessions keep running and are re-adopted after the restart.",
    );
  });

  it("substitutes 'untitled' for a shell whose owning session is unknown (null title)", () => {
    const el = { textContent: "" } as unknown as HTMLElement;
    const shells: RestartImpactShell[] = [{ sessionId: 9, title: null }];
    renderRestartImpact(el, shells);
    expect(el.textContent).toBe(
      "1 plain-terminal shell will close: untitled. Claude sessions keep running and are re-adopted after the restart.",
    );
  });
});

/** A minimal `<dialog>` fake — `open`, `showModal()`, `close()` only, matching
 * render/confirm.ts's precedent (no jsdom, see file header). */
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

/** A fake button recording its one `click` listener, for the confirm/cancel wiring. */
function fakeClickButton(): HTMLButtonElement & { click: () => void } {
  let handler: (() => void) | null = null;
  return {
    addEventListener: (type: string, listener: () => void) => {
      if (type === "click") handler = listener;
    },
    click: () => handler?.(),
  } as unknown as HTMLButtonElement & { click: () => void };
}

function fakeRestartConfirmElements(): RestartConfirmElements & {
  confirmBtn: HTMLButtonElement & { click: () => void };
  cancelBtn: HTMLButtonElement & { click: () => void };
} {
  return {
    dialog: fakeDialog(),
    body: { textContent: "" } as unknown as HTMLElement,
    confirmBtn: fakeClickButton(),
    cancelBtn: fakeClickButton(),
  };
}

describe("initRestartConfirm — REQ-11's confirm dialog controller", () => {
  it("open() renders the restart-impact body and shows the modal", () => {
    const els = fakeRestartConfirmElements();
    const shells: RestartImpactShell[] = [{ sessionId: 3, title: "fix auth" }];

    const controller = initRestartConfirm(els, { onConfirm: vi.fn() });
    controller.open(shells);

    expect(els.body.textContent).toContain("fix auth");
    expect(els.dialog.open).toBe(true);
  });

  it("open() is a no-op (does not re-invoke showModal) when already open", () => {
    const els = fakeRestartConfirmElements();
    const controller = initRestartConfirm(els, { onConfirm: vi.fn() });
    let showModalCalls = 0;
    const originalShowModal = els.dialog.showModal.bind(els.dialog);
    els.dialog.showModal = () => {
      showModalCalls += 1;
      originalShowModal();
    };
    controller.open([]);
    controller.open([]);
    expect(showModalCalls).toBe(1);
  });

  it("Confirm closes the dialog then fires onConfirm", () => {
    const els = fakeRestartConfirmElements();
    const onConfirm = vi.fn();
    const controller = initRestartConfirm(els, { onConfirm });
    controller.open([]);

    els.confirmBtn.click();

    expect(els.dialog.open).toBe(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Cancel closes the dialog without firing onConfirm", () => {
    const els = fakeRestartConfirmElements();
    const onConfirm = vi.fn();
    const controller = initRestartConfirm(els, { onConfirm });
    controller.open([]);

    els.cancelBtn.click();

    expect(els.dialog.open).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("close() is a no-op when the dialog is already closed", () => {
    const els = fakeRestartConfirmElements();
    const controller = initRestartConfirm(els, { onConfirm: vi.fn() });
    expect(() => controller.close()).not.toThrow();
    expect(els.dialog.open).toBe(false);
  });

  it("close() closes an open dialog (e.g. daemon-down tears it down)", () => {
    const els = fakeRestartConfirmElements();
    const controller = initRestartConfirm(els, { onConfirm: vi.fn() });
    controller.open([]);
    controller.close();
    expect(els.dialog.open).toBe(false);
  });
});
