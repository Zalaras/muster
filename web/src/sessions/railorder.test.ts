import { describe, expect, it } from "vitest";
import { moveCard, type RailOrderItem } from "./railorder";

function items(spec: Array<[id: number, pinned: boolean]>): RailOrderItem[] {
  return spec.map(([id, pinned]) => ({ id, pinned }));
}

describe("moveCard — forward/backward drags within one block (plan order-sidebar REQ-11/W7)", () => {
  it("moves a dragged item forward (before target) to land immediately after the target — worked example from live.ts's moveTile", () => {
    // Mirrors live.test.ts's moveTile([1,2,3,4],1,3) -> [2,3,1,4] worked example, verified
    // by hand in the plan's Decisions section against the same target-index convention.
    const ordered = items([
      [1, false],
      [2, false],
      [3, false],
      [4, false],
    ]);
    const result = moveCard(ordered, 1, 3);
    expect(result).toEqual({ ids: [2, 3, 1, 4], pinnedCount: 0 });
  });

  it("moves a dragged item backward (after target) to land immediately before the target", () => {
    const ordered = items([
      [1, false],
      [2, false],
      [3, false],
      [4, false],
    ]);
    const result = moveCard(ordered, 4, 2);
    expect(result).toEqual({ ids: [1, 4, 2, 3], pinnedCount: 0 });
  });

  it("moving the first item onto the last item lands it at the end", () => {
    const ordered = items([
      [1, false],
      [2, false],
      [3, false],
    ]);
    expect(moveCard(ordered, 1, 3)).toEqual({ ids: [2, 3, 1], pinnedCount: 0 });
  });

  it("moving the last item onto the first item lands it at the start", () => {
    const ordered = items([
      [1, false],
      [2, false],
      [3, false],
    ]);
    expect(moveCard(ordered, 3, 1)).toEqual({ ids: [3, 1, 2], pinnedCount: 0 });
  });
});

describe("moveCard — the dragged entry inherits the target's pinned value and pinnedCount reflects the result (W7)", () => {
  it("dragging an unpinned card onto a pinned card pins it there and grows pinnedCount", () => {
    // pinned block: [1,2]; unpinned: [3,4]. Dragged (3) is after target (2) in the
    // original order, so (backward-drag convention) it lands immediately BEFORE 2,
    // taking on 2's pinned:true.
    const ordered = items([
      [1, true],
      [2, true],
      [3, false],
      [4, false],
    ]);
    const result = moveCard(ordered, 3, 2);
    expect(result).toEqual({ ids: [1, 3, 2, 4], pinnedCount: 3 });
  });

  it("dragging a pinned card onto an unpinned card unpins it and shrinks pinnedCount", () => {
    // pinned: [1,2]; unpinned: [3,4]. Dragged (1) is before target (4) in the original
    // order, so (per the forward-drag convention) it lands immediately AFTER 4, taking
    // on 4's pinned:false.
    const ordered = items([
      [1, true],
      [2, true],
      [3, false],
      [4, false],
    ]);
    const result = moveCard(ordered, 1, 4);
    expect(result).toEqual({ ids: [2, 3, 4, 1], pinnedCount: 1 });
  });

  it("dragging within the pinned block keeps every entry pinned (pinnedCount unchanged)", () => {
    const ordered = items([
      [1, true],
      [2, true],
      [3, true],
      [4, false],
    ]);
    const result = moveCard(ordered, 1, 3);
    expect(result).toEqual({ ids: [2, 3, 1, 4], pinnedCount: 3 });
  });

  it("dragging within the unpinned block keeps every entry unpinned (pinnedCount unchanged)", () => {
    const ordered = items([
      [1, true],
      [2, false],
      [3, false],
      [4, false],
    ]);
    const result = moveCard(ordered, 4, 2);
    expect(result).toEqual({ ids: [1, 4, 2, 3], pinnedCount: 1 });
  });

  it("dragging into a single-member block onto that lone member takes on its pinned value", () => {
    // Single pinned member (id 1); drag the last unpinned member onto it.
    const ordered = items([
      [1, true],
      [2, false],
      [3, false],
    ]);
    const result = moveCard(ordered, 3, 1);
    expect(result).toEqual({ ids: [3, 1, 2], pinnedCount: 2 });
  });
});

describe("moveCard — self-drop / absent id returns null (REQ-11/W8/edge case 2)", () => {
  it("returns null when draggedId === targetId (drop on self)", () => {
    const ordered = items([
      [1, false],
      [2, false],
    ]);
    expect(moveCard(ordered, 1, 1)).toBeNull();
  });

  it("returns null when the dragged id is absent from ordered", () => {
    const ordered = items([
      [1, false],
      [2, false],
    ]);
    expect(moveCard(ordered, 99, 1)).toBeNull();
  });

  it("returns null when the target id is absent from ordered", () => {
    const ordered = items([
      [1, false],
      [2, false],
    ]);
    expect(moveCard(ordered, 1, 99)).toBeNull();
  });

  it("returns null when both ids are absent", () => {
    expect(moveCard([], 1, 2)).toBeNull();
  });
});

describe("moveCard — never mutates its input (W9)", () => {
  it("leaves the ordered array untouched", () => {
    const ordered = items([
      [1, true],
      [2, false],
      [3, false],
    ]);
    const original = ordered.map((i) => ({ ...i }));
    moveCard(ordered, 3, 1);
    expect(ordered).toEqual(original);
  });

  it("leaves each item object untouched (no in-place pinned flip)", () => {
    const ordered = items([
      [1, true],
      [2, false],
    ]);
    const item2 = ordered[1];
    moveCard(ordered, 2, 1);
    expect(item2?.pinned).toBe(false);
  });
});
