// review Minor 6: `checkRadioValue` is the "sync a radio group from external state" idiom
// pulled out of `features/launch.ts` and `render/settings.ts`, which each hand-rolled it.
// Both callers already exercise it indirectly (render/settings.test.ts's "setChecked"
// describe block); this file covers the helper itself directly, including the
// no-match/matched-return-value cases neither caller's own test bothers asserting on.
import { describe, expect, it } from "vitest";
import { checkRadioValue } from "./dom";

function fakeRadio(value: string, checked = false): HTMLInputElement {
  return { value, checked } as unknown as HTMLInputElement;
}

describe("checkRadioValue", () => {
  it("checks exactly the radio whose value matches, unchecking every other one", () => {
    const radios = [fakeRadio("a", true), fakeRadio("b"), fakeRadio("c", true)];
    checkRadioValue(radios, "b");
    expect(radios.map((r) => r.checked)).toEqual([false, true, false]);
  });

  it("unchecks every radio when none match, and returns false", () => {
    const radios = [fakeRadio("a", true), fakeRadio("b", true)];
    const matched = checkRadioValue(radios, "z");
    expect(radios.every((r) => !r.checked)).toBe(true);
    expect(matched).toBe(false);
  });

  it("returns true when a radio matched", () => {
    const radios = [fakeRadio("a"), fakeRadio("b")];
    expect(checkRadioValue(radios, "b")).toBe(true);
  });

  it("is a no-op on an empty radio list, returning false", () => {
    expect(checkRadioValue([], "anything")).toBe(false);
  });
});
