import { describe, expect, it } from "vitest";
import type { DiffFile, DiffLine } from "../api/diff";
import { MINUS } from "./diffbutton";
import { buildFileModel, buildModels, changeKey, entrySide, fileTick, progress } from "./diffmodel";

const ctx = (n: number, text = "c"): DiffLine => ({
  kind: "context",
  old: n,
  new: n,
  text,
});
const del = (n: number, text: string): DiffLine => ({
  kind: "del",
  old: n,
  new: null,
  text,
});
const add = (n: number, text: string): DiffLine => ({
  kind: "add",
  old: null,
  new: n,
  text,
});

function file(path: string, ...hunks: DiffLine[][]): DiffFile {
  return {
    path,
    oldPath: null,
    status: "modified",
    binary: false,
    additions: 0,
    deletions: 0,
    hunks: hunks.map((lines) => ({ header: "@@", lines })),
  };
}

describe("diffmodel — buildFileModel", () => {
  it("groups a run of removed and added lines into one change, split by context", () => {
    const m = buildFileModel(
      file("a", [ctx(1), del(2, "x"), del(3, "y"), add(2, "z"), ctx(4), add(5, "w")]),
    );
    expect(m.changes).toHaveLength(2);
    expect(m.changes[0]?.dels).toEqual([1, 2]);
    expect(m.changes[0]?.adds).toEqual([3]);
    expect(m.changes[1]?.adds).toEqual([5]);
    expect(m.entries.map((e) => e.change)).toEqual([-1, 0, 0, 0, -1, 1]);
  });

  it("starts a new change at a hunk boundary even with no context between", () => {
    const m = buildFileModel(file("a", [add(1, "x")], [add(9, "y")]));
    expect(m.changes).toHaveLength(2);
  });

  it("has no changes for an empty or context-only file", () => {
    expect(buildFileModel(file("a")).changes).toEqual([]);
    expect(buildFileModel(file("a", [ctx(1)])).changes).toEqual([]);
  });

  it("word-marks paired del/add lines only when similar", () => {
    const m = buildFileModel(file("a", [del(1, "return A[0]"), add(1, "return B[0]")]));
    expect(m.entries[0]?.segs).not.toBeNull();
    expect(m.entries[1]?.segs).not.toBeNull();
    const far = buildFileModel(
      file("a", [del(1, "alpha beta gamma"), add(1, "one two three four")]),
    );
    expect(far.entries[0]?.segs).toBeNull();
  });

  it("buildModels maps every file", () => {
    expect(buildModels([file("a"), file("b")]).map((m) => m.file.path)).toEqual(["a", "b"]);
  });
});

describe("diffmodel — change keys (kb:adr/diff-comments-anchor-by-quote-ticks-by-content)", () => {
  it("is stable across line-number shifts of the same content", () => {
    const a = buildFileModel(file("p", [ctx(1), del(2, "x"), add(2, "y")]));
    const b = buildFileModel(file("p", [ctx(40), del(41, "x"), add(41, "y")]));
    expect(a.changes[0]?.key).toBe(b.changes[0]?.key);
  });

  it.each([
    ["different path", changeKey("a", ["x"], ["y"]), changeKey("b", ["x"], ["y"])],
    ["different removed text", changeKey("a", ["x"], ["y"]), changeKey("a", ["z"], ["y"])],
    ["different added text", changeKey("a", ["x"], ["y"]), changeKey("a", ["x"], ["z"])],
    [
      "a line moved across the del/add split",
      changeKey("a", ["x", "y"], []),
      changeKey("a", ["x"], ["y"]),
    ],
  ])("differs for %s", (_n, one, two) => {
    expect(one).not.toBe(two);
  });

  it("carries the k1: prefix and fits the 256-char wire limit", () => {
    const key = changeKey("a".repeat(500), ["x".repeat(5000)], []);
    expect(key.startsWith("k1:")).toBe(true);
    expect(key.length).toBeLessThanOrEqual(256);
  });
});

describe("diffmodel — entry helpers", () => {
  it("entrySide and Entry.line pick the new side for added and context, old for removed", () => {
    const m = buildFileModel(file("a", [ctx(3), del(4, "x"), add(4, "y")]));
    const [c, d, a] = m.entries as [
      (typeof m.entries)[number],
      (typeof m.entries)[number],
      (typeof m.entries)[number],
    ];
    expect([entrySide(c), c.line]).toEqual(["new", 3]);
    expect([entrySide(d), d.line]).toEqual(["old", 4]);
    expect([entrySide(a), a.line]).toEqual(["new", 4]);
  });
});

describe("diffmodel — computed display fields", () => {
  it("gives each entry its sign, and a change and file their signed counts", () => {
    const f = {
      ...file("src/a.ts", [ctx(1), del(2, "x"), del(3, "y"), add(2, "z")]),
      additions: 1,
      deletions: 2,
    };
    const m = buildFileModel(f);
    expect(m.entries.map((e) => e.sign)).toEqual([" ", MINUS, MINUS, "+"]);
    expect(m.changes[0]?.counts).toBe(`+1 ${MINUS}2`);
    expect(m.counts).toBe(`+1 ${MINUS}2`);
    expect(m.path).toBe("src/a.ts");
  });

  it("shows a rename as old → new in FileModel.path", () => {
    const f = {
      ...file("new.ts"),
      status: "renamed" as const,
      oldPath: "old.ts",
    };
    expect(buildFileModel(f).path).toBe("old.ts → new.ts");
  });
});

describe("diffmodel — ticks and progress", () => {
  const m = buildFileModel(file("a", [add(1, "x"), ctx(2), add(3, "y")]));
  const [k0, k1] = m.changes.map((c) => c.key) as [string, string];

  it.each([
    ["no tick", [], "none", 0],
    ["one of two", [k0], "some", 1],
    ["both", [k0, k1], "all", 2],
    ["a key from elsewhere", ["k1:zzz"], "none", 0],
  ])("fileTick with %s", (_n, ticked, state, done) => {
    expect(fileTick(m, new Set(ticked))).toEqual({ state, done });
  });

  it("progress sums done and total across files", () => {
    const other = buildFileModel(file("b", [add(1, "q")]));
    const otherKey = (other.changes[0] as { key: string }).key;
    expect(progress([m, other], new Set([k0, otherKey]))).toEqual({
      done: 2,
      total: 3,
    });
    expect(progress([], new Set())).toEqual({ done: 0, total: 0 });
  });
});
