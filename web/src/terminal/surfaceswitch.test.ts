// Plan plain-terminal-session (REQ-4/REQ-7/REQ-8): covers the pure per-session
// surface-switch state (getSurfaceState/selectSurface/setShellRunning/shellEnded/
// forgetSession/isSurfaceAttachable) and the composite (id, kind) key helpers
// (surfaceKey/parseSurfaceKey). Per the module's own header comment this state is
// deliberately kept out of any Session/DOM shape so it's Vitest-testable without jsdom —
// see docs/conventions.md's logic/rendering split and web/vitest.config.ts (no jsdom
// installed in this project, confirmed: no `jsdom`/`happy-dom` dependency).
// `updateSurfaceSegment`'s DOM-attribute-write contract lives in
// `../render/surfaceseg.test.ts`, not here.
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

  it("selects docs (plan markdown-viewing REQ-1, W4) without touching shellRunning", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shellRunning: true }]]);
    const next = selectSurface(state, 1, "docs");
    expect(getSurfaceState(next, 1)).toEqual({ selected: "docs", shellRunning: true });
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

describe("surfaceswitch — shellEnded (REQ-8: exit/kill reverts to claude and clears shellRunning atomically)", () => {
  it("reverts selected to claude and clears shellRunning when shell was showing", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shellRunning: true }]]);
    const next = shellEnded(state, 1);
    expect(getSurfaceState(next, 1)).toEqual({ selected: "claude", shellRunning: false });
  });

  it("still clears shellRunning even when claude was already the visible surface (edge case 7: shellRunning — which gates attachability and background mounting, not any indicator — would otherwise stay true until the next click)", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "claude", shellRunning: true }]]);
    const next = shellEnded(state, 1);
    expect(getSurfaceState(next, 1)).toEqual({ selected: "claude", shellRunning: false });
  });

  it("leaves a docs selection untouched, only clearing shellRunning (plan markdown-viewing edge case 20/INV-1, W4)", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "docs", shellRunning: true }]]);
    const next = shellEnded(state, 1);
    expect(getSurfaceState(next, 1)).toEqual({ selected: "docs", shellRunning: false });
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

  // Plan markdown-viewing INV-1, W4: docs never has a TerminalSurface, across every
  // alive x shellRunning combination.
  it("docs selected, shellRunning=false: never attachable regardless of alive=true", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "docs", shellRunning: false }]]);
    expect(isSurfaceAttachable(state, 1, true)).toBe(false);
  });

  it("docs selected, shellRunning=false: never attachable regardless of alive=false", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "docs", shellRunning: false }]]);
    expect(isSurfaceAttachable(state, 1, false)).toBe(false);
  });

  it("docs selected, shellRunning=true: never attachable regardless of alive=true", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "docs", shellRunning: true }]]);
    expect(isSurfaceAttachable(state, 1, true)).toBe(false);
  });

  it("docs selected, shellRunning=true: never attachable regardless of alive=false", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "docs", shellRunning: true }]]);
    expect(isSurfaceAttachable(state, 1, false)).toBe(false);
  });
});

describe("surfaceswitch — surfaceKey / parseSurfaceKey (the composite key main.ts's surface manager keys on)", () => {
  it("round-trips both kinds", () => {
    expect(parseSurfaceKey(surfaceKey(1, "claude"))).toEqual({ id: 1, kind: "claude" });
    expect(parseSurfaceKey(surfaceKey(1, "shell"))).toEqual({ id: 1, kind: "shell" });
  });

  it("round-trips docs (plan markdown-viewing INV-1, W4)", () => {
    expect(parseSurfaceKey(surfaceKey(1, "docs"))).toEqual({ id: 1, kind: "docs" });
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
