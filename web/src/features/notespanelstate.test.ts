import { describe, expect, it } from "vitest";
import { loadPanelMemory, savePanelMemory } from "./notespanelstate";
import { memoryStorage, throwingStorage } from "../storagefakes";

const KEY = "muster.note-panel";
const EMPTY = { popped: false, rect: null };
const RECT = { x: 10, y: 20, width: 300, height: 200 };

describe("panel memory (per tab)", () => {
  it("defaults to anchored with no rectangle when nothing is stored", () => {
    expect(loadPanelMemory(memoryStorage())).toEqual(EMPTY);
  });

  it.each([
    ["popped with a rectangle", { popped: true, rect: RECT }],
    ["popped with no rectangle yet", { popped: true, rect: null }],
    ["anchored with a remembered rectangle", { popped: false, rect: RECT }],
  ])("round-trips %s", (_label, memory) => {
    const storage = memoryStorage();
    savePanelMemory(storage, memory);
    expect(loadPanelMemory(storage)).toEqual(memory);
  });

  it.each([
    ["not JSON", "{{"],
    ["an array", "[]"],
    ["a number", "4"],
    ["null", "null"],
  ])("reads %s as the default", (_label, raw) => {
    expect(loadPanelMemory(memoryStorage({ [KEY]: raw }))).toEqual(EMPTY);
  });

  it.each([
    ["a missing field", { x: 1, y: 2, width: 3 }],
    ["a string field", { x: "1", y: 2, width: 3, height: 4 }],
    ["a null field", { x: 1, y: null, width: 3, height: 4 }],
    ["not an object", "wide"],
    ["an array", [1, 2, 3, 4]],
  ])("drops a rectangle that has %s but keeps popped", (_label, rect) => {
    const raw = JSON.stringify({ popped: true, rect });
    expect(loadPanelMemory(memoryStorage({ [KEY]: raw }))).toEqual({ popped: true, rect: null });
  });

  it.each([
    ["a string", "yes"],
    ["a number", 1],
    ["missing", undefined],
  ])("treats popped that is %s as anchored", (_label, popped) => {
    const raw = JSON.stringify({ popped, rect: RECT });
    expect(loadPanelMemory(memoryStorage({ [KEY]: raw }))).toEqual({ popped: false, rect: RECT });
  });

  it("never throws when storage throws, and loads the default", () => {
    const storage = throwingStorage();
    expect(() => savePanelMemory(storage, { popped: true, rect: RECT })).not.toThrow();
    expect(loadPanelMemory(storage)).toEqual(EMPTY);
  });
});
