// Plan plain-terminal-session (REQ-4/REQ-7/REQ-8): covers the pure per-session
// surface-switch state (getSurfaceState/selectSurface/setShellRunning/shellEnded/
// forgetSession/isSurfaceAttachable), the composite (id, kind) key helpers
// (surfaceKey/parseSurfaceKey), and `updateSurfaceSegment`'s DOM-attribute-write
// contract. Per the module's own header comment this state is deliberately kept out of
// any Session/DOM shape so it's Vitest-testable without jsdom — see
// docs/conventions.md's logic/rendering split and web/vitest.config.ts (no jsdom
// installed in this project, confirmed: no `jsdom`/`happy-dom` dependency).
//
// `buildSurfaceSegment` itself calls `document.createElement` and is real DOM
// construction with no jsdom available in this Vitest environment — same category as
// render/tiles.ts's `buildTile` (excluded from tiles.test.ts for the identical reason,
// see that file's header comment). It is not covered here; the Testable UI Elements
// table's `role="group"`/button-name/pip-presence assertions are Playwright's job
// (web/e2e/plain-shell.spec.ts's W1/W4-style coverage).
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SURFACE_STATE,
  forgetSession,
  getSurfaceState,
  isSurfaceAttachable,
  parseSurfaceKey,
  selectSurface,
  setShellRunning,
  shellEnded,
  surfaceKey,
  updateSurfaceSegment,
  type SessionSurfaceState,
  type SurfaceSegmentRefs,
  type SurfaceSwitchState,
} from "./surfaceswitch";

describe("surfaceswitch — DEFAULT_SURFACE_STATE / getSurfaceState (States: 'no data yet')", () => {
  it("is claude selected, shellRunning false — the state every session starts at", () => {
    expect(DEFAULT_SURFACE_STATE).toEqual({ selected: "claude", shellRunning: false });
  });

  it("getSurfaceState returns the default for a session with no entry in the map", () => {
    const state: SurfaceSwitchState = new Map();
    expect(getSurfaceState(state, 1)).toBe(DEFAULT_SURFACE_STATE);
  });

  it("getSurfaceState returns the stored entry for a session that has one", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shellRunning: true }]]);
    expect(getSurfaceState(state, 1)).toEqual({ selected: "shell", shellRunning: true });
  });

  it("getSurfaceState keys strictly per session id — an unrelated id's entry never leaks", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shellRunning: true }]]);
    expect(getSurfaceState(state, 2)).toBe(DEFAULT_SURFACE_STATE);
  });
});

describe("surfaceswitch — selectSurface (user flows 2/3: switching which surface is selected)", () => {
  it("switches an unset session straight to shell (identity map, new entry)", () => {
    const state: SurfaceSwitchState = new Map();
    const next = selectSurface(state, 1, "shell");
    expect(getSurfaceState(next, 1)).toEqual({ selected: "shell", shellRunning: false });
  });

  it("switching back to claude preserves shellRunning (a shell can keep running while hidden — REQ-6)", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shellRunning: true }]]);
    const next = selectSurface(state, 1, "claude");
    expect(getSurfaceState(next, 1)).toEqual({ selected: "claude", shellRunning: true });
  });

  it("returns the exact same map instance when the surface is already selected (no redundant re-render)", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shellRunning: true }]]);
    const next = selectSurface(state, 1, "shell");
    expect(next).toBe(state);
  });

  it("returns the same default-identity behaviour for an unset session already implicitly on claude", () => {
    const state: SurfaceSwitchState = new Map();
    const next = selectSurface(state, 1, "claude");
    expect(next).toBe(state);
  });

  it("does not disturb another session's entry", () => {
    const state: SurfaceSwitchState = new Map([
      [1, { selected: "claude", shellRunning: false }],
      [2, { selected: "shell", shellRunning: true }],
    ]);
    const next = selectSurface(state, 1, "shell");
    expect(getSurfaceState(next, 2)).toEqual({ selected: "shell", shellRunning: true });
  });
});

describe("surfaceswitch — setShellRunning (REQ-1/REQ-8: tracks whether the daemon reports a live shell)", () => {
  it("sets shellRunning true on an unset session without changing selected", () => {
    const state: SurfaceSwitchState = new Map();
    const next = setShellRunning(state, 1, true);
    expect(getSurfaceState(next, 1)).toEqual({ selected: "claude", shellRunning: true });
  });

  it("clears shellRunning while leaving selected untouched (e.g. still showing shell)", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shellRunning: true }]]);
    const next = setShellRunning(state, 1, false);
    expect(getSurfaceState(next, 1)).toEqual({ selected: "shell", shellRunning: false });
  });

  it("returns the same map instance when the value is unchanged", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shellRunning: true }]]);
    expect(setShellRunning(state, 1, true)).toBe(state);
  });

  it("returns the same map instance for an unset session set to false (already false by default)", () => {
    const state: SurfaceSwitchState = new Map();
    expect(setShellRunning(state, 1, false)).toBe(state);
  });
});

describe("surfaceswitch — shellEnded (REQ-8: exit/kill reverts to claude and clears the pip atomically)", () => {
  it("reverts selected to claude and clears shellRunning when shell was showing", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shellRunning: true }]]);
    const next = shellEnded(state, 1);
    expect(getSurfaceState(next, 1)).toEqual({ selected: "claude", shellRunning: false });
  });

  it("still clears shellRunning (the pip) even when claude was already the visible surface (edge case 7: pip stays lit until the next click otherwise)", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "claude", shellRunning: true }]]);
    const next = shellEnded(state, 1);
    expect(getSurfaceState(next, 1)).toEqual({ selected: "claude", shellRunning: false });
  });

  it("is idempotent / identity when the session is already at the default state", () => {
    const state: SurfaceSwitchState = new Map();
    expect(shellEnded(state, 1)).toBe(state);
  });

  it("is identity when a stored entry is already exactly the default shape", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "claude", shellRunning: false }]]);
    expect(shellEnded(state, 1)).toBe(state);
  });

  it("does not disturb another session's entry", () => {
    const state: SurfaceSwitchState = new Map([
      [1, { selected: "shell", shellRunning: true }],
      [2, { selected: "shell", shellRunning: true }],
    ]);
    const next = shellEnded(state, 1);
    expect(getSurfaceState(next, 2)).toEqual({ selected: "shell", shellRunning: true });
  });
});

describe("surfaceswitch — forgetSession (a removed session's entry must not accumulate)", () => {
  it("removes the session's entry", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shellRunning: true }]]);
    const next = forgetSession(state, 1);
    expect(next.has(1)).toBe(false);
    expect(getSurfaceState(next, 1)).toBe(DEFAULT_SURFACE_STATE);
  });

  it("returns the same map instance when the session has no entry", () => {
    const state: SurfaceSwitchState = new Map();
    expect(forgetSession(state, 1)).toBe(state);
  });

  it("leaves other sessions' entries untouched", () => {
    const state: SurfaceSwitchState = new Map([
      [1, { selected: "shell", shellRunning: true }],
      [2, { selected: "shell", shellRunning: true }],
    ]);
    const next = forgetSession(state, 1);
    expect(getSurfaceState(next, 2)).toEqual({ selected: "shell", shellRunning: true });
  });
});

describe("surfaceswitch — isSurfaceAttachable (REQ-7: shell never consults alive, in either direction)", () => {
  it("claude selected: follows alive=true", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "claude", shellRunning: false }]]);
    expect(isSurfaceAttachable(state, 1, true)).toBe(true);
  });

  it("claude selected: follows alive=false", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "claude", shellRunning: false }]]);
    expect(isSurfaceAttachable(state, 1, false)).toBe(false);
  });

  it("shell selected, shellRunning=true: attachable even though alive=false (starting a shell on a dead session)", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shellRunning: true }]]);
    expect(isSurfaceAttachable(state, 1, false)).toBe(true);
  });

  it("shell selected, shellRunning=true: attachable when alive=true too (alive is simply irrelevant)", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shellRunning: true }]]);
    expect(isSurfaceAttachable(state, 1, true)).toBe(true);
  });

  it("shell selected, shellRunning=false: not attachable even though alive=true (no live shell to attach to)", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shellRunning: false }]]);
    expect(isSurfaceAttachable(state, 1, true)).toBe(false);
  });

  it("unset session defaults to claude/not-shellRunning, so it follows alive", () => {
    const state: SurfaceSwitchState = new Map();
    expect(isSurfaceAttachable(state, 1, true)).toBe(true);
    expect(isSurfaceAttachable(state, 1, false)).toBe(false);
  });
});

describe("surfaceswitch — surfaceKey / parseSurfaceKey (the composite key main.ts's surface manager keys on)", () => {
  it("round-trips both kinds", () => {
    expect(parseSurfaceKey(surfaceKey(1, "claude"))).toEqual({ id: 1, kind: "claude" });
    expect(parseSurfaceKey(surfaceKey(1, "shell"))).toEqual({ id: 1, kind: "shell" });
  });

  it("produces distinct keys for the two kinds of the same session id (INV-3: independent attach targets)", () => {
    expect(surfaceKey(1, "claude")).not.toBe(surfaceKey(1, "shell"));
  });

  it("produces distinct keys for different session ids of the same kind", () => {
    expect(surfaceKey(1, "shell")).not.toBe(surfaceKey(2, "shell"));
  });

  it("parseSurfaceKey falls back to claude for any kind suffix it doesn't recognise (defensive parse, not just the two known shapes)", () => {
    expect(parseSurfaceKey("1:bogus")).toEqual({ id: 1, kind: "claude" });
    expect(parseSurfaceKey("1:")).toEqual({ id: 1, kind: "claude" });
  });

  it("parseSurfaceKey on a malformed key with no separator yields NaN for id rather than throwing", () => {
    const parsed = parseSurfaceKey("not-a-key");
    expect(parsed.kind).toBe("claude");
    expect(Number.isNaN(parsed.id)).toBe(true);
  });
});

// ── updateSurfaceSegment: DOM-attribute-write contract, exercised against hand-built
// fakes (this project's established convention for element refs with no real DOM
// available — see render/mainhead.test.ts's fakeButton/fakeNameEl and
// render/tiles.test.ts's fakeElement/fakeNameEl). `buildSurfaceSegment` (which allocates
// real elements) is out of scope here — see file header.

interface FakeSurfaceButton {
  attrs: Record<string, string>;
  disabled: boolean;
  children: FakeSurfacePip[];
  setAttribute(name: string, value: string): void;
  contains(el: FakeSurfacePip): boolean;
  prepend(el: FakeSurfacePip): void;
}

interface FakeSurfacePip {
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
} {
  const claudeBtn = fakeSurfaceButton();
  const shellBtn = fakeSurfaceButton();
  const pipEl: FakeSurfacePip = {
    remove() {
      const i = shellBtn.children.indexOf(pipEl);
      if (i >= 0) shellBtn.children.splice(i, 1);
    },
  };
  return {
    root: {} as unknown as HTMLElement,
    claudeBtn: claudeBtn as unknown as HTMLButtonElement & FakeSurfaceButton,
    shellBtn: shellBtn as unknown as HTMLButtonElement & FakeSurfaceButton,
    pipEl: pipEl as unknown as HTMLElement,
  } as SurfaceSegmentRefs & { claudeBtn: FakeSurfaceButton; shellBtn: FakeSurfaceButton };
}

function hasPip(refs: ReturnType<typeof fakeSurfaceSegmentRefs>): boolean {
  return refs.shellBtn.contains(refs.pipEl as unknown as FakeSurfacePip);
}

describe("updateSurfaceSegment — States: 'no data yet' has no pip; a running shell shows one", () => {
  it("no session ever switched: claude pressed, shell not pressed, no pip in the DOM", () => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, true);
    expect(refs.claudeBtn.attrs["aria-pressed"]).toBe("true");
    expect(refs.shellBtn.attrs["aria-pressed"]).toBe("false");
    expect(hasPip(refs)).toBe(false);
  });

  it("a running, visible shell: shell pressed, pip attached", () => {
    const refs = fakeSurfaceSegmentRefs();
    const state: SessionSurfaceState = { selected: "shell", shellRunning: true };
    updateSurfaceSegment(refs, state, true);
    expect(refs.claudeBtn.attrs["aria-pressed"]).toBe("false");
    expect(refs.shellBtn.attrs["aria-pressed"]).toBe("true");
    expect(hasPip(refs)).toBe(true);
  });

  it("a running shell hidden behind claude: claude pressed, pip still attached (the pip is a positive claim about the shell, independent of which surface is selected)", () => {
    const refs = fakeSurfaceSegmentRefs();
    const state: SessionSurfaceState = { selected: "claude", shellRunning: true };
    updateSurfaceSegment(refs, state, true);
    expect(refs.claudeBtn.attrs["aria-pressed"]).toBe("true");
    expect(refs.shellBtn.attrs["aria-pressed"]).toBe("false");
    expect(hasPip(refs)).toBe(true);
  });

  it("the pip is removed on the next pass once shellRunning goes back to false (REQ-8)", () => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, { selected: "shell", shellRunning: true }, true);
    expect(hasPip(refs)).toBe(true);
    updateSurfaceSegment(refs, { selected: "claude", shellRunning: false }, true);
    expect(hasPip(refs)).toBe(false);
  });

  it("a second pass with the pip already attached does not attach a duplicate", () => {
    const refs = fakeSurfaceSegmentRefs();
    const state: SessionSurfaceState = { selected: "shell", shellRunning: true };
    updateSurfaceSegment(refs, state, true);
    updateSurfaceSegment(refs, state, true);
    expect(refs.shellBtn.children.length).toBe(1);
  });
});

describe("updateSurfaceSegment — States: 'daemon down' disables both segments, never gated on alive/shellRunning", () => {
  it("disables both buttons when connected=false, regardless of which surface is selected", () => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, { selected: "shell", shellRunning: true }, false);
    expect(refs.claudeBtn.disabled).toBe(true);
    expect(refs.shellBtn.disabled).toBe(true);
  });

  it("re-enables both buttons once connected=true again", () => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, false);
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, true);
    expect(refs.claudeBtn.disabled).toBe(false);
    expect(refs.shellBtn.disabled).toBe(false);
  });

  it("the shell segment stays enabled while connected even on a dead session (REQ-7: the shell button is never gated on alive) — modelled here as 'update never even receives alive', so connected=true always enables it regardless of the caller's session state", () => {
    const refs = fakeSurfaceSegmentRefs();
    updateSurfaceSegment(refs, DEFAULT_SURFACE_STATE, true);
    expect(refs.shellBtn.disabled).toBe(false);
  });
});
