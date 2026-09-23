// renderLaunchFooter is the one builder in render/launch.ts that only writes
// textContent/hidden on refs it's given — no document.createElement/cloneNode — so it's
// pinnable without jsdom, same category as render/sessions.ts's renderSizenote. The other
// three builders here (renderRecentsList/renderBrowseListing/renderBrowseLoading) allocate
// real elements via `template.content.cloneNode`/`document.createElement` and have no
// jsdom configured (docs/conventions.md defers DOM construction to Playwright, same
// category as render/tiles.ts's `buildTile`); they are not covered here.
import { describe, expect, it } from "vitest";
import { renderLaunchFooter } from "./launch";

function fakeElement(): HTMLElement {
  return { textContent: "", hidden: false } as unknown as HTMLElement;
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
