import { describe, expect, it } from "vitest";
import { moveCard, planDrop, type RailOrderItem } from "./railorder";

// A card's section is its third entry; absent is Ungrouped (null), the pre-groups rail.
function items(
  spec: Array<[id: number, pinned: boolean, groupId?: number | null]>,
): RailOrderItem[] {
  return spec.map(([id, pinned, groupId = null]) => ({ id, pinned, groupId }));
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
    expect(result).toEqual({ ids: [2, 3, 1, 4], pinnedCount: 0, groupId: null });
  });

  it("moves a dragged item backward (after target) to land immediately before the target", () => {
    const ordered = items([
      [1, false],
      [2, false],
      [3, false],
      [4, false],
    ]);
    const result = moveCard(ordered, 4, 2);
    expect(result).toEqual({ ids: [1, 4, 2, 3], pinnedCount: 0, groupId: null });
  });

  it("moving the first item onto the last item lands it at the end", () => {
    const ordered = items([
      [1, false],
      [2, false],
      [3, false],
    ]);
    expect(moveCard(ordered, 1, 3)).toEqual({ ids: [2, 3, 1], pinnedCount: 0, groupId: null });
  });

  it("moving the last item onto the first item lands it at the start", () => {
    const ordered = items([
      [1, false],
      [2, false],
      [3, false],
    ]);
    expect(moveCard(ordered, 3, 1)).toEqual({ ids: [3, 1, 2], pinnedCount: 0, groupId: null });
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
    expect(result).toEqual({ ids: [1, 3, 2, 4], pinnedCount: 3, groupId: null });
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
    expect(result).toEqual({ ids: [2, 3, 4, 1], pinnedCount: 1, groupId: null });
  });

  it("dragging within the pinned block keeps every entry pinned (pinnedCount unchanged)", () => {
    const ordered = items([
      [1, true],
      [2, true],
      [3, true],
      [4, false],
    ]);
    const result = moveCard(ordered, 1, 3);
    expect(result).toEqual({ ids: [2, 3, 1, 4], pinnedCount: 3, groupId: null });
  });

  it("dragging within the unpinned block keeps every entry unpinned (pinnedCount unchanged)", () => {
    const ordered = items([
      [1, true],
      [2, false],
      [3, false],
      [4, false],
    ]);
    const result = moveCard(ordered, 4, 2);
    expect(result).toEqual({ ids: [1, 4, 2, 3], pinnedCount: 1, groupId: null });
  });

  it("dragging into a single-member block onto that lone member takes on its pinned value", () => {
    // Single pinned member (id 1); drag the last unpinned member onto it.
    const ordered = items([
      [1, true],
      [2, false],
      [3, false],
    ]);
    const result = moveCard(ordered, 3, 1);
    expect(result).toEqual({ ids: [3, 1, 2], pinnedCount: 2, groupId: null });
  });
});

// kb:adr/rail-pin-invariant-scoped-per-section: a drop is computed against the target card's own
// section, and the result names that section so the daemon moves the dragged card into it.
describe("moveCard — across sections (plan groups W7)", () => {
  // Group 3: pinned 10, unpinned 11, 12. Ungrouped: pinned 1, unpinned 2. Group 4: unpinned 20.
  const rail = (): RailOrderItem[] =>
    items([
      [10, true, 3],
      [11, false, 3],
      [12, false, 3],
      [1, true],
      [2, false],
      [20, false, 4],
    ]);

  it("returns only the target section's ids, the dragged id inserted before the target, with the target's groupId", () => {
    expect(moveCard(rail(), 2, 12)).toEqual({ ids: [10, 11, 2, 12], pinnedCount: 1, groupId: 3 });
  });

  it("takes pinnedCount from the drop side: onto a pinned target the dragged card is counted pinned", () => {
    expect(moveCard(rail(), 2, 10)).toEqual({ ids: [2, 10, 11, 12], pinnedCount: 2, groupId: 3 });
  });

  it("a pinned card dropped onto an unpinned target in another section is counted unpinned", () => {
    expect(moveCard(rail(), 1, 11)).toEqual({ ids: [10, 1, 11, 12], pinnedCount: 1, groupId: 3 });
  });

  it("dropping a grouped card onto an Ungrouped card names Ungrouped (null) and lists only Ungrouped's cards", () => {
    expect(moveCard(rail(), 11, 2)).toEqual({ ids: [1, 11, 2], pinnedCount: 1, groupId: null });
  });

  it("dropping onto the only card of a section yields that card and the dragged one", () => {
    expect(moveCard(rail(), 2, 20)).toEqual({ ids: [2, 20], pinnedCount: 0, groupId: 4 });
  });

  it("a within-section drop still returns just that section, never another's cards", () => {
    expect(moveCard(rail(), 12, 11)).toEqual({ ids: [10, 12, 11], pinnedCount: 1, groupId: 3 });
  });

  it("a self-drop and an absent id are still null with sections present", () => {
    expect(moveCard(rail(), 11, 11)).toBeNull();
    expect(moveCard(rail(), 11, 99)).toBeNull();
    expect(moveCard(rail(), 99, 11)).toBeNull();
  });

  it("never mutates the rail it reads", () => {
    const ordered = rail();
    const before = ordered.map((i) => ({ ...i }));
    moveCard(ordered, 2, 12);
    expect(ordered).toEqual(before);
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

describe("moveCard — carried set (REQ-16)", () => {
  it("lands the carried cards contiguously at the drop position in display order", () => {
    const ordered = items([
      [1, false],
      [2, false],
      [3, false],
      [4, false],
      [5, false],
    ]);
    expect(moveCard(ordered, 4, 1, new Set([4, 2]))).toEqual({
      ids: [2, 4, 1, 3, 5],
      pinnedCount: 0,
      groupId: null,
    });
  });

  it("carried cards from another section join the target's and take its pin", () => {
    const ordered = items([
      [1, true, 3],
      [2, false, 3],
      [3, false, null],
      [4, true, null],
    ]);
    const result = moveCard(ordered, 3, 2, new Set([3, 4]));
    expect(result).toEqual({ ids: [1, 3, 4, 2], pinnedCount: 1, groupId: 3 });
  });

  it("a drop onto a carried card is nothing", () => {
    const ordered = items([
      [1, false],
      [2, false],
      [3, false],
    ]);
    expect(moveCard(ordered, 1, 3, new Set([1, 3]))).toBeNull();
  });
});

describe("planDrop (REQ-12–14, REQ-16–18, W6)", () => {
  const ordered = items([
    [1, true, 3],
    [2, false, 3],
    [3, false, 5],
    [4, false, null],
    [5, false, null],
  ]);
  const one = (id: number) => new Set([id]);

  it.each(["manual", "attention"] as const)(
    "a header drop is one group move in %s order",
    (sort) => {
      expect(planDrop(ordered, sort, one(4), 4, { section: 3 })).toEqual({
        kind: "group",
        ids: [4],
        groupId: 3,
      });
    },
  );

  it("a drop on Ungrouped's header leaves the group", () => {
    expect(planDrop(ordered, "manual", one(2), 2, { section: null })).toEqual({
      kind: "group",
      ids: [2],
      groupId: null,
    });
  });

  it("a header drop into the card's own section changes nothing", () => {
    expect(planDrop(ordered, "manual", one(2), 2, { section: 3 })).toBeNull();
  });

  it("a selection drop on a section moves every carried card not already there, in display order", () => {
    expect(planDrop(ordered, "manual", new Set([5, 1, 3]), 5, { section: 3 })).toEqual({
      kind: "group",
      ids: [3, 5],
      groupId: 3,
    });
  });

  it("attention order: a drop among another section's cards is a group-only move", () => {
    expect(planDrop(ordered, "attention", one(4), 4, { card: 2 })).toEqual({
      kind: "group",
      ids: [4],
      groupId: 3,
    });
  });

  it("attention order: a drop inside the card's own section sends nothing", () => {
    expect(planDrop(ordered, "attention", one(1), 1, { card: 2 })).toBeNull();
  });

  it("manual order: a drop among cards is one order request with groupId", () => {
    expect(planDrop(ordered, "manual", one(4), 4, { card: 2 })).toEqual({
      kind: "order",
      ids: [1, 4, 2],
      pinnedCount: 1,
      groupId: 3,
    });
  });

  it("manual order: a selection lands contiguous at the drop position", () => {
    expect(planDrop(ordered, "manual", new Set([4, 5]), 5, { card: 2 })).toEqual({
      kind: "order",
      ids: [1, 4, 5, 2],
      pinnedCount: 1,
      groupId: 3,
    });
  });

  it.each(["manual", "attention"] as const)(
    "a drop onto a carried or unknown card is nothing (%s)",
    (sort) => {
      expect(planDrop(ordered, sort, new Set([4, 5]), 4, { card: 5 })).toBeNull();
      expect(planDrop(ordered, sort, one(4), 4, { card: 99 })).toBeNull();
    },
  );
});
