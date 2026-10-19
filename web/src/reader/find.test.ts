import { describe, expect, it } from "vitest";
import { clampIndex, countText, findInTexts, stepIndex } from "./find";

describe("findInTexts (W1)", () => {
  it.each([
    ["empty query matches nothing", ["abc"], "", []],
    [
      "case-insensitive",
      ["Hello HELLO"],
      "hello",
      [
        [0, 0, 5],
        [0, 6, 11],
      ],
    ],
    [
      "whitespace-only query is literal",
      ["a b  c"],
      " ",
      [
        [0, 1, 2],
        [0, 3, 4],
        [0, 4, 5],
      ],
    ],
    ["dot is literal", ["a.b axb"], ".", [[0, 1, 2]]],
    ["star is literal", ["a*b ab"], "a*", [[0, 0, 2]]],
    ["paren is literal", ["f(x) f"], "(", [[0, 1, 2]]],
    [
      "overlapping occurrences are non-overlapping",
      ["aaaa"],
      "aa",
      [
        [0, 0, 2],
        [0, 2, 4],
      ],
    ],
    ["odd run leaves the remainder", ["aaa"], "aa", [[0, 0, 2]]],
    ["a match never spans two strings", ["foo ", "bar"], "foo bar", []],
    [
      "matches carry their string index",
      ["x", "ax", "xx"],
      "x",
      [
        [0, 0, 1],
        [1, 1, 2],
        [2, 0, 1],
        [2, 1, 2],
      ],
    ],
    ["no match", ["abc"], "z", []],
  ] as const)("%s", (_name, texts, query, expected) => {
    const got = findInTexts(texts, query).map((m) => [m.node, m.start, m.end]);
    expect(got).toEqual(expected);
  });

  it("maps indices back when lower-casing changes the length", () => {
    const text = "İx x";
    const got = findInTexts([text], "x");
    expect(got.map((m) => text.slice(m.start, m.end))).toEqual(["x", "x"]);
  });
});

describe("stepIndex (W3)", () => {
  it.each([
    [0, 3, 1, 1],
    [2, 3, 1, 0],
    [0, 3, -1, 2],
    [2, 3, -1, 1],
    [0, 1, 1, 0],
    [0, 1, -1, 0],
    [0, 0, 1, 0],
    [0, 0, -1, 0],
  ] as const)("index %i of %i step %i -> %i", (index, count, dir, want) => {
    expect(stepIndex(index, count, dir)).toBe(want);
  });
});

describe("clampIndex", () => {
  it.each([
    [5, 3, 2],
    [1, 3, 1],
    [-1, 3, 0],
    [0, 0, 0],
  ] as const)("clamp %i of %i -> %i", (index, count, want) => {
    expect(clampIndex(index, count)).toBe(want);
  });
});

describe("countText (W3)", () => {
  it.each([
    [0, 0, "", "No results"],
    [0, 5, "", "No results"],
    [0, 0, "x", "No results"],
    [0, 4, "x", "1 of 4"],
    [3, 4, "x", "4 of 4"],
    [0, 1, " ", "1 of 1"],
  ] as const)("index %i count %i query %j -> %j", (index, count, query, want) => {
    expect(countText(index, count, query)).toBe(want);
  });
});
