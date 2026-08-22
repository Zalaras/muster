import { describe, expect, it } from "vitest";
import { renderBanner } from "./banner";

function fakeElement(): HTMLElement {
  return { hidden: false } as unknown as HTMLElement;
}

describe("renderBanner", () => {
  it("unhides the banner when visible is true (daemon-down)", () => {
    const el = fakeElement();
    el.hidden = true;
    renderBanner(el, true);
    expect(el.hidden).toBe(false);
  });

  it("hides the banner when visible is false (connected / not-yet-connected)", () => {
    const el = fakeElement();
    el.hidden = false;
    renderBanner(el, false);
    expect(el.hidden).toBe(true);
  });
});
