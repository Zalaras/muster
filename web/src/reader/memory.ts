// Browser-side reader memory (REQ-7, REQ-13, REQ-27; kb:adr/reader-memory-split-browser-and-daemon):
// which file was last open, and which writes the user has already acknowledged — kept in
// `localStorage` under `muster.reader.<id>`, shared by the dashboard and the pop-out page
// (same origin, same key). A `ReaderInstance` is disposed whenever its surface isn't
// visible (features/reader.ts's diff), so this is also how a re-mount (switching back to
// `docs`, reloading, popping out) recovers "which files has Claude written since the user
// last looked" without any live event history to lean on — the daemon's own write log is
// in-memory only and resets on restart, so acknowledging a write is keyed by its
// `writtenAt`/`docChanged.at` value (they're the same timestamp, one write log): a later
// write to the same path gets a new value and lights the dot again.
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ReaderMemory {
  openPath: string | null;
  clearedAt: Readonly<Record<string, string>>;
}

const EMPTY_MEMORY: ReaderMemory = { openPath: null, clearedAt: {} };

function keyFor(sessionId: number): string {
  return `muster.reader.${sessionId}`;
}

function isClearedAtShape(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((v) => typeof v === "string");
}

/** Every access is try/caught: a throwing storage (private mode, disabled storage) or a
 * foreign JSON shape (an older build, hand-edited storage) yields the empty default
 * rather than throwing — W7. */
export function loadMemory(storage: StorageLike, sessionId: number): ReaderMemory {
  try {
    const raw = storage.getItem(keyFor(sessionId));
    if (!raw) return EMPTY_MEMORY;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return EMPTY_MEMORY;
    const rec = parsed as Record<string, unknown>;
    const openPath = typeof rec["openPath"] === "string" ? rec["openPath"] : null;
    const clearedAt = isClearedAtShape(rec["clearedAt"]) ? rec["clearedAt"] : {};
    return { openPath, clearedAt };
  } catch {
    return EMPTY_MEMORY;
  }
}

export function saveMemory(storage: StorageLike, sessionId: number, memory: ReaderMemory): void {
  try {
    storage.setItem(keyFor(sessionId), JSON.stringify(memory));
  } catch {
    // Private mode / disabled storage / quota — memory just doesn't survive a reload.
  }
}

/** REQ-13: whether `path`'s changed dot should show, given the daemon's current
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
