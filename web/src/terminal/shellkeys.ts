// Pure shell-surface input translation — no DOM, no socket, so terminal/pane.ts's
// `kind === "shell"` handlers stay thin wiring over these two functions and web-tests can
// Vitest them directly (docs/conventions.md's logic/rendering split).
//
// Both translations exist because xterm.js's own handling is wrong for a plain shell but
// correct for the Claude pane (spike S7): Option+Arrow emits the raw CSI
// modifier form (`ESC[1;3D`), which zsh/bash print as a literal `3D` instead of moving by
// a word, and Cmd+Arrow emits nothing at all. `pane.ts` installs neither for `kind ===
// "claude"` — Claude Code reads the CSI form natively.

// ── Keys: Option/Cmd+Arrow → readline bytes ─────────────────────────────────────────────

const ESC_B = new Uint8Array([0x1b, 0x62]); // readline backward-word
const ESC_F = new Uint8Array([0x1b, 0x66]); // readline forward-word
const CTRL_A = new Uint8Array([0x01]); // readline beginning-of-line
const CTRL_E = new Uint8Array([0x05]); // readline end-of-line

/** The subset of `KeyboardEvent` this translation reads — a real `KeyboardEvent`
 * satisfies it structurally, so `pane.ts` passes one straight through with no adapter. */
export interface ShellKeyChord {
  key: string;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

/** `null` for every chord but the four `shellKeyBytes` translates — xterm.js's own
 * handling (or lack of it) applies unchanged for everything else, including
 * Shift-combinations and any other modifier this function does not touch. Return type
 * pinned to
 * `Uint8Array<ArrayBuffer>` (rather than the bare `Uint8Array`, which TypeScript's lib
 * types as `Uint8Array<ArrayBufferLike>`) so the result satisfies `WebSocket.send`'s
 * `BufferSource` at the call site without a cast. */
export function shellKeyBytes(chord: ShellKeyChord): Uint8Array<ArrayBuffer> | null {
  if (chord.ctrlKey) return null;
  if (chord.altKey && !chord.metaKey) {
    if (chord.key === "ArrowLeft") return ESC_B;
    if (chord.key === "ArrowRight") return ESC_F;
    return null;
  }
  if (chord.metaKey && !chord.altKey) {
    if (chord.key === "ArrowLeft") return CTRL_A;
    if (chord.key === "ArrowRight") return CTRL_E;
    return null;
  }
  return null;
}

// ── Wheel: deltaY → a `scroll` frame's signed line count ────────────────────────────────

// Roughly one terminal row at the pane's own 12.5px/1.65 type (style.css's `.xterm`
// rule) — only needs to be in the right neighbourhood, since the daemon clamps the
// magnitude it actually acts on; this conversion just keeps a normal trackpad/wheel
// gesture from producing an implausibly large or a rounds-to-zero request.
// Exported so `pane.ts`'s `flushWheelScroll` can convert a sent `lines` count back into
// the pixel amount it consumed, to carry the sub-line remainder into the next frame
// rather than recomputing/duplicating this constant.
export const PIXELS_PER_LINE = 20;
const MIN_SCROLL_MAGNITUDE = 1;
// Protocol Contract: "Magnitude clamped to [1, 200]" — clamped here too so the frame the
// client sends already honours the contract rather than relying solely on the daemon.
const MAX_SCROLL_MAGNITUDE = 200;

/**
 * Converts one animation-frame's worth of accumulated wheel `deltaY` (`pane.ts` coalesces
 * every `wheel` event since the last flush) into the `scroll` frame's `lines`: positive
 * scrolls back into history (wheel up — browsers report a negative `deltaY` there),
 * negative scrolls toward the live bottom. `0` means the gesture was too small to round to
 * a whole line — the caller sends no frame at all rather than a zero-magnitude one.
 */
export function wheelDeltaToScrollLines(deltaY: number): number {
  const rawLines = Math.round(-deltaY / PIXELS_PER_LINE);
  if (rawLines === 0) return 0;
  const magnitude = Math.min(
    MAX_SCROLL_MAGNITUDE,
    Math.max(MIN_SCROLL_MAGNITUDE, Math.abs(rawLines)),
  );
  return Math.sign(rawLines) * magnitude;
}
