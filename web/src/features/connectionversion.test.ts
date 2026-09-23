import { describe, expect, it } from "vitest";
import type { ClaudeCodeInfo } from "../protocol/hello";
import { describeClaudeVersion } from "./connectionversion";

// Plan version-claude-interface, UI Specifications > DOM: the six-row table
// `describeClaudeVersion` implements. Exercised directly (pure function, no DOM) so every
// row is pinned independently of how `renderClaudeVersion` happens to build markup.
const VERSION_NOT_TESTED = "This Claude Code version has not been tested with Muster";
const VERSION_NOT_TESTED_UPDATE = `${VERSION_NOT_TESTED} — please update Claude Code`;

describe("describeClaudeVersion — UI Specifications > DOM six-row table", () => {
  it("row 1: null (pre-hello) -> 'claude unknown', no warning", () => {
    expect(describeClaudeVersion(null)).toEqual({ text: "claude unknown", warning: null });
  });

  it("row 2: status 'unknown' (with a populated installed, which the daemon never actually sends alongside unknown) -> 'Claude installation unknown', no warning", () => {
    const info: ClaudeCodeInfo = {
      installed: "2.1.267",
      floor: "2.1.246",
      verified: "2.1.267",
      status: "unknown",
    };
    expect(describeClaudeVersion(info)).toEqual({
      text: "Claude installation unknown",
      warning: null,
    });
  });

  it("row 2 (installed genuinely null): status 'unknown' with installed null -> 'Claude installation unknown', no warning", () => {
    const info: ClaudeCodeInfo = {
      installed: null,
      floor: "2.1.246",
      verified: "2.1.267",
      status: "unknown",
    };
    expect(describeClaudeVersion(info)).toEqual({
      text: "Claude installation unknown",
      warning: null,
    });
  });

  it("row 3: status 'verified' -> 'claude <installed>', no warning", () => {
    const info: ClaudeCodeInfo = {
      installed: "2.1.267",
      floor: "2.1.246",
      verified: "2.1.267",
      status: "verified",
    };
    expect(describeClaudeVersion(info)).toEqual({ text: "claude 2.1.267", warning: null });
  });

  it("row 4: status 'above' -> 'claude <installed>' + the not-tested warning (no update wording)", () => {
    const info: ClaudeCodeInfo = {
      installed: "2.1.270",
      floor: "2.1.246",
      verified: "2.1.267",
      status: "above",
    };
    expect(describeClaudeVersion(info)).toEqual({
      text: "claude 2.1.270",
      warning: VERSION_NOT_TESTED,
    });
  });

  it("row 5: status 'below' -> 'claude <installed>' + the not-tested-please-update warning (em dash U+2014)", () => {
    const info: ClaudeCodeInfo = {
      installed: "2.1.200",
      floor: "2.1.246",
      verified: "2.1.267",
      status: "below",
    };
    const result = describeClaudeVersion(info);
    expect(result).toEqual({ text: "claude 2.1.200", warning: VERSION_NOT_TESTED_UPDATE });
    expect(result.warning).toContain("—"); // em dash, not a hyphen
  });

  it("row 6 (defensive): a non-'unknown' status with installed null -> 'Claude installation unknown', no warning (the daemon never sends this — INV-1 — but the parser only type-checks, so the renderer must not template 'claude null')", () => {
    for (const status of ["verified", "above", "below"] as const) {
      const info: ClaudeCodeInfo = {
        installed: null,
        floor: "2.1.246",
        verified: "2.1.267",
        status,
      };
      expect(describeClaudeVersion(info)).toEqual({
        text: "Claude installation unknown",
        warning: null,
      });
    }
  });
});
