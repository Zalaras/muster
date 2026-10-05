import { describe, expect, it } from "vitest";
import type { Group } from "../protocol/groups";
import { makeSession } from "../sessions/testfixtures";
import {
  defaultGroupValue,
  groupChoice,
  groupOptions,
  groupOptionsKey,
  keepGroupValue,
  NEW_GROUP_VALUE,
  NO_GROUP_VALUE,
} from "./launchgroupchoice";

const group = (id: number, pos: number, name = `group-${id}`): Group => ({
  id,
  name,
  pos,
  collapsed: false,
});

describe("groupOptions — the launch dialog's Group select (kb:anchor/sessions.create)", () => {
  it("with no groups offers No group and New group… only", () => {
    expect(groupOptions([])).toEqual([
      { value: NO_GROUP_VALUE, label: "No group" },
      { value: NEW_GROUP_VALUE, label: "New group…" },
    ]);
  });

  it("lists every group in rail order between them, valued by its id", () => {
    const options = groupOptions([group(5, 2), group(3, 0, "PR reviews"), group(8, 1)]);
    expect(options).toEqual([
      { value: "none", label: "No group" },
      { value: "3", label: "PR reviews" },
      { value: "8", label: "group-8" },
      { value: "5", label: "group-5" },
      { value: "new", label: "New group…" },
    ]);
  });

  it("does not reorder the array it is given", () => {
    const groups = [group(5, 2), group(3, 0)];
    groupOptions(groups);
    expect(groups.map((g) => g.id)).toEqual([5, 3]);
  });

  it("a group may share a name with another: both are offered, told apart by value", () => {
    const options = groupOptions([group(1, 0, "dup"), group(2, 1, "dup")]);
    expect(options.filter((o) => o.label === "dup").map((o) => o.value)).toEqual(["1", "2"]);
  });
});

describe("groupOptionsKey — rebuild the select only when its options change", () => {
  it("is equal for the same options and different when a name, id or order changes", () => {
    const base = groupOptions([group(3, 0), group(5, 1)]);
    expect(groupOptionsKey(groupOptions([group(3, 0), group(5, 1)]))).toBe(groupOptionsKey(base));
    expect(groupOptionsKey(groupOptions([group(3, 0, "renamed"), group(5, 1)]))).not.toBe(
      groupOptionsKey(base),
    );
    expect(groupOptionsKey(groupOptions([group(3, 1), group(5, 0)]))).not.toBe(
      groupOptionsKey(base),
    );
    expect(groupOptionsKey(groupOptions([group(3, 0)]))).not.toBe(groupOptionsKey(base));
  });

  it("does not change when only a group's collapsed state does: the select never shows it", () => {
    expect(groupOptionsKey(groupOptions([{ ...group(3, 0), collapsed: true }]))).toBe(
      groupOptionsKey(groupOptions([group(3, 0)])),
    );
  });
});

describe("defaultGroupValue — what a fresh open holds", () => {
  const groups = [group(3, 0), group(5, 1)];

  it("is the focused session's group", () => {
    expect(defaultGroupValue(makeSession({ id: 1, groupId: 5 }), groups)).toBe("5");
  });

  it("is No group for an ungrouped focused session", () => {
    expect(defaultGroupValue(makeSession({ id: 1 }), groups)).toBe(NO_GROUP_VALUE);
  });

  it("is No group with nothing focused", () => {
    expect(defaultGroupValue(null, groups)).toBe(NO_GROUP_VALUE);
  });

  it("is No group when the focused session names a group the dashboard does not know", () => {
    expect(defaultGroupValue(makeSession({ id: 1, groupId: 99 }), groups)).toBe(NO_GROUP_VALUE);
  });
});

describe("keepGroupValue — the choice survives the options changing under an open dialog", () => {
  it("keeps the current value while it still exists", () => {
    const options = groupOptions([group(3, 0), group(5, 1)]);
    expect(keepGroupValue("5", options)).toBe("5");
    expect(keepGroupValue(NEW_GROUP_VALUE, options)).toBe(NEW_GROUP_VALUE);
    expect(keepGroupValue(NO_GROUP_VALUE, options)).toBe(NO_GROUP_VALUE);
  });

  it("falls back to No group when the chosen group was deleted", () => {
    expect(keepGroupValue("5", groupOptions([group(3, 0)]))).toBe(NO_GROUP_VALUE);
  });
});

describe("groupChoice — what the launch request carries", () => {
  it("No group sends neither field", () => {
    expect(groupChoice(NO_GROUP_VALUE, "")).toEqual({ ok: true, group: {} });
  });

  it("No group ignores a name typed earlier under New group…", () => {
    expect(groupChoice(NO_GROUP_VALUE, "stale")).toEqual({ ok: true, group: {} });
  });

  it("a group sends its id as a number and no newGroup (the daemon refuses both together)", () => {
    const choice = groupChoice("5", "ignored");
    expect(choice).toEqual({ ok: true, group: { groupId: 5 } });
    expect(choice.ok && "newGroup" in choice.group).toBe(false);
  });

  it("New group… sends the trimmed name as newGroup and no groupId", () => {
    const choice = groupChoice(NEW_GROUP_VALUE, "  Hotfix  ");
    expect(choice).toEqual({ ok: true, group: { newGroup: "Hotfix" } });
    expect(choice.ok && "groupId" in choice.group).toBe(false);
  });

  it.each(["", "   ", "\t\n"])(
    "New group… with the blank name %j is refused before any request",
    (name) => {
      expect(groupChoice(NEW_GROUP_VALUE, name)).toEqual({
        ok: false,
        message: "Enter a name for the new group.",
      });
    },
  );

  it("a value that is no group id (a stale option) sends neither field, like No group", () => {
    expect(groupChoice("nonsense", "")).toEqual({ ok: true, group: {} });
    expect(groupChoice("1.5", "")).toEqual({ ok: true, group: {} });
  });

  it("does not bound the name's length: the daemon owns 1-40 and answers 400", () => {
    const long = "x".repeat(60);
    expect(groupChoice(NEW_GROUP_VALUE, long)).toEqual({ ok: true, group: { newGroup: long } });
  });
});
