import { describe, expect, it } from "vitest";
import { adoptIncoming, UNSAVED_TEXT, unsavedStatus } from "./notesview";

describe("adoptIncoming", () => {
  it.each([
    ["not editing: the incoming text replaces the shown text", "old", "new", false, "new"],
    ["editing: the shown text stays", "mine, half typed", "theirs", true, "mine, half typed"],
    ["not editing: an incoming clear replaces", "old", "", false, ""],
    ["editing: an incoming clear is ignored", "typing", "", true, "typing"],
    ["not editing: identical text stays", "same", "same", false, "same"],
  ])("%s", (_label, shown, incoming, editing, expected) => {
    expect(adoptIncoming(shown, incoming, editing)).toBe(expected);
  });
});

describe("unsavedStatus", () => {
  it("reads the warning text iff the latest save failed to reach musterd", () => {
    expect(unsavedStatus(true)).toBe("unsaved, musterd unreachable");
    expect(UNSAVED_TEXT).toBe("unsaved, musterd unreachable");
  });

  it("is empty once a later save succeeded (or none failed)", () => {
    expect(unsavedStatus(false)).toBe("");
  });
});
