// The one localStorage seam and safe-JSON helper pair: theme.ts's first-paint hint and
// reader/memory.ts's per-session memory each read and write JSON under a storage that can
// throw (private mode, disabled storage) or hold a foreign shape (an older build,
// hand-edited storage). This module owns the try/catch-parse-validate sequence; each
// caller still owns what its own JSON shape means.
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Reads `key`, parses it as JSON and hands the result to `parse`. Returns `fallback` for a
 * throwing storage, a missing/empty value, invalid JSON, or a `parse` that rejects the
 * shape (returns `null`) — never throws. */
export function readJson<T>(
  storage: Pick<StorageLike, "getItem">,
  key: string,
  parse: (value: unknown) => T | null,
  fallback: T,
): T {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return fallback;
  }
  if (!raw) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  const result = parse(parsed);
  return result === null ? fallback : result;
}

/** Best-effort JSON write — a throwing storage (private mode, disabled storage, quota) is
 * swallowed, never surfaced, since every caller treats persistence here as an optimisation
 * rather than a hard dependency of the render path that produced `value`. */
export function writeJson(
  storage: Pick<StorageLike, "setItem">,
  key: string,
  value: unknown,
): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort only — see doc comment above.
  }
}

/** Best-effort removal — same throwing-storage tolerance as `writeJson`. Every caller that
 * clears a key goes through this rather than wrapping `removeItem` in its own try/catch. */
export function removeItem(storage: Pick<StorageLike, "removeItem">, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // best-effort only — see writeJson's doc comment above.
  }
}
