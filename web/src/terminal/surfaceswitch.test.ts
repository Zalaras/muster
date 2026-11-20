// Covers the pure per-session
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
  showTerminal,
  terminalsChanged,
  surfaceBodyKind,
  surfaceKey,
  type SurfaceSwitchState,
} from "./surfaceswitch";

describe("surfaceswitch — DEFAULT_SURFACE_STATE / getSurfaceState (States: 'no data yet')", () => {
  it("is claude selected, no terminal shown — the state every session starts at", () => {
    expect(DEFAULT_SURFACE_STATE).toEqual({ selected: "claude", shell: null });
  });

  it("getSurfaceState returns the default for a session with no entry in the map", () => {
    const state: SurfaceSwitchState = new Map();
    expect(getSurfaceState(state, 1)).toBe(DEFAULT_SURFACE_STATE);
  });

  it("getSurfaceState returns the stored entry for a session that has one", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shell: 1 }]]);
    expect(getSurfaceState(state, 1)).toEqual({ selected: "shell", shell: 1 });
  });

  it("getSurfaceState keys strictly per session id — an unrelated id's entry never leaks", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shell: 1 }]]);
    expect(getSurfaceState(state, 2)).toBe(DEFAULT_SURFACE_STATE);
  });
});

describe("surfaceswitch — selectSurface (user flows 2/3: switching which surface is selected)", () => {
  it("switches an unset session straight to shell (identity map, new entry)", () => {
    const state: SurfaceSwitchState = new Map();
    const next = selectSurface(state, 1, "shell");
    expect(getSurfaceState(next, 1)).toEqual({ selected: "shell", shell: null });
  });

  it("switching back to claude preserves shell (a shell can keep running while hidden — REQ-6)", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shell: 1 }]]);
    const next = selectSurface(state, 1, "claude");
    expect(getSurfaceState(next, 1)).toEqual({ selected: "claude", shell: 1 });
  });

  it("returns the exact same map instance when the surface is already selected (no redundant re-render)", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shell: 1 }]]);
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
      [1, { selected: "claude", shell: null }],
      [2, { selected: "shell", shell: 1 }],
    ]);
    const next = selectSurface(state, 1, "shell");
    expect(getSurfaceState(next, 2)).toEqual({ selected: "shell", shell: 1 });
  });

  it("selects docs (plan markdown-viewing REQ-1, W4) without touching shell", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shell: 1 }]]);
    const next = selectSurface(state, 1, "docs");
    expect(getSurfaceState(next, 1)).toEqual({ selected: "docs", shell: 1 });
  });
});

describe("surfaceswitch — showTerminal (a spawn or a chosen row records the terminal shown)", () => {
  it("records n on an unset session without changing selected", () => {
    const next = showTerminal(new Map(), 1, 2);
    expect(getSurfaceState(next, 1)).toEqual({ selected: "claude", shell: 2 });
  });

  it("replaces the shown terminal, leaving selected alone", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shell: 1 }]]);
    expect(getSurfaceState(showTerminal(state, 1, 3), 1)).toEqual({ selected: "shell", shell: 3 });
  });

  it("returns the same map instance when n is already shown", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shell: 2 }]]);
    expect(showTerminal(state, 1, 2)).toBe(state);
  });
});

describe("surfaceswitch — terminalsChanged (INV-5: shell stays inside the daemon's list; REQ-6 fallback)", () => {
  const list = (...ns: number[]) => ns.map((n) => ({ n }));
  const cases: {
    name: string;
    from: SurfaceSwitchState;
    list: { n: number }[];
    to: { selected: "claude" | "shell" | "docs"; shell: number | null } | "same";
  }[] = [
    {
      name: "shown terminal still listed: identity",
      from: new Map([[1, { selected: "shell", shell: 2 }]]),
      list: list(1, 2),
      to: "same",
    },
    {
      name: "shown terminal gone: falls back to the lowest-numbered remaining, stays on shell",
      from: new Map([[1, { selected: "shell", shell: 2 }]]),
      list: list(5, 3),
      to: { selected: "shell", shell: 3 },
    },
    {
      name: "last terminal gone while shell selected: shell clears and selection reverts to claude",
      from: new Map([[1, { selected: "shell", shell: 2 }]]),
      list: [],
      to: { selected: "claude", shell: null },
    },
    {
      name: "last terminal gone while claude selected: shell clears, claude kept",
      from: new Map([[1, { selected: "claude", shell: 1 }]]),
      list: [],
      to: { selected: "claude", shell: null },
    },
    {
      name: "docs selection is never touched",
      from: new Map([[1, { selected: "docs", shell: 1 }]]),
      list: [],
      to: { selected: "docs", shell: null },
    },
    {
      name: "no shown terminal yet and a list arrives: lowest n becomes shown, selection kept",
      from: new Map(),
      list: list(2, 4),
      to: { selected: "claude", shell: 2 },
    },
    {
      name: "unset session and empty list: identity",
      from: new Map(),
      list: [],
      to: "same",
    },
  ];
  it.each(cases)("$name", ({ from, list: l, to }) => {
    const next = terminalsChanged(from, 1, l);
    if (to === "same") expect(next).toBe(from);
    else expect(getSurfaceState(next, 1)).toEqual(to);
  });

  it("does not disturb another session's entry", () => {
    const state: SurfaceSwitchState = new Map([
      [1, { selected: "shell", shell: 1 }],
      [2, { selected: "shell", shell: 1 }],
    ]);
    expect(getSurfaceState(terminalsChanged(state, 1, []), 2)).toEqual({
      selected: "shell",
      shell: 1,
    });
  });
});

describe("surfaceswitch — forgetSession (a removed session's entry must not accumulate)", () => {
  it("removes the session's entry", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shell: 1 }]]);
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
      [1, { selected: "shell", shell: 1 }],
      [2, { selected: "shell", shell: 1 }],
    ]);
    const next = forgetSession(state, 1);
    expect(getSurfaceState(next, 2)).toEqual({ selected: "shell", shell: 1 });
  });
});

describe("surfaceswitch — isSurfaceAttachable (REQ-7: shell never consults alive, in either direction)", () => {
  it("claude selected: follows alive=true", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "claude", shell: null }]]);
    expect(isSurfaceAttachable(state, 1, true)).toBe(true);
  });

  it("claude selected: follows alive=false", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "claude", shell: null }]]);
    expect(isSurfaceAttachable(state, 1, false)).toBe(false);
  });

  it("shell selected, shell=true: attachable even though alive=false (starting a shell on a dead session)", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shell: 1 }]]);
    expect(isSurfaceAttachable(state, 1, false)).toBe(true);
  });

  it("shell selected, shell=true: attachable when alive=true too (alive is simply irrelevant)", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shell: 1 }]]);
    expect(isSurfaceAttachable(state, 1, true)).toBe(true);
  });

  it("shell selected, shell=false: not attachable even though alive=true (no live shell to attach to)", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "shell", shell: null }]]);
    expect(isSurfaceAttachable(state, 1, true)).toBe(false);
  });

  it("unset session defaults to claude/not-shell, so it follows alive", () => {
    const state: SurfaceSwitchState = new Map();
    expect(isSurfaceAttachable(state, 1, true)).toBe(true);
    expect(isSurfaceAttachable(state, 1, false)).toBe(false);
  });

  // Docs never has a TerminalSurface, across every
  // alive x shell combination.
  it("docs selected, shell=false: never attachable regardless of alive=true", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "docs", shell: null }]]);
    expect(isSurfaceAttachable(state, 1, true)).toBe(false);
  });

  it("docs selected, shell=false: never attachable regardless of alive=false", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "docs", shell: null }]]);
    expect(isSurfaceAttachable(state, 1, false)).toBe(false);
  });

  it("docs selected, shell=true: never attachable regardless of alive=true", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "docs", shell: 1 }]]);
    expect(isSurfaceAttachable(state, 1, true)).toBe(false);
  });

  it("docs selected, shell=true: never attachable regardless of alive=false", () => {
    const state: SurfaceSwitchState = new Map([[1, { selected: "docs", shell: 1 }]]);
    expect(isSurfaceAttachable(state, 1, false)).toBe(false);
  });
});

describe("surfaceswitch — surfaceKey / parseSurfaceKey (the composite key main.ts's surface manager keys on)", () => {
  it("round-trips both kinds", () => {
    expect(parseSurfaceKey(surfaceKey(1, "claude"))).toEqual({ id: 1, kind: "claude", n: null });
    expect(parseSurfaceKey(surfaceKey(1, "shell"))).toEqual({ id: 1, kind: "shell", n: null });
  });

  it("round-trips docs (plan markdown-viewing INV-1, W4)", () => {
    expect(parseSurfaceKey(surfaceKey(1, "docs"))).toEqual({ id: 1, kind: "docs", n: null });
  });

  it("shell keys carry the terminal number and round-trip it; other kinds ignore n", () => {
    expect(surfaceKey(1, "shell", 2)).toBe("1:shell:2");
    expect(parseSurfaceKey(surfaceKey(1, "shell", 2))).toEqual({ id: 1, kind: "shell", n: 2 });
    expect(surfaceKey(1, "claude", 2)).toBe(surfaceKey(1, "claude"));
    expect(surfaceKey(1, "docs", 2)).toBe(surfaceKey(1, "docs"));
  });

  it("two terminals of one session are distinct attach targets (INV-3)", () => {
    expect(surfaceKey(1, "shell", 1)).not.toBe(surfaceKey(1, "shell", 2));
  });

  it("produces distinct keys for the two kinds of the same session id (INV-3: independent attach targets)", () => {
    expect(surfaceKey(1, "claude")).not.toBe(surfaceKey(1, "shell"));
  });

  it("produces distinct keys for different session ids of the same kind", () => {
    expect(surfaceKey(1, "shell")).not.toBe(surfaceKey(2, "shell"));
  });

  it("parseSurfaceKey falls back to claude for any kind suffix it doesn't recognise (defensive parse, not just the two known shapes)", () => {
    expect(parseSurfaceKey("1:bogus")).toEqual({ id: 1, kind: "claude", n: null });
    expect(parseSurfaceKey("1:")).toEqual({ id: 1, kind: "claude", n: null });
  });

  it("parseSurfaceKey on a malformed key with no separator yields NaN for id rather than throwing", () => {
    const parsed = parseSurfaceKey("not-a-key");
    expect(parsed.kind).toBe("claude");
    expect(Number.isNaN(parsed.id)).toBe(true);
  });
});

// review Major 3: the one decision features/focus.ts and features/tiles.ts each
// re-derived, in a different branch order and with inverted conditions.
describe("surfaceswitch — surfaceBodyKind (the one decision focus.ts and tiles.ts each re-derived)", () => {
  it("docs selected always yields docs, regardless of alive (INV-1)", () => {
    expect(surfaceBodyKind("docs", true)).toBe("docs");
    expect(surfaceBodyKind("docs", false)).toBe("docs");
  });

  it("claude selected on a dead session yields dead", () => {
    expect(surfaceBodyKind("claude", false)).toBe("dead");
  });

  it("claude selected on a live session yields surface", () => {
    expect(surfaceBodyKind("claude", true)).toBe("surface");
  });

  it("shell selected yields surface regardless of alive (REQ-7: shell never consults alive)", () => {
    expect(surfaceBodyKind("shell", true)).toBe("surface");
    expect(surfaceBodyKind("shell", false)).toBe("surface");
  });
});
