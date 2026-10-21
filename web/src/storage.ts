// The only place in web/src that touches the localStorage or sessionStorage global, and the
// safe-JSON helpers over them: callers read and write JSON under a storage that can throw
// (private mode, disabled storage) or hold a foreign shape (an older build, hand-edited
// storage). This module owns the try/catch-parse-validate sequence; each caller still owns
// what its own JSON shape means. The accessors re-resolve the global on every call, so a
// caller may hold one from init: storage blocked at first use is not unavailable for good.
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface KeyedStorage extends StorageLike {
  readonly length: number;
  key(index: number): string | null;
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

export function writeJson(
  storage: Pick<StorageLike, "setItem">,
  key: string,
  value: unknown,
): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
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

export function listKeys(storage: Pick<KeyedStorage, "length" | "key">): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key !== null) keys.push(key);
    }
  } catch {
    return [];
  }
  return keys;
}

function unavailable(): never {
  throw new Error("storage unavailable");
}

function guardedStorage(read: () => KeyedStorage): KeyedStorage {
  const current = (): KeyedStorage | null => {
    try {
      return read();
    } catch {
      return null;
    }
  };
  return {
    getItem: (key) => (current() ?? unavailable()).getItem(key),
    setItem: (key, value) => (current() ?? unavailable()).setItem(key, value),
    removeItem: (key) => (current() ?? unavailable()).removeItem(key),
    get length() {
      return current()?.length ?? 0;
    },
    key: (index) => current()?.key(index) ?? null,
  };
}

export function safeSessionStorage(): KeyedStorage {
  return guardedStorage(() => sessionStorage);
}

export function safeLocalStorage(): KeyedStorage {
  return guardedStorage(() => localStorage);
}
