import { describe, expect, it } from "vitest";
import { asInteger } from "./decode";

describe("asInteger (a wire id or count that must be a whole number)", () => {
  it.each([
    ["zero", 0, 0],
    ["a positive integer", 7, 7],
    ["a negative integer", -3, -3],
    ["a whole number written with a fraction part", 4.0, 4],
    ["the largest safe integer", Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  ])("%s is kept", (_name, value, expected) => {
    expect(asInteger(value)).toBe(expected);
  });

  it.each([
    ["a fraction", 1.5],
    ["a tiny fraction", 0.1],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negative Infinity", Number.NEGATIVE_INFINITY],
    ["a numeric string", "3"],
    ["a boolean", true],
    ["null", null],
    ["undefined", undefined],
    ["an object", { id: 3 }],
    ["an array", [3]],
  ])("%s is null", (_name, value) => {
    expect(asInteger(value)).toBeNull();
  });
});
