import { describe, expect, it } from "vitest";
import { elapsedSeconds, formatAge, formatTimer } from "./format";

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
