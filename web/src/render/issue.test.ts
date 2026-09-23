// renderIssueButton is the one DOM-trivial builder in render/issue.ts pinnable without
// jsdom (a bare `.disabled` write) — `buildSessionOptions` calls `document.createElement`
// directly and has no jsdom configured (docs/conventions.md defers DOM construction to
// Playwright, same category as render/crumbs.ts's `renderCrumbs`); it is not covered here.
// `composeNoteSection`, the pure piece still in `features/issue.ts`, is tested in
// `../features/issue.test.ts`, not here.
import { describe, expect, it } from "vitest";
import { renderIssueButton } from "./issue";

describe("renderIssueButton (masthead trigger, REQ-13: disabled while the daemon is down)", () => {
  function fakeButton(): HTMLButtonElement {
    return { disabled: false } as unknown as HTMLButtonElement;
  }

  it("enables the button when connected", () => {
    const el = fakeButton();
    el.disabled = true;
    renderIssueButton(el, true);
    expect(el.disabled).toBe(false);
  });

  it("disables the button when not connected", () => {
    const el = fakeButton();
    el.disabled = false;
    renderIssueButton(el, false);
    expect(el.disabled).toBe(true);
  });
});
