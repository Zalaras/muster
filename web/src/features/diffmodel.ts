import type { CommentSide, DiffFile } from "../api/diff";
import type { Change, Entry, FileModel } from "../render/diffshape";
import { MINUS, signedCounts } from "./diffbutton";
import { wordDiff } from "./diffwords";

const SIGNS = { add: "+", del: MINUS, context: " " } as const;

export function pathText(file: DiffFile): string {
  return file.status === "renamed" && file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;
}

export function entrySide(entry: Entry): CommentSide {
  return entry.new !== null ? "new" : "old";
}

function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

export function changeKey(path: string, dels: readonly string[], adds: readonly string[]): string {
  return `k1:${hash(`${path}\n${dels.join("\n")}\n\u0000\n${adds.join("\n")}`)}`;
}

function flatten(file: DiffFile): Entry[] {
  const entries: Entry[] = [];
  file.hunks.forEach((hunk, h) => {
    for (const line of hunk.lines) {
      entries.push({
        idx: entries.length,
        hunk: h,
        kind: line.kind,
        old: line.old,
        new: line.new,
        line: (line.new ?? line.old) as number,
        sign: SIGNS[line.kind],
        text: line.text,
        change: -1,
        segs: null,
      });
    }
  });
  return entries;
}

function markWords(entries: Entry[], change: Change): void {
  const pairs = Math.min(change.dels.length, change.adds.length);
  for (let i = 0; i < pairs; i++) {
    const del = entries[change.dels[i] as number] as Entry;
    const add = entries[change.adds[i] as number] as Entry;
    const words = wordDiff(del.text, add.text);
    if (!words) continue;
    del.segs = words.old;
    add.segs = words.new;
  }
}

function closeChange(file: DiffFile, entries: Entry[], open: Change | null, out: Change[]): void {
  if (!open) return;
  const dels = open.dels.map((i) => (entries[i] as Entry).text);
  const adds = open.adds.map((i) => (entries[i] as Entry).text);
  open.key = changeKey(file.path, dels, adds);
  open.index = out.length;
  open.counts = signedCounts(adds.length, dels.length);
  for (const i of [...open.dels, ...open.adds]) (entries[i] as Entry).change = open.index;
  markWords(entries, open);
  out.push(open);
}

export function buildFileModel(file: DiffFile): FileModel {
  const entries = flatten(file);
  const changes: Change[] = [];
  let open: Change | null = null;
  let openHunk = -1;
  for (const entry of entries) {
    if (entry.kind === "context" || entry.hunk !== openHunk) {
      closeChange(file, entries, open, changes);
      open = null;
    }
    if (entry.kind === "context") continue;
    if (!open) open = { index: 0, key: "", dels: [], adds: [], counts: "" };
    openHunk = entry.hunk;
    (entry.kind === "del" ? open.dels : open.adds).push(entry.idx);
  }
  closeChange(file, entries, open, changes);
  return {
    file,
    entries,
    changes,
    path: pathText(file),
    counts: signedCounts(file.additions, file.deletions),
  };
}

export function buildModels(files: readonly DiffFile[]): FileModel[] {
  return files.map(buildFileModel);
}

export type FileTick = "none" | "some" | "all";

export function fileTick(
  model: FileModel,
  ticks: ReadonlySet<string>,
): { state: FileTick; done: number } {
  const done = model.changes.filter((c) => ticks.has(c.key)).length;
  if (done === 0) return { state: "none", done };
  return { state: done === model.changes.length ? "all" : "some", done };
}

export function progress(
  models: readonly FileModel[],
  ticks: ReadonlySet<string>,
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const model of models) {
    total += model.changes.length;
    done += model.changes.filter((c) => ticks.has(c.key)).length;
  }
  return { done, total };
}
