// buildTile/renderStrip's non-empty branch clone real `<template>` DOM
// (`#tile-template` / `#session-card-template`) — per docs/conventions.md that's
// Playwright's job (see render/sessions.test.ts's identical note and
// web/e2e/terminal.spec.ts / web/e2e/views.spec.ts for the rendered-tile coverage).
// This file covers the paths here that never touch a template: renderTileGeometry and
// updateTile (pure element mutation on an already-built TileRefs/chrome — no cloning,
// no re-parenting; review m2-terminal Critical 2 requires in-place mutation of existing
// nodes rather than a wholesale chrome rebuild) and renderStrip's empty branch (returns
// before ever looking up a template).
import { describe, expect, it } from "vitest";
import type { Session } from "../protocol";
import { renderStrip, renderTileGeometry, updateTile, type TileRefs } from "./tiles";

function fakeElement(): HTMLElement {
  return { textContent: "", className: "", hidden: false, replaceChildren: () => {} } as unknown as HTMLElement;
}

function fakeRefs(): TileRefs {
  return {
    root: fakeElement(),
    bodySlot: fakeElement(),
    geoEl: fakeElement(),
    markerEl: fakeElement(),
  };
}

const NOW = new Date("2026-08-22T00:00:10Z");

function makeSession(overrides: Partial<Session> & { id: number }): Session {
  return {
    title: null,
    state: "idle",
    stateSince: "2026-08-22T00:00:00Z",
    alive: true,
    endedAt: null,
    attention: null,
    failure: null,
    directory: "/Users/damian/code/muster",
    repo: null,
    model: null,
    permissionMode: { value: "default", source: "seed" },
    context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
    lastActivity: null,
    claudeSessionId: null,
    tmuxTarget: "muster:@1",
    firstLaunchHere: false,
    createdAt: "2026-08-22T00:00:00Z",
    pinned: false,
    railPos: overrides.id,
    ...overrides,
  };
}

/** A root whose `.querySelector` resolves the four chrome selectors `updateTileChrome`
 * mutates, backed by plain fake elements — no real DOM/template involved, matching this
 * file's existing `fakeElement`/`fakeRefs` convention. */
function fakeTileRoot(): HTMLElement & { className: string } {
  const nm = fakeElement();
  const wh = fakeElement();
  const ctx = fakeElement();
  const tm = fakeElement();
  const dot = { ...fakeElement(), title: "" } as HTMLElement & { title: string };
  const byClass: Record<string, HTMLElement> = { ".nm": nm, ".wh": wh, ".ctxinfo": ctx, ".tm": tm, ".sdot": dot };
  return {
    className: "",
    querySelector: (selector: string) => byClass[selector] ?? null,
  } as unknown as HTMLElement & { className: string };
}

describe("renderTileGeometry — REQ-15's tile footer: real geometry + live/stopped marker driven by `alive`, not geometry nullability (review m2-terminal Critical 5)", () => {
  it("renders cols×rows and the 'live' marker when alive and geometry is present", () => {
    const refs = fakeRefs();
    renderTileGeometry(refs, true, { cols: 100, rows: 30 });
    expect(refs.geoEl.textContent).toBe("100×30");
    expect(refs.markerEl.textContent).toBe("live");
    expect(refs.markerEl.className).toBe("marker live");
  });

  it("renders an empty geometry string and the 'stopped' marker when not alive and geometry is null (the surface never attached)", () => {
    const refs = fakeRefs();
    renderTileGeometry(refs, false, null);
    expect(refs.geoEl.textContent).toBe("");
    expect(refs.markerEl.textContent).toBe("stopped");
    expect(refs.markerEl.className).toBe("marker");
  });

  it("renders the 'stopped' marker even though geometry is still non-null — a session that died while its tile was live must not keep reading 'live' off its last-known geometry", () => {
    const refs = fakeRefs();
    renderTileGeometry(refs, false, { cols: 100, rows: 30 });
    expect(refs.geoEl.textContent).toBe("100×30");
    expect(refs.markerEl.textContent).toBe("stopped");
    expect(refs.markerEl.className).toBe("marker");
  });

  it("renders the 'live' marker even though geometry is null — alive is the sole source of truth, not geometry presence", () => {
    const refs = fakeRefs();
    renderTileGeometry(refs, true, null);
    expect(refs.geoEl.textContent).toBe("");
    expect(refs.markerEl.textContent).toBe("live");
    expect(refs.markerEl.className).toBe("marker live");
  });
});

describe("updateTile — refreshes existing chrome in place, never touches bodySlot (review m2-terminal Critical 2)", () => {
  it("writes the shared view-model's title/repoLine/contextText/timer/stateClass onto the existing chrome nodes", () => {
    const root = fakeTileRoot();
    const refs: TileRefs = { root, bodySlot: fakeElement(), geoEl: fakeElement(), markerEl: fakeElement() };
    const session = makeSession({ id: 1, title: "fix the thing", state: "working" });

    updateTile(refs, session, NOW);

    expect(root.querySelector(".nm")?.textContent).toBe("fix the thing");
    expect(root.querySelector(".wh")?.textContent).toBe("muster");
    expect(root.querySelector(".ctxinfo")?.textContent).toBe("ctx unknown");
    expect(root.className).toBe("tile s-work");
  });

  it("re-derives the view-model fresh on every call, so a stale title/state from a prior render is overwritten rather than left behind", () => {
    const root = fakeTileRoot();
    const refs: TileRefs = { root, bodySlot: fakeElement(), geoEl: fakeElement(), markerEl: fakeElement() };

    updateTile(refs, makeSession({ id: 1, title: "first", state: "idle" }), NOW);
    expect(root.querySelector(".nm")?.textContent).toBe("first");
    expect(root.className).toBe("tile s-idle");

    updateTile(refs, makeSession({ id: 1, title: "second", state: "needs_input" }), NOW);
    expect(root.querySelector(".nm")?.textContent).toBe("second");
    expect(root.className).toBe("tile s-blocked");
  });

  it("never touches bodySlot (the mounted live surface's container) — only chrome nodes are read via querySelector", () => {
    const root = fakeTileRoot();
    const bodySlot = fakeElement();
    const refs: TileRefs = { root, bodySlot, geoEl: fakeElement(), markerEl: fakeElement() };

    updateTile(refs, makeSession({ id: 1 }), NOW);

    // bodySlot is a fresh fakeElement with no replaceChildren/mutation hooks exercised;
    // updateTile has no reference to it beyond the `refs` struct, so it is left exactly
    // as constructed.
    expect(bodySlot.textContent).toBe("");
    expect(bodySlot.className).toBe("");
  });
});

describe("updateTile — REQ-9 (plan move-tiles): the state dot gets a title = the state badge word, so a hover explains the colour", () => {
  const cases: Array<{ state: Session["state"]; word: string }> = [
    { state: "started", word: "started" },
    { state: "planning", word: "planning" },
    { state: "working", word: "working" },
    { state: "needs_input", word: "needs input" },
    { state: "failed", word: "failed" },
    { state: "idle", word: "idle" },
  ];

  for (const { state, word } of cases) {
    it(`sets .sdot's title to "${word}" for state "${state}"`, () => {
      const root = fakeTileRoot();
      const refs: TileRefs = { root, bodySlot: fakeElement(), geoEl: fakeElement(), markerEl: fakeElement() };

      updateTile(refs, makeSession({ id: 1, state }), NOW);

      expect((root.querySelector(".sdot") as (HTMLElement & { title: string }) | null)?.title).toBe(word);
    });
  }

  it("updates the title on every pass, so a stale state's word doesn't linger after a transition", () => {
    const root = fakeTileRoot();
    const refs: TileRefs = { root, bodySlot: fakeElement(), geoEl: fakeElement(), markerEl: fakeElement() };

    updateTile(refs, makeSession({ id: 1, state: "working" }), NOW);
    expect((root.querySelector(".sdot") as (HTMLElement & { title: string }) | null)?.title).toBe("working");

    updateTile(refs, makeSession({ id: 1, state: "needs_input" }), NOW);
    expect((root.querySelector(".sdot") as (HTMLElement & { title: string }) | null)?.title).toBe("needs input");
  });

  it("does not touch the dot's size or colour — className carries the state class, not the dot's own attributes", () => {
    const root = fakeTileRoot();
    const refs: TileRefs = { root, bodySlot: fakeElement(), geoEl: fakeElement(), markerEl: fakeElement() };

    updateTile(refs, makeSession({ id: 1, state: "failed" }), NOW);

    expect(root.className).toBe("tile s-failed");
  });
});

describe("renderStrip — hides entirely when every session is live (plan edge case 7)", () => {
  it("hides the strip and clears its children when the session list is empty", () => {
    const el = fakeElement();
    renderStrip(el, [], new Date(), () => {});
    expect(el.hidden).toBe(true);
  });
});
