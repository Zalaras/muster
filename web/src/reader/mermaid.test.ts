// Plan mermaid-support (W7, W8, W9): isMermaidLanguageClass, mermaidThemeFor and
// diagramErrorText are the pure fence-recognition/theme/error-text helpers the DOM diagram
// pass (render/mermaid.ts, render/diagrams.ts) is built on; diagramId's uniqueness backs
// REQ-14 (two identical fences still get distinct ids).
import { describe, expect, it } from "vitest";
import { diagramErrorText, diagramId, isMermaidLanguageClass, mermaidThemeFor } from "./mermaid";

describe("isMermaidLanguageClass", () => {
  it.each([
    ["language-mermaid", true],
    ["language-Mermaid", true],
    ["language-MERMAID", true],
    ["language-mermaid other", true],
    ["x language-mermaid", true],
    ["language-mermaidjs", false],
    ["lang-mermaid", false],
    ["mermaid", false],
    ["", false],
  ])("%s -> %s", (className, expected) => {
    expect(isMermaidLanguageClass(className)).toBe(expected);
  });
});

describe("mermaidThemeFor", () => {
  it.each([
    ["light", "default"],
    ["instrument", "dark"],
    ["dark", "dark"],
    ["", "dark"],
    [null, "dark"],
    ["unrecognised", "dark"],
  ] as const)("%s -> %s", (theme, expected) => {
    expect(mermaidThemeFor(theme)).toBe(expected);
  });
});

describe("diagramErrorText", () => {
  it("prefixes an Error's message with the failure label", () => {
    expect(diagramErrorText(new Error("Parse error on line 3"))).toBe(
      "diagram not rendered: Parse error on line 3",
    );
  });

  it("takes the first non-empty line of a multi-line message", () => {
    const err = new Error("\n  \nExpecting 'SEMI', got 'NEWLINE'\nsecond line");
    expect(diagramErrorText(err)).toBe("diagram not rendered: Expecting 'SEMI', got 'NEWLINE'");
  });

  it("trims surrounding whitespace on the chosen line", () => {
    expect(diagramErrorText(new Error("   padded reason   "))).toBe(
      "diagram not rendered: padded reason",
    );
  });

  it("caps the reason at 200 characters", () => {
    const long = "x".repeat(250);
    const result = diagramErrorText(new Error(long));
    expect(result).toBe(`diagram not rendered: ${"x".repeat(200)}`);
  });

  it("falls back to 'syntax error' for an empty message", () => {
    expect(diagramErrorText(new Error(""))).toBe("diagram not rendered: syntax error");
  });

  it("falls back to 'syntax error' for a whitespace-only message", () => {
    expect(diagramErrorText(new Error("   \n  \n  "))).toBe("diagram not rendered: syntax error");
  });

  it("falls back to 'syntax error' for a non-Error throw", () => {
    expect(diagramErrorText("plain string")).toBe("diagram not rendered: syntax error");
    expect(diagramErrorText(42)).toBe("diagram not rendered: syntax error");
    expect(diagramErrorText(undefined)).toBe("diagram not rendered: syntax error");
    expect(diagramErrorText(null)).toBe("diagram not rendered: syntax error");
  });
});

describe("diagramId", () => {
  it("names an id from the instance counter and the fence's document position", () => {
    expect(diagramId(0, 0)).toBe("muster-diagram-0-0");
    expect(diagramId(2, 5)).toBe("muster-diagram-2-5");
  });

  it("gives two fences in the same pass distinct ids (edge case 16)", () => {
    expect(diagramId(1, 0)).not.toBe(diagramId(1, 1));
  });

  it("is injective in the instance counter for a fixed fence position", () => {
    expect(diagramId(1, 0)).not.toBe(diagramId(2, 0));
  });
});
