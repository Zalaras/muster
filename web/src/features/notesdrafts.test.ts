import { describe, expect, it } from "vitest";
import { createDraftStore } from "./notesdrafts";
import { failingAfter, memoryStorage, throwingStorage } from "../storagefakes";

const key = (id: number) => `muster.note-draft.${id}`;

describe("createDraftStore", () => {
  it("holds unacknowledged text per session", () => {
    const store = createDraftStore(memoryStorage());
    store.set(1, "one");
    store.set(2, "two");
    expect(store.get(1)).toBe("one");
    expect(store.get(2)).toBe("two");
    expect(store.get(3)).toBeUndefined();
  });

  it("keeps the latest text when a session is set twice", () => {
    const store = createDraftStore(memoryStorage());
    store.set(1, "a");
    store.set(1, "ab");
    expect(store.get(1)).toBe("ab");
  });

  it("keeps an empty string as a draft (clearing a note is an edit to send)", () => {
    const store = createDraftStore(memoryStorage());
    store.set(1, "");
    expect(store.get(1)).toBe("");
    expect([...store.pending()]).toEqual([[1, ""]]);
  });

  it("clears a draft only on an acknowledgement of that same text", () => {
    const store = createDraftStore(memoryStorage());
    store.set(1, "newer");
    store.acknowledge(1, "older");
    expect(store.get(1)).toBe("newer");
    store.acknowledge(1, "newer");
    expect(store.get(1)).toBeUndefined();
  });

  it("an acknowledgement for a session with no draft changes nothing", () => {
    const storage = memoryStorage();
    const store = createDraftStore(storage);
    store.set(2, "kept");
    store.acknowledge(1, "x");
    expect(store.get(2)).toBe("kept");
  });

  it("an acknowledgement for one session leaves another's draft", () => {
    const store = createDraftStore(memoryStorage());
    store.set(1, "same");
    store.set(2, "same");
    store.acknowledge(1, "same");
    expect([...store.pending()]).toEqual([[2, "same"]]);
  });

  it("drops a session's draft when it is removed, others kept", () => {
    const store = createDraftStore(memoryStorage());
    store.set(1, "a");
    store.set(2, "b");
    store.drop(1);
    store.drop(99);
    expect([...store.pending()]).toEqual([[2, "b"]]);
  });

  it("yields every pending draft, numeric ids, for re-send on load and reconnect", () => {
    const store = createDraftStore(memoryStorage());
    store.set(10, "ten");
    store.set(2, "two");
    expect(new Map(store.pending())).toEqual(
      new Map([
        [10, "ten"],
        [2, "two"],
      ]),
    );
  });

  it("survives a reload: a fresh store over the same storage sees the drafts", () => {
    const storage = memoryStorage();
    createDraftStore(storage).set(4, "kept in the browser");
    expect(createDraftStore(storage).get(4)).toBe("kept in the browser");
  });

  it("keeps each session's draft under its own key", () => {
    const storage = memoryStorage();
    const store = createDraftStore(storage);
    store.set(1, "one");
    store.set(22, "two");
    expect(storage.data).toEqual({ [key(1)]: '"one"', [key(22)]: '"two"' });
    store.drop(1);
    expect(Object.keys(storage.data)).toEqual([key(22)]);
  });

  it("two windows over one storage: one session's write or acknowledgement never removes the other's draft", () => {
    const storage = memoryStorage();
    const a = createDraftStore(storage);
    const b = createDraftStore(storage);
    a.set(1, "x");
    b.set(2, "y");
    b.acknowledge(2, "y");
    expect(a.get(1)).toBe("x");
    expect(storage.data[key(1)]).toBe('"x"');
    expect(b.get(2)).toBeUndefined();
    b.set(3, "z");
    expect(new Map(a.pending())).toEqual(
      new Map([
        [1, "x"],
        [3, "z"],
      ]),
    );
  });

  it("a fresh window lists drafts another window left in storage", () => {
    const storage = memoryStorage();
    createDraftStore(storage).set(5, "left");
    expect([...createDraftStore(storage).pending()]).toEqual([[5, "left"]]);
  });

  it.each([
    ["not JSON", "{{"],
    ["an array", "[1]"],
    ["a number", "5"],
    ["null", "null"],
  ])("reads a stored value that is %s as no draft", (_label, raw) => {
    const store = createDraftStore(memoryStorage({ [key(1)]: raw }));
    expect(store.get(1)).toBeUndefined();
    expect([...store.pending()]).toEqual([]);
    store.set(1, "ok");
    expect(store.get(1)).toBe("ok");
  });

  it("ignores stored keys that are not a session's draft key", () => {
    const storage = memoryStorage({
      [key(1)]: '"good"',
      "muster.note-draft.abc": '"bad id"',
      "muster.note-draft.1.5": '"fractional"',
      "muster.other": '"x"',
      [key(3)]: "5",
    });
    expect([...createDraftStore(storage).pending()]).toEqual([[1, "good"]]);
  });

  it("returns the latest typed text even when storage throws (private window), pending holds it", () => {
    const store = createDraftStore(throwingStorage());
    expect(() => store.set(1, "x")).not.toThrow();
    expect(store.get(1)).toBe("x");
    expect([...store.pending()]).toEqual([[1, "x"]]);
    expect(() => store.drop(1)).not.toThrow();
    expect(store.get(1)).toBeUndefined();
    expect([...store.pending()]).toEqual([]);
  });

  it("a failed write removes that session's older stored text so it is never resurrected", () => {
    const storage = failingAfter(1);
    const store = createDraftStore(storage);
    store.set(1, "short");
    expect(storage.data[key(1)]).toBe('"short"');
    store.set(1, "a much longer text");
    expect(storage.data[key(1)]).toBeUndefined();
    expect(store.get(1)).toBe("a much longer text");
    expect(createDraftStore(storage).get(1)).toBeUndefined();
  });
});
