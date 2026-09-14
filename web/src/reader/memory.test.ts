// Plan markdown-viewing (W7, REQ-7/REQ-13/REQ-27): loadMemory/saveMemory round-trip
// through a fake Storage, degrade to the empty default on a throwing storage or a foreign
// JSON shape, and key strictly per session id — see memory.ts's header comment for why
// isDirty/withOpened are keyed by writtenAt rather than a live event history.
import { describe, expect, it } from "vitest";
import {
  forget,
  isDirty,
  loadMemory,
  saveMemory,
  withOpened,
  type ReaderMemory,
  type StorageLike,
} from "./memory";

// `forget` (REQ-17/W4) needs to remove a key. `StorageLike` (memory.ts) has no
// `removeItem` yet — that's part of the red state below — so these fixtures declare it
// themselves via `StorageLikeWithRemove` rather than widening the imported type; additive,
// so every describe block above the `forget` one is unaffected.
interface StorageLikeWithRemove extends StorageLike {
  removeItem(key: string): void;
}

function fakeStorage(initial: Record<string, string> = {}): StorageLikeWithRemove & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem(key: string) {
      return key in data ? data[key]! : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
    removeItem(key: string) {
      delete data[key];
    },
  };
}

function throwingStorage(): StorageLikeWithRemove {
  return {
    getItem() {
      throw new Error("storage disabled");
    },
    setItem() {
      throw new Error("storage disabled");
    },
    removeItem() {
      throw new Error("storage disabled");
    },
  };
}

describe("loadMemory", () => {
  it("returns the empty default when nothing is stored for this session", () => {
    const storage = fakeStorage();
    expect(loadMemory(storage, 1)).toEqual({ openPath: null, clearedAt: {} });
  });

  it("round-trips a saved memory", () => {
    const storage = fakeStorage();
    const memory: ReaderMemory = {
      openPath: "TODO.md",
      clearedAt: { "TODO.md": "2026-09-13T00:00:00Z" },
    };
    saveMemory(storage, 1, memory);
    expect(loadMemory(storage, 1)).toEqual(memory);
  });

  it("keys strictly per session id — an unrelated id's storage entry never leaks", () => {
    const storage = fakeStorage();
    saveMemory(storage, 1, { openPath: "TODO.md", clearedAt: {} });
    expect(loadMemory(storage, 2)).toEqual({ openPath: null, clearedAt: {} });
  });

  it("yields the empty default when the storage throws (private mode / disabled storage)", () => {
    expect(loadMemory(throwingStorage(), 1)).toEqual({ openPath: null, clearedAt: {} });
  });

  it("yields the empty default for unparsable JSON (hand-edited storage)", () => {
    const storage = fakeStorage({ "muster.reader.1": "not json{" });
    expect(loadMemory(storage, 1)).toEqual({ openPath: null, clearedAt: {} });
  });

  it("yields the empty default for a JSON value that isn't an object (foreign shape)", () => {
    const storage = fakeStorage({ "muster.reader.1": "42" });
    expect(loadMemory(storage, 1)).toEqual({ openPath: null, clearedAt: {} });
  });

  it("defaults openPath to null and clearedAt to {} when either key is the wrong type", () => {
    const storage = fakeStorage({
      "muster.reader.1": JSON.stringify({ openPath: 42, clearedAt: "nope" }),
    });
    expect(loadMemory(storage, 1)).toEqual({ openPath: null, clearedAt: {} });
  });

  it("rejects a clearedAt map with a non-string value, falling back to {}", () => {
    const storage = fakeStorage({
      "muster.reader.1": JSON.stringify({ openPath: "TODO.md", clearedAt: { "TODO.md": 1 } }),
    });
    expect(loadMemory(storage, 1)).toEqual({ openPath: "TODO.md", clearedAt: {} });
  });
});

describe("saveMemory", () => {
  it("does not throw when the storage throws (private mode / disabled storage, memory just doesn't survive a reload)", () => {
    expect(() =>
      saveMemory(throwingStorage(), 1, { openPath: "TODO.md", clearedAt: {} }),
    ).not.toThrow();
  });
});

describe("isDirty (REQ-13: whether the changed dot shows)", () => {
  it("is false when writtenAt is null (no write seen this daemon lifetime)", () => {
    expect(isDirty({ openPath: null, clearedAt: {} }, "TODO.md", null)).toBe(false);
  });

  it("is true when writtenAt is non-null and unacknowledged", () => {
    const memory: ReaderMemory = { openPath: null, clearedAt: {} };
    expect(isDirty(memory, "TODO.md", "2026-09-13T09:15:00Z")).toBe(true);
  });

  it("is false once the exact writtenAt has been acknowledged", () => {
    const memory: ReaderMemory = {
      openPath: null,
      clearedAt: { "TODO.md": "2026-09-13T09:15:00Z" },
    };
    expect(isDirty(memory, "TODO.md", "2026-09-13T09:15:00Z")).toBe(false);
  });

  it("is true again once a newer write supersedes the acknowledged one", () => {
    const memory: ReaderMemory = {
      openPath: null,
      clearedAt: { "TODO.md": "2026-09-13T09:15:00Z" },
    };
    expect(isDirty(memory, "TODO.md", "2026-09-13T09:16:00Z")).toBe(true);
  });

  it("tracks acknowledgement strictly per path", () => {
    const memory: ReaderMemory = { openPath: null, clearedAt: { "a.md": "2026-09-13T09:15:00Z" } };
    expect(isDirty(memory, "b.md", "2026-09-13T09:15:00Z")).toBe(true);
  });
});

describe("withOpened (REQ-7/REQ-13: opening a file remembers it and acknowledges its write)", () => {
  it("sets openPath without touching clearedAt when writtenAt is null", () => {
    const memory: ReaderMemory = { openPath: "old.md", clearedAt: { "old.md": "x" } };
    const next = withOpened(memory, "TODO.md", null);
    expect(next).toEqual({ openPath: "TODO.md", clearedAt: { "old.md": "x" } });
  });

  it("acknowledges the write when writtenAt is non-null, so isDirty goes false immediately after", () => {
    const memory: ReaderMemory = { openPath: null, clearedAt: {} };
    const next = withOpened(memory, "TODO.md", "2026-09-13T09:15:00Z");
    expect(next).toEqual({ openPath: "TODO.md", clearedAt: { "TODO.md": "2026-09-13T09:15:00Z" } });
    expect(isDirty(next, "TODO.md", "2026-09-13T09:15:00Z")).toBe(false);
  });

  it("is pure — never mutates the input memory object", () => {
    const memory: ReaderMemory = { openPath: null, clearedAt: {} };
    withOpened(memory, "TODO.md", "2026-09-13T09:15:00Z");
    expect(memory).toEqual({ openPath: null, clearedAt: {} });
  });

  it("preserves other paths' acknowledged writes", () => {
    const memory: ReaderMemory = { openPath: "a.md", clearedAt: { "a.md": "t1" } };
    const next = withOpened(memory, "b.md", "t2");
    expect(next.clearedAt).toEqual({ "a.md": "t1", "b.md": "t2" });
  });
});

// REQ-17/W4 (plan session-lifecycle): `handleRemoved` (features/actions.ts:139) clears
// `muster.reader.<id>` on `sessionRemoved` through this helper, which does not exist yet —
// red until it's added. Same "every access is try/caught" contract as loadMemory/saveMemory
// above (memory.ts's header comment), for the same reason: a private window or blocked
// site data must not turn removing a session into a thrown error.
describe("forget (REQ-17/W4: clears muster.reader.<id> on sessionRemoved)", () => {
  it("removes the stored entry for this session id", () => {
    const storage = fakeStorage({
      "muster.reader.1": JSON.stringify({ openPath: "TODO.md", clearedAt: {} }),
    });

    forget(storage, 1);

    expect(loadMemory(storage, 1)).toEqual({ openPath: null, clearedAt: {} });
  });

  it("leaves other sessions' entries untouched", () => {
    const storage = fakeStorage({
      "muster.reader.1": JSON.stringify({ openPath: "a.md", clearedAt: {} }),
      "muster.reader.2": JSON.stringify({ openPath: "b.md", clearedAt: {} }),
    });

    forget(storage, 1);

    expect(loadMemory(storage, 2)).toEqual({ openPath: "b.md", clearedAt: {} });
  });

  it("is a no-op when nothing was ever stored for this session id", () => {
    const storage = fakeStorage();

    expect(() => forget(storage, 1)).not.toThrow();
    expect(loadMemory(storage, 1)).toEqual({ openPath: null, clearedAt: {} });
  });

  it("does not throw when the storage accessor throws (private window / blocked site data — W4's specific case)", () => {
    expect(() => forget(throwingStorage(), 1)).not.toThrow();
  });
});
