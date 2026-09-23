// updateSurfaceSegment's DOM-attribute-write contract, exercised against hand-built fakes
// (this project's established convention for element refs with no real DOM available —
// see render/mainhead.test.ts's fakeButton/fakeNameEl and render/tiles.test.ts's
// fakeElement/fakeNameEl). `buildSurfaceSegment` (which allocates real elements) is out of
// scope here — no jsdom is configured (web/vitest.config.ts), same category as
// render/tiles.ts's `buildTile` (excluded from tiles.test.ts for the identical reason).
// It is not covered here; the Testable UI Elements table's `role="group"`/button-name/
// accessible-name (INV-3) assertions are Playwright's job (web/e2e/shell-activity.spec.ts's
// W5-style coverage). The pure per-session surface-switch state this reads
// (DEFAULT_SURFACE_STATE/SessionSurfaceState) is tested in
// `../terminal/surfaceswitch.test.ts`, not here.
import { describe, expect, it } from "vitest";
import { DEFAULT_SURFACE_STATE, type SessionSurfaceState } from "../terminal/surfaceswitch";
import { updateSurfaceSegment, type SurfaceSegmentRefs } from "./surfaceseg";

interface FakeSurfaceButton {
  attrs: Record<string, string>;
  disabled: boolean;
  children: FakeShellActEl[];
  setAttribute(name: string, value: string): void;
  contains(el: FakeShellActEl): boolean;
  prepend(el: FakeShellActEl): void;
}

interface FakeShellActEl {
  dataset: Record<string, string>;
  remove(): void;
}

function fakeSurfaceButton(): FakeSurfaceButton {
  const btn: FakeSurfaceButton = {
    attrs: {},
    disabled: false,
    children: [],
    setAttribute(name, value) {
      btn.attrs[name] = value;
    },
    contains(el) {
      return btn.children.includes(el);
    },
    prepend(el) {
      btn.children.unshift(el);
    },
  };
  return btn;
}

function fakeSurfaceSegmentRefs(): SurfaceSegmentRefs & {
  claudeBtn: FakeSurfaceButton;
  shellBtn: FakeSurfaceButton;
  docsBtn: FakeSurfaceButton;
} {
  const claudeBtn = fakeSurfaceButton();
  const shellBtn = fakeSurfaceButton();
  const docsBtn = fakeSurfaceButton();
  const shellActEl: FakeShellActEl = {
    dataset: {},
    remove() {
      const i = shellBtn.children.indexOf(shellActEl);
      if (i >= 0) shellBtn.children.splice(i, 1);
    },
  };
  return {
    root: {} as unknown as HTMLElement,
    claudeBtn: claudeBtn as unknown as HTMLButtonElement & FakeSurfaceButton,
    shellBtn: shellBtn as unknown as HTMLButtonElement & FakeSurfaceButton,
    docsBtn: docsBtn as unknown as HTMLButtonElement & FakeSurfaceButton,
    shellActEl: shellActEl as unknown as HTMLElement,
  } as SurfaceSegmentRefs & {
    claudeBtn: FakeSurfaceButton;
    shellBtn: FakeSurfaceButton;
    docsBtn: FakeSurfaceButton;
  };
}

/** `"none"` when the indicator isn't attached at all, else the `data-act` value the real
 * `dataset["act"]` write would produce — mirrors what a caller actually observes: the
 * indicator's presence and its `data-act` are the contract, not a boolean. */
function shellActState(refs: ReturnType<typeof fakeSurfaceSegmentRefs>): string {
  const el = refs.shellActEl as unknown as FakeShellActEl;
  if (!refs.shellBtn.contains(el)) return "none";
  return el.dataset["act"] ?? "";
}

describe("updateSurfaceSegment — States: 'no data yet' has no indicator; busy/done attach one with data-act", () => {
  it("activity 'none': claude pressed, shell not pressed, no indicator in the DOM", () => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, true, "none");
    expect(refs.claudeBtn.attrs["aria-pressed"]).toBe("true");
    expect(refs.shellBtn.attrs["aria-pressed"]).toBe("false");
    expect(refs.docsBtn.attrs["aria-pressed"]).toBe("false");
    expect(shellActState(refs)).toBe("none");
  });

  it("docs selected: docs pressed, neither claude nor shell pressed (plan markdown-viewing REQ-1, W4)", () => {
    const refs = fakeSurfaceSegmentRefs();
    const state: SessionSurfaceState = { selected: "docs", shellRunning: false };
    updateSurfaceSegment(refs, state, true, "none");
    expect(refs.claudeBtn.attrs["aria-pressed"]).toBe("false");
    expect(refs.shellBtn.attrs["aria-pressed"]).toBe("false");
    expect(refs.docsBtn.attrs["aria-pressed"]).toBe("true");
  });

  it("activity 'busy': shell pressed, indicator attached with data-act='busy'", () => {
    const refs = fakeSurfaceSegmentRefs();
    const state: SessionSurfaceState = { selected: "shell", shellRunning: true };
    updateSurfaceSegment(refs, state, true, "busy");
    expect(refs.claudeBtn.attrs["aria-pressed"]).toBe("false");
    expect(refs.shellBtn.attrs["aria-pressed"]).toBe("true");
    expect(shellActState(refs)).toBe("busy");
  });

  it("activity 'busy' while claude is selected: indicator still attached (the indicator reflects `activity`, not which surface is selected)", () => {
    const refs = fakeSurfaceSegmentRefs();
    const state: SessionSurfaceState = { selected: "claude", shellRunning: true };
    updateSurfaceSegment(refs, state, true, "busy");
    expect(refs.claudeBtn.attrs["aria-pressed"]).toBe("true");
    expect(refs.shellBtn.attrs["aria-pressed"]).toBe("false");
    expect(shellActState(refs)).toBe("busy");
  });

  it("activity 'done': indicator attached with data-act='done'", () => {
    const refs = fakeSurfaceSegmentRefs();
    const state: SessionSurfaceState = { selected: "claude", shellRunning: true };
    updateSurfaceSegment(refs, state, true, "done");
    expect(shellActState(refs)).toBe("done");
  });

  it("the indicator is removed on the next pass once activity returns to 'none' (REQ-4 self-clear/REQ-8 shell-gone)", () => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, { selected: "shell", shellRunning: true }, true, "busy");
    expect(shellActState(refs)).toBe("busy");
    updateSurfaceSegment(refs, { selected: "claude", shellRunning: false }, true, "none");
    expect(shellActState(refs)).toBe("none");
  });

  it("a second pass with the same activity does not attach a duplicate", () => {
    const refs = fakeSurfaceSegmentRefs();
    const state: SessionSurfaceState = { selected: "shell", shellRunning: true };
    updateSurfaceSegment(refs, state, true, "busy");
    updateSurfaceSegment(refs, state, true, "busy");
    expect(refs.shellBtn.children.length).toBe(1);
  });

  it("activity 'busy' then 'done' across two passes updates data-act in place, without a duplicate or a detach in between", () => {
    const refs = fakeSurfaceSegmentRefs();
    const state: SessionSurfaceState = { selected: "shell", shellRunning: true };
    updateSurfaceSegment(refs, state, true, "busy");
    updateSurfaceSegment(refs, state, true, "done");
    expect(refs.shellBtn.children.length).toBe(1);
    expect(shellActState(refs)).toBe("done");
  });
});

describe("updateSurfaceSegment — States: 'daemon down' disables both segments, never gated on alive/shellRunning", () => {
  it("disables both buttons when connected=false, regardless of which surface is selected", () => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, { selected: "shell", shellRunning: true }, false, "busy");
    expect(refs.claudeBtn.disabled).toBe(true);
    expect(refs.shellBtn.disabled).toBe(true);
    expect(refs.docsBtn.disabled).toBe(true);
  });

  it("re-enables both buttons once connected=true again", () => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, false, "none");
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, true, "none");
    expect(refs.claudeBtn.disabled).toBe(false);
    expect(refs.shellBtn.disabled).toBe(false);
  });

  it("the shell segment stays enabled while connected even on a dead session (REQ-7: the shell button is never gated on alive) — modelled here as 'update never even receives alive', so connected=true always enables it regardless of the caller's session state", () => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, true, "none");
    expect(refs.shellBtn.disabled).toBe(false);
  });
});
