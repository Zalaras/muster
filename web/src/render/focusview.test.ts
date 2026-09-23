import { describe, expect, it } from "vitest";
import { renderFocusMain, renderSizenote, type FocusMainElements } from "./focusview";

function fakeElement(): HTMLElement {
  return { textContent: "", hidden: false } as unknown as HTMLElement;
}

describe("renderFocusMain — toggles between the empty state and the terminal slot", () => {
  function elements(): FocusMainElements {
    return { emptyEl: fakeElement(), slotEl: fakeElement() };
  }

  it("shows the empty state and hides the terminal slot when there are no sessions", () => {
    const els = elements();
    renderFocusMain(els, false);
    expect(els.emptyEl.hidden).toBe(false);
    expect(els.slotEl.hidden).toBe(true);
  });

  it("hides the empty state and shows the terminal slot when sessions exist", () => {
    const els = elements();
    renderFocusMain(els, true);
    expect(els.emptyEl.hidden).toBe(true);
    expect(els.slotEl.hidden).toBe(false);
  });
});

describe("renderSizenote — REQ-15's '<cols>×<rows> · one live client · geometry owned by this pane'", () => {
  it("hides the line entirely when geometry is null (no focused session / not yet laid out)", () => {
    const el = fakeElement();
    renderSizenote(el, null);
    expect(el.hidden).toBe(true);
    expect(el.textContent).toBe("");
  });

  it("renders the exact sizenote text (byte-for-byte × character) when geometry is present", () => {
    const el = fakeElement();
    renderSizenote(el, { cols: 210, rows: 52 });
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe("210×52 · one live client · geometry owned by this pane");
  });

  it("re-shows a previously-hidden line once geometry arrives", () => {
    const el = fakeElement();
    renderSizenote(el, null);
    renderSizenote(el, { cols: 80, rows: 24 });
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe("80×24 · one live client · geometry owned by this pane");
  });
});
