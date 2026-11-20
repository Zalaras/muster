import { describe, expect, it } from "vitest";
import {
  appliedRev,
  applyListRev,
  EMPTY_TERMINALS_REV,
  forgetSeenRev,
  isStaleList,
  raiseSeenRev,
  resetSeenRev,
  seenRev,
} from "./terminalsrev";

describe("terminalsrev", () => {
  it("an unseen session reads the base, 0 when empty", () => {
    expect(seenRev(EMPTY_TERMINALS_REV, 1)).toBe(0);
    expect(seenRev(resetSeenRev(5), 1)).toBe(5);
  });

  it("raise keeps the highest rev and returns the same state for a lower or equal one", () => {
    const raised = raiseSeenRev(resetSeenRev(5), 1, 8);
    expect(seenRev(raised, 1)).toBe(8);
    expect(seenRev(raised, 2)).toBe(5);
    expect(raiseSeenRev(raised, 1, 8)).toBe(raised);
    expect(raiseSeenRev(raised, 1, 7)).toBe(raised);
    expect(raiseSeenRev(resetSeenRev(5), 1, 5).bySession.size).toBe(0);
  });

  it("raise does not mutate the state it was given", () => {
    const before = resetSeenRev(1);
    raiseSeenRev(before, 1, 9);
    expect(before.bySession.size).toBe(0);
  });

  it.each([
    [4, true],
    [5, false],
    [6, false],
  ])("a list at rev %s against seen 5 is stale: %s", (rev, stale) => {
    expect(isStaleList(raiseSeenRev(EMPTY_TERMINALS_REV, 1, 5), 1, rev)).toBe(stale);
  });

  it("reset drops every per-session rev", () => {
    const state = resetSeenRev(3);
    expect(seenRev(raiseSeenRev(state, 1, 9), 1)).toBe(9);
    expect(seenRev(resetSeenRev(3), 1)).toBe(3);
  });

  it("forget returns a session to the base and leaves others and unknown ids alone", () => {
    const state = raiseSeenRev(raiseSeenRev(resetSeenRev(2), 1, 9), 2, 7);
    const forgot = forgetSeenRev(state, 1);
    expect(seenRev(forgot, 1)).toBe(2);
    expect(seenRev(forgot, 2)).toBe(7);
    expect(forgetSeenRev(forgot, 3)).toBe(forgot);
  });

  it("appliedRev reads the applied base, 0 when empty, and is not moved by raiseSeenRev", () => {
    expect(appliedRev(EMPTY_TERMINALS_REV, 1)).toBe(0);
    expect(appliedRev(resetSeenRev(5), 1)).toBe(5);
    expect(appliedRev(raiseSeenRev(resetSeenRev(5), 1, 9), 1)).toBe(5);
  });

  it("applyListRev raises both the seen and the applied rev of that session only", () => {
    const state = applyListRev(resetSeenRev(5), 1, 9);
    expect(appliedRev(state, 1)).toBe(9);
    expect(seenRev(state, 1)).toBe(9);
    expect(appliedRev(state, 2)).toBe(5);
    expect(seenRev(state, 2)).toBe(5);
  });

  it("applyListRev at or below the applied rev leaves applied alone but still floors seen", () => {
    const state = applyListRev(resetSeenRev(5), 1, 9);
    expect(applyListRev(state, 1, 9)).toBe(state);
    const low = applyListRev(raiseSeenRev(resetSeenRev(5), 1, 12), 1, 7);
    expect(appliedRev(low, 1)).toBe(7);
    expect(applyListRev(low, 1, 6)).toBe(low);
    expect(appliedRev(applyListRev(state, 1, 4), 1)).toBe(9);
  });

  it("forget drops the applied rev back to the applied base too", () => {
    const state = applyListRev(resetSeenRev(2), 1, 9);
    const forgot = forgetSeenRev(state, 1);
    expect(appliedRev(forgot, 1)).toBe(2);
    expect(seenRev(forgot, 1)).toBe(2);
    const appliedOnly = { ...resetSeenRev(2), appliedBySession: new Map([[1, 8]]) };
    expect(appliedRev(forgetSeenRev(appliedOnly, 1), 1)).toBe(2);
  });
});
