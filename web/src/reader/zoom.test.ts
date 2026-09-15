// Plan mermaid-support (W21, REQ-9, INV-5): the diagram modal's zoom/pan arithmetic, pure.
// zoomAround's point-invariance checks decode the canvas-space point a stage point maps to
// (the inverse of transformOf's translate-then-scale) rather than re-deriving the transform
// string, so the assertion is independent of how transformOf happens to format it.
import { describe, expect, it } from "vitest";
import {
  clampZoom,
  fitScale,
  panBy,
  resetZoom,
  transformOf,
  wheelFactor,
  zoomAround,
  ZOOM_MAX,
  ZOOM_MIN,
  type ZoomState,
} from "./zoom";

/** The canvas-space point a stage point `(px, py)` refers to under `state`'s transform
 * (`transformOf`'s translate then scale, `fit` folded out since it multiplies both zoom
 * states equally) — used to assert zoomAround's invariant without depending on the
 * transform string's exact format. */
function canvasPoint(state: ZoomState, px: number, py: number) {
  return { x: (px - state.x) / state.zoom, y: (py - state.y) / state.zoom };
}

describe("clampZoom", () => {
  it("pins below ZOOM_MIN up to ZOOM_MIN", () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
  });

  it("pins above ZOOM_MAX down to ZOOM_MAX", () => {
    expect(clampZoom(20)).toBe(ZOOM_MAX);
  });

  it("leaves an in-range value untouched", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(2.5)).toBe(2.5);
  });

  it("leaves the exact bounds untouched", () => {
    expect(clampZoom(ZOOM_MIN)).toBe(ZOOM_MIN);
    expect(clampZoom(ZOOM_MAX)).toBe(ZOOM_MAX);
  });
});

describe("wheelFactor", () => {
  it("is greater than 1 for negative deltaY (wheel up, zoom in)", () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
  });

  it("is less than 1 for positive deltaY (wheel down, zoom out)", () => {
    expect(wheelFactor(100)).toBeLessThan(1);
  });

  it("is 1 for a zero delta", () => {
    expect(wheelFactor(0)).toBe(1);
  });

  it("is the inverse of its opposite-signed delta of the same magnitude", () => {
    expect(wheelFactor(-100)).toBeCloseTo(1 / wheelFactor(100), 10);
  });
});

describe("zoomAround", () => {
  const points: Array<[number, number]> = [
    [0, 0],
    [100, 50],
    [250, 300],
  ];
  const factors = [2, 0.5];
  const states: ZoomState[] = [
    { zoom: 1, x: 0, y: 0 },
    { zoom: 2, x: 10, y: -5 },
  ];

  for (const state of states) {
    for (const factor of factors) {
      for (const [px, py] of points) {
        it(`leaves the stage point (${px}, ${py}) mapped to the same canvas point, factor ${factor}, from zoom ${state.zoom}`, () => {
          const before = canvasPoint(state, px, py);
          const after = zoomAround(state, factor, px, py);
          const afterPoint = canvasPoint(after, px, py);
          expect(afterPoint.x).toBeCloseTo(before.x, 10);
          expect(afterPoint.y).toBeCloseTo(before.y, 10);
        });
      }
    }
  }

  it("still holds the point invariant when the requested factor overshoots the clamp", () => {
    const state: ZoomState = { zoom: 7, x: 3, y: 4 };
    const before = canvasPoint(state, 40, 60);
    const after = zoomAround(state, 2, 40, 60); // 7*2=14, clamped to ZOOM_MAX=8
    expect(after.zoom).toBe(ZOOM_MAX);
    const afterPoint = canvasPoint(after, 40, 60);
    expect(afterPoint.x).toBeCloseTo(before.x, 10);
    expect(afterPoint.y).toBeCloseTo(before.y, 10);
  });

  it("clamps the resulting zoom", () => {
    expect(zoomAround({ zoom: 1, x: 0, y: 0 }, 100, 0, 0).zoom).toBe(ZOOM_MAX);
    expect(zoomAround({ zoom: 1, x: 0, y: 0 }, 0.001, 0, 0).zoom).toBe(ZOOM_MIN);
  });
});

describe("panBy", () => {
  it("adds the delta to x and y", () => {
    expect(panBy({ zoom: 2, x: 10, y: -5 }, 3, 4)).toEqual({ zoom: 2, x: 13, y: -1 });
  });

  it("leaves zoom unchanged", () => {
    expect(panBy({ zoom: 1.5, x: 0, y: 0 }, -20, 0).zoom).toBe(1.5);
  });

  it("accepts a negative delta", () => {
    expect(panBy({ zoom: 1, x: 5, y: 5 }, -5, -5)).toEqual({ zoom: 1, x: 0, y: 0 });
  });
});

describe("fitScale", () => {
  it("fits a wide SVG by its width (the tighter axis)", () => {
    expect(fitScale(1000, 100, 500, 500)).toBe(0.5);
  });

  it("fits a tall SVG by its height (the tighter axis)", () => {
    expect(fitScale(100, 1000, 500, 500)).toBe(0.5);
  });

  it("falls back to 1 for a zero or negative SVG dimension", () => {
    expect(fitScale(0, 100, 500, 500)).toBe(1);
    expect(fitScale(100, -1, 500, 500)).toBe(1);
  });

  it("falls back to 1 for a zero or negative stage dimension (measured before layout)", () => {
    expect(fitScale(100, 100, 0, 500)).toBe(1);
    expect(fitScale(100, 100, 500, -1)).toBe(1);
  });
});

describe("resetZoom", () => {
  it("is fit with no pan", () => {
    expect(resetZoom()).toEqual({ zoom: 1, x: 0, y: 0 });
  });
});

describe("transformOf", () => {
  it("folds fit into the scale but reports state.zoom-only via the multiplier order", () => {
    expect(transformOf({ zoom: 2, x: 10, y: -5 }, 0.5)).toBe("translate(10px, -5px) scale(1)");
  });

  it("reflects a zero pan and fit-only scale at reset", () => {
    expect(transformOf(resetZoom(), 0.75)).toBe("translate(0px, 0px) scale(0.75)");
  });
});
