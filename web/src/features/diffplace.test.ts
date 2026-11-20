import { describe, expect, it } from "vitest";
import type { DiffFile, DiffLine, ReviewComment } from "../api/diff";
import { buildFileModel } from "./diffmodel";
import {
  commentHeading,
  lineLabel,
  lineSpan,
  openCount,
  placeComment,
  placementAnchor,
  recordedLines,
} from "./diffplace";

const ctx = (n: number, text: string): DiffLine => ({
  kind: "context",
  old: n,
  new: n,
  text,
});
const add = (n: number, text: string): DiffLine => ({
  kind: "add",
  old: null,
  new: n,
  text,
});
const del = (n: number, text: string): DiffLine => ({
  kind: "del",
  old: n,
  new: null,
  text,
});

function model(...lines: DiffLine[]) {
  const f: DiffFile = {
    path: "a",
    oldPath: null,
    status: "modified",
    binary: false,
    additions: 0,
    deletions: 0,
    hunks: [{ header: "@@", lines }],
  };
  return buildFileModel(f);
}

function comment(over: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: "c",
    path: "a",
    start: { side: "new", line: 2 },
    end: { side: "new", line: 3 },
    quote: ["two", "three"],
    body: "b",
    resolved: false,
    createdAt: "t",
    ...over,
  };
}

describe("diffplace — placeComment", () => {
  const m = model(ctx(1, "one"), add(2, "two"), add(3, "three"), ctx(4, "four"));

  it("places a comment whose quote still matches at its lines", () => {
    expect(placeComment(m, comment())).toEqual({
      kind: "placed",
      first: 1,
      last: 2,
      lines: "2–3",
    });
  });

  it("follows the quote when lines shifted", () => {
    const shifted = model(ctx(1, "x"), ctx(2, "y"), ctx(3, "z"), add(4, "two"), add(5, "three"));
    expect(placeComment(shifted, comment())).toEqual({
      kind: "placed",
      first: 3,
      last: 4,
      lines: "4–5",
    });
  });

  it("picks the nearest of several identical lines", () => {
    const dup = model(add(1, "same"), ctx(2, "m"), ctx(10, "m"), add(11, "same"));
    const c = comment({
      start: { side: "new", line: 10 },
      end: { side: "new", line: 10 },
      quote: ["same"],
    });
    expect(placeComment(dup, c)).toMatchObject({
      kind: "placed",
      first: 3,
      last: 3,
      lines: "11",
    });
  });

  it("is partial when only one end still matches", () => {
    expect(placeComment(m, comment({ quote: ["two", "gone"] }))).toEqual({
      kind: "partial",
      at: 1,
      lines: "2",
    });
    expect(placeComment(m, comment({ quote: ["gone", "three"] }))).toEqual({
      kind: "partial",
      at: 2,
      lines: "3",
    });
  });

  it("is partial when the matched ends are out of order", () => {
    expect(placeComment(m, comment({ quote: ["three", "two"] })).kind).toBe("partial");
  });

  it("is outdated when no end matches or the file is gone", () => {
    expect(placeComment(m, comment({ quote: ["x", "y"] }))).toEqual({
      kind: "outdated",
    });
    expect(placeComment(undefined, comment())).toEqual({ kind: "outdated" });
  });

  it("matches a removed line on the old side only", () => {
    const o = model(del(5, "gone"), add(5, "gone"));
    const c = comment({
      start: { side: "old", line: 5 },
      end: { side: "old", line: 5 },
      quote: ["gone"],
    });
    expect(placeComment(o, c)).toMatchObject({
      kind: "placed",
      first: 0,
      last: 0,
      lines: "5",
    });
  });
});

describe("diffplace — helpers", () => {
  it("placementAnchor is the last row, the partial row, or null", () => {
    expect(placementAnchor({ kind: "placed", first: 1, last: 4, lines: "x" })).toBe(4);
    expect(placementAnchor({ kind: "partial", at: 2, lines: "x" })).toBe(2);
    expect(placementAnchor({ kind: "outdated" })).toBeNull();
  });

  it.each([
    [3, 3, "3", "Line 3"],
    [3, 5, "3–5", "Lines 3–5"],
  ])("lineSpan(%i,%i) and lineLabel", (a, b, span, label) => {
    expect(lineSpan(a, b)).toBe(span);
    expect(lineLabel(span)).toBe(label);
  });

  it("recordedLines uses the saved start and end, and openCount skips resolved", () => {
    expect(recordedLines(comment())).toBe("2–3");
    expect(openCount([comment(), comment({ resolved: true }), comment()])).toBe(2);
    expect(openCount([])).toBe(0);
  });
});

describe("diffplace — commentHeading", () => {
  it.each([
    ["3", "Commenting on line 3"],
    ["3–5", "Commenting on lines 3–5"],
  ])("commentHeading(%s)", (lines, heading) => {
    expect(commentHeading(lines)).toBe(heading);
  });
});
