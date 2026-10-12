import { describe, expect, it } from "vitest";
import {
  agoSuffix,
  ageAgo,
  elapsedSeconds,
  formatAge,
  formatResets,
  formatResetsTitle,
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

describe("formatAge (REQ-9/REQ-10/REQ-13, plan m4-reconcile): coarse buckets, one function for both a session's live age and its endedAt age", () => {
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

  it("never shows a negative age for a timestamp momentarily in the future (clock race)", () => {
    const now = new Date("2026-08-22T00:00:00Z");
    const future = "2026-08-22T00:00:05Z";
    expect(formatAge(future, now)).toBe("now");
  });

  it("returns 'now' for an unparsable timestamp rather than throwing", () => {
    expect(() => formatAge("not-a-date", new Date())).not.toThrow();
    expect(formatAge("not-a-date", new Date("2026-08-22T00:00:00Z"))).toBe("now");
  });
});

describe("agoSuffix (review markdown-viewing cycle-1 Major 2): the shared '<age> ago' composer", () => {
  it("leaves the 'now' bucket bare instead of appending ' ago'", () => {
    expect(agoSuffix("now")).toBe("now");
  });

  it.each(["1m", "59m", "1h", "23h", "1d"])("appends ' ago' to every other bucket (%s)", (age) => {
    expect(agoSuffix(age)).toBe(`${age} ago`);
  });
});

describe("ageAgo: agoSuffix applied to formatAge", () => {
  it("reads 'now', never 'now ago', for a sub-minute endedAt", () => {
    const endedAt = "2026-08-22T00:00:00Z";
    const now = new Date("2026-08-22T00:00:05Z");
    expect(ageAgo(endedAt, now)).toBe("now");
  });

  it("reads '<age> ago' once a minute has elapsed", () => {
    const endedAt = "2026-08-22T00:00:00Z";
    const now = new Date("2026-08-22T00:02:00Z");
    expect(ageAgo(endedAt, now)).toBe("2m ago");
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

type LocalParts = readonly [number, number, number, number, number];

function localIsoAt(parts: LocalParts): string {
  return localIso(parts[0], parts[1], parts[2], parts[3], parts[4]);
}

describe("formatResets (W2/REQ-4): same local day -> '(HH:MM)', else '(HH:MM Ddd)'", () => {
  it.each([
    ["the same local day", [2026, 7, 23, 9, 15], [2026, 7, 23, 14, 20], "(14:20)"],
    ["a single-digit hour and minute, padded", [2026, 7, 23, 0, 0], [2026, 7, 23, 6, 5], "(06:05)"],
    [
      "a past resetsAt earlier today, verbatim (edge case 10)",
      [2026, 7, 23, 14, 0],
      [2026, 7, 23, 9, 0],
      "(09:00)",
    ],
    ["local midnight exactly, same day", [2026, 7, 23, 0, 0], [2026, 7, 23, 0, 0], "(00:00)"],
    ["the last minute of the day, same day", [2026, 7, 23, 0, 0], [2026, 7, 23, 23, 59], "(23:59)"],
  ] as const)(
    "renders %s",
    (_name: string, nowParts: LocalParts, resetsParts: LocalParts, expected: string) => {
      const now = new Date(localIsoAt(nowParts));
      expect(formatResets(localIsoAt(resetsParts), now)).toBe(expected);
    },
  );

  const OTHER_DAY = /^\((\d{2}:\d{2}) ([\p{L}.]{2,})\)$/u;

  it.each([
    ["two days later", [2026, 7, 23, 9, 15], [2026, 7, 25, 6, 0], "06:00"],
    [
      "just after local midnight, with now just before it",
      [2026, 7, 22, 23, 59],
      [2026, 7, 23, 0, 1],
      "00:01",
    ],
    ["the same weekday a week on", [2026, 7, 23, 9, 15], [2026, 7, 30, 9, 15], "09:15"],
    ["a past resetsAt on an earlier day", [2026, 7, 23, 9, 15], [2026, 7, 21, 17, 45], "17:45"],
    [
      "the same day of the month in a later month",
      [2026, 7, 23, 9, 15],
      [2026, 8, 23, 9, 15],
      "09:15",
    ],
  ] as const)(
    "renders the clock and short weekday for %s",
    (_name: string, nowParts: LocalParts, resetsParts: LocalParts, clock: string) => {
      const now = new Date(localIsoAt(nowParts));
      const match = OTHER_DAY.exec(formatResets(localIsoAt(resetsParts), now));
      expect(match?.[1]).toBe(clock);
    },
  );

  it("uses the weekday of the reset day, not of now", () => {
    const now = new Date(localIso(2026, 7, 23, 9, 15));
    const resetsAt = localIso(2026, 7, 25, 6, 0);
    const weekday = new Date(resetsAt).toLocaleDateString(undefined, { weekday: "short" });
    expect(formatResets(resetsAt, now)).toBe(`(06:00 ${weekday})`);
  });

  it("never carries the old 'resets' wording", () => {
    const now = new Date(localIso(2026, 7, 23, 9, 15));
    expect(formatResets(localIso(2026, 7, 23, 14, 20), now)).not.toContain("resets");
    expect(formatResets(localIso(2026, 7, 25, 6, 0), now)).not.toContain("resets");
  });
});

describe("formatResetsTitle (REQ-12): the full local date and the same HH:MM as the suffix", () => {
  it.each([
    [[2026, 9, 13, 15, 59], "15:59"],
    [[2026, 9, 13, 6, 5], "06:05"],
    [[2026, 9, 13, 0, 0], "00:00"],
  ] as const)("%j ends in the 24-hour clock %s", (parts: LocalParts, clock: string) => {
    const title = formatResetsTitle(localIsoAt(parts));
    expect(title.startsWith("Resets ")).toBe(true);
    expect(title.endsWith(`, ${clock}`)).toBe(true);
  });

  it("names the weekday and the day of the month from the same locale call", () => {
    const iso = localIso(2026, 9, 13, 15, 59);
    const date = new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    expect(formatResetsTitle(iso)).toBe(`Resets ${date}, 15:59`);
  });

  it("contains the HH:MM the suffix shows, for same-day and other-day resets alike", () => {
    const now = new Date(localIso(2026, 9, 13, 9, 0));
    for (const resetsAt of [localIso(2026, 9, 13, 15, 59), localIso(2026, 9, 15, 6, 30)]) {
      const clock = /\d{2}:\d{2}/.exec(formatResets(resetsAt, now))?.[0];
      expect(clock).toBeDefined();
      expect(formatResetsTitle(resetsAt)).toContain(clock as string);
    }
  });
});
