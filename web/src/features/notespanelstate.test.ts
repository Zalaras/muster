import { describe, expect, it } from "vitest";
import { memoryStorage, throwingStorage } from "../storagefakes";
import {
  isPopped,
  loadPlaces,
  type NotePlaces,
  rectOf,
  savePlaces,
  withoutAbsent,
  withoutPlace,
  withPlace,
} from "./notespanelstate";

const KEY = "muster.note-places";
const RECT = { x: 10, y: 20, width: 300, height: 200 };
const OTHER = { x: 0, y: 5, width: 400, height: 250 };

function stored(value: unknown) {
  return memoryStorage({ [KEY]: JSON.stringify(value) });
}

describe("places memory (per tab)", () => {
  it("is empty when nothing is stored", () => {
    expect(loadPlaces(memoryStorage()).size).toBe(0);
  });

  it("round-trips several sessions' popped flags and rectangles (W1)", () => {
    const places: NotePlaces = new Map([
      [3, { popped: true, rect: RECT }],
      [7, { popped: false, rect: OTHER }],
      [9, { popped: true, rect: null }],
    ]);
    const storage = memoryStorage();
    savePlaces(storage, places);
    expect(loadPlaces(storage)).toEqual(places);
  });

  it("ignores the old muster.note-panel key (W2)", () => {
    const storage = memoryStorage({
      "muster.note-panel": JSON.stringify({ popped: true, rect: RECT }),
    });
    const places = loadPlaces(storage);
    expect(places.size).toBe(0);
    expect(isPopped(places, 1)).toBe(false);
    expect(rectOf(places, 1)).toBeNull();
  });

  it("drops malformed entries and keeps the others (W3)", () => {
    const places = loadPlaces(
      stored({
        "1": { popped: true, rect: RECT },
        "2": { popped: true, rect: { x: "1", y: 2, width: 3, height: 4 } },
        "3": { popped: true, rect: { x: 1, y: 2, width: 3 } },
        "4": { popped: "yes", rect: RECT },
        abc: { popped: true, rect: RECT },
        "1.5": { popped: true, rect: RECT },
        "-2": { popped: true, rect: RECT },
        "5": "wide",
        "6": { popped: false, rect: null },
        "7": { popped: true },
      }),
    );
    expect([...places.keys()].sort()).toEqual([1, 6, 7]);
    expect(places.get(1)).toEqual({ popped: true, rect: RECT });
    expect(places.get(7)).toEqual({ popped: true, rect: null });
  });

  it("drops a non-finite rectangle number", () => {
    const storage = memoryStorage({
      [KEY]: '{"1":{"popped":true,"rect":{"x":1e999,"y":0,"width":300,"height":200}}}',
    });
    expect(loadPlaces(storage).has(1)).toBe(false);
  });

  it.each([
    ["not JSON", "{{"],
    ["an array", "[]"],
    ["a number", "4"],
    ["null", "null"],
  ])("reads %s as empty", (_label, raw) => {
    expect(loadPlaces(memoryStorage({ [KEY]: raw })).size).toBe(0);
  });

  it("never throws when storage throws", () => {
    const storage = throwingStorage();
    expect(() => savePlaces(storage, new Map([[1, { popped: true, rect: RECT }]]))).not.toThrow();
    expect(loadPlaces(storage).size).toBe(0);
  });
});

describe("place queries and updates", () => {
  const base: NotePlaces = new Map([
    [1, { popped: true, rect: RECT }],
    [2, { popped: false, rect: OTHER }],
  ]);

  it("isPopped and rectOf answer per session, unknown ids are anchored without a rect", () => {
    expect(isPopped(base, 1)).toBe(true);
    expect(isPopped(base, 2)).toBe(false);
    expect(isPopped(base, 99)).toBe(false);
    expect(rectOf(base, 2)).toEqual(OTHER);
    expect(rectOf(base, 99)).toBeNull();
  });

  it("withPlace patches one session without touching others or the input", () => {
    const next = withPlace(base, 2, { popped: true });
    expect(next.get(2)).toEqual({ popped: true, rect: OTHER });
    expect(next.get(1)).toEqual(base.get(1));
    expect(base.get(2)?.popped).toBe(false);
  });

  it("withPlace creates an entry with defaults for a new session", () => {
    expect(withPlace(base, 5, { rect: RECT }).get(5)).toEqual({ popped: false, rect: RECT });
  });

  it("withoutPlace removes one entry and returns the same map when absent", () => {
    expect([...withoutPlace(base, 1).keys()]).toEqual([2]);
    expect(withoutPlace(base, 99)).toBe(base);
  });

  it("withoutAbsent forgets only the ids missing from the snapshot (W5)", () => {
    const places = withPlace(withPlace(base, 3, { popped: true }), 4, { rect: RECT });
    const next = withoutAbsent(places, new Set([1, 4, 8]));
    expect([...next.keys()].sort()).toEqual([1, 4]);
    expect(next.get(1)).toEqual(places.get(1));
  });

  it("withoutAbsent returns the same map when nothing is absent", () => {
    expect(withoutAbsent(base, new Set([1, 2, 3]))).toBe(base);
  });
});
