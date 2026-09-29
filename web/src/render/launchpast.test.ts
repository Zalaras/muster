// renderPastHead is the one builder in render/launchpast.ts that only writes textContent
// on a ref it's given — no document.createElement/cloneNode — so it's pinnable without
// jsdom, same category as render/launch.ts's renderLaunchFooter (see that file's own
// test). renderPastLoading/renderPastError/renderPastList allocate real elements via
// document.createElement and have no jsdom configured (docs/conventions.md defers DOM
// construction to Playwright); they are not covered here.
import { describe, expect, it } from "vitest";
import { renderPastHead } from "./launchpast";

function fakeElement(): HTMLElement {
  return { textContent: "" } as unknown as HTMLElement;
}

describe("renderPastHead — the Resume tab's list head (design-system §6 honesty rules)", () => {
  it("omits the count while it isn't known yet (loading/error)", () => {
    const el = fakeElement();
    renderPastHead(el, "muster", null);
    expect(el.textContent).toBe("Claude sessions in muster");
  });

  it("includes the count once the fetch has landed, even when it's zero", () => {
    const el = fakeElement();
    renderPastHead(el, "muster", 0);
    expect(el.textContent).toBe("Claude sessions in muster · 0");
  });

  it("includes a positive count", () => {
    const el = fakeElement();
    renderPastHead(el, "muster", 3);
    expect(el.textContent).toBe("Claude sessions in muster · 3");
  });

  it("re-renders cleanly from a known count back to unknown (stale count doesn't linger)", () => {
    const el = fakeElement();
    renderPastHead(el, "muster", 3);
    renderPastHead(el, "muster", null);
    expect(el.textContent).toBe("Claude sessions in muster");
  });
});
