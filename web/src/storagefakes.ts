import type { KeyedStorage } from "./storage";

export type MemoryStorage = KeyedStorage & { data: Record<string, string> };

export function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const data = { ...initial };
  return {
    data,
    get length() {
      return Object.keys(data).length;
    },
    key: (index) => Object.keys(data)[index] ?? null,
    getItem: (key) => (key in data ? data[key]! : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

export function throwingStorage(): KeyedStorage {
  const fail = (): never => {
    throw new Error("storage disabled");
  };
  return {
    get length(): number {
      return fail();
    },
    key: fail,
    getItem: fail,
    setItem: fail,
    removeItem: fail,
  };
}

export function failingAfter(writes: number): MemoryStorage {
  const inner = memoryStorage();
  let left = writes;
  return {
    ...inner,
    get length() {
      return inner.length;
    },
    setItem: (key, value) => {
      if (left <= 0) throw new Error("quota exceeded");
      left -= 1;
      inner.setItem(key, value);
    },
  };
}
