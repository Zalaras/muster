// Plan markdown-render-fixes (REQ-13, W7): basename and loadingText are the reader's pure
// path/text derivations — no DOM, Vitest-tested directly.
import { describe, expect, it } from "vitest";
import { basename, loadingText } from "./paths";

describe("basename", () => {
  it("returns the last path segment", () => {
    expect(basename("/Users/bob/code/Projects/muster/TODO.md")).toBe("TODO.md");
  });

  it("returns the last segment of a relative path", () => {
    expect(basename("docs/adr/x.md")).toBe("x.md");
  });

  it("falls back to the path itself when there is no slash", () => {
    expect(basename("TODO.md")).toBe("TODO.md");
  });

  it("strips a trailing slash before taking the last segment (shared with sessions/card.ts)", () => {
    expect(basename("/Users/bob/plans/")).toBe("plans");
  });

  it("returns an empty string for an empty path", () => {
    expect(basename("")).toBe("");
  });
});

describe("loadingText", () => {
  it("returns the bare 'loading…' for a null path (REQ-9/REQ-10)", () => {
    expect(loadingText(null)).toBe("loading…");
  });

  it("returns 'loading <basename>…' for a path (REQ-8)", () => {
    expect(loadingText("/Users/bob/code/Projects/muster/TODO.md")).toBe("loading TODO.md…");
  });

  it("uses the same basename derivation as the standalone function", () => {
    const path = "docs/adr/x.md";
    expect(loadingText(path)).toBe(`loading ${basename(path)}…`);
  });
});
