import { describe, expect, it } from "vitest";
import { renderBanner, renderBannerContent } from "./banner";

function fakeElement(): HTMLElement {
  const classes = new Set<string>();
  return {
    hidden: false,
    textContent: "",
    classList: {
      toggle(name: string, force?: boolean) {
        const on = force ?? !classes.has(name);
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
      contains(name: string) {
        return classes.has(name);
      },
    },
  } as unknown as HTMLElement;
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

// Plan settings-update-failures REQ-14/17/19: renderBannerContent is the sole writer of
// the banner's text and its REQ-19 neutral modifier — connection.ts composes the text,
// this only ever writes it in once.
describe("renderBannerContent", () => {
  it("writes the given text verbatim", () => {
    const el = fakeElement();
    renderBannerContent(
      el,
      "musterd unreachable — hook output in open panes is Muster's absence, not session failure.",
      false,
    );
    expect(el.textContent).toBe(
      "musterd unreachable — hook output in open panes is Muster's absence, not session failure.",
    );
  });

  it("adds the .neutral class when neutral is true (REQ-19 confirmation style)", () => {
    const el = fakeElement();
    renderBannerContent(el, "Updated to v0.18.1.", true);
    expect(el.classList.contains("neutral")).toBe(true);
  });

  it("removes the .neutral class when neutral is false (the alarm banner tokens)", () => {
    const el = fakeElement();
    renderBannerContent(el, "Updated to v0.18.1.", true);
    renderBannerContent(
      el,
      "musterd unreachable — hook output in open panes is Muster's absence, not session failure.",
      false,
    );
    expect(el.classList.contains("neutral")).toBe(false);
  });
});
