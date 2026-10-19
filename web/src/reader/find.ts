export interface TextMatch {
  readonly node: number;
  readonly start: number;
  readonly end: number;
}

export type StepDirection = 1 | -1;

interface Folded {
  readonly text: string;
  readonly origin: readonly number[] | null;
}

function fold(text: string): Folded {
  const lower = text.toLowerCase();
  if (lower.length === text.length) return { text: lower, origin: null };
  const origin: number[] = [];
  let folded = "";
  let index = 0;
  for (const ch of text) {
    const piece = ch.toLowerCase();
    for (let i = 0; i < piece.length; i++) origin.push(index);
    folded += piece;
    index += ch.length;
  }
  origin.push(text.length);
  return { text: folded, origin };
}

function spansIn(text: string, foldedQuery: string): { start: number; end: number }[] {
  const { text: haystack, origin } = fold(text);
  const spans: { start: number; end: number }[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(foldedQuery, from);
    if (at === -1) return spans;
    const end = at + foldedQuery.length;
    spans.push(
      origin ? { start: origin[at] ?? at, end: origin[end] ?? text.length } : { start: at, end },
    );
    from = end;
  }
}

export function findInTexts(texts: readonly string[], query: string): TextMatch[] {
  if (query === "") return [];
  const foldedQuery = query.toLowerCase();
  const matches: TextMatch[] = [];
  texts.forEach((text, node) => {
    for (const span of spansIn(text, foldedQuery)) matches.push({ node, ...span });
  });
  return matches;
}

export function stepIndex(index: number, count: number, direction: StepDirection): number {
  if (count === 0) return 0;
  return (index + direction + count) % count;
}

export function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(index, count - 1));
}

export function countText(index: number, count: number, query: string): string {
  if (query === "" || count === 0) return "No results";
  return `${index + 1} of ${count}`;
}
