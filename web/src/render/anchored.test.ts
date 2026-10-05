import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { placeAnchored } from "./anchored";

// Viewport 1000 x 800. EDGE_GAP is 8 and ANCHOR_GAP is 4 in anchored.ts; the expectations below
// are worked from those two numbers, so a changed gap shows up here.
const VIEWPORT = { innerWidth: 1000, innerHeight: 800 };

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const anchorAt = (box: Box): HTMLElement =>
  ({ getBoundingClientRect: () => box }) as unknown as HTMLElement;

const panelOf = (width: number, height: number) => {
  const style: { left?: string; top?: string } = {};
  const panel = { offsetWidth: width, offsetHeight: height, style } as unknown as HTMLElement;
  return { panel, style };
};

describe("placeAnchored", () => {
  let saved: unknown;
  beforeEach(() => {
    saved = (globalThis as { window?: unknown }).window;
    (globalThis as { window: unknown }).window = VIEWPORT;
  });
  afterEach(() => {
    (globalThis as { window: unknown }).window = saved;
  });

  it("puts the panel under the anchor, left edges aligned, with a 4px gap", () => {
    const { panel, style } = panelOf(200, 100);
    placeAnchored(panel, anchorAt({ left: 300, right: 340, top: 100, bottom: 120 }));
    expect(style).toEqual({ left: "300px", top: "124px" });
  });

  it("flips above the anchor when below would run past the bottom edge", () => {
    const { panel, style } = panelOf(200, 100);
    // below = 764, 764 + 100 > 800 - 8, so the panel sits above: 740 - 4 - 100.
    placeAnchored(panel, anchorAt({ left: 300, right: 340, top: 740, bottom: 760 }));
    expect(style.top).toBe("636px");
  });

  it("stays below when the panel ends exactly at the bottom margin", () => {
    const { panel, style } = panelOf(200, 100);
    // below = 692, 692 + 100 = 792 = 800 - 8: fits.
    placeAnchored(panel, anchorAt({ left: 300, right: 340, top: 670, bottom: 688 }));
    expect(style.top).toBe("692px");
  });

  it("never lets a flipped panel start above the top margin", () => {
    const { panel, style } = panelOf(200, 790);
    placeAnchored(panel, anchorAt({ left: 300, right: 340, top: 20, bottom: 40 }));
    expect(style.top).toBe("8px");
  });

  describe("past the right edge", () => {
    const anchor = anchorAt({ left: 900, right: 940, top: 100, bottom: 120 });

    it("by default keeps the left edge and clamps it inside the right margin", () => {
      const { panel, style } = panelOf(220, 100);
      placeAnchored(panel, anchor);
      expect(style.left).toBe("772px"); // 1000 - 220 - 8
    });

    it("with alignRight lines the panel's right edge up with the anchor's", () => {
      const { panel, style } = panelOf(220, 100);
      placeAnchored(panel, anchor, { alignRight: true });
      expect(style.left).toBe("720px"); // 940 - 220
    });
  });

  it("alignRight is ignored while the panel fits to the right of the anchor", () => {
    const { panel, style } = panelOf(200, 100);
    placeAnchored(panel, anchorAt({ left: 300, right: 340, top: 100, bottom: 120 }), {
      alignRight: true,
    });
    expect(style.left).toBe("300px");
  });

  it("keeps the left edge inside the left margin", () => {
    const { panel, style } = panelOf(200, 100);
    placeAnchored(panel, anchorAt({ left: 2, right: 30, top: 100, bottom: 120 }));
    expect(style.left).toBe("8px");
  });

  it("alignRight cannot push a panel wider than the room past the left margin", () => {
    const { panel, style } = panelOf(990, 100);
    // Overflows right (10 + 990 > 992); right-aligned it would start at 20 - 990, so the clamp holds it at 8.
    placeAnchored(panel, anchorAt({ left: 10, right: 20, top: 100, bottom: 120 }), {
      alignRight: true,
    });
    expect(style.left).toBe("8px");
  });
});
