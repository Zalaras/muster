import { describe, expect, it } from "vitest";
import { renderFocusMain, renderSessions, renderSizenote, type FocusMainElements } from "./sessions";

function fakeElement(): HTMLElement {
  return { textContent: "", hidden: false } as unknown as HTMLElement;
}

// The non-empty branch now clones real `<template>` DOM (`#session-card-template`) via
// `buildCardViewModel` (docs/conventions.md: rendering/DOM is Playwright's job, not
// Vitest's) — see web/e2e/sessions.spec.ts for card-rendering coverage and
// ../sessions/card.test.ts for the pure view-model logic it's built from. Only the
// honest-empty-state branch is DOM-free enough to unit test here.
describe("renderSessions", () => {
  it("renders the honest empty state when there are no sessions", () => {
    const el = fakeElement();
    renderSessions(el, []);
    expect(el.textContent).toBe("No sessions yet");
  });
});

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
