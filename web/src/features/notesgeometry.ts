import type { Edge } from "../render/notespanel";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_WIDTH = 260;
export const MIN_HEIGHT = 150;
const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 300;
const DEFAULT_INSET = 24;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
}

export function clampRect(rect: Rect, slot: Size): Rect {
  const width = Math.max(MIN_WIDTH, Math.min(rect.width, slot.width));
  const height = Math.max(MIN_HEIGHT, Math.min(rect.height, slot.height));
  return {
    x: clamp(rect.x, 0, Math.max(0, slot.width - width)),
    y: clamp(rect.y, 0, Math.max(0, slot.height - height)),
    width,
    height,
  };
}

export function defaultRect(slot: Size): Rect {
  return clampRect(
    {
      x: slot.width - DEFAULT_WIDTH - DEFAULT_INSET,
      y: DEFAULT_INSET,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
    },
    slot,
  );
}

export function dragRect(rect: Rect, dx: number, dy: number, slot: Size): Rect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, slot);
}

export function resizeRect(rect: Rect, edge: Edge, dx: number, dy: number, slot: Size): Rect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (edge.includes("e")) right = clamp(right + dx, left + MIN_WIDTH, slot.width);
  if (edge.includes("w")) left = clamp(left + dx, 0, right - MIN_WIDTH);
  if (edge.includes("s")) bottom = clamp(bottom + dy, top + MIN_HEIGHT, slot.height);
  if (edge.includes("n")) top = clamp(top + dy, 0, bottom - MIN_HEIGHT);
  return clampRect({ x: left, y: top, width: right - left, height: bottom - top }, slot);
}

export function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
