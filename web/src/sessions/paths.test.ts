import { describe, expect, it } from "vitest";
import { basename } from "./paths";

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
