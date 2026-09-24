// Pure zoom/pan arithmetic for the diagram modal (kb:adr/reader-diagram-enlarge-is-a-zoomable-modal).
// No DOM here: `render/diagramdialog.ts` is the only module that reads events and writes
// `data-zoom`/`style.transform`; this module only ever transforms one `ZoomState` into
// the next.

export interface ZoomState {
  /** Multiplier on top of `fit` — `1` reads as "fit" (Testable UI Elements: `data-zoom`
   * is `1.00` on open). */
  zoom: number;
  /** Canvas translate, in stage pixels. */
  x: number;
  y: number;
}

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 8;

/** The scale that fits an SVG of size `(svgW, svgH)` inside a stage of size
 * `(stageW, stageH)` — the smaller of the two axis ratios, so neither axis overflows.
 * Zero or negative inputs (a stage measured before layout) fall back to `1` rather than
 * `Infinity`/`NaN`. */
export function fitScale(svgW: number, svgH: number, stageW: number, stageH: number): number {
  if (svgW <= 0 || svgH <= 0 || stageW <= 0 || stageH <= 0) return 1;
  return Math.min(stageW / svgW, stageH / svgH);
}

/** Clamps to `[ZOOM_MIN, ZOOM_MAX]` — a quarter to eight times fit
 * (kb:adr/reader-diagram-enlarge-is-a-zoomable-modal). */
export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** `1.1` per 100px of wheel `deltaY`, inverted so wheel-up (`deltaY < 0`) zooms in — the
 * multiplicative factor `zoomAround` applies. */
export function wheelFactor(deltaY: number): number {
  return 1.1 ** (-deltaY / 100);
}

/** Multiplies `state.zoom` by `factor`, clamped, and re-solves the pan so the stage point
 * `(px, py)` maps to the same canvas point before and after — the standard "zoom around a
 * point" identity, computed from the *applied* factor (post-clamp) so a factor that would
 * overshoot the clamp doesn't also drag the anchored point off `(px, py)`. */
export function zoomAround(state: ZoomState, factor: number, px: number, py: number): ZoomState {
  const zoom = clampZoom(state.zoom * factor);
  const applied = zoom / state.zoom;
  return {
    zoom,
    x: px - (px - state.x) * applied,
    y: py - (py - state.y) * applied,
  };
}

/** Pans by a screen-pixel delta — used for both pointer drag and the arrow keys. */
export function panBy(state: ZoomState, dx: number, dy: number): ZoomState {
  return { ...state, x: state.x + dx, y: state.y + dy };
}

/** Fit, centred, no pan — the state on open and after `Reset zoom`. */
export function resetZoom(): ZoomState {
  return { zoom: 1, x: 0, y: 0 };
}

/** The canvas's inline `transform` (DOM sketch): `fit` is folded into the scale only —
 * `state.zoom` alone is what `data-zoom` reports, and `fit` never appears in the pan
 * arithmetic above (it cancels out of `zoomAround`'s identity, since it multiplies both
 * sides equally). */
export function transformOf(state: ZoomState, fit: number): string {
  return `translate(${state.x}px, ${state.y}px) scale(${state.zoom * fit})`;
}
