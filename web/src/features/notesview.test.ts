import { describe, expect, it } from "vitest";
import type { ConnectionStatus } from "../app";
import { CONNECTING_WORD } from "./connectionhealth";
import {
  adoptIncoming,
  UNREACHABLE_TEXT,
  UNSAVED_TEXT,
  unsavedStatus,
  windowStatus,
} from "./notesview";

describe("windowStatus", () => {
  it.each<[string, ConnectionStatus, boolean, string, string]>([
    ["failed save beats connected", "connected", true, UNSAVED_TEXT, "warn"],
    ["failed save beats reconnecting", "reconnecting", true, UNSAVED_TEXT, "warn"],
    ["failed save beats connecting", "connecting", true, UNSAVED_TEXT, "warn"],
    ["reconnecting reads musterd unreachable", "reconnecting", false, UNREACHABLE_TEXT, "warn"],
    ["before first hello reads connecting", "connecting", false, CONNECTING_WORD, "info"],
    ["connected and saved is empty", "connected", false, "", "warn"],
  ])("%s", (_label, connection, failed, text, kind) => {
    expect(windowStatus(connection, failed)).toEqual({ text, kind });
  });

  it("uses the agreed words", () => {
    expect(UNREACHABLE_TEXT).toBe("musterd unreachable");
    expect(CONNECTING_WORD).toBe("connecting…");
  });
});

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
