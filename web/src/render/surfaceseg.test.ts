// updateSurfaceSegment's DOM-attribute-write contract, exercised against hand-built fakes
// (this project's established convention for element refs with no real DOM available —
// see render/mainhead.test.ts's fakeButton/fakeNameEl and render/tiles.test.ts's
// fakeElement/fakeNameEl). `buildSurfaceSegment` (which allocates real elements) is out of
// scope here — no jsdom is configured (web/vitest.config.ts), same category as
// render/tiles.ts's `buildTile` (excluded from tiles.test.ts for the identical reason).
// It is not covered here; the Testable UI Elements table's `role="group"`/button-name/
// accessible-name assertions are Playwright's job (web/e2e/shell-activity.spec.ts's
// coverage). The pure per-session surface-switch state this reads
// (DEFAULT_SURFACE_STATE/SessionSurfaceState) is tested in
// `../terminal/surfaceswitch.test.ts`, not here.
import { describe, expect, it } from "vitest";
import { DEFAULT_SURFACE_STATE, type SessionSurfaceState } from "../terminal/surfaceswitch";
import {
  NO_TERMINALS_VIEW,
  updateSurfaceSegment,
  type SurfaceSegmentRefs,
  type SurfaceTerminalsView,
} from "./surfaceseg";

interface FakeSurfaceButton {
  attrs: Record<string, string>;
  disabled: boolean;
  children: FakeShellActEl[];
  title: string;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  append(el: FakeShellActEl): void;
  contains(el: FakeShellActEl): boolean;
  prepend(el: FakeShellActEl): void;
}

interface FakeShellActEl {
  dataset: Record<string, string>;
  textContent: string;
  remove(): void;
}

function fakeSurfaceButton(): FakeSurfaceButton {
  const btn: FakeSurfaceButton = {
    attrs: {},
    disabled: false,
    children: [],
    title: "",
    setAttribute(name, value) {
      btn.attrs[name] = value;
    },
    removeAttribute(name) {
      delete btn.attrs[name];
      if (name === "title") btn.title = "";
    },
    append(el) {
      btn.children.push(el);
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
  terminalsBtn: FakeSurfaceButton;
  countEl: FakeShellActEl;
} {
  const claudeBtn = fakeSurfaceButton();
  const terminalsBtn = fakeSurfaceButton();
  const shellBtn = fakeSurfaceButton();
  const docsBtn = fakeSurfaceButton();
  const countEl: FakeShellActEl = {
    dataset: {},
    textContent: "",
    remove() {
      const i = shellBtn.children.indexOf(countEl);
      if (i >= 0) shellBtn.children.splice(i, 1);
    },
  };
  const shellActEl: FakeShellActEl = {
    dataset: {},
    textContent: "",
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
    terminalsBtn: terminalsBtn as unknown as HTMLButtonElement & FakeSurfaceButton,
    countEl: countEl as unknown as HTMLElement,
    shellActEl: shellActEl as unknown as HTMLElement,
  } as SurfaceSegmentRefs & {
    claudeBtn: FakeSurfaceButton;
    shellBtn: FakeSurfaceButton;
    docsBtn: FakeSurfaceButton;
    terminalsBtn: FakeSurfaceButton;
    countEl: FakeShellActEl;
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
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, true, "none", NO_TERMINALS_VIEW);
    expect(refs.claudeBtn.attrs["aria-pressed"]).toBe("true");
    expect(refs.shellBtn.attrs["aria-pressed"]).toBe("false");
    expect(refs.docsBtn.attrs["aria-pressed"]).toBe("false");
    expect(shellActState(refs)).toBe("none");
  });

  it("docs selected: docs pressed, neither claude nor shell pressed (plan markdown-viewing REQ-1, W4)", () => {
    const refs = fakeSurfaceSegmentRefs();
    const state: SessionSurfaceState = {
      selected: "docs",
      shell: null,
    };
    updateSurfaceSegment(refs, state, true, "none", NO_TERMINALS_VIEW);
    expect(refs.claudeBtn.attrs["aria-pressed"]).toBe("false");
    expect(refs.shellBtn.attrs["aria-pressed"]).toBe("false");
    expect(refs.docsBtn.attrs["aria-pressed"]).toBe("true");
  });

  it("activity 'busy': shell pressed, indicator attached with data-act='busy'", () => {
    const refs = fakeSurfaceSegmentRefs();
    const state: SessionSurfaceState = {
      selected: "shell",
      shell: 1,
    };
    updateSurfaceSegment(refs, state, true, "busy", NO_TERMINALS_VIEW);
    expect(refs.claudeBtn.attrs["aria-pressed"]).toBe("false");
    expect(refs.shellBtn.attrs["aria-pressed"]).toBe("true");
    expect(shellActState(refs)).toBe("busy");
  });

  it("activity 'busy' while claude is selected: indicator still attached (the indicator reflects `activity`, not which surface is selected)", () => {
    const refs = fakeSurfaceSegmentRefs();
    const state: SessionSurfaceState = {
      selected: "claude",
      shell: 1,
    };
    updateSurfaceSegment(refs, state, true, "busy", NO_TERMINALS_VIEW);
    expect(refs.claudeBtn.attrs["aria-pressed"]).toBe("true");
    expect(refs.shellBtn.attrs["aria-pressed"]).toBe("false");
    expect(shellActState(refs)).toBe("busy");
  });

  it("activity 'done': indicator attached with data-act='done'", () => {
    const refs = fakeSurfaceSegmentRefs();
    const state: SessionSurfaceState = {
      selected: "claude",
      shell: 1,
    };
    updateSurfaceSegment(refs, state, true, "done", NO_TERMINALS_VIEW);
    expect(shellActState(refs)).toBe("done");
  });

  it("the indicator is removed on the next pass once activity returns to 'none' (REQ-4 self-clear/REQ-8 shell-gone)", () => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, { selected: "shell", shell: 1 }, true, "busy", NO_TERMINALS_VIEW);
    expect(shellActState(refs)).toBe("busy");
    updateSurfaceSegment(
      refs,
      { selected: "claude", shell: null },
      true,
      "none",
      NO_TERMINALS_VIEW,
    );
    expect(shellActState(refs)).toBe("none");
  });

  it("a second pass with the same activity does not attach a duplicate", () => {
    const refs = fakeSurfaceSegmentRefs();
    const state: SessionSurfaceState = {
      selected: "shell",
      shell: 1,
    };
    updateSurfaceSegment(refs, state, true, "busy", NO_TERMINALS_VIEW);
    updateSurfaceSegment(refs, state, true, "busy", NO_TERMINALS_VIEW);
    expect(refs.shellBtn.children.length).toBe(1);
  });

  it("activity 'busy' then 'done' across two passes updates data-act in place, without a duplicate or a detach in between", () => {
    const refs = fakeSurfaceSegmentRefs();
    const state: SessionSurfaceState = {
      selected: "shell",
      shell: 1,
    };
    updateSurfaceSegment(refs, state, true, "busy", NO_TERMINALS_VIEW);
    updateSurfaceSegment(refs, state, true, "done", NO_TERMINALS_VIEW);
    expect(refs.shellBtn.children.length).toBe(1);
    expect(shellActState(refs)).toBe("done");
  });
});

describe("updateSurfaceSegment — States: 'daemon down' disables both segments, never gated on alive/shellRunning", () => {
  it("disables both buttons when connected=false, regardless of which surface is selected", () => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, { selected: "shell", shell: 1 }, false, "busy", NO_TERMINALS_VIEW);
    expect(refs.claudeBtn.disabled).toBe(true);
    expect(refs.shellBtn.disabled).toBe(true);
    expect(refs.docsBtn.disabled).toBe(true);
  });

  it("re-enables both buttons once connected=true again", () => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, false, "none", NO_TERMINALS_VIEW);
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, true, "none", NO_TERMINALS_VIEW);
    expect(refs.claudeBtn.disabled).toBe(false);
    expect(refs.shellBtn.disabled).toBe(false);
  });

  it("the shell segment stays enabled while connected even on a dead session (REQ-7: the shell button is never gated on alive) — modelled here as 'update never even receives alive', so connected=true always enables it regardless of the caller's session state", () => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, true, "none", NO_TERMINALS_VIEW);
    expect(refs.shellBtn.disabled).toBe(false);
  });
});

describe("updateSurfaceSegment — terminal count, title and ▾ opener (REQ-8, 9, 10, 14)", () => {
  const view = (count: number, shownName: string | null = null): SurfaceTerminalsView => ({
    count,
    shownName,
  });
  const counted = (refs: ReturnType<typeof fakeSurfaceSegmentRefs>) =>
    refs.shellBtn.children.includes(refs.countEl as unknown as FakeShellActEl);

  it.each([0, 1])(
    "%i running terminals: no count element attached (absent, not hidden)",
    (count) => {
      const refs = fakeSurfaceSegmentRefs();
      updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, true, "none", view(count));
      expect(counted(refs)).toBe(false);
    },
  );

  it.each([2, 3, 12])("%i running terminals: count attached with that number", (count) => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, true, "none", view(count));
    expect(counted(refs)).toBe(true);
    expect(refs.countEl.textContent).toBe(String(count));
  });

  it("the count follows the list: 3 -> 2 updates in place, 2 -> 1 detaches, no duplicate", () => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, true, "none", view(3));
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, true, "none", view(3));
    expect(refs.shellBtn.children.length).toBe(1);
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, true, "none", view(2));
    expect(refs.countEl.textContent).toBe("2");
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, true, "none", view(1));
    expect(counted(refs)).toBe(false);
  });

  it("the shell button's title is the shown terminal's name only while shell is selected", () => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, { selected: "shell", shell: 2 }, true, "none", view(2, "build"));
    expect(refs.shellBtn.title).toBe("build");
    updateSurfaceSegment(refs, { selected: "claude", shell: 2 }, true, "none", view(2, "build"));
    expect(refs.shellBtn.title).toBe("");
  });

  it("no title for a null shown name even with shell selected", () => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, { selected: "shell", shell: null }, true, "none", view(0));
    expect(refs.shellBtn.title).toBe("");
  });

  it.each([
    [false, true],
    [true, false],
  ])("connected=%s: the ▾ opener disabled=%s", (connected, disabled) => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, connected, "none", view(2));
    expect(refs.terminalsBtn.disabled).toBe(disabled);
  });
});
