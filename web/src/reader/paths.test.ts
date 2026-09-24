// Plan markdown-render-fixes (REQ-13, W7): loadingText is the reader's pure text
// derivation — no DOM, Vitest-tested directly. `basename` itself moved to
// `sessions/paths.ts`; its own coverage lives in `sessions/paths.test.ts` now — this file
// only imports it to check loadingText composes with it correctly.
import { describe, expect, it } from "vitest";
import { basename } from "../sessions/paths";
import { loadingText } from "./paths";

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
