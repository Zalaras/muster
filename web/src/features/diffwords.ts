import type { Seg } from "../render/diffshape";

export interface WordPair {
  old: Seg[];
  new: Seg[];
}

const TOKEN = /\s+|\w+|[^\w\s]/g;
const MAX_TOKENS = 400;
const MIN_SIMILARITY = 0.5;

function tokens(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

function lcsTable(a: readonly string[], b: readonly string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = table[i] as number[];
      const below = table[i + 1] as number[];
      row[j] =
        a[i] === b[j]
          ? (below[j + 1] as number) + 1
          : Math.max(below[j] as number, row[j + 1] as number);
    }
  }
  return table;
}

function push(segs: Seg[], text: string, changed: boolean): void {
  const last = segs[segs.length - 1];
  if (last && last.changed === changed) last.text += text;
  else segs.push({ text, changed });
}

export function wordDiff(oldText: string, newText: string): WordPair | null {
  const a = tokens(oldText);
  const b = tokens(newText);
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) return null;
  const table = lcsTable(a, b);
  const oldSegs: Seg[] = [];
  const newSegs: Seg[] = [];
  let i = 0;
  let j = 0;
  let common = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(oldSegs, a[i] as string, false);
      push(newSegs, b[j] as string, false);
      common += (a[i] as string).length;
      i++;
      j++;
    } else if (
      ((table[i + 1] as number[])[j] as number) >= ((table[i] as number[])[j + 1] as number)
    ) {
      push(oldSegs, a[i++] as string, true);
    } else {
      push(newSegs, b[j++] as string, true);
    }
  }
  while (i < a.length) push(oldSegs, a[i++] as string, true);
  while (j < b.length) push(newSegs, b[j++] as string, true);
  const total = oldText.length + newText.length;
  if (total === 0 || (2 * common) / total < MIN_SIMILARITY) return null;
  if (!oldSegs.some((s) => s.changed) && !newSegs.some((s) => s.changed)) return null;
  return { old: oldSegs, new: newSegs };
}
