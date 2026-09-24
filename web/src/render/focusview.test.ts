import { describe, expect, it } from "vitest";
import {
  renderFocusMain,
  renderSizenote,
  setMainSlotHidden,
  type FocusMainElements,
} from "./focusview";

function fakeElement(): HTMLElement {
  return { textContent: "", hidden: false } as unknown as HTMLElement;
}

describe("renderFocusMain — toggles the empty state", () => {
  function elements(): FocusMainElements {
    return { emptyEl: fakeElement() };
  }

  it("shows the empty state when there are no sessions", () => {
    const els = elements();
    renderFocusMain(els, false);
    expect(els.emptyEl.hidden).toBe(false);
  });

  it("hides the empty state when sessions exist", () => {
    const els = elements();
    renderFocusMain(els, true);
    expect(els.emptyEl.hidden).toBe(true);
  });
});

describe("setMainSlotHidden — the main slot's one hidden writer", () => {
  it("sets hidden true", () => {
    const el = fakeElement();
    setMainSlotHidden(el, true);
    expect(el.hidden).toBe(true);
  });

  it("sets hidden false", () => {
    const el = fakeElement();
    el.hidden = true;
    setMainSlotHidden(el, false);
    expect(el.hidden).toBe(false);
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
