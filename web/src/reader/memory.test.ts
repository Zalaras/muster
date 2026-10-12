// Plan markdown-viewing (W7, REQ-7/REQ-13/REQ-27): loadMemory/saveMemory round-trip
// through a fake Storage, degrade to the empty default on a throwing storage or a foreign
// JSON shape, and key strictly per session id — see memory.ts's header comment for why
// isDirty/withOpened are keyed by writtenAt rather than a live event history.
import { describe, expect, it } from "vitest";
import {
  forget,
  isDirty,
  isMemoryWrite,
  loadMemory,
  saveMemory,
  withExpandedCleared,
  withFilesFolded,
  withFolderExpanded,
  withOpened,
  withOutlineFolded,
  type ReaderMemory,
} from "./memory";
import type { StorageLike } from "../storage";

const EMPTY: ReaderMemory = {
  openPath: null,
  clearedAt: {},
  expanded: [],
  filesFolded: false,
  outlineFolded: false,
};

function mem(over: Partial<ReaderMemory> = {}): ReaderMemory {
  return { ...EMPTY, ...over };
}

function fakeStorage(initial: Record<string, string> = {}): StorageLike & {
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

function throwingStorage(): StorageLike {
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
    expect(loadMemory(storage, 1)).toEqual(EMPTY);
  });

  it("round-trips a saved memory", () => {
    const storage = fakeStorage();
    const memory = mem({
      openPath: "TODO.md",
      clearedAt: { "TODO.md": "2026-09-13T00:00:00Z" },
      expanded: ["docs", "docs/adr"],
      filesFolded: true,
      outlineFolded: true,
    });
    saveMemory(storage, 1, memory);
    expect(loadMemory(storage, 1)).toEqual(memory);
  });

  it("keys strictly per session id — an unrelated id's storage entry never leaks", () => {
    const storage = fakeStorage();
    saveMemory(storage, 1, mem({ openPath: "TODO.md" }));
    expect(loadMemory(storage, 2)).toEqual(EMPTY);
  });

  it("yields the empty default when the storage throws (private mode / disabled storage)", () => {
    expect(loadMemory(throwingStorage(), 1)).toEqual(EMPTY);
  });

  it("yields the empty default for unparsable JSON (hand-edited storage)", () => {
    const storage = fakeStorage({ "muster.reader.1": "not json{" });
    expect(loadMemory(storage, 1)).toEqual(EMPTY);
  });

  it("yields the empty default for a JSON value that isn't an object (foreign shape)", () => {
    const storage = fakeStorage({ "muster.reader.1": "42" });
    expect(loadMemory(storage, 1)).toEqual(EMPTY);
  });

  it("defaults openPath to null and clearedAt to {} when either key is the wrong type", () => {
    const storage = fakeStorage({
      "muster.reader.1": JSON.stringify({ openPath: 42, clearedAt: "nope" }),
    });
    expect(loadMemory(storage, 1)).toEqual(EMPTY);
  });

  it("rejects a clearedAt map with a non-string value, falling back to {}", () => {
    const storage = fakeStorage({
      "muster.reader.1": JSON.stringify({ openPath: "TODO.md", clearedAt: { "TODO.md": 1 } }),
    });
    expect(loadMemory(storage, 1)).toEqual(mem({ openPath: "TODO.md" }));
  });
});

// Review cycle 2: features/reader.ts re-reads storage before every write and passes its own
// state as the fallback, so a throwing storage keeps the instance's state rather than
// resetting it to empty.
describe("loadMemory — fallback argument", () => {
  const own = mem({
    openPath: "own.md",
    clearedAt: { "own.md": "t1" },
    expanded: ["docs"],
    filesFolded: true,
    outlineFolded: true,
  });

  it("returns the supplied fallback when the storage throws", () => {
    expect(loadMemory(throwingStorage(), 1, own)).toEqual(own);
  });

  it("returns the supplied fallback when nothing is stored for this session", () => {
    expect(loadMemory(fakeStorage(), 1, own)).toEqual(own);
  });

  it("returns the supplied fallback for unparsable JSON and for a non-object value", () => {
    expect(loadMemory(fakeStorage({ "muster.reader.1": "not json{" }), 1, own)).toEqual(own);
    expect(loadMemory(fakeStorage({ "muster.reader.1": "42" }), 1, own)).toEqual(own);
  });

  it("ignores the fallback when a stored entry parses, field defaults included", () => {
    const storage = fakeStorage({ "muster.reader.1": JSON.stringify({ openPath: "stored.md" }) });
    expect(loadMemory(storage, 1, own)).toEqual(mem({ openPath: "stored.md" }));
  });

  it("keeps the empty default when the fallback is omitted", () => {
    expect(loadMemory(throwingStorage(), 1)).toEqual(EMPTY);
    expect(loadMemory(fakeStorage(), 1)).toEqual(EMPTY);
  });
});

// REQ-4 (plan reader-expanded-persists): memory written by an older build, or hand-edited,
// loads field by field — each new field defaults on its own and never drags the others down.
describe("loadMemory — expanded and fold fields (REQ-4)", () => {
  const stored = (value: unknown) => fakeStorage({ "muster.reader.1": JSON.stringify(value) });

  it("loads an older shape with none of the new fields as nothing expanded, nothing folded", () => {
    const storage = stored({ openPath: "TODO.md", clearedAt: { "TODO.md": "t1" } });
    expect(loadMemory(storage, 1)).toEqual(
      mem({ openPath: "TODO.md", clearedAt: { "TODO.md": "t1" } }),
    );
  });

  it("loads an empty object as the empty default", () => {
    expect(loadMemory(stored({}), 1)).toEqual(EMPTY);
  });

  it.each<[string, Record<string, unknown>, Partial<ReaderMemory>]>([
    ["expanded is a string", { expanded: "x" }, {}],
    ["expanded holds a number", { expanded: [1] }, {}],
    ["expanded mixes strings and numbers", { expanded: ["docs", 2] }, {}],
    ["expanded is null", { expanded: null }, {}],
    ["expanded is an object", { expanded: { docs: true } }, {}],
    ["filesFolded is a string", { filesFolded: "yes" }, {}],
    ["filesFolded is a number", { filesFolded: 1 }, {}],
    ["outlineFolded is a string", { outlineFolded: "yes" }, {}],
    ["outlineFolded is null", { outlineFolded: null }, {}],
  ])("defaults the field when %s", (_name, fields, expected) => {
    expect(loadMemory(stored({ openPath: "a.md", ...fields }), 1)).toEqual(
      mem({ openPath: "a.md", ...expected }),
    );
  });

  it("keeps the valid new fields when a sibling field is the wrong type", () => {
    const storage = stored({
      expanded: ["docs", "docs/adr"],
      filesFolded: true,
      outlineFolded: "yes",
    });
    expect(loadMemory(storage, 1)).toEqual(
      mem({ expanded: ["docs", "docs/adr"], filesFolded: true, outlineFolded: false }),
    );
  });

  it("keeps the old fields when every new field is the wrong type", () => {
    const storage = stored({
      openPath: "TODO.md",
      clearedAt: { "TODO.md": "t1" },
      expanded: "x",
      filesFolded: "yes",
      outlineFolded: "yes",
    });
    expect(loadMemory(storage, 1)).toEqual(
      mem({ openPath: "TODO.md", clearedAt: { "TODO.md": "t1" } }),
    );
  });

  it("round-trips each fold flag independently", () => {
    const storage = fakeStorage();
    saveMemory(storage, 1, mem({ filesFolded: true }));
    expect(loadMemory(storage, 1)).toEqual(mem({ filesFolded: true }));
    saveMemory(storage, 1, mem({ outlineFolded: true }));
    expect(loadMemory(storage, 1)).toEqual(mem({ outlineFolded: true }));
  });
});

describe("saveMemory", () => {
  it("does not throw when the storage throws (private mode / disabled storage, memory just doesn't survive a reload)", () => {
    expect(() => saveMemory(throwingStorage(), 1, mem({ openPath: "TODO.md" }))).not.toThrow();
  });
});

describe("isDirty (REQ-13: whether the changed dot shows)", () => {
  it("is false when writtenAt is null (no write seen this daemon lifetime)", () => {
    expect(isDirty(EMPTY, "TODO.md", null)).toBe(false);
  });

  it("is true when writtenAt is non-null and unacknowledged", () => {
    const memory = mem();
    expect(isDirty(memory, "TODO.md", "2026-09-13T09:15:00Z")).toBe(true);
  });

  it("is false once the exact writtenAt has been acknowledged", () => {
    const memory = mem({ clearedAt: { "TODO.md": "2026-09-13T09:15:00Z" } });
    expect(isDirty(memory, "TODO.md", "2026-09-13T09:15:00Z")).toBe(false);
  });

  it("is true again once a newer write supersedes the acknowledged one", () => {
    const memory = mem({ clearedAt: { "TODO.md": "2026-09-13T09:15:00Z" } });
    expect(isDirty(memory, "TODO.md", "2026-09-13T09:16:00Z")).toBe(true);
  });

  it("tracks acknowledgement strictly per path", () => {
    const memory = mem({ clearedAt: { "a.md": "2026-09-13T09:15:00Z" } });
    expect(isDirty(memory, "b.md", "2026-09-13T09:15:00Z")).toBe(true);
  });
});

describe("withOpened (REQ-7/REQ-13: opening a file remembers it and acknowledges its write)", () => {
  it("sets openPath without touching clearedAt when writtenAt is null", () => {
    const memory = mem({ openPath: "old.md", clearedAt: { "old.md": "x" }, expanded: ["docs"] });
    const next = withOpened(memory, "TODO.md", null);
    expect(next).toEqual(
      mem({ openPath: "TODO.md", clearedAt: { "old.md": "x" }, expanded: ["docs"] }),
    );
  });

  it("acknowledges the write when writtenAt is non-null, so isDirty goes false immediately after", () => {
    const memory = mem();
    const next = withOpened(memory, "TODO.md", "2026-09-13T09:15:00Z");
    expect(next).toEqual(
      mem({ openPath: "TODO.md", clearedAt: { "TODO.md": "2026-09-13T09:15:00Z" } }),
    );
    expect(isDirty(next, "TODO.md", "2026-09-13T09:15:00Z")).toBe(false);
  });

  it("is pure — never mutates the input memory object", () => {
    const memory = mem();
    withOpened(memory, "TODO.md", "2026-09-13T09:15:00Z");
    expect(memory).toEqual(EMPTY);
  });

  it("preserves other paths' acknowledged writes", () => {
    const memory = mem({ openPath: "a.md", clearedAt: { "a.md": "t1" } });
    const next = withOpened(memory, "b.md", "t2");
    expect(next.clearedAt).toEqual({ "a.md": "t1", "b.md": "t2" });
  });
});

describe("withFolderExpanded (REQ-1: an expanded folder is remembered)", () => {
  it("adds a folder that was not expanded when set to true", () => {
    expect(withFolderExpanded(EMPTY, "docs", true).expanded).toEqual(["docs"]);
  });

  it("adds a folder that is already expanded only once", () => {
    const memory = mem({ expanded: ["docs", "web"] });
    expect(withFolderExpanded(memory, "docs", true).expanded).toEqual(["web", "docs"]);
  });

  it("removes an expanded folder when set to false, leaving the others in order", () => {
    const memory = mem({ expanded: ["docs", "docs/adr", "web"] });
    expect(withFolderExpanded(memory, "docs/adr", false).expanded).toEqual(["docs", "web"]);
  });

  it("collapsing a folder that was never expanded changes nothing", () => {
    const memory = mem({ expanded: ["docs"] });
    expect(withFolderExpanded(memory, "web", false)).toEqual(memory);
  });

  it("is idempotent for either value", () => {
    const memory = mem({ expanded: ["docs"] });
    const expanded = withFolderExpanded(memory, "web", true);
    expect(withFolderExpanded(expanded, "web", true)).toEqual(expanded);
    const collapsed = withFolderExpanded(expanded, "web", false);
    expect(withFolderExpanded(collapsed, "web", false)).toEqual(collapsed);
    expect(collapsed).toEqual(memory);
  });

  it("is pure and leaves every other field alone", () => {
    const memory = mem({
      openPath: "a.md",
      clearedAt: { "a.md": "t1" },
      expanded: ["docs"],
      filesFolded: true,
      outlineFolded: true,
    });
    const snapshot = structuredClone(memory);
    const next = withFolderExpanded(memory, "web", true);
    expect(memory).toEqual(snapshot);
    expect(next).toEqual({ ...snapshot, expanded: ["docs", "web"] });
  });
});

describe("withExpandedCleared (REQ-3: a filter clear collapses the tree and is saved)", () => {
  it("empties the expanded set and leaves every other field alone", () => {
    const memory = mem({
      openPath: "a.md",
      clearedAt: { "a.md": "t1" },
      expanded: ["docs", "web"],
      filesFolded: true,
      outlineFolded: true,
    });
    const next = withExpandedCleared(memory);
    expect(next).toEqual({ ...memory, expanded: [] });
    expect(memory.expanded).toEqual(["docs", "web"]);
  });

  it("is a no-op in value when nothing was expanded", () => {
    expect(withExpandedCleared(EMPTY)).toEqual(EMPTY);
  });
});

describe.each([
  ["withFilesFolded", withFilesFolded, "filesFolded", "outlineFolded"],
  ["withOutlineFolded", withOutlineFolded, "outlineFolded", "filesFolded"],
] as const)("%s (REQ-2: a fold is remembered)", (_name, setFolded, field, other) => {
  it.each([
    [true, false],
    [false, true],
    [true, true],
    [false, false],
  ])("sets the fold to %s when it was %s", (value, before) => {
    expect(setFolded(mem({ [field]: before }), value)[field]).toBe(value);
  });

  it("never touches the other fold or any other field, and does not mutate its input", () => {
    const memory = mem({ openPath: "a.md", expanded: ["docs"], [other]: true });
    const next = setFolded(memory, true);
    expect(next).toEqual({ ...memory, [field]: true });
    expect(memory[field]).toBe(false);
  });
});

describe("isMemoryWrite (a storage event is another window writing this session's memory)", () => {
  it.each([
    ["this session's key with a value", "muster.reader.7", "{}", 7, true],
    ["this session's key with an empty-string value", "muster.reader.7", "", 7, true],
    ["a removal of this session's key", "muster.reader.7", null, 7, false],
    ["another session's key", "muster.reader.8", "{}", 7, false],
    ["a key that only shares the prefix", "muster.reader.77", "{}", 7, false],
    ["an unrelated key", "muster.theme", "dark", 7, false],
    ["a null key (storage.clear())", null, null, 7, false],
    ["a null key with a value", null, "{}", 7, false],
  ] as const)("%s", (_name, key, newValue, sessionId, expected) => {
    expect(isMemoryWrite(key, newValue, sessionId)).toBe(expected);
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

    expect(loadMemory(storage, 1)).toEqual(EMPTY);
  });

  it("leaves other sessions' entries untouched", () => {
    const storage = fakeStorage({
      "muster.reader.1": JSON.stringify({ openPath: "a.md", clearedAt: {} }),
      "muster.reader.2": JSON.stringify({ openPath: "b.md", clearedAt: {} }),
    });

    forget(storage, 1);

    expect(loadMemory(storage, 2)).toEqual(mem({ openPath: "b.md" }));
  });

  it("is a no-op when nothing was ever stored for this session id", () => {
    const storage = fakeStorage();

    expect(() => forget(storage, 1)).not.toThrow();
    expect(loadMemory(storage, 1)).toEqual(EMPTY);
  });

  it("does not throw when the storage accessor throws (private window / blocked site data — W4's specific case)", () => {
    expect(() => forget(throwingStorage(), 1)).not.toThrow();
  });
});
