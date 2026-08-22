import { describe, expect, it } from "vitest";
import { renderSessions } from "./sessions";

function fakeElement(): HTMLElement {
  return { textContent: "" } as unknown as HTMLElement;
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
