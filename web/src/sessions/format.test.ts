import { describe, expect, it } from "vitest";
import {
  elapsedSeconds,
  formatAge,
  formatEndedAge,
  formatResets,
  formatTimer,
  formatTokens,
  GAUGE_WARN_THRESHOLD,
} from "./format";

describe("elapsedSeconds", () => {
  it("computes whole elapsed seconds", () => {
    const since = "2026-08-22T00:00:00Z";
    const now = new Date("2026-08-22T00:00:05.900Z");
    expect(elapsedSeconds(since, now)).toBe(5);
  });

  it("clamps a since timestamp in the future to zero (clock race), never negative", () => {
    const since = "2026-08-22T00:00:10Z";
    const now = new Date("2026-08-22T00:00:00Z");
    expect(elapsedSeconds(since, now)).toBe(0);
  });

  it("returns zero for an unparsable timestamp rather than NaN", () => {
    expect(elapsedSeconds("not-a-date", new Date("2026-08-22T00:00:00Z"))).toBe(0);
  });

  it("returns zero for an empty string", () => {
    expect(elapsedSeconds("", new Date())).toBe(0);
  });
});

describe("formatTimer", () => {
  const since = "2026-08-22T00:00:00Z";

  it.each([
    [0, "00:00"],
    [5, "00:05"],
    [59, "00:59"],
    [60, "01:00"],
    [61, "01:01"],
    [599, "09:59"],
    [3599, "59:59"],
  ])("formats %d elapsed seconds as %s (MM:SS, under an hour)", (seconds, expected) => {
    const now = new Date(new Date(since).getTime() + seconds * 1000);
    expect(formatTimer(since, now)).toBe(expected);
  });

  it.each([
    [3600, "1h"],
    [7199, "1h"],
    [7200, "2h"],
    [86399, "23h"],
  ])("formats %d elapsed seconds as %s (hours, under a day)", (seconds, expected) => {
    const now = new Date(new Date(since).getTime() + seconds * 1000);
    expect(formatTimer(since, now)).toBe(expected);
  });

  it.each([
    [86400, "1d"],
    [172799, "1d"],
    [172800, "2d"],
  ])("formats %d elapsed seconds as %s (days)", (seconds, expected) => {
    const now = new Date(new Date(since).getTime() + seconds * 1000);
    expect(formatTimer(since, now)).toBe(expected);
  });

  it("never shows a negative duration for a since timestamp in the future", () => {
    const now = new Date("2026-08-22T00:00:00Z");
    const future = "2026-08-22T00:05:00Z";
    expect(formatTimer(future, now)).toBe("00:00");
  });
});

describe("formatAge", () => {
  const since = "2026-08-22T00:00:00Z";

  it.each([
    [0, "now"],
    [59, "now"],
    [60, "1m"],
    [3599, "59m"],
    [3600, "1h"],
    [86399, "23h"],
    [86400, "1d"],
  ])("formats %d elapsed seconds as %s", (seconds, expected) => {
    const now = new Date(new Date(since).getTime() + seconds * 1000);
    expect(formatAge(since, now)).toBe(expected);
  });
});

describe("formatEndedAge (REQ-9/REQ-10/REQ-13, plan m4-reconcile): same coarse buckets as formatAge", () => {
  const endedAt = "2026-08-22T00:00:00Z";

  it.each([
    [0, "now"],
    [59, "now"],
    [60, "1m"],
    [3599, "59m"],
    [3600, "1h"],
    [86399, "23h"],
    [86400, "1d"],
  ])("formats %d elapsed seconds since endedAt as %s", (seconds, expected) => {
    const now = new Date(new Date(endedAt).getTime() + seconds * 1000);
    expect(formatEndedAge(endedAt, now)).toBe(expected);
  });

  it("never shows a negative age for an endedAt timestamp momentarily in the future (clock race)", () => {
    const now = new Date("2026-08-22T00:00:00Z");
    const future = "2026-08-22T00:00:05Z";
    expect(formatEndedAge(future, now)).toBe("now");
  });

  it("returns 'now' for an unparsable endedAt rather than throwing", () => {
    expect(() => formatEndedAge("not-a-date", new Date())).not.toThrow();
    expect(formatEndedAge("not-a-date", new Date("2026-08-22T00:00:00Z"))).toBe("now");
  });
});

describe("GAUGE_WARN_THRESHOLD", () => {
  it("is 60 (design-system §5 'Gauge thresholds', settled 2026-08-23)", () => {
    expect(GAUGE_WARN_THRESHOLD).toBe(60);
  });
});

describe("formatTokens (W5): < 1000 verbatim, < 1M as NNk, >= 1M as N.NM", () => {
  it.each([
    [0, "0"],
    [1, "1"],
    [999, "999"],
  ])("formats %d verbatim as %s (below 1000)", (tokens, expected) => {
    expect(formatTokens(tokens)).toBe(expected);
  });

  it.each([
    [1000, "1k"],
    [1499, "1k"],
    [1500, "2k"], // Math.round: 1.5 rounds up
    [38886, "39k"],
    [999_499, "999k"],
    [999_999, "1000k"],
  ])("formats %d as %s (thousands, rounded)", (tokens, expected) => {
    expect(formatTokens(tokens)).toBe(expected);
  });

  it.each([
    [1_000_000, "1.0M"],
    [1_500_000, "1.5M"],
    [2_340_000, "2.3M"],
  ])("formats %d as %s (millions, one decimal)", (tokens, expected) => {
    expect(formatTokens(tokens)).toBe(expected);
  });

  it("exercises the exact boundary between the k and M formats (999999 vs 1000000)", () => {
    expect(formatTokens(999_999)).toBe("1000k");
    expect(formatTokens(1_000_000)).toBe("1.0M");
  });
});

// R5: formatResets renders using the *local* timezone (Date's local getters), while the
// daemon ships UTC RFC3339Nano. To keep these tests correct under any CI/dev machine's
// timezone (not just UTC), every fixture is built with the local Date constructor
// (`new Date(y, m, d, h, mi)`) and converted to an ISO string via `.toISOString()` — that
// round-trips through whatever offset the runner has, so the local hour/day the test
// asserts is always the local hour/day it constructed, regardless of TZ.
function localIso(year: number, month: number, day: number, hour = 0, minute = 0): string {
  return new Date(year, month, day, hour, minute).toISOString();
}

describe("formatResets (W6/REQ-14): same local day -> 'resets HH:MM', else 'resets <short weekday>'", () => {
  it("renders HH:MM when resetsAt falls on the same local day as now", () => {
    const now = new Date(localIso(2026, 7, 23, 9, 15));
    const resetsAt = localIso(2026, 7, 23, 14, 20);
    expect(formatResets(resetsAt, now)).toBe("resets 14:20");
  });

  it("pads single-digit hours and minutes", () => {
    const now = new Date(localIso(2026, 7, 23, 0, 0));
    const resetsAt = localIso(2026, 7, 23, 6, 5);
    expect(formatResets(resetsAt, now)).toBe("resets 06:05");
  });

  it("renders the short weekday when resetsAt falls on a different local day", () => {
    const now = new Date(localIso(2026, 7, 23, 9, 15));
    const resetsAt = localIso(2026, 7, 25, 6, 0);
    const result = formatResets(resetsAt, now);
    expect(result).toMatch(/^resets [A-Za-z]{3}$/);
    expect(result).not.toContain(":");
  });

  it("renders verbatim (no special-casing) for a resetsAt in the past — self-corrects on the next sample (edge case 10)", () => {
    const now = new Date(localIso(2026, 7, 23, 14, 0));
    const resetsAt = localIso(2026, 7, 23, 9, 0); // earlier today
    expect(formatResets(resetsAt, now)).toBe("resets 09:00");
  });

  it("treats a resetsAt just after local midnight as a different day when now is just before midnight the day before", () => {
    const now = new Date(localIso(2026, 7, 22, 23, 59));
    const resetsAt = localIso(2026, 7, 23, 0, 1);
    const result = formatResets(resetsAt, now);
    expect(result).not.toBe("resets 00:01");
    expect(result).toMatch(/^resets [A-Za-z]{3}$/);
  });
});
