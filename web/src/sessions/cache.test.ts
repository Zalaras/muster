import { describe, expect, it } from "vitest";
import type { SessionCache } from "../protocol/session";
import { cacheWarmth, groupWarmthHover, latestEntered, waitingMembers } from "./cache";
import { makeSession } from "./testfixtures";

const NOW = new Date("2026-08-22T12:00:00Z");

function cacheWith(remainingSeconds: number, ttlSeconds: number): SessionCache {
  return {
    expiresAt: new Date(NOW.getTime() + remainingSeconds * 1000).toISOString(),
    ttlSeconds,
  };
}

describe("cacheWarmth (W1, W2)", () => {
  it("null cache is unknown with no fade, never an empty gauge", () => {
    expect(cacheWarmth(null, NOW)).toEqual({
      state: "unknown",
      fraction: 0,
      hover: "cache unknown",
    });
  });

  const table: Array<[remaining: number, ttl: number, state: string, hover: string]> = [
    [3600, 3600, "warm", "cache warm · cold in 60m"],
    [3000, 3600, "warm", "cache warm · cold in 50m"],
    [541, 3600, "warm", "cache warm · cold in 10m"],
    [540, 3600, "cooling", "cache warm · cold in 9m"],
    [539, 3600, "cooling", "cache warm · cold in 9m"],
    [61, 3600, "cooling", "cache warm · cold in 2m"],
    [60, 3600, "cooling", "cache warm · cold in 1m"],
    [59, 3600, "cooling", "cache warm · cold in 59s"],
    [1, 3600, "cooling", "cache warm · cold in 1s"],
    [0, 3600, "cold", "cache cold"],
    [-30, 3600, "cold", "cache cold"],
    [300, 300, "warm", "cache warm · cold in 5m"],
    [46, 300, "warm", "cache warm · cold in 46s"],
    [45, 300, "cooling", "cache warm · cold in 45s"],
    [1, 300, "cooling", "cache warm · cold in 1s"],
  ];
  it.each(table)("%is left of %is TTL is %s", (remaining, ttl, state, hover) => {
    const warmth = cacheWarmth(cacheWith(remaining, ttl), NOW);
    expect(warmth.state).toBe(state);
    expect(warmth.hover).toBe(hover);
  });

  it("fraction is the straight-line remaining share, 0 once cold", () => {
    expect(cacheWarmth(cacheWith(1800, 3600), NOW).fraction).toBeCloseTo(0.5);
    expect(cacheWarmth(cacheWith(3600, 3600), NOW).fraction).toBe(1);
    expect(cacheWarmth(cacheWith(0, 3600), NOW).fraction).toBe(0);
  });

  it("fraction is capped at 1 when expiresAt is beyond the TTL", () => {
    expect(cacheWarmth(cacheWith(7200, 3600), NOW).fraction).toBe(1);
  });

  it("fades with the clock alone (REQ-28): the same cache later is cooler", () => {
    const cache = cacheWith(600, 3600);
    const later = new Date(NOW.getTime() + 120_000);
    expect(cacheWarmth(cache, NOW).state).toBe("warm");
    expect(cacheWarmth(cache, later).state).toBe("cooling");
    expect(cacheWarmth(cache, new Date(NOW.getTime() + 600_000)).state).toBe("cold");
  });
});

describe("waitingMembers / latestEntered (W4)", () => {
  it.each([
    ["idle", true, true],
    ["needs_input", true, true],
    ["failed", true, true],
    ["working", true, false],
    ["started", true, false],
    ["planning", true, false],
    ["idle", false, false],
    ["failed", false, false],
  ] as const)("%s alive=%s is in the set: %s", (state, alive, included) => {
    const members = waitingMembers([makeSession({ id: 1, state, alive })]);
    expect(members.length).toBe(included ? 1 : 0);
  });

  it("latestEntered picks the latest stateSince, null for none", () => {
    expect(latestEntered([])).toBeNull();
    const picked = latestEntered([
      makeSession({ id: 1, stateSince: "2026-08-22T00:00:01Z" }),
      makeSession({ id: 2, stateSince: "2026-08-22T00:00:09Z" }),
      makeSession({ id: 3, stateSince: "2026-08-22T00:00:05Z" }),
    ]);
    expect(picked?.id).toBe(2);
  });
});

describe("groupWarmthHover (REQ-30)", () => {
  const s = (id: number, cache: SessionCache | null) => makeSession({ id, cache });

  it("no members or all unknown is cache unknown", () => {
    expect(groupWarmthHover([], NOW)).toBe("cache unknown");
    expect(groupWarmthHover([s(1, null), s(2, null)], NOW)).toBe("cache unknown");
  });

  it("none warm is all k cold", () => {
    expect(groupWarmthHover([s(1, cacheWith(-5, 300)), s(2, cacheWith(0, 300))], NOW)).toBe(
      "all 2 cold",
    );
  });

  it("some warm names the soonest expiry among the warm ones, ignoring cold and unknown", () => {
    const hover = groupWarmthHover(
      [
        s(1, cacheWith(1800, 3600)),
        s(2, cacheWith(90, 3600)),
        s(3, cacheWith(-1, 3600)),
        s(4, null),
      ],
      NOW,
    );
    expect(hover).toBe("2 of 3 warm · next cold in 2m");
  });

  it("uses seconds when the soonest is under a minute", () => {
    expect(groupWarmthHover([s(1, cacheWith(30, 300))], NOW)).toBe(
      "1 of 1 warm · next cold in 30s",
    );
  });
});
