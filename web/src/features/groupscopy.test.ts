import { describe, expect, it } from "vitest";
import {
  batchReport,
  DELETE_CHOICES,
  DELETE_CONFIRM_LABEL,
  deleteGroupBody,
  deleteGroupTitle,
  MENU_LABELS,
  NEW_GROUP_CHORD,
  newGroupFromTitle,
  railCountText,
  removeManyBody,
  removeManyConfirm,
  removeManyTitle,
  selectAllLabel,
  selectionCount,
  stopManyBody,
  stopManyConfirm,
  stopManyTitle,
} from "./groupscopy";

// The strings below are transcribed from the plan's Testable UI Elements table, not read back from
// the module: the e2e specs and the table are what a regression would drift from.
describe("groupscopy — bulk Stop (W12)", () => {
  it.each([
    [1, "Stop 1 session?", "Stop 1"],
    [2, "Stop 2 sessions?", "Stop 2"],
    [12, "Stop 12 sessions?", "Stop 12"],
  ])("for %i sessions the dialog reads %j and its button %j", (n, title, confirm) => {
    expect(stopManyTitle(n)).toBe(title);
    expect(stopManyConfirm(n)).toBe(confirm);
  });

  it("the body explains that a stopped session stays, resumable", () => {
    expect(stopManyBody(false)).toBe(
      "Each is stopped the way Stop does: it stays in the rail as ended and can be resumed.",
    );
  });

  it("a header's Stop all… adds that the group stays; the selection bar's does not", () => {
    expect(stopManyBody(true)).toBe(`${stopManyBody(false)} The group stays.`);
    expect(stopManyBody(false)).not.toContain("group");
  });
});

describe("groupscopy — bulk Remove (W12)", () => {
  it.each([
    [1, "Remove 1 session?", "Remove 1"],
    [2, "Remove 2 sessions?", "Remove 2"],
    [30, "Remove 30 sessions?", "Remove 30"],
  ])("for %i sessions the dialog reads %j and its button %j", (n, title, confirm) => {
    expect(removeManyTitle(n)).toBe(title);
    expect(removeManyConfirm(n)).toBe(confirm);
  });

  it("with live sessions the body says how many are stopped first", () => {
    expect(removeManyBody(2)).toBe(
      "2 of them are alive and will be stopped first. A removed session cannot be resumed.",
    );
    expect(removeManyBody(1)).toBe(
      "1 of them are alive and will be stopped first. A removed session cannot be resumed.",
    );
  });

  it("with none alive the stopped-first sentence is absent", () => {
    expect(removeManyBody(0)).toBe("A removed session cannot be resumed.");
  });

  it.each([0, 1, 2, 9])("every body matches the table's pattern for %i live", (live) => {
    expect(removeManyBody(live)).toMatch(
      /^(\d+ of them are alive and will be stopped first\. )?A removed session cannot be resumed\.$/,
    );
  });
});

describe("groupscopy — delete group (W12)", () => {
  it("titles the dialog with the group's name in curly quotes", () => {
    expect(deleteGroupTitle("PR reviews")).toBe("Delete group “PR reviews”?");
  });

  it("puts the name as sent in the title: no trimming, no escaping, it goes to textContent", () => {
    expect(deleteGroupTitle(`<b>"x"</b>`)).toBe(`Delete group “<b>"x"</b>”?`);
  });

  it("an empty group has nothing to choose and says nothing else changes", () => {
    expect(deleteGroupBody(0)).toBe("The group is empty; nothing else changes.");
  });

  it("a group with members asks what happens to them, singular at 1", () => {
    expect(deleteGroupBody(1)).toBe("The group goes away. Choose what happens to its 1 session.");
    expect(deleteGroupBody(4)).toBe("The group goes away. Choose what happens to its 4 sessions.");
  });

  it("the three radios are named as the table states, and the confirm is `Delete group`", () => {
    expect(DELETE_CHOICES.ungroup.label).toBe("Move them to Ungrouped");
    expect(DELETE_CHOICES.move.label).toBe("Move them to another group");
    expect(DELETE_CHOICES.remove.label).toBe("Stop and remove them");
    expect(DELETE_CONFIRM_LABEL).toBe("Delete group");
  });

  it("every radio has a hint that is separate from its name (the hint is sibling text)", () => {
    for (const choice of Object.values(DELETE_CHOICES)) {
      expect(choice.hint).not.toBe("");
      expect(choice.hint).not.toContain(choice.label);
    }
  });
});

describe("groupscopy — menu, count and select text", () => {
  it("the rail and header menu items read as the table states", () => {
    expect(MENU_LABELS.newGroup).toBe("New group…");
    expect(MENU_LABELS.collapseAll).toBe("Collapse all groups");
    expect(MENU_LABELS.expandAll).toBe("Expand all groups");
    expect(MENU_LABELS.rename).toBe("Rename");
    expect(MENU_LABELS.collapse).toBe("Collapse");
    expect(MENU_LABELS.expand).toBe("Expand");
    expect(MENU_LABELS.stopAll).toBe("Stop all…");
    expect(MENU_LABELS.ungroup).toBe("Ungroup");
    expect(MENU_LABELS.deleteGroup).toBe("Delete group…");
    expect(MENU_LABELS.moveTo).toBe("Move to");
  });

  it("the Move to menu's destinations: `Ungrouped` from the bar, `No group` from the mainhead", () => {
    expect(MENU_LABELS.ungrouped).toBe("Ungrouped");
    expect(MENU_LABELS.noGroup).toBe("No group");
  });

  it("the rail menu shows the ⌥⌘G chord", () => {
    expect(NEW_GROUP_CHORD).toBe("⌥⌘G");
  });

  it("Select all (n)", () => {
    expect(selectAllLabel(0)).toBe("Select all (0)");
    expect(selectAllLabel(5)).toBe("Select all (5)");
  });

  it("the selection count reads `n selected`, and prompts at zero", () => {
    expect(selectionCount(0)).toBe("Select sessions");
    expect(selectionCount(1)).toBe("1 selected");
    expect(selectionCount(7)).toBe("7 selected");
  });

  it("matches the table's patterns for the count", () => {
    for (const n of [1, 2, 10]) expect(selectionCount(n)).toMatch(/^\d+ selected$/);
  });

  it("the new-group dialog names how many sessions go in, singular at 1", () => {
    expect(newGroupFromTitle(1)).toBe("New group from 1 session");
    expect(newGroupFromTitle(3)).toBe("New group from 3 sessions");
  });
});

describe("groupscopy — rail count", () => {
  it("is the plain total when the filter hides nothing", () => {
    expect(railCountText(5, 5, false)).toBe("5");
  });

  it("reads `n of m` while the filter hides a card", () => {
    expect(railCountText(3, 5, true)).toBe("3 of 5");
    expect(railCountText(0, 5, true)).toBe("0 of 5");
  });

  it("reads 0 with no sessions at all", () => {
    expect(railCountText(0, 0, false)).toBe("0");
    expect(railCountText(0, 0, true)).toBe("0");
  });

  it.each([
    ["the plain total", railCountText(4, 4, false)],
    ["`n of m`", railCountText(2, 4, true)],
  ])("matches the table's pattern for %s", (_label, text) => {
    expect(text).toMatch(/^\d+$|^\d+ of \d+$/);
  });
});

describe("groupscopy — batchReport (REQ-27)", () => {
  const phrase = "Not every session was handled — some were skipped or failed.";

  it("is null for a batch that did everything it was asked", () => {
    expect(batchReport({ done: [1, 2], skipped: [], failed: [] })).toBeNull();
    expect(batchReport({ done: [], skipped: [], failed: [] })).toBeNull();
  });

  it("reports a skipped id", () => {
    expect(batchReport({ done: [1], skipped: [2], failed: [] })).toBe(phrase);
  });

  it("reports a failed id", () => {
    expect(batchReport({ done: [1], skipped: [], failed: [2] })).toBe(phrase);
  });

  it("reports both, in the same fixed phrase, and never lists ids", () => {
    const text = batchReport({ done: [], skipped: [41], failed: [42] });
    expect(text).toBe(phrase);
    expect(text).not.toMatch(/4[12]/);
  });
});
