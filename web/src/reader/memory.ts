// Browser-side reader memory (kb:adr/reader-memory-split-browser-and-daemon):
// which file was last open, and which writes the user has already acknowledged — kept in
// `localStorage` under `muster.reader.<id>`, shared by the dashboard and the pop-out page
// (same origin, same key). A `ReaderInstance` is disposed whenever its surface isn't
// visible (features/reader.ts's diff), so this is also how a re-mount (switching back to
// `docs`, reloading, popping out) recovers "which files has Claude written since the user
// last looked" without any live event history to lean on — the daemon's own write log is
// in-memory only and resets on restart, so acknowledging a write is keyed by its
// `writtenAt`/`docChanged.at` value (they're the same timestamp, one write log): a later
// write to the same path gets a new value and lights the dot again.
import { isRecord } from "../protocol/decode";
import { readJson, removeItem, writeJson, type StorageLike } from "../storage";

export interface ReaderMemory {
  openPath: string | null;
  clearedAt: Readonly<Record<string, string>>;
}

const EMPTY_MEMORY: ReaderMemory = { openPath: null, clearedAt: {} };

function keyFor(sessionId: number): string {
  return `muster.reader.${sessionId}`;
}

function isClearedAtShape(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((v) => typeof v === "string");
}

function parseMemory(value: unknown): ReaderMemory | null {
  if (!isRecord(value)) return null;
  const openPath = typeof value["openPath"] === "string" ? value["openPath"] : null;
  const clearedAt = isClearedAtShape(value["clearedAt"]) ? value["clearedAt"] : {};
  return { openPath, clearedAt };
}

/** A throwing storage (private mode, disabled storage) or a foreign JSON shape (an older
 * build, hand-edited storage) yields the empty default rather than throwing. */
export function loadMemory(storage: StorageLike, sessionId: number): ReaderMemory {
  return readJson(storage, keyFor(sessionId), parseMemory, EMPTY_MEMORY);
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
