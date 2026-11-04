import { describe, expect, it } from "vitest";
import { parseStandaloneQuery } from "../features/reader";
import { parseSessionParam } from "./query";

const cases: [string, string, number | null][] = [
  ["a bare integer", "?session=12", 12],
  ["zero", "?session=0", 0],
  ["no query", "", null],
  ["missing session", "?other=1", null],
  ["empty", "?session=", null],
  ["negative", "?session=-3", null],
  ["fractional", "?session=1.5", null],
  ["non-numeric", "?session=abc", null],
  ["trailing junk", "?session=12x", null],
  ["signed", "?session=%2B4", null],
];

describe("parseSessionParam", () => {
  it.each(cases)("%s", (_label, search, expected) => {
    expect(parseSessionParam(new URLSearchParams(search))).toBe(expected);
  });
});

describe("parseStandaloneQuery (shares the session parse)", () => {
  it.each(cases)("%s", (_label, search, expected) => {
    const target = parseStandaloneQuery(search);
    expect(target === null ? null : target.sessionId).toBe(expected);
  });

  it("carries the path alongside the session, null when absent", () => {
    expect(parseStandaloneQuery("?session=3&path=a%2Fb.md")).toEqual({
      sessionId: 3,
      path: "a/b.md",
    });
    expect(parseStandaloneQuery("?session=3")).toEqual({ sessionId: 3, path: null });
  });
});
