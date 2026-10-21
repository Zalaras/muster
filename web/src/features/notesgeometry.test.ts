import { describe, expect, it } from "vitest";
import type { Edge } from "../render/notespanel";
import {
  clampRect,
  defaultRect,
  dragRect,
  MIN_HEIGHT,
  MIN_WIDTH,
  resizeRect,
  sameRect,
  type Rect,
  type Size,
} from "./notesgeometry";

const SLOT: Size = { width: 1000, height: 700 };

function inside(rect: Rect, slot: Size): boolean {
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= slot.width &&
    rect.y + rect.height <= slot.height
  );
}

describe("clampRect", () => {
  it.each<[string, Rect, Rect]>([
    [
      "already inside is unchanged",
      { x: 10, y: 20, width: 400, height: 300 },
      { x: 10, y: 20, width: 400, height: 300 },
    ],
    [
      "pushed off the left and top",
      { x: -50, y: -9, width: 400, height: 300 },
      { x: 0, y: 0, width: 400, height: 300 },
    ],
    [
      "pushed off the right and bottom",
      { x: 900, y: 650, width: 400, height: 300 },
      { x: 600, y: 400, width: 400, height: 300 },
    ],
    [
      "wider and taller than the slot shrinks to it",
      { x: 0, y: 0, width: 5000, height: 5000 },
      { x: 0, y: 0, width: 1000, height: 700 },
    ],
    [
      "below the minimum grows to it",
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 0, y: 0, width: MIN_WIDTH, height: MIN_HEIGHT },
    ],
  ])("%s", (_label, rect, expected) => {
    expect(clampRect(rect, SLOT)).toEqual(expected);
  });

  it("a slot smaller than the minimum keeps the minimum size pinned at the origin", () => {
    expect(
      clampRect({ x: 50, y: 50, width: 400, height: 300 }, { width: 100, height: 60 }),
    ).toEqual({
      x: 0,
      y: 0,
      width: MIN_WIDTH,
      height: MIN_HEIGHT,
    });
  });

  it("a slot exactly the minimum holds the minimum flush", () => {
    const slot = { width: MIN_WIDTH, height: MIN_HEIGHT };
    expect(clampRect({ x: 30, y: 30, width: 999, height: 999 }, slot)).toEqual({
      x: 0,
      y: 0,
      ...slot,
    });
  });

  it.each([
    [{ x: -1e6, y: 1e6, width: 1e6, height: 1 }],
    [{ x: 3.5, y: 7.25, width: 300.5, height: 200.5 }],
    [{ x: 500, y: 500, width: 261, height: 151 }],
  ])("always lands inside a slot that can hold the minimum: %j", (rect) => {
    const out = clampRect(rect, SLOT);
    expect(inside(out, SLOT)).toBe(true);
    expect(out.width).toBeGreaterThanOrEqual(MIN_WIDTH);
    expect(out.height).toBeGreaterThanOrEqual(MIN_HEIGHT);
  });

  it("is idempotent", () => {
    const once = clampRect({ x: 2000, y: -4, width: 20, height: 2000 }, SLOT);
    expect(clampRect(once, SLOT)).toEqual(once);
  });
});

describe("defaultRect", () => {
  it("is 360x300 inset 24px from the slot's top right", () => {
    expect(defaultRect(SLOT)).toEqual({ x: 1000 - 360 - 24, y: 24, width: 360, height: 300 });
  });

  it("shrinks and stays inside a small slot", () => {
    const slot = { width: 340, height: 200 };
    const rect = defaultRect(slot);
    expect(rect).toEqual({ x: 0, y: 0, width: 340, height: 200 });
    expect(inside(rect, slot)).toBe(true);
  });
});

describe("dragRect", () => {
  const start: Rect = { x: 100, y: 100, width: 300, height: 200 };

  it("moves by the delta keeping the size", () => {
    expect(dragRect(start, 40, -30, SLOT)).toEqual({ x: 140, y: 70, width: 300, height: 200 });
  });

  it.each([
    ["left", -500, 0, { x: 0, y: 100 }],
    ["up", 0, -500, { x: 100, y: 0 }],
    ["right", 5000, 0, { x: 700, y: 100 }],
    ["down", 0, 5000, { x: 100, y: 500 }],
  ])("stops at the slot edge dragging %s", (_label, dx, dy, at) => {
    expect(dragRect(start, dx, dy, SLOT)).toEqual({ ...at, width: 300, height: 200 });
  });
});

describe("resizeRect", () => {
  const start: Rect = { x: 200, y: 200, width: 300, height: 200 };

  it.each<[Edge, number, number, Rect]>([
    ["e", 50, 99, { x: 200, y: 200, width: 350, height: 200 }],
    ["s", 99, 50, { x: 200, y: 200, width: 300, height: 250 }],
    ["w", -50, 99, { x: 150, y: 200, width: 350, height: 200 }],
    ["n", 99, -50, { x: 200, y: 150, width: 300, height: 250 }],
    ["se", 10, 20, { x: 200, y: 200, width: 310, height: 220 }],
    ["nw", -10, -20, { x: 190, y: 180, width: 310, height: 220 }],
    ["ne", 10, -20, { x: 200, y: 180, width: 310, height: 220 }],
    ["sw", -10, 20, { x: 190, y: 200, width: 310, height: 220 }],
  ])("edge %s by (%d, %d)", (edge, dx, dy, expected) => {
    expect(resizeRect(start, edge, dx, dy, SLOT)).toEqual(expected);
  });

  it.each<[Edge, number, number, Partial<Rect>]>([
    ["e", -5000, 0, { x: 200, width: MIN_WIDTH }],
    ["w", 5000, 0, { x: 500 - MIN_WIDTH, width: MIN_WIDTH }],
    ["s", 0, -5000, { y: 200, height: MIN_HEIGHT }],
    ["n", 0, 5000, { y: 400 - MIN_HEIGHT, height: MIN_HEIGHT }],
  ])(
    "never shrinks below the minimum dragging %s, and the opposite edge holds",
    (edge, dx, dy, expected) => {
      expect(resizeRect(start, edge, dx, dy, SLOT)).toMatchObject(expected);
    },
  );

  it.each<[Edge, number, number]>([
    ["e", 5000, 0],
    ["w", -5000, 0],
    ["s", 0, 5000],
    ["n", 0, -5000],
    ["se", 5000, 5000],
    ["nw", -5000, -5000],
  ])("never grows past the slot dragging %s", (edge, dx, dy) => {
    expect(inside(resizeRect(start, edge, dx, dy, SLOT), SLOT)).toBe(true);
  });

  it("a zero delta changes nothing", () => {
    expect(resizeRect(start, "se", 0, 0, SLOT)).toEqual(start);
  });
});

describe("sameRect", () => {
  it("compares all four fields", () => {
    const a = { x: 1, y: 2, width: 3, height: 4 };
    expect(sameRect(a, { ...a })).toBe(true);
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(sameRect(a, { ...a, [key]: 99 })).toBe(false);
    }
  });
});
