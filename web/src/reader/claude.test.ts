import { describe, expect, it } from "vitest";
import type { ReaderListing } from "../api/reader";
import { makeReaderListing } from "../api/testfixtures";
import {
  claudeChips,
  docChangedNeedsRescan,
  isScratchPath,
  latestIso,
  scratchDirMoved,
  type ScratchRescanInput,
} from "./claude";

const DIR = "/private/tmp/claude-501/-x/abc/scratchpad";

function listing(scratch: ReaderListing["scratch"]): ReaderListing {
  return makeReaderListing({ scratch });
}

function file(path: string) {
  return { path, modifiedAt: "2026-11-12T10:00:00Z", writtenAt: null };
}

describe("claudeChips (REQ-7)", () => {
  it.each([
    [true, 0, { plan: "plan", tmp: null }],
    [false, 0, { plan: "no plan", tmp: null }],
    [true, 1, { plan: "plan", tmp: "1 tmp" }],
    [false, 3, { plan: "no plan", tmp: "3 tmp" }],
    [true, 12, { plan: "plan", tmp: "12 tmp" }],
  ])("plan exists %s, %s scratch files", (planExists, count, expected) => {
    expect(claudeChips(planExists, count)).toEqual(expected);
  });
});

describe("latestIso (the summary row's age)", () => {
  it.each<[string, (string | null | undefined)[], string | null]>([
    ["nothing", [], null],
    ["only nulls and undefined", [null, undefined], null],
    ["one stamp", ["2026-11-12T10:00:00Z"], "2026-11-12T10:00:00Z"],
    ["the later of two", ["2026-11-12T10:00:00Z", "2026-11-12T11:00:00Z"], "2026-11-12T11:00:00Z"],
    [
      "the later regardless of order",
      ["2026-11-12T11:00:00Z", "2026-11-12T10:00:00Z"],
      "2026-11-12T11:00:00Z",
    ],
    ["skipping nulls", [null, "2026-11-12T10:00:00Z", undefined], "2026-11-12T10:00:00Z"],
    [
      "instants, not strings",
      ["2026-11-12T10:00:00+02:00", "2026-11-12T09:00:00Z"],
      "2026-11-12T09:00:00Z",
    ],
  ])("picks %s", (_name, stamps, expected) => {
    expect(latestIso(...stamps)).toBe(expected);
  });
});

describe("isScratchPath (REQ-10: the tmp badge)", () => {
  const dirs = new Set([DIR, "/old/scratchpad"]);
  it.each([
    [`${DIR}/findings.md`, true],
    [`${DIR}/notes/options.md`, true],
    ["/old/scratchpad/a.md", true],
    [DIR, false],
    [`${DIR}-other/a.md`, false],
    ["/Users/bob/code/muster/TODO.md", false],
    ["TODO.md", false],
  ])("%s -> %s", (path, expected) => {
    expect(isScratchPath(path, dirs)).toBe(expected);
  });

  it("is false with no known folders", () => {
    expect(isScratchPath(`${DIR}/a.md`, new Set())).toBe(false);
  });
});

describe("docChangedNeedsRescan (REQ-11)", () => {
  const held = listing({ dir: DIR, files: [file("findings.md"), file("notes/options.md")] });
  const base: ScratchRescanInput = {
    listing: held,
    listingPending: false,
    scratchpadDir: DIR,
    changedPath: `${DIR}/new.md`,
  };

  it.each<[string, Partial<ScratchRescanInput>, boolean]>([
    ["an unknown scratch .md", {}, true],
    ["an unknown nested scratch .md", { changedPath: `${DIR}/deep/er/x.md` }, true],
    ["an upper-case extension", { changedPath: `${DIR}/NEW.MD` }, true],
    ["a file the listing already holds", { changedPath: `${DIR}/findings.md` }, false],
    ["a nested file the listing holds", { changedPath: `${DIR}/notes/options.md` }, false],
    ["a non-markdown file", { changedPath: `${DIR}/data.json` }, false],
    ["a path outside the scratchpad", { changedPath: "/Users/bob/code/muster/new.md" }, false],
    ["a sibling folder sharing the prefix", { changedPath: `${DIR}-x/new.md` }, false],
    ["no listing yet", { listing: null }, false],
    ["a listing already in flight", { listingPending: true }, false],
    ["no known scratchpad folder", { scratchpadDir: null }, false],
    ["a listing whose scratch is null", { listing: listing(null) }, true],
    [
      "a listing covering another folder",
      { listing: listing({ dir: "/other/scratchpad", files: [file("new.md")] }) },
      true,
    ],
  ])("%s", (_name, over, expected) => {
    expect(docChangedNeedsRescan({ ...base, ...over })).toBe(expected);
  });
});

describe("scratchDirMoved (REQ-11: a sessionUpsert with a new folder)", () => {
  it.each<[string | null, string | null | undefined, boolean]>([
    [DIR, DIR, false],
    ["/new/scratchpad", DIR, true],
    [DIR, null, true],
    [null, DIR, true],
    [null, null, false],
    [DIR, undefined, false],
    [null, undefined, false],
  ])("scratchpadDir %s vs covered %s -> %s", (dir, covered, expected) => {
    expect(scratchDirMoved(dir, covered)).toBe(expected);
  });
});
