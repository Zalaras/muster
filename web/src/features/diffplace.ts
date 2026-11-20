import type { CommentSide, ReviewComment } from "../api/diff";
import type { Entry, FileModel } from "../render/diffshape";

export type Placement =
  | { kind: "placed"; first: number; last: number; lines: string }
  | { kind: "partial"; at: number; lines: string }
  | { kind: "outdated" };

export function lineSpan(a: number, b: number): string {
  return a === b ? `${a}` : `${a}–${b}`;
}

export function lineLabel(lines: string): string {
  return `${lines.includes("–") ? "Lines" : "Line"} ${lines}`;
}

export function commentHeading(lines: string): string {
  return `Commenting on ${lineLabel(lines).toLowerCase()}`;
}

function onSide(entry: Entry, side: CommentSide): number | null {
  return side === "new" ? entry.new : entry.old;
}

function nearest(
  entries: readonly Entry[],
  side: CommentSide,
  line: number,
  text: string,
): number | null {
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of entries) {
    const number = onSide(entry, side);
    if (number === null || entry.text !== text) continue;
    const distance = Math.abs(number - line);
    if (distance < bestDistance) {
      best = entry.idx;
      bestDistance = distance;
    }
  }
  return best;
}

export function placeComment(model: FileModel | undefined, comment: ReviewComment): Placement {
  if (!model) return { kind: "outdated" };
  const { entries } = model;
  const firstText = comment.quote[0] as string;
  const lastText = comment.quote[comment.quote.length - 1] as string;
  const first = nearest(entries, comment.start.side, comment.start.line, firstText);
  const last = nearest(entries, comment.end.side, comment.end.line, lastText);
  if (first !== null && last !== null && first <= last) {
    const a = onSide(entries[first] as Entry, comment.start.side) as number;
    const b = onSide(entries[last] as Entry, comment.end.side) as number;
    return { kind: "placed", first, last, lines: lineSpan(a, b) };
  }
  const at = first ?? last;
  if (at === null) return { kind: "outdated" };
  return { kind: "partial", at, lines: `${(entries[at] as Entry).line}` };
}

export function placementAnchor(placement: Placement): number | null {
  if (placement.kind === "placed") return placement.last;
  if (placement.kind === "partial") return placement.at;
  return null;
}

export function recordedLines(comment: ReviewComment): string {
  return lineSpan(comment.start.line, comment.end.line);
}

export function openCount(comments: readonly ReviewComment[]): number {
  return comments.filter((c) => !c.resolved).length;
}
