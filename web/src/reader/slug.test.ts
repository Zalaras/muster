// Plan markdown-viewing (W8, REQ-14): headingSlug/dedupeIds are the outline's heading-id
// derivation, shared with markdown.ts's heading walk (see that module for why this stays
// its own pure unit).
import { describe, expect, it } from "vitest";
import { dedupeIds, headingSlug } from "./slug";

describe("headingSlug", () => {
  it("lowercases", () => {
    expect(headingSlug("Overview")).toBe("overview");
  });

  it("hyphenates spaces", () => {
    expect(headingSlug("The hard part")).toBe("the-hard-part");
  });

  it("strips punctuation but keeps word characters and hyphens", () => {
    expect(headingSlug("Testing (both sides)!")).toBe("testing-both-sides");
  });

  it("collapses runs of whitespace to a single hyphen", () => {
    expect(headingSlug("Two   spaces")).toBe("two-spaces");
  });

  it("trims leading/trailing whitespace before slugging", () => {
    expect(headingSlug("  padded  ")).toBe("padded");
  });

  it("keeps an existing hyphen and underscore untouched", () => {
    expect(headingSlug("kebab-case_word")).toBe("kebab-case_word");
  });

  it("returns an empty string for an all-punctuation heading", () => {
    expect(headingSlug("---")).toBe("---");
  });
});

describe("dedupeIds (edge case 26: repeated heading text)", () => {
  it("leaves unique slugs untouched", () => {
    expect(dedupeIds(["intro", "overview", "details"])).toEqual(["intro", "overview", "details"]);
  });

  it("appends -2, -3 to repeats in document order", () => {
    expect(dedupeIds(["notes", "notes", "notes"])).toEqual(["notes", "notes-2", "notes-3"]);
  });

  it("dedupes independently per distinct slug", () => {
    expect(dedupeIds(["a", "b", "a", "b", "a"])).toEqual(["a", "b", "a-2", "b-2", "a-3"]);
  });

  it("returns an empty array for no headings", () => {
    expect(dedupeIds([])).toEqual([]);
  });
});
