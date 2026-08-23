// renderContextRow's known branch builds real DOM nodes via `document.createElement`
// (track/percent/tokens/compaction spans), which this Vitest environment doesn't provide
// (no jsdom configured — docs/conventions.md assigns rendering to Playwright; see
// render/sessions.test.ts and render/tiles.test.ts, which defer their own template-cloning
// branches the same way). Only the unknown branch is DOM-construction-free (it sets
// `className`/`textContent` and returns), so that's what's covered directly here — the
// known branch's honesty/track/hot-class behavior is covered end-to-end by
// web/e2e/gauges.spec.ts (E1, E3, E4, E12) against the real DOM, and its derivation
// (pct/tokensText/hot) is covered without any DOM at all by ../sessions/context.test.ts.
import { describe, expect, it } from "vitest";
import type { SessionContext } from "../protocol";
import { renderContextRow } from "./context";

function fakeElement(): HTMLElement & { className: string } {
  return { textContent: "", className: "" } as unknown as HTMLElement & { className: string };
}

function unknownContext(compactions = 0): SessionContext {
  return { usedPct: null, totalInputTokens: null, windowSize: null, compactions };
}

describe("renderContextRow — honesty rule 1 (INV-3): unknown context sets plain text, never a track", () => {
  it("renders 'ctx unknown' with the 'unk' modifier class appended to the caller's baseClass, for a rail/strip card ('r3')", () => {
    const el = fakeElement();
    renderContextRow(el, unknownContext(), "r3");
    expect(el.className).toBe("r3 unk");
    expect(el.textContent).toBe("ctx unknown");
  });

  it("renders the same shape for a tile header ('ctxinfo') — one derivation, two renderers (REQ-13)", () => {
    const el = fakeElement();
    renderContextRow(el, unknownContext(), "ctxinfo");
    expect(el.className).toBe("ctxinfo unk");
    expect(el.textContent).toBe("ctx unknown");
  });

  it("appends the compaction counter even while unknown (⟳n comes from hooks, not the status line)", () => {
    const el = fakeElement();
    renderContextRow(el, unknownContext(3), "r3");
    expect(el.textContent).toBe("ctx unknown ⟳3");
    expect(el.className).toBe("r3 unk");
  });

  it("has no compaction suffix when compactions is exactly 0", () => {
    const el = fakeElement();
    renderContextRow(el, unknownContext(0), "r3");
    expect(el.textContent).toBe("ctx unknown");
  });

  it("resets a stale 'unk' modifier and text once transitioning is re-invoked on the same element for another unknown context (e.g. after /clear, REQ-9) — className is always freshly computed, never accumulated", () => {
    const el = fakeElement();
    renderContextRow(el, unknownContext(2), "r3");
    expect(el.className).toBe("r3 unk");
    renderContextRow(el, unknownContext(0), "r3");
    expect(el.className).toBe("r3 unk");
    expect(el.textContent).toBe("ctx unknown");
  });

  it("treats a mixed null/non-null context (defensive, protocol INV-2) as unknown — never half-renders", () => {
    const el = fakeElement();
    renderContextRow(el, { usedPct: null, totalInputTokens: 1000, windowSize: 200000, compactions: 0 }, "r3");
    expect(el.className).toBe("r3 unk");
    expect(el.textContent).toBe("ctx unknown");
  });
});
