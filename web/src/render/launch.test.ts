// renderLaunchFooter, renderResumeFooter and renderLaunchButtonFace are the builders in
// render/launch.ts that only write textContent/hidden/className on refs they're given —
// no document.createElement/cloneNode — so they're pinnable without jsdom, same category
// as render/sessions.ts's renderSizenote. The other three builders here
// (renderRecentsList/renderBrowseListing/renderBrowseLoading) allocate real elements via
// `template.content.cloneNode`/`document.createElement` and have no jsdom configured
// (docs/conventions.md defers DOM construction to Playwright, same category as
// render/tiles.ts's `buildTile`); they are not covered here.
import { describe, expect, it } from "vitest";
import { renderLaunchButtonFace, renderLaunchFooter, renderResumeFooter } from "./launch";

function fakeElement(): HTMLElement {
  return { textContent: "", hidden: false } as unknown as HTMLElement;
}

function fakeButton(): HTMLButtonElement {
  return { textContent: "", className: "" } as unknown as HTMLButtonElement;
}

describe("renderLaunchFooter — REQ-17's target readout", () => {
  it("shows an em dash and hides the branch when nothing is listed yet (path null)", () => {
    const pathEl = fakeElement();
    const branchEl = fakeElement();
    renderLaunchFooter(pathEl, branchEl, null, null);
    expect(pathEl.textContent).toBe("—");
    expect(branchEl.hidden).toBe(true);
    expect(branchEl.textContent).toBe("");
  });

  it("shows the path with no branch clause when the path has no matching recent's branch", () => {
    const pathEl = fakeElement();
    const branchEl = fakeElement();
    renderLaunchFooter(pathEl, branchEl, "/Users/bob/muster", null);
    expect(pathEl.textContent).toBe("/Users/bob/muster");
    expect(branchEl.hidden).toBe(true);
    expect(branchEl.textContent).toBe("");
  });

  it("shows the path plus ' · <branch>' when a matching recent's branch is known", () => {
    const pathEl = fakeElement();
    const branchEl = fakeElement();
    renderLaunchFooter(pathEl, branchEl, "/Users/bob/muster", "plan/foo");
    expect(pathEl.textContent).toBe("/Users/bob/muster");
    expect(branchEl.hidden).toBe(false);
    expect(branchEl.textContent).toBe(" · plan/foo");
  });

  it("re-renders cleanly from a branch shown back to nothing listed (stale branch text/hidden both reset)", () => {
    const pathEl = fakeElement();
    const branchEl = fakeElement();
    renderLaunchFooter(pathEl, branchEl, "/Users/bob/muster", "plan/foo");
    renderLaunchFooter(pathEl, branchEl, null, null);
    expect(pathEl.textContent).toBe("—");
    expect(branchEl.hidden).toBe(true);
    expect(branchEl.textContent).toBe("");
  });
});

describe("renderResumeFooter — the Resume tab's own target readout ('Resume <title> in <path>')", () => {
  it("shows an em dash and hides the suffix while nothing is selected yet (directory null)", () => {
    const pathEl = fakeElement();
    const suffixEl = fakeElement();
    renderResumeFooter(pathEl, suffixEl, null, null);
    expect(pathEl.textContent).toBe("—");
    expect(suffixEl.hidden).toBe(true);
    expect(suffixEl.textContent).toBe("");
  });

  it("shows the title and ' in <directory>' suffix once a row is selected", () => {
    const pathEl = fakeElement();
    const suffixEl = fakeElement();
    renderResumeFooter(pathEl, suffixEl, "fix the thing", "/Users/bob/muster");
    expect(pathEl.textContent).toBe("fix the thing");
    expect(suffixEl.hidden).toBe(false);
    expect(suffixEl.textContent).toBe(" in /Users/bob/muster");
  });

  // `title === null` means "nothing selected", full stop — a selected-but-untitled row
  // never reaches this function as `null`: its caller (features/launchresume.ts's
  // selectedTitle, via features/launchpastlist.ts's pastRowView) resolves the
  // "(untitled)" fallback before calling. A non-null directory alone must not override
  // that: the dash still shows even with a directory present.
  it("shows the dash and hides the suffix when title is null, even with a directory present", () => {
    const pathEl = fakeElement();
    const suffixEl = fakeElement();
    renderResumeFooter(pathEl, suffixEl, null, "/Users/bob/muster");
    expect(pathEl.textContent).toBe("—");
    expect(suffixEl.hidden).toBe(true);
    expect(suffixEl.textContent).toBe("");
  });

  it("re-renders cleanly from a selection shown back to nothing selected (stale suffix text/hidden both reset)", () => {
    const pathEl = fakeElement();
    const suffixEl = fakeElement();
    renderResumeFooter(pathEl, suffixEl, "fix the thing", "/Users/bob/muster");
    renderResumeFooter(pathEl, suffixEl, null, null);
    expect(pathEl.textContent).toBe("—");
    expect(suffixEl.hidden).toBe(true);
    expect(suffixEl.textContent).toBe("");
  });
});

describe("renderLaunchButtonFace — #launch-button's two faces (REQ-2/REQ-11/INV-2)", () => {
  it("renders the calm face: label verbatim, class 'btn key'", () => {
    const button = fakeButton();
    renderLaunchButtonFace(button, { label: "Launch", danger: false });
    expect(button.textContent).toBe("Launch");
    expect(button.className).toBe("btn key");
  });

  it("renders the danger face: label verbatim, class 'btn key-danger'", () => {
    const button = fakeButton();
    renderLaunchButtonFace(button, { label: "Launch without checks", danger: true });
    expect(button.textContent).toBe("Launch without checks");
    expect(button.className).toBe("btn key-danger");
  });

  it("re-renders cleanly from danger back to calm (stale class doesn't linger)", () => {
    const button = fakeButton();
    renderLaunchButtonFace(button, { label: "Resume without checks", danger: true });
    renderLaunchButtonFace(button, { label: "Resume", danger: false });
    expect(button.textContent).toBe("Resume");
    expect(button.className).toBe("btn key");
  });
});
