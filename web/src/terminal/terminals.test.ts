// The pure per-session terminal-list state (W2, W3): whole-list replacement, identity when
// unchanged, any-busy reading, snapshot re-sync.
import { describe, expect, it } from "vitest";
import {
  anyBusy,
  EMPTY_TERMINALS,
  forgetTerminals,
  getTerminals,
  setTerminals,
  terminalsFromSnapshot,
  type TerminalsState,
} from "./terminals";

const t = (n: number, busy = false, name = `shell ${n}`) => ({ n, name, busy });

describe("getTerminals", () => {
  it("is the empty list for a session with no entry (no data yet reads as none running)", () => {
    expect(getTerminals(EMPTY_TERMINALS, 1)).toEqual([]);
  });

  it("returns the stored list per session id", () => {
    const state: TerminalsState = new Map([[1, [t(1)]]]);
    expect(getTerminals(state, 1)).toEqual([t(1)]);
    expect(getTerminals(state, 2)).toEqual([]);
  });
});

describe("anyBusy", () => {
  it.each([
    ["empty", [], false],
    ["one idle", [t(1)], false],
    ["two idle", [t(1), t(2)], false],
    ["one busy of two", [t(1), t(2, true)], true],
    ["all busy", [t(1, true), t(2, true)], true],
  ])("%s -> %s", (_label, list, expected) => {
    expect(anyBusy(list)).toBe(expected);
  });
});

describe("setTerminals", () => {
  it("stores a new list for a session", () => {
    const next = setTerminals(EMPTY_TERMINALS, 1, [t(1), t(2)]);
    expect(getTerminals(next, 1)).toEqual([t(1), t(2)]);
  });

  it("returns the same map when the list is equal by n, name and busy", () => {
    const state = setTerminals(EMPTY_TERMINALS, 1, [t(1), t(2)]);
    expect(setTerminals(state, 1, [t(1), t(2)])).toBe(state);
  });

  it.each([
    ["a busy flip", [t(1), t(2, true)]],
    ["a rename", [t(1), t(2, false, "build")]],
    ["a terminal added", [t(1), t(2), t(3)]],
    ["a terminal removed", [t(1)]],
    ["a different number", [t(1), t(3)]],
  ])("replaces the list on %s", (_label, list) => {
    const state = setTerminals(EMPTY_TERMINALS, 1, [t(1), t(2)]);
    const next = setTerminals(state, 1, list);
    expect(next).not.toBe(state);
    expect(getTerminals(next, 1)).toEqual(list);
  });

  it("an empty list drops the entry; empty on an unset session is identity", () => {
    const state = setTerminals(EMPTY_TERMINALS, 1, [t(1)]);
    expect(setTerminals(state, 1, []).has(1)).toBe(false);
    expect(setTerminals(EMPTY_TERMINALS, 1, [])).toBe(EMPTY_TERMINALS);
  });

  it("never mutates the previous map and leaves other sessions' lists alone", () => {
    const state = setTerminals(setTerminals(EMPTY_TERMINALS, 1, [t(1)]), 2, [t(1), t(2)]);
    const next = setTerminals(state, 1, []);
    expect(getTerminals(state, 1)).toEqual([t(1)]);
    expect(getTerminals(next, 2)).toEqual([t(1), t(2)]);
  });
});

describe("forgetTerminals", () => {
  it("drops a session's list; identity when it had none", () => {
    const state = setTerminals(EMPTY_TERMINALS, 1, [t(1)]);
    expect(forgetTerminals(state, 1).has(1)).toBe(false);
    expect(forgetTerminals(EMPTY_TERMINALS, 1)).toBe(EMPTY_TERMINALS);
  });
});

describe("terminalsFromSnapshot", () => {
  it("builds a map keyed by numeric session id", () => {
    const state = terminalsFromSnapshot({ 7: [t(1)], 12: [t(1), t(2, true)] });
    expect(getTerminals(state, 7)).toEqual([t(1)]);
    expect(getTerminals(state, 12)).toEqual([t(1), t(2, true)]);
  });

  it("skips a session whose list is empty and gives an empty map for {}", () => {
    expect(terminalsFromSnapshot({ 7: [] }).has(7)).toBe(false);
    expect(terminalsFromSnapshot({}).size).toBe(0);
  });
});
