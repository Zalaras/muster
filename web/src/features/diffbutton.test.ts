import { describe, expect, it } from "vitest";
import type { DiffBody, DiffFile, DiffSummary } from "../api/diff";
import {
  countsText,
  diffButtonText,
  diffButtonTitle,
  diffErrorText,
  MINUS,
  pickScope,
  signedCounts,
  summaryLine,
  whatChanged,
} from "./diffbutton";

const c = (files: number, additions = 0, deletions = 0) => ({
  files,
  additions,
  deletions,
  fingerprint: "f",
});
const sum = (u: number, b: number, openComments = 0, repo = true): DiffSummary => ({
  repo,
  uncommitted: c(u, 51, 9),
  branch: c(b, 4, 2),
  openComments,
});

describe("diffbutton — diffButtonText (spec § The button)", () => {
  it.each([
    ["uncommitted counts", sum(8, 0), false, "8 files +51 −9 · View diff ›"],
    [
      "singular file",
      { ...sum(1, 0), uncommitted: c(1, 1, 0) },
      false,
      "1 file +1 −0 · View diff ›",
    ],
    ["branch only is prefixed", sum(0, 3), false, "branch · 3 files +4 −2 · View diff ›"],
    ["uncommitted wins over branch", sum(2, 3), false, "2 files +51 −9 · View diff ›"],
    ["open comments", sum(8, 0, 2), false, "8 files +51 −9 · 💬 2 · View diff ›"],
    ["comments alone, clean checkout", sum(0, 0, 2), false, "💬 2 · View diff ›"],
    ["open viewer", sum(8, 0, 2), true, "8 files +51 −9 · 💬 2 · Close diff ×"],
  ])("%s", (_n, summary, open, text) => {
    expect(diffButtonText(summary, open)).toBe(text);
  });

  it.each([
    ["no summary yet", null],
    ["not a repo, even with changes and comments", sum(3, 3, 5, false)],
    ["clean checkout and no open comment", sum(0, 0, 0)],
  ])("is null (button absent) for %s", (_n, summary) => {
    expect(diffButtonText(summary, false)).toBeNull();
    expect(diffButtonText(summary, true)).toBeNull();
  });
});

describe("diffbutton — scopes and titles", () => {
  it.each([
    [sum(2, 5), "uncommitted"],
    [sum(0, 5), "branch"],
    [sum(0, 0), "uncommitted"],
  ])("pickScope %#", (summary, scope) => {
    expect(pickScope(summary)).toBe(scope);
  });

  it("titles both scopes", () => {
    expect(diffButtonTitle(sum(8, 3))).toBe("Uncommitted: 8 files +51 −9 · Branch: 3 files +4 −2");
    expect(countsText(c(0))).toBe("0 files +0 −0");
  });
});

const fileOf = (path: string, text: string): DiffFile => ({
  path,
  oldPath: null,
  status: "modified",
  binary: false,
  additions: 2,
  deletions: 1,
  hunks: [{ header: "@@", lines: [{ kind: "add", old: null, new: 1, text }] }],
});
const body = (...files: DiffFile[]): DiffBody => ({
  scope: "uncommitted",
  base: "main",
  fingerprint: "f",
  files,
});

describe("diffbutton — summaryLine, whatChanged, diffErrorText", () => {
  it("summaryLine totals the files and names the base", () => {
    expect(summaryLine(body(fileOf("a", "x"), fileOf("b", "y")))).toBe(
      "2 files · +4 −2 · against main",
    );
    expect(summaryLine(body())).toBe("0 files · +0 −0 · against main");
  });

  it.each([
    ["added file", body(fileOf("a", "x")), body(fileOf("a", "x"), fileOf("b", "y")), "1 new file"],
    ["changed file", body(fileOf("a", "x")), body(fileOf("a", "z")), "1 file changed"],
    [
      "removed file",
      body(fileOf("a", "x"), fileOf("b", "y")),
      body(fileOf("a", "x")),
      "1 file no longer changed",
    ],
    [
      "a mix",
      body(fileOf("a", "x"), fileOf("b", "y")),
      body(fileOf("a", "q"), fileOf("c", "y")),
      "1 new file, 1 file changed, 1 file no longer changed",
    ],
    [
      "nothing visible differs",
      body(fileOf("a", "x")),
      body(fileOf("a", "x")),
      "its contents changed",
    ],
  ])("whatChanged: %s", (_n, shown, latest, text) => {
    expect(whatChanged(shown, latest)).toBe(text);
  });

  it("diffErrorText says musterd unreachable for a network error, else the message", () => {
    expect(diffErrorText({ code: "network_error", message: "x" })).toBe("musterd unreachable");
    expect(
      diffErrorText({
        code: "diff_failed",
        message: "could not read the diff",
      }),
    ).toBe("could not read the diff");
  });
});

describe("diffbutton — signedCounts", () => {
  it("uses the real minus sign (U+2212), not a hyphen", () => {
    expect(MINUS).toBe("\u2212");
    expect(signedCounts(51, 9)).toBe("+51 \u22129");
    expect(signedCounts(0, 0)).toBe("+0 \u22120");
    expect(signedCounts(1, 2)).not.toContain("-");
  });
});
