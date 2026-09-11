import { describe, expect, it } from "vitest";
import type { SessionContext } from "../protocol";
import { buildContextRowViewModel } from "./context";

function makeContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0, ...overrides };
}

describe("buildContextRowViewModel — honesty rule 1 (INV-3): unknown never derives a percentage or track", () => {
  it("is unknown for the all-null fresh-launch shape, with no compaction suffix carried as a percentage", () => {
    const vm = buildContextRowViewModel(makeContext());
    expect(vm.known).toBe(false);
    expect(vm.pct).toBeNull();
    expect(vm.tokensText).toBeNull();
    expect(vm.hot).toBe(false);
    expect(vm.compactions).toBe(0);
  });

  it("carries a positive compaction count through even while unknown (⟳n comes from hooks, not the status line)", () => {
    const vm = buildContextRowViewModel(makeContext({ compactions: 3 }));
    expect(vm.known).toBe(false);
    expect(vm.compactions).toBe(3);
  });

  it("is unknown for the measured pre-first-response shape (null pct alongside a zero token count) — zero tokens is not a known-zero context", () => {
    // docs/history/spikes/canary-fields.md's status-line context gauge: pre-first-response, the
    // percentage is null while the token count reads zero. Even if that zero ever
    // reached the wire (it shouldn't, per protocol INV-2), the derivation must still
    // call it unknown, not "0%".
    const vm = buildContextRowViewModel(makeContext({ usedPct: null, totalInputTokens: 0, windowSize: 0 }));
    expect(vm.known).toBe(false);
    expect(vm.pct).toBeNull();
    expect(vm.tokensText).toBeNull();
  });

  it("is unknown (defensive, protocol INV-2) when usedPct is null but totalInputTokens is populated — a wire violation must not half-render", () => {
    const vm = buildContextRowViewModel(makeContext({ usedPct: null, totalInputTokens: 1000, windowSize: 200000 }));
    expect(vm.known).toBe(false);
  });

  it("is unknown (defensive) when totalInputTokens is null but usedPct is populated", () => {
    const vm = buildContextRowViewModel(makeContext({ usedPct: 42, totalInputTokens: null, windowSize: 200000 }));
    expect(vm.known).toBe(false);
  });
});

describe("buildContextRowViewModel — known context", () => {
  it("rounds usedPct for display and formats totalInputTokens compactly", () => {
    const vm = buildContextRowViewModel(makeContext({ usedPct: 19, totalInputTokens: 38886, windowSize: 200000 }));
    expect(vm.known).toBe(true);
    expect(vm.pct).toBe(19);
    expect(vm.tokensText).toBe("39k");
  });

  it("rounds a fractional percentage (61.2 -> 61)", () => {
    const vm = buildContextRowViewModel(makeContext({ usedPct: 61.2, totalInputTokens: 1000, windowSize: 200000 }));
    expect(vm.pct).toBe(61);
  });

  it("carries the compaction count through unchanged when known", () => {
    const vm = buildContextRowViewModel(makeContext({ usedPct: 5, totalInputTokens: 100, windowSize: 200000, compactions: 2 }));
    expect(vm.compactions).toBe(2);
  });
});

describe("buildContextRowViewModel — hot threshold (W9/design-system §5): raw usedPct >= 60, boundary exact", () => {
  it("is not hot at 59%", () => {
    const vm = buildContextRowViewModel(makeContext({ usedPct: 59, totalInputTokens: 1000, windowSize: 200000 }));
    expect(vm.hot).toBe(false);
  });

  it("is hot at exactly 60%", () => {
    const vm = buildContextRowViewModel(makeContext({ usedPct: 60, totalInputTokens: 1000, windowSize: 200000 }));
    expect(vm.hot).toBe(true);
  });

  it("is not hot at 59.6% even though it would round to 60% on screen (compares the raw value, never the rounded one)", () => {
    const vm = buildContextRowViewModel(makeContext({ usedPct: 59.6, totalInputTokens: 1000, windowSize: 200000 }));
    expect(vm.hot).toBe(false);
    expect(vm.pct).toBe(60); // display rounds up...
  });

  it("is hot above 60%", () => {
    const vm = buildContextRowViewModel(makeContext({ usedPct: 84, totalInputTokens: 1000, windowSize: 200000 }));
    expect(vm.hot).toBe(true);
  });

  it("is never hot while unknown, regardless of any stray field values", () => {
    const vm = buildContextRowViewModel(makeContext({ usedPct: null, totalInputTokens: null, windowSize: null }));
    expect(vm.hot).toBe(false);
  });
});
