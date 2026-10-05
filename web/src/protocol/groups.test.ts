import { describe, expect, it } from "vitest";
import {
  emptyGroupsFields,
  parseGroup,
  parseGroupsMessage,
  parseSnapshotGroups,
  parseUngroupedLayout,
} from "./groups";

const group = { id: 3, name: "PR reviews", pos: 0, collapsed: false };

describe("parseGroup (kb:anchor/ws.groups)", () => {
  it("parses a group and keeps exactly its four fields", () => {
    expect(parseGroup({ ...group, extra: "ignored" })).toEqual(group);
  });

  it("parses a collapsed group", () => {
    expect(parseGroup({ ...group, collapsed: true })).toEqual({ ...group, collapsed: true });
  });

  it("keeps the name as sent: trimming and the 1-40 bound are the daemon's", () => {
    expect(parseGroup({ ...group, name: "" })?.name).toBe("");
    expect(parseGroup({ ...group, name: "  padded  " })?.name).toBe("  padded  ");
  });

  it.each([null, undefined, "group", 3, [], [group]])("rejects the non-object %p", (value) => {
    expect(parseGroup(value)).toBeNull();
  });

  it.each([
    ["id missing", { name: "a", pos: 0, collapsed: false }],
    ["id a string", { ...group, id: "3" }],
    ["id a fraction", { ...group, id: 3.5 }],
    ["id null", { ...group, id: null }],
    ["name missing", { id: 3, pos: 0, collapsed: false }],
    ["name null", { ...group, name: null }],
    ["name a number", { ...group, name: 3 }],
    ["pos missing", { id: 3, name: "a", collapsed: false }],
    ["pos a string", { ...group, pos: "0" }],
    ["collapsed missing", { id: 3, name: "a", pos: 0 }],
    ["collapsed a string", { ...group, collapsed: "false" }],
    ["collapsed null", { ...group, collapsed: null }],
  ])("rejects a group with %s", (_label, value) => {
    expect(parseGroup(value)).toBeNull();
  });
});

describe("parseUngroupedLayout (kb:anchor/ws.groups)", () => {
  it("parses the Ungrouped place and collapsed state, with no id", () => {
    expect(parseUngroupedLayout({ pos: 2, collapsed: true, id: 0 })).toEqual({
      pos: 2,
      collapsed: true,
    });
  });

  it.each([
    null,
    "x",
    [],
    {},
    { pos: 1 },
    { collapsed: false },
    { pos: "1", collapsed: false },
    { pos: 1, collapsed: 0 },
  ])("rejects %p", (value) => {
    expect(parseUngroupedLayout(value)).toBeNull();
  });
});

describe("parseGroupsMessage (kb:anchor/ws.groups)", () => {
  it("parses both keys into a groups message", () => {
    expect(
      parseGroupsMessage({ groups: [group], ungrouped: { pos: 1, collapsed: false } }),
    ).toEqual({ type: "groups", groups: [group], ungrouped: { pos: 1, collapsed: false } });
  });

  it("is strict: a groups message with neither key is not an empty rail, it is rejected", () => {
    expect(parseGroupsMessage({})).toBeNull();
  });

  it("rejects when either key is missing or one element is malformed", () => {
    expect(parseGroupsMessage({ groups: [group] })).toBeNull();
    expect(parseGroupsMessage({ ungrouped: { pos: 0, collapsed: false } })).toBeNull();
    expect(
      parseGroupsMessage({ groups: [group, { id: 1 }], ungrouped: { pos: 0, collapsed: false } }),
    ).toBeNull();
  });
});

describe("parseSnapshotGroups (kb:anchor/ws.snapshot)", () => {
  it("neither key (an older daemon) is the empty rail: no groups, Ungrouped last and expanded", () => {
    expect(parseSnapshotGroups({})).toEqual({
      groups: [],
      ungrouped: { pos: 0, collapsed: false },
    });
  });

  it("parses both keys when present", () => {
    expect(
      parseSnapshotGroups({ groups: [group], ungrouped: { pos: 1, collapsed: true } }),
    ).toEqual({
      groups: [group],
      ungrouped: { pos: 1, collapsed: true },
    });
  });

  it("one key without the other is rejected, not defaulted", () => {
    expect(parseSnapshotGroups({ groups: [group] })).toBeNull();
    expect(parseSnapshotGroups({ ungrouped: { pos: 0, collapsed: false } })).toBeNull();
  });

  it("a present-but-null key is malformed, not absent", () => {
    expect(parseSnapshotGroups({ groups: null, ungrouped: null })).toBeNull();
  });
});

describe("emptyGroupsFields", () => {
  it("returns a fresh object each call, so one consumer's write cannot reach another's", () => {
    const a = emptyGroupsFields();
    const b = emptyGroupsFields();
    expect(a).toEqual(b);
    expect(a.groups).not.toBe(b.groups);
    expect(a.ungrouped).not.toBe(b.ungrouped);
  });
});
