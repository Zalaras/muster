import { describe, expect, it } from "vitest";
import type { Session, SessionState } from "../protocol";
import { aliveOnly, applyDensity, densityCount, initialLive, moveTile, promote, surfaceDiff } from "./live";

// All sessions share the same state ("idle") with strictly increasing `stateSince`, so
// sort.ts's tiebreak (stateSince ascending) makes the §3.4 sort order exactly the
// ascending id order [1, 2, 3, ...] — keeps every table below easy to read without
// re-deriving sort.ts's own priority rules (already covered by sort.test.ts).
function makeSession(id: number): Session {
  return {
    id,
    title: null,
    titleOverride: null,
    state: "idle",
    stateSince: `2026-08-22T00:00:${String(id).padStart(2, "0")}Z`,
    alive: true,
    endedAt: null,
    attention: null,
    failure: null,
    directory: "/tmp/repo",
    repo: null,
    model: null,
    permissionMode: { value: "default", source: "seed" },
    context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
    lastActivity: null,
    claudeSessionId: null,
    tmuxTarget: `muster-${id}:@1`,
    firstLaunchHere: false,
    createdAt: `2026-08-22T00:00:${String(id).padStart(2, "0")}Z`,
    pinned: false,
    railPos: id,
  };
}

function sessions(ids: number[]): Session[] {
  return ids.map(makeSession);
}

describe("densityCount (REQ-8: 2x2 -> 4, 3x2 -> 6)", () => {
  it("2x2 is 4", () => {
    expect(densityCount("2x2")).toBe(4);
  });

  it("3x2 is 6", () => {
    expect(densityCount("3x2")).toBe(6);
  });
});

describe("initialLive — top-N by §3.4 sort order at view entry", () => {
  it("takes the top N ids in sort order", () => {
    expect(initialLive(sessions([1, 2, 3, 4, 5, 6, 7, 8]), 4)).toEqual([1, 2, 3, 4]);
  });

  it("takes all N=6 for a 3x2 grid", () => {
    expect(initialLive(sessions([1, 2, 3, 4, 5, 6, 7, 8]), 6)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("returns every session, in order, when there are fewer sessions than N (edge case 7)", () => {
    expect(initialLive(sessions([1, 2, 3]), 4)).toEqual([1, 2, 3]);
  });

  it("returns an empty array for no sessions", () => {
    expect(initialLive([], 4)).toEqual([]);
  });

  it("is insensitive to the input array's order (re-derives sort order itself)", () => {
    expect(initialLive(sessions([4, 1, 3, 2]), 2)).toEqual([1, 2]);
  });
});

describe("promote — sticky membership: promotes one id, demotes exactly the worst-ranked live member", () => {
  const all = sessions([1, 2, 3, 4, 5, 6, 7, 8]);

  it("demotes the single lowest-priority (worst-sorted) live member", () => {
    // live = [1,2,3,4]; promoting 7 must demote 4 (the worst-ranked of the four).
    expect(promote([1, 2, 3, 4], 7, all)).toEqual([1, 2, 3, 7]);
  });

  it("keeps the live set the same size regardless of which member was demoted", () => {
    const result = promote([1, 2, 3, 4], 7, all);
    expect(result).toHaveLength(4);
  });

  it("demotes in place at the worst member's own index, even when that member isn't last in the input array (first-slot demotion, plan move-tiles REQ-1/W3)", () => {
    // live given out of sort order (4 is worst but listed first) — 7 replaces 4's own
    // slot (index 0); the array is never re-sorted.
    expect(promote([4, 1, 2, 3], 7, all)).toEqual([7, 1, 2, 3]);
  });

  it("demotes in place at the worst member's own index when that member sits in the middle of the input array (middle-slot demotion, W3)", () => {
    expect(promote([1, 4, 2, 3], 7, all)).toEqual([1, 7, 2, 3]);
  });

  it("is a no-op, preserving the input's exact order (not re-sorted), when the id is already live", () => {
    expect(promote([4, 1, 3, 2], 2, all)).toEqual([4, 1, 3, 2]);
  });

  it("is a no-op, preserving the input's exact order (not re-sorted), when the id isn't a known session", () => {
    expect(promote([3, 1, 2], 999, all)).toEqual([3, 1, 2]);
  });

  it("promotes into a single-member live set by replacing that one member", () => {
    expect(promote([5], 1, all)).toEqual([1]);
  });

  it("leaves an empty live set empty (nothing to demote)", () => {
    expect(promote([], 1, all)).toEqual([]);
  });

  it("demoting an already-stale live id (not in the session list) demotes that one first, in its own slot (last-slot-equivalent: the stale entry, wherever it sits, is worst)", () => {
    // 999 isn't a known session; promoting 7 must displace the stale entry's own slot
    // (index 1) — no valid member moves.
    expect(promote([1, 999, 2], 7, all)).toEqual([1, 7, 2]);
  });
});

describe("applyDensity — grow", () => {
  it("keeps existing live members and appends the next sessions by sort order into freed slots", () => {
    expect(applyDensity([1, 2], 4, sessions([1, 2, 3, 4, 5, 6, 7, 8]))).toEqual([1, 2, 3, 4]);
  });

  it("skips ids already live when filling new slots", () => {
    // live already contains 3 (out of the usual top-N) — growing to 4 must not duplicate it.
    expect(applyDensity([1, 3], 4, sessions([1, 2, 3, 4, 5, 6]))).toEqual([1, 3, 2, 4]);
  });

  it("fills as many slots as there are known sessions when fewer exist than the new N (edge case 7)", () => {
    expect(applyDensity([1], 4, sessions([1, 2, 3]))).toEqual([1, 2, 3]);
  });

  it("growing from empty behaves exactly like initialLive", () => {
    expect(applyDensity([], 4, sessions([1, 2, 3, 4, 5]))).toEqual(initialLive(sessions([1, 2, 3, 4, 5]), 4));
  });
});

describe("applyDensity — shrink", () => {
  it("drops the lowest-priority current members, keeping the top N of what was live", () => {
    expect(applyDensity([1, 2, 3, 4, 5, 6], 4, sessions([1, 2, 3, 4, 5, 6]))).toEqual([1, 2, 3, 4]);
  });

  it("keeps survivors in their existing relative order instead of re-sorting them, for a deliberately out-of-order input (W4)", () => {
    // Top 4 by §3.4 order are {1,2,3,4}; the plan requires their INPUT relative order
    // (1,2,4,3, taken from the live array [6,1,5,2,4,3] with 6 and 5 dropped) to survive,
    // not a re-sort to §3.4 order (1,2,3,4).
    expect(applyDensity([6, 1, 5, 2, 4, 3], 4, sessions([1, 2, 3, 4, 5, 6]))).toEqual([1, 2, 4, 3]);
  });
});

describe("applyDensity — idempotent at capacity (called on every session-list change, per the plan's sticky rule)", () => {
  it("returns the same members, re-sorted, when already at capacity with only valid members", () => {
    expect(applyDensity([1, 2, 3, 4], 4, sessions([1, 2, 3, 4, 5, 6, 7, 8]))).toEqual([1, 2, 3, 4]);
  });

  it("does not reshuffle a user-chosen live set even if it isn't the top-N by sort order", () => {
    // 7 was promoted in by the user, displacing what would have been top-N — a mere
    // re-render (same density, no grow/shrink) must not undo that choice.
    expect(applyDensity([1, 2, 3, 7], 4, sessions([1, 2, 3, 4, 5, 6, 7, 8]))).toEqual([1, 2, 3, 7]);
  });
});

describe("applyDensity — a live session dies / is otherwise no longer a known session", () => {
  it("drops the dead id and backfills the freed slot from the next session by sort order", () => {
    // 2 is no longer in the session list at all (e.g. removed) — applyDensity must drop
    // it and promote the next-best session (5) into the freed slot, keeping N members.
    expect(applyDensity([1, 2, 3, 4], 4, sessions([1, 3, 4, 5, 6]))).toEqual([1, 3, 4, 5]);
  });

  it("shrinks the live set below N if there aren't enough known sessions left to backfill", () => {
    expect(applyDensity([1, 2, 3, 4], 4, sessions([1, 3]))).toEqual([1, 3]);
  });
});

describe("applyDensity — a newly-launched session fills a genuinely free slot (edge case 7)", () => {
  it("backfills an under-capacity live set with a brand-new session id", () => {
    // Only 2 sessions existed (live = both of them, under N=4); session 9 just launched.
    expect(applyDensity([1, 2], 4, sessions([1, 2, 9]))).toEqual([1, 2, 9]);
  });

  it("does not touch a live set that's already at capacity, even when a new session appears", () => {
    expect(applyDensity([1, 2, 3, 4], 4, sessions([1, 2, 3, 4, 9]))).toEqual([1, 2, 3, 4]);
  });
});

describe("moveTile (plan move-tiles REQ-3/W6): pure insert-and-shift reorder — the only way the grid's order ever changes", () => {
  it("forward drag: dragging the first tile onto a later tile — plan edge case 2's worked example ([A,B,C,D] drop A on C -> [B,C,A,D])", () => {
    expect(moveTile([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4]);
  });

  it("backward drag: dragging the last tile onto an earlier tile — plan edge case 2's worked example ([A,B,C,D] drop D on B -> [A,D,B,C])", () => {
    expect(moveTile([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
  });

  it("is identity (new array, same contents) when a tile is dropped on itself (edge case 1, W7)", () => {
    const input = [1, 2, 3, 4];
    const result = moveTile(input, 2, 2);
    expect(result).toEqual([1, 2, 3, 4]);
    expect(result).not.toBe(input);
  });

  it("is identity when the dragged id is no longer live — session removed mid-drag (edge case 6, W7)", () => {
    const input = [1, 2, 3, 4];
    const result = moveTile(input, 9, 2);
    expect(result).toEqual([1, 2, 3, 4]);
    expect(result).not.toBe(input);
  });

  it("is identity when the target id is no longer live — drop target removed mid-drag (W7)", () => {
    const input = [1, 2, 3, 4];
    const result = moveTile(input, 2, 9);
    expect(result).toEqual([1, 2, 3, 4]);
    expect(result).not.toBe(input);
  });

  it("preserves set membership and length for a middle-to-middle move", () => {
    const result = moveTile([1, 2, 3, 4, 5], 2, 4);
    expect(result).toHaveLength(5);
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("dragging a tile one slot forward is a plain adjacent swap", () => {
    expect(moveTile([1, 2, 3, 4], 2, 3)).toEqual([1, 3, 2, 4]);
  });

  it("dragging a tile one slot backward is a plain adjacent swap", () => {
    expect(moveTile([1, 2, 3, 4], 3, 2)).toEqual([1, 3, 2, 4]);
  });
});

describe("applyDensity — INV-7: a priority change alone, with membership unchanged, never reorders the grid (REQ-2/W5)", () => {
  // At capacity (stillValid.length === n), applyDensity's shrink branch keeps every
  // member — toKeep is the top n of exactly n survivors, i.e. all of them — so the
  // result is the input array's own order, filtered but not resorted. This table pins
  // that for every §3.4 state, transitioning at the first, middle, and last slot.
  const live = [1, 2, 3, 4];
  const allStates: SessionState[] = ["needs_input", "failed", "planning", "working", "started", "idle"];
  const slots: Array<{ label: string; id: number }> = [
    { label: "first", id: 1 },
    { label: "middle", id: 2 },
    { label: "last", id: 4 },
  ];

  function withState(id: number, state: SessionState): Session[] {
    return sessions([1, 2, 3, 4, 5, 6, 7, 8]).map((s) =>
      s.id === id
        ? { ...s, state, attention: state === "needs_input" ? { reason: "idle" as const, since: s.stateSince } : null }
        : s,
    );
  }

  for (const state of allStates) {
    for (const slot of slots) {
      it(`transitioning the ${slot.label}-slot member (id ${slot.id}) to "${state}" leaves the order [1,2,3,4] unchanged`, () => {
        expect(applyDensity(live, 4, withState(slot.id, state))).toEqual([1, 2, 3, 4]);
      });
    }
  }
});

describe("aliveOnly (REQ-13/INV-5/W8, plan m4-reconcile): filters a desired-live id list to actually-alive sessions", () => {
  it("passes through ids whose session is alive, unchanged and in order", () => {
    expect(aliveOnly([1, 2, 3], sessions([1, 2, 3]))).toEqual([1, 2, 3]);
  });

  it("drops an id whose session is alive:false, without reshuffling the rest", () => {
    const withOneDead = [makeSession(1), { ...makeSession(2), alive: false }, makeSession(3)];
    expect(aliveOnly([1, 2, 3], withOneDead)).toEqual([1, 3]);
  });

  it("drops an id that isn't a known session at all (same as dead — no terminal socket either way)", () => {
    expect(aliveOnly([1, 999, 2], sessions([1, 2]))).toEqual([1, 2]);
  });

  it("returns an empty array when every desired id is dead or unknown", () => {
    const allDead = [{ ...makeSession(1), alive: false }, { ...makeSession(2), alive: false }];
    expect(aliveOnly([1, 2], allDead)).toEqual([]);
  });

  it("returns an empty array for an empty input id list, regardless of session list", () => {
    expect(aliveOnly([], sessions([1, 2, 3]))).toEqual([]);
  });

  it("never includes an id not present in the input list, even if other alive sessions exist", () => {
    expect(aliveOnly([1], sessions([1, 2, 3]))).toEqual([1]);
  });
});

describe("surfaceDiff — which live surfaces to open/close/keep (REQ-11/INV-3)", () => {
  it("opens newly-live ids, closes no-longer-live ids, keeps the rest untouched", () => {
    expect(surfaceDiff([1, 2, 3], [2, 3, 4])).toEqual({ toOpen: [4], toClose: [1], toKeep: [2, 3] });
  });

  it("opening from nothing: everything is toOpen", () => {
    expect(surfaceDiff([], [1, 2])).toEqual({ toOpen: [1, 2], toClose: [], toKeep: [] });
  });

  it("closing everything: nothing after means everything is toClose", () => {
    expect(surfaceDiff([1, 2], [])).toEqual({ toOpen: [], toClose: [1, 2], toKeep: [] });
  });

  it("an unchanged set is entirely toKeep — no session is ever needlessly resized", () => {
    expect(surfaceDiff([1, 2], [1, 2])).toEqual({ toOpen: [], toClose: [], toKeep: [1, 2] });
  });

  it("a Focus->Focus refocus (single-element sets) closes the old id and opens the new one", () => {
    expect(surfaceDiff([1], [2])).toEqual({ toOpen: [2], toClose: [1], toKeep: [] });
  });
});
