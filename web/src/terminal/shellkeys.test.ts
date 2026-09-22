// Plan terminal-fixes-cleanup (W1/W2/W4): pure logic only — no DOM, matching
// `shellkeys.ts`'s own header comment. `pane.ts`'s wiring (installed only for
// `kind === "shell"`, W3; coalesced to one `scroll` frame per animation frame, the rest
// of W4) is Playwright's job (web/e2e/shell-keys.spec.ts, web/e2e/shell-scroll.spec.ts).
import { describe, expect, it } from "vitest";
import {
  PIXELS_PER_LINE,
  shellKeyBytes,
  wheelDeltaToScrollLines,
  type ShellKeyChord,
} from "./shellkeys";

function chord(overrides: Partial<ShellKeyChord>): ShellKeyChord {
  return { key: "a", altKey: false, metaKey: false, ctrlKey: false, ...overrides };
}

describe("shellKeyBytes — W1: Option+Arrow sends readline word-jump bytes", () => {
  it("Option+Left sends ESC b (backward-word)", () => {
    expect(shellKeyBytes(chord({ key: "ArrowLeft", altKey: true }))).toEqual(
      new Uint8Array([0x1b, 0x62]),
    );
  });

  it("Option+Right sends ESC f (forward-word)", () => {
    expect(shellKeyBytes(chord({ key: "ArrowRight", altKey: true }))).toEqual(
      new Uint8Array([0x1b, 0x66]),
    );
  });
});

describe("shellKeyBytes — W2: Cmd+Arrow sends readline line-jump bytes", () => {
  it("Cmd+Left sends 0x01 (beginning-of-line)", () => {
    expect(shellKeyBytes(chord({ key: "ArrowLeft", metaKey: true }))).toEqual(
      new Uint8Array([0x01]),
    );
  });

  it("Cmd+Right sends 0x05 (end-of-line)", () => {
    expect(shellKeyBytes(chord({ key: "ArrowRight", metaKey: true }))).toEqual(
      new Uint8Array([0x05]),
    );
  });
});

describe("shellKeyBytes — every other chord returns null (xterm.js's own handling applies unchanged)", () => {
  it("plain arrow keys with no modifier", () => {
    expect(shellKeyBytes(chord({ key: "ArrowLeft" }))).toBeNull();
    expect(shellKeyBytes(chord({ key: "ArrowRight" }))).toBeNull();
  });

  it("Option+Up / Option+Down — only Left/Right are translated", () => {
    expect(shellKeyBytes(chord({ key: "ArrowUp", altKey: true }))).toBeNull();
    expect(shellKeyBytes(chord({ key: "ArrowDown", altKey: true }))).toBeNull();
  });

  it("Cmd+Up / Cmd+Down — only Left/Right are translated", () => {
    expect(shellKeyBytes(chord({ key: "ArrowUp", metaKey: true }))).toBeNull();
    expect(shellKeyBytes(chord({ key: "ArrowDown", metaKey: true }))).toBeNull();
  });

  it("Option or Cmd held with a non-arrow key", () => {
    expect(shellKeyBytes(chord({ key: "a", altKey: true }))).toBeNull();
    expect(shellKeyBytes(chord({ key: "a", metaKey: true }))).toBeNull();
  });

  it("ctrlKey held alongside Option or Cmd — never translated", () => {
    expect(shellKeyBytes(chord({ key: "ArrowLeft", altKey: true, ctrlKey: true }))).toBeNull();
    expect(shellKeyBytes(chord({ key: "ArrowRight", metaKey: true, ctrlKey: true }))).toBeNull();
  });

  it("ctrlKey alone", () => {
    expect(shellKeyBytes(chord({ key: "ArrowLeft", ctrlKey: true }))).toBeNull();
  });

  it("both Option and Cmd held at once — neither branch matches", () => {
    expect(shellKeyBytes(chord({ key: "ArrowLeft", altKey: true, metaKey: true }))).toBeNull();
    expect(shellKeyBytes(chord({ key: "ArrowRight", altKey: true, metaKey: true }))).toBeNull();
  });

  it("no modifier at all", () => {
    expect(shellKeyBytes(chord({ key: "a" }))).toBeNull();
  });
});

describe("wheelDeltaToScrollLines — deltaY to a signed line count (REQ-7..12, W4's pure half)", () => {
  it("wheel up (negative deltaY) scrolls back into history: positive lines", () => {
    expect(wheelDeltaToScrollLines(-20)).toBe(1);
  });

  it("wheel down (positive deltaY) scrolls toward the live bottom: negative lines", () => {
    expect(wheelDeltaToScrollLines(20)).toBe(-1);
  });

  it("no motion at all sends no frame", () => {
    expect(wheelDeltaToScrollLines(0)).toBe(0);
  });

  it("a gesture too small to round to a whole line sends no frame", () => {
    expect(wheelDeltaToScrollLines(-5)).toBe(0);
    expect(wheelDeltaToScrollLines(5)).toBe(0);
  });

  it("the downward exact-half-line tie rounds to 0 lines (Math.round(-0.5) === -0, and -0 === 0)", () => {
    expect(wheelDeltaToScrollLines(10)).toBe(0);
  });

  it("the upward exact-half-line tie rounds up to 1 line (Math.round(0.5) === 1)", () => {
    expect(wheelDeltaToScrollLines(-10)).toBe(1);
  });

  it("clamps a very large upward gesture to the protocol's 200-line ceiling", () => {
    expect(wheelDeltaToScrollLines(-100_000)).toBe(200);
  });

  it("clamps a very large downward gesture to -200", () => {
    expect(wheelDeltaToScrollLines(100_000)).toBe(-200);
  });

  it("a magnitude just over one line's worth still rounds to a single line either direction", () => {
    expect(wheelDeltaToScrollLines(-21)).toBe(1);
    expect(wheelDeltaToScrollLines(21)).toBe(-1);
  });
});

describe("PIXELS_PER_LINE — sub-line wheel accumulation across frames (review cycle 1 Major 1)", () => {
  // `PIXELS_PER_LINE` is exported for exactly this purpose (see shellkeys.ts's own
  // comment on the export): `pane.ts`'s `flushWheelScroll` keeps its running
  // `wheelAccumDeltaY` in the private `TerminalSurface` instance, so it isn't reachable
  // here directly — but its accumulator step is these two exported values and nothing
  // else, so this reproduces that exact step to pin the fixed semantics: a 0-line frame
  // leaves the full accumulated delta in place, and a frame that does produce `lines`
  // subtracts only the pixels that rounded into it, carrying any remainder forward.
  function accumulateFrame(
    accumDeltaY: number,
    eventDeltaY: number,
  ): { accumDeltaY: number; lines: number } {
    const next = accumDeltaY + eventDeltaY;
    const lines = wheelDeltaToScrollLines(next);
    if (lines === 0) return { accumDeltaY: next, lines: 0 };
    return { accumDeltaY: next + lines * PIXELS_PER_LINE, lines };
  }

  it("a run of sub-line deltas too small to scroll individually accumulates until one does", () => {
    let accumDeltaY = 0;
    for (let i = 0; i < 4; i++) {
      const r = accumulateFrame(accumDeltaY, -2);
      expect(r.lines).toBe(0); // -2, -4, -6, -8: all below the half-line rounding threshold
      accumDeltaY = r.accumDeltaY;
    }
    const r = accumulateFrame(accumDeltaY, -2); // -10 hits the half-line tie, rounds up to 1
    expect(r.lines).toBe(1);
  });

  it("the remainder below a whole line carries into the next frame rather than resetting to 0", () => {
    const first = accumulateFrame(0, -24); // one line (-20) consumed, -4 left over
    expect(first.lines).toBe(1);
    expect(first.accumDeltaY).toBe(-4);

    // A single further -4 event is not yet a full line on its own...
    const second = accumulateFrame(first.accumDeltaY, -4);
    expect(second.lines).toBe(0);
    expect(second.accumDeltaY).toBe(-8); // ...but the carried remainder shows: -4 + -4 = -8, not -4
  });
});
