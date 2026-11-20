import { describe, expect, it } from "vitest";
import { wordDiff } from "./diffwords";

const join = (segs: { text: string }[]) => segs.map((s) => s.text).join("");

describe("diffwords — wordDiff", () => {
  it("marks only the differing word on each side", () => {
    const pair = wordDiff("return PRAISE[0]", "return WORDS[0]");
    expect(pair?.old.filter((s) => s.changed).map((s) => s.text)).toEqual(["PRAISE"]);
    expect(pair?.new.filter((s) => s.changed).map((s) => s.text)).toEqual(["WORDS"]);
  });

  it("segments rejoin to the original text and never carry adjacent same-kind segs", () => {
    const pair = wordDiff("let a = foo(bar, baz)", "let a = foo(bar, qux, baz)");
    expect(join(pair?.old ?? [])).toBe("let a = foo(bar, baz)");
    expect(join(pair?.new ?? [])).toBe("let a = foo(bar, qux, baz)");
    for (const segs of [pair?.old ?? [], pair?.new ?? []]) {
      segs.forEach((s, i) => {
        if (i > 0) expect(s.changed).not.toBe(segs[i - 1]?.changed);
      });
    }
  });

  it.each([
    ["mostly different (a rewritten line)", "alpha beta gamma", "one two three four"],
    ["identical lines (nothing to highlight)", "same line", "same line"],
    ["both empty", "", ""],
    ["no shared text", "abc", "xyz"],
  ])("returns null for %s", (_n, a, b) => {
    expect(wordDiff(a, b)).toBeNull();
  });

  it("returns null past 400 tokens on either side", () => {
    const long = "a ".repeat(201);
    expect(wordDiff(long, "a b")).toBeNull();
    expect(wordDiff("a b", long)).toBeNull();
  });

  it("handles a pure insertion as only new-side changes", () => {
    const pair = wordDiff("call(a)", "call(a, b)");
    expect(pair?.old.some((s) => s.changed)).toBe(false);
    expect(pair?.new.some((s) => s.changed)).toBe(true);
  });
});
