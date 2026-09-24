import { describe, expect, it } from "vitest";
import { formatResets } from "./format";
import type { UsageBucket as UsageBucketSource } from "../protocol/usage";
import { buildUsageBucketViewModel } from "./usage";

// R5: `formatResets` (which this derivation delegates to for `resetsText`) renders using
// the *local* timezone, while the daemon ships UTC RFC3339Nano — same `localIso` idiom as
// format.test.ts, so these fixtures are correct under any CI/dev machine's timezone.
function localIso(year: number, month: number, day: number, hour = 0, minute = 0): string {
  return new Date(year, month, day, hour, minute).toISOString();
}

const NOW = new Date(localIso(2026, 7, 23, 9, 0));

function bucket(overrides: Partial<UsageBucketSource> = {}): UsageBucketSource {
  return { usedPct: 42, resetsAt: localIso(2026, 7, 23, 11, 0), ...overrides };
}

describe("buildUsageBucketViewModel — honesty rule 1 (design-system §6.1): null never derives a percentage or track", () => {
  it("is 'unknown' with no fill/resets/warn for a null bucket (pre-hello state, or a daemon restart)", () => {
    const vm = buildUsageBucketViewModel(null, NOW);
    expect(vm.percentText).toBe("unknown");
    expect(vm.warn).toBe(false);
    expect(vm.fillPercent).toBeNull();
    expect(vm.resetsText).toBeNull();
  });

  it("is a true no-op regardless of the current time — no time-dependent path taken when the bucket is null", () => {
    expect(buildUsageBucketViewModel(null, new Date("2000-01-01T00:00:00Z"))).toEqual(
      buildUsageBucketViewModel(null, new Date("2099-01-01T00:00:00Z")),
    );
  });
});

describe("buildUsageBucketViewModel — known bucket", () => {
  it("rounds usedPct for display and carries formatResets' text, prefixed with '· '", () => {
    const source = bucket({ usedPct: 61.2 });
    const vm = buildUsageBucketViewModel(source, NOW);
    expect(vm.percentText).toBe("61%");
    expect(vm.fillPercent).toBe(61);
    expect(vm.resetsText).toBe(`· ${formatResets(source.resetsAt, NOW)}`);
  });

  it("rounds the boundary values 0 and 99.6 correctly (0% and 100%, never blank)", () => {
    expect(buildUsageBucketViewModel(bucket({ usedPct: 0 }), NOW).percentText).toBe("0%");
    expect(buildUsageBucketViewModel(bucket({ usedPct: 0 }), NOW).fillPercent).toBe(0);
    expect(buildUsageBucketViewModel(bucket({ usedPct: 99.6 }), NOW).percentText).toBe("100%");
    expect(buildUsageBucketViewModel(bucket({ usedPct: 99.6 }), NOW).fillPercent).toBe(100);
  });

  // design-system §5 "Gauge thresholds": compared against the raw (unrounded) usedPct,
  // never the display-rounded one — a bar reading "60%" on screen only because 59.6
  // rounded up must not also claim the threshold.
  it("applies the 'warn' modifier at or above the 60% threshold and omits it below", () => {
    expect(buildUsageBucketViewModel(bucket({ usedPct: 59.9 }), NOW).warn).toBe(false);
    expect(buildUsageBucketViewModel(bucket({ usedPct: 60 }), NOW).warn).toBe(true);
    expect(buildUsageBucketViewModel(bucket({ usedPct: 61.2 }), NOW).warn).toBe(true);
  });

  it("never carries 'warn' when a rounded-up display percent reaches 60 but the raw usedPct is still below the threshold", () => {
    // 59.6 rounds to "60%" on screen but must not warn — the threshold reads the raw value.
    const vm = buildUsageBucketViewModel(bucket({ usedPct: 59.6 }), NOW);
    expect(vm.percentText).toBe("60%");
    expect(vm.warn).toBe(false);
  });
});
