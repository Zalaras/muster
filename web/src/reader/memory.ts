import { isRecord } from "../protocol/decode";
import { readJson, removeItem, writeJson, type StorageLike } from "../storage";

export interface ReaderMemory {
  openPath: string | null;
  clearedAt: Readonly<Record<string, string>>;
  expanded: readonly string[];
  filesFolded: boolean;
  outlineFolded: boolean;
  scroll: Readonly<Record<string, number>>;
}

const EMPTY_MEMORY: ReaderMemory = {
  openPath: null,
  clearedAt: {},
  expanded: [],
  filesFolded: false,
  outlineFolded: false,
  scroll: {},
};

function keyFor(sessionId: number): string {
  return `muster.reader.${sessionId}`;
}

function isClearedAtShape(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((v) => typeof v === "string");
}

function isScrollShape(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((v) => typeof v === "number" && Number.isFinite(v));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function parseMemory(value: unknown): ReaderMemory | null {
  if (!isRecord(value)) return null;
  const openPath = typeof value["openPath"] === "string" ? value["openPath"] : null;
  const clearedAt = isClearedAtShape(value["clearedAt"]) ? value["clearedAt"] : {};
  const expanded = isStringArray(value["expanded"]) ? value["expanded"] : [];
  return {
    openPath,
    clearedAt,
    expanded,
    filesFolded: value["filesFolded"] === true,
    outlineFolded: value["outlineFolded"] === true,
    scroll: isScrollShape(value["scroll"]) ? value["scroll"] : {},
  };
}

export function loadMemory(
  storage: StorageLike,
  sessionId: number,
  fallback: ReaderMemory = EMPTY_MEMORY,
): ReaderMemory {
  return readJson(storage, keyFor(sessionId), parseMemory, fallback);
}

export function saveMemory(storage: StorageLike, sessionId: number, memory: ReaderMemory): void {
  writeJson(storage, keyFor(sessionId), memory);
}

/** Clears `muster.reader.<id>` on `sessionRemoved` (features/reader.ts's own subscriber —
 * reader memory is owned only by the reader feature, so no other module writes or clears
 * this key). Not about a future session inheriting this state — session ids are
 * monotonic and never reused (kb:adr/lifecycle-session-ids-monotonic-never-reused), so
 * no later session can ever carry this id. That is precisely why the key has to be
 * dropped here: nothing else will ever collide with it and reclaim it, so without this
 * every removed session leaves a key behind for good. */
export function forget(storage: StorageLike, sessionId: number): void {
  removeItem(storage, keyFor(sessionId));
}

/** Whether `path`'s changed dot should show, given the daemon's current
 * `writtenAt` for it (`null` = no write seen this daemon lifetime) and what the user has
 * already acknowledged for it. */
export function isDirty(memory: ReaderMemory, path: string, writtenAt: string | null): boolean {
  if (writtenAt === null) return false;
  return memory.clearedAt[path] !== writtenAt;
}

/** Opening `path` remembers it as the last-open file and, when the daemon has a
 * `writtenAt` for it, acknowledges that write so its dot doesn't re-light — this
 * session or a later reload — until a newer write replaces it. Pure; the caller
 * persists the result via `saveMemory`. */
export function withOpened(
  memory: ReaderMemory,
  path: string,
  writtenAt: string | null,
): ReaderMemory {
  if (writtenAt === null) return { ...memory, openPath: path };
  return { ...memory, openPath: path, clearedAt: { ...memory.clearedAt, [path]: writtenAt } };
}

export function withFolderExpanded(
  memory: ReaderMemory,
  path: string,
  expanded: boolean,
): ReaderMemory {
  const rest = memory.expanded.filter((p) => p !== path);
  return { ...memory, expanded: expanded ? [...rest, path] : rest };
}

export function withExpandedCleared(memory: ReaderMemory): ReaderMemory {
  return { ...memory, expanded: [] };
}

export function withFilesFolded(memory: ReaderMemory, folded: boolean): ReaderMemory {
  return { ...memory, filesFolded: folded };
}

export function withOutlineFolded(memory: ReaderMemory, folded: boolean): ReaderMemory {
  return { ...memory, outlineFolded: folded };
}

export function withScroll(memory: ReaderMemory, path: string, top: number): ReaderMemory {
  return { ...memory, scroll: { ...memory.scroll, [path]: top } };
}

export function withScrollPruned(
  memory: ReaderMemory,
  listedPaths: readonly string[],
): ReaderMemory {
  const listed = new Set(listedPaths);
  const kept = Object.entries(memory.scroll).filter(([path]) => listed.has(path));
  return { ...memory, scroll: Object.fromEntries(kept) };
}

export function isMemoryWrite(
  key: string | null,
  newValue: string | null,
  sessionId: number,
): boolean {
  return newValue !== null && key === keyFor(sessionId);
}
