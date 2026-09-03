import { describe, expect, it } from "vitest";
import type { ApiErrorBody } from "../api";
import { classifyApiFailure, classifyDrop, escapePath, locatingText, MAX_DROP_BYTES, noticeForFailure } from "./drop";

// Plan file-drop-fix REQ-4: Terminal.app-style path escaping — a backslash before every
// space and every character in the named set; everything else (including non-ASCII)
// passes through unchanged.
describe("escapePath (REQ-4)", () => {
  it("escapes a space", () => {
    expect(escapePath("Screenshot 2026.png")).toBe("Screenshot\\ 2026.png");
  });

  it("escapes every character in the required set, once each, in order", () => {
    // Deliberately typed out (not re-derived from the implementation's own Set) so this
    // is an independent check of REQ-4's literal character list, not a tautology.
    const raw = ` \\!"#$&'()*,;<=>?[]^\`{|}~`;
    const expected =
      "\\ \\\\\\!\\\"\\#\\$\\&\\'\\(\\)\\*\\,\\;\\<\\=\\>\\?\\[\\]\\^\\`\\{\\|\\}\\~";
    expect(escapePath(raw)).toBe(expected);
  });

  it("leaves path separators, dots, hyphens and underscores unchanged where not in the escape set", () => {
    // '/', '.', '-', '_' are explicitly called out by REQ-4 as passing through unchanged.
    expect(escapePath("/Users/damian/my-file_v2.final.txt")).toBe("/Users/damian/my-file_v2.final.txt");
  });

  it("escapes '=' but leaves ':', '@' and '+' unescaped (REQ-4: only '=' of these four is in the escape set)", () => {
    expect(escapePath("a:b@c+d=e")).toBe("a:b@c+d\\=e");
  });

  it("does not escape digits or letters", () => {
    expect(escapePath("abcXYZ0123")).toBe("abcXYZ0123");
  });

  it("does not escape non-ASCII characters", () => {
    expect(escapePath("café_résumé_日本語.pdf")).toBe("café_résumé_日本語.pdf");
  });

  it("escapes a filename containing a single quote (edge case 12: it's.png)", () => {
    expect(escapePath("it's.png")).toBe("it\\'s.png");
  });

  it("escapes a backslash itself (so an already-escaped-looking name round-trips distinctly)", () => {
    expect(escapePath("a\\b")).toBe("a\\\\b");
  });

  it("returns an empty string unchanged", () => {
    expect(escapePath("")).toBe("");
  });

  it("handles a path with no characters needing escape", () => {
    expect(escapePath("/tmp/plainfile")).toBe("/tmp/plainfile");
  });
});

describe("MAX_DROP_BYTES (REQ-7)", () => {
  it("is exactly 50 MiB", () => {
    expect(MAX_DROP_BYTES).toBe(50 * 1024 * 1024);
  });
});

// REQ-2/REQ-10/edge case 15: files win over text whenever any file is present, even
// alongside a text/plain item; text only when no files but a text/plain item exists;
// "none" otherwise (left for the document-level guard).
describe("classifyDrop (REQ-2/REQ-10, edge case 15)", () => {
  it("classifies as 'files' when one or more files are present", () => {
    expect(classifyDrop(["Files"], 1)).toBe("files");
    expect(classifyDrop(["Files"], 3)).toBe("files");
  });

  it("classifies as 'files' even when a text/plain item is also present alongside files", () => {
    expect(classifyDrop(["Files", "text/plain"], 1)).toBe("files");
  });

  it("classifies as 'text' when there are no files but a text/plain type is present", () => {
    expect(classifyDrop(["text/plain"], 0)).toBe("text");
  });

  it("classifies as 'none' when there are no files and no text/plain type", () => {
    expect(classifyDrop([], 0)).toBe("none");
    expect(classifyDrop(["text/html"], 0)).toBe("none");
  });

  it("classifies as 'none' for an internal reorder drag carrying only its own MIME (INV-3 seam)", () => {
    expect(classifyDrop(["application/x-muster-drag-id"], 0)).toBe("none");
  });

  it("treats the file count as authoritative even if 'Files' appears in types with fileCount 0 (dragover-time types-only visibility)", () => {
    expect(classifyDrop(["Files"], 0)).toBe("none");
  });
});

// REQ-6: the in-flight notice text, verbatim basename, trailing U+2026.
describe("locatingText (REQ-6)", () => {
  it("builds the in-flight notice with the verbatim basename and a trailing ellipsis", () => {
    expect(locatingText("Screenshot 2026-08-30 at 14.35.00.png")).toBe("Locating Screenshot 2026-08-30 at 14.35.00.png\u2026");
  });

  it("uses the literal Unicode ellipsis character, not three ASCII dots", () => {
    const text = locatingText("x.txt");
    expect(text.endsWith("\u2026")).toBe(true);
    expect(text.endsWith("...")).toBe(false);
  });

  it("does not escape or otherwise alter the name", () => {
    expect(locatingText("it's a file.png")).toBe("Locating it's a file.png\u2026");
  });
});

// REQ-6 / Testable UI Elements: exact failure notice text per outcome kind, em dash
// (U+2014) with spaces, matching the overlay glyph.
describe("noticeForFailure (REQ-6, Testable UI Elements)", () => {
  it("renders the not_located notice with the verbatim name", () => {
    expect(noticeForFailure("report.pdf", { kind: "not_located" })).toBe(
      "Can't locate report.pdf on disk \u2014 paste its path instead",
    );
  });

  it("renders the ambiguous notice with the name and the daemon-reported count", () => {
    expect(noticeForFailure("dup.png", { kind: "ambiguous", count: 2 })).toBe(
      "dup.png matches 2 identical files \u2014 paste the path of the one you mean",
    );
  });

  it("renders the ambiguous notice with a count greater than two", () => {
    expect(noticeForFailure("dup.png", { kind: "ambiguous", count: 5 })).toBe(
      "dup.png matches 5 identical files \u2014 paste the path of the one you mean",
    );
  });

  it("renders the ambiguous notice with a zero count (defensive: classifyApiFailure's ?? 0 fallback)", () => {
    expect(noticeForFailure("dup.png", { kind: "ambiguous", count: 0 })).toBe(
      "dup.png matches 0 identical files \u2014 paste the path of the one you mean",
    );
  });

  it("renders the too_large notice naming the 50 MiB cap", () => {
    expect(noticeForFailure("huge.mov", { kind: "too_large" })).toBe("huge.mov is over 50 MiB \u2014 paste its path instead");
  });

  it("renders the generic 'other' notice (network_error, 500, 400, unrecognised codes)", () => {
    expect(noticeForFailure("x.txt", { kind: "other" })).toBe("Couldn't resolve x.txt \u2014 paste its path instead");
  });

  it("renders the not_connected notice without interpolating the name at all (REQ-8)", () => {
    expect(noticeForFailure("ignored-name.txt", { kind: "not_connected" })).toBe("Pane isn't connected \u2014 nothing pasted");
    expect(noticeForFailure("", { kind: "not_connected" })).toBe("Pane isn't connected \u2014 nothing pasted");
  });

  it("uses the literal em dash (U+2014) with surrounding spaces, not a hyphen", () => {
    const text = noticeForFailure("x", { kind: "not_located" });
    expect(text).toContain(" \u2014 ");
    expect(text).not.toContain(" - ");
  });
});

// docs/protocol.md \u00a73.14 wire code -> LocateFailure kind. Moved here from
// terminal/pane.ts in web-impl's fix attempt 1 specifically so this mapping could be
// pinned directly, without a DOM/xterm/socket harness around TerminalSurface.
function apiError(code: string, paths?: string[]): ApiErrorBody {
  return paths === undefined ? { code, message: "irrelevant" } : { code, message: "irrelevant", paths };
}

describe("classifyApiFailure (docs/protocol.md \u00a73.14 wire code -> LocateFailure)", () => {
  it("maps 'not_located' to the not_located kind", () => {
    expect(classifyApiFailure(apiError("not_located"))).toEqual({ kind: "not_located" });
  });

  it("maps 'too_large' to the too_large kind", () => {
    expect(classifyApiFailure(apiError("too_large"))).toEqual({ kind: "too_large" });
  });

  it("maps 'ambiguous' to the ambiguous kind, counting the daemon's verified-match paths", () => {
    expect(classifyApiFailure(apiError("ambiguous", ["/a/x.png", "/b/x.png"]))).toEqual({
      kind: "ambiguous",
      count: 2,
    });
  });

  it("maps 'ambiguous' with a single-element paths array to count 1", () => {
    expect(classifyApiFailure(apiError("ambiguous", ["/a/x.png"]))).toEqual({
      kind: "ambiguous",
      count: 1,
    });
  });

  it("falls back to count 0 when 'ambiguous' carries no paths field at all (?? 0 fallback)", () => {
    expect(classifyApiFailure(apiError("ambiguous"))).toEqual({ kind: "ambiguous", count: 0 });
  });

  it("falls back to count 0 when 'ambiguous' carries an explicitly empty paths array", () => {
    expect(classifyApiFailure(apiError("ambiguous", []))).toEqual({ kind: "ambiguous", count: 0 });
  });

  it("maps 'invalid_request' (400) to the catch-all 'other' kind", () => {
    expect(classifyApiFailure(apiError("invalid_request"))).toEqual({ kind: "other" });
  });

  it("maps 'internal_error' (500) to the catch-all 'other' kind", () => {
    expect(classifyApiFailure(apiError("internal_error"))).toEqual({ kind: "other" });
  });

  it("maps 'unknown_session' (404, distinct from not_located) to the catch-all 'other' kind", () => {
    expect(classifyApiFailure(apiError("unknown_session"))).toEqual({ kind: "other" });
  });

  it("maps the client-synthesised 'network_error' code to the catch-all 'other' kind", () => {
    expect(classifyApiFailure(apiError("network_error"))).toEqual({ kind: "other" });
  });

  it("maps an unrecognised/future code to the catch-all 'other' kind rather than throwing", () => {
    expect(classifyApiFailure(apiError("some_future_code_this_client_has_never_seen"))).toEqual({
      kind: "other",
    });
  });

  it("does not let a stray 'paths' field on a non-ambiguous code leak into the result", () => {
    // Defensive: only 'ambiguous' reads error.paths; every other code ignores it even
    // if present (e.g. a future wire change adds paths elsewhere).
    expect(classifyApiFailure(apiError("not_located", ["/a"]))).toEqual({ kind: "not_located" });
  });
});
