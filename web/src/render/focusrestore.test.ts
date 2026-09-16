// Plan general-cleanup (REQ-7, W2): the pure decision table `features/connection.ts`
// drives around the disconnect->reconnect render pair. No DOM — `RestorableCandidate` is
// duck-typed, so a plain object stands in for `document.activeElement`.
import { describe, expect, it } from "vitest";
import {
  isRestorableControl,
  shouldRestoreFocus,
  type RestorableCandidate,
} from "./focusrestore";

/** `closest` answers `#app` (or not) the way a real DOM node would: an element inside the
 * shell resolves `#app`, one outside it (or the shell root itself, absent from a real
 * `#app` subtree in these tests) resolves nothing. */
function candidate(tagName: string, insideApp: boolean): RestorableCandidate {
  return {
    tagName,
    closest: (selector: string) => (selector === "#app" && insideApp ? {} : null),
  };
}

describe("isRestorableControl", () => {
  it("is true for a button inside #app", () => {
    expect(isRestorableControl(candidate("BUTTON", true))).toBe(true);
  });

  it("is true for a select inside #app", () => {
    expect(isRestorableControl(candidate("SELECT", true))).toBe(true);
  });

  it("is true regardless of tagName case (a real Element.tagName is already uppercase)", () => {
    expect(isRestorableControl(candidate("button", true))).toBe(true);
  });

  it("is false for a button outside #app", () => {
    expect(isRestorableControl(candidate("BUTTON", false))).toBe(false);
  });

  // Edge case 10: focus was in a terminal (xterm textarea), not a control.
  it("is false for a textarea inside #app", () => {
    expect(isRestorableControl(candidate("TEXTAREA", true))).toBe(false);
  });

  it("is false for an anchor inside #app", () => {
    expect(isRestorableControl(candidate("A", true))).toBe(false);
  });

  it("is false for body", () => {
    expect(isRestorableControl(candidate("BODY", true))).toBe(false);
  });

  it("is false for null", () => {
    expect(isRestorableControl(null)).toBe(false);
  });
});

describe("shouldRestoreFocus (W2 decision table)", () => {
  it("is true only for {activeIsBody: true, stillInDocument: true, disabled: false}", () => {
    expect(
      shouldRestoreFocus({ activeIsBody: true, stillInDocument: true, disabled: false }),
    ).toBe(true);
  });

  it("is false when the user has already focused something else after reconnect (activeIsBody: false)", () => {
    expect(
      shouldRestoreFocus({ activeIsBody: false, stillInDocument: true, disabled: false }),
    ).toBe(false);
  });

  // Edge case 8 (shared with edge case 11: a second drop before one reconnect overwrites
  // nothing because activeElement is already body — the pure decision this row exercises
  // is unchanged either way): the reconnect render replaced the remembered element.
  it("is false when the remembered element is no longer in the document (edge case 8, 11)", () => {
    expect(
      shouldRestoreFocus({ activeIsBody: true, stillInDocument: false, disabled: false }),
    ).toBe(false);
  });

  // Edge case 9: the control stays disabled after reconnect (e.g. Resume on a still-live
  // session).
  it("is false when the remembered element is still disabled (edge case 9)", () => {
    expect(
      shouldRestoreFocus({ activeIsBody: true, stillInDocument: true, disabled: true }),
    ).toBe(false);
  });

  it("is false when every condition fails", () => {
    expect(
      shouldRestoreFocus({ activeIsBody: false, stillInDocument: false, disabled: true }),
    ).toBe(false);
  });
});
