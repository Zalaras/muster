import { describe, expect, it } from "vitest";
import {
  CARD_MENU_LABELS,
  type CardMenuAction,
  cardMenuItems,
  selectionMenuItems,
} from "./railmenuitems";

const UP = { connected: true, busy: false };

const markRows = (items: { marks: CardMenuAction[] }) =>
  items.marks.map((m) => [m.label, m.danger, m.disabled]);

describe("cardMenuItems (REQ-2, REQ-3, REQ-10, W5)", () => {
  it("a live session offers Stop… then Remove…, Remove danger", () => {
    const items = cardMenuItems({ alive: true, claudeSessionId: "c", pinned: false }, UP);
    expect(items.actions.map((a) => [a.label, a.action, a.danger])).toEqual([
      ["Stop…", "end", false],
      ["Remove…", "remove", true],
    ]);
  });

  it.each([
    ["live", { alive: true, claudeSessionId: "c", pinned: false }],
    ["ended resumable", { alive: false, claudeSessionId: "c", pinned: true }],
    ["ended unbound", { alive: false, claudeSessionId: null, pinned: false }],
  ])("a %s card offers Mark as read and Mark as unread, non-danger and enabled", (_n, session) => {
    expect(markRows(cardMenuItems(session, UP))).toEqual([
      ["Mark as read", false, false],
      ["Mark as unread", false, false],
    ]);
  });

  it.each([
    ["disconnected", { connected: false, busy: false }],
    ["in flight", { connected: true, busy: true }],
  ])("the mark entries are disabled while %s", (_n, state) => {
    const rows = markRows(
      cardMenuItems({ alive: true, claudeSessionId: null, pinned: false }, state),
    );
    expect(rows).toEqual([
      ["Mark as read", false, true],
      ["Mark as unread", false, true],
    ]);
  });

  it("an ended resumable session offers Resume then Remove…, Remove danger", () => {
    const items = cardMenuItems({ alive: false, claudeSessionId: "c", pinned: false }, UP);
    expect(items.actions.map((a) => [a.label, a.action, a.danger])).toEqual([
      ["Resume", "resume", false],
      ["Remove…", "remove", true],
    ]);
  });

  it("an ended session without a Claude session id has no Resume at all", () => {
    const items = cardMenuItems({ alive: false, claudeSessionId: null, pinned: false }, UP);
    expect(items.actions.map((a) => a.label)).toEqual(["Remove…"]);
  });

  // The primary Stop/Resume entry for every {alive, claudeSessionId, connected} cell
  // (kb:adr/actions-mainhead-one-stop-resume-button); an ended unbound session has none.
  it.each([
    [true, "c", true, ["Stop…", "end", false]],
    [true, "c", false, ["Stop…", "end", true]],
    [true, null, true, ["Stop…", "end", false]],
    [true, null, false, ["Stop…", "end", true]],
    [false, "c", true, ["Resume", "resume", false]],
    [false, "c", false, ["Resume", "resume", true]],
    [false, null, true, undefined],
    [false, null, false, undefined],
  ])("alive=%s claudeSessionId=%s connected=%s -> primary %j", (alive, id, connected, want) => {
    const items = cardMenuItems(
      { alive, claudeSessionId: id, pinned: false },
      { connected, busy: false },
    );
    const first = items.actions.find((a) => a.action !== "remove");
    const primary = first && [first.label, first.action, first.disabled];
    expect(primary).toEqual(want);
  });

  it.each([
    [false, CARD_MENU_LABELS.pin],
    [true, CARD_MENU_LABELS.unpin],
  ])("pinned=%s reads %s", (pinned, label) => {
    expect(cardMenuItems({ alive: true, claudeSessionId: null, pinned }, UP).pin.label).toBe(label);
  });

  it("enabled while connected and idle", () => {
    const items = cardMenuItems({ alive: false, claudeSessionId: "c", pinned: false }, UP);
    expect(items.actions.every((a) => !a.disabled)).toBe(true);
    expect(items.pin.disabled).toBe(false);
    expect(items.moveDisabled).toBe(false);
  });

  it.each([
    ["disconnected", { connected: false, busy: false }],
    ["in flight", { connected: true, busy: true }],
  ])("every item is disabled while %s", (_name, state) => {
    const items = cardMenuItems({ alive: false, claudeSessionId: "c", pinned: true }, state);
    expect(items.actions.every((a) => a.disabled)).toBe(true);
    expect(items.pin.disabled).toBe(true);
    expect(items.moveDisabled).toBe(true);
  });
});

// Plan bugs-one-batch-1 (REQ-3, W1). Shape assumed from the plan:
// `selectionMenuItems(sessions: Pick<Session, "alive">[], state: CardMenuState)` returns
// `{ label, actions: CardMenuAction[], moveDisabled }`; no pin, no Resume.
const LIVE = { alive: true };
const ENDED = { alive: false };

describe("selectionMenuItems (REQ-3, W1)", () => {
  it.each([
    ["all live", [LIVE, LIVE], ["Stop…", "Remove…"]],
    ["all ended", [ENDED, ENDED], ["Remove…"]],
    ["mixed", [LIVE, ENDED], ["Stop…", "Remove…"]],
  ])("%s shows %j", (_name, sessions, labels) => {
    expect(selectionMenuItems(sessions, UP).actions.map((a) => a.label)).toEqual(labels);
  });

  it.each([
    ["all live", [LIVE, LIVE]],
    ["all ended", [ENDED]],
    ["mixed", [LIVE, ENDED]],
  ])("%s still shows Mark as read and Mark as unread, enabled", (_n, sessions) => {
    expect(markRows(selectionMenuItems(sessions, UP))).toEqual([
      ["Mark as read", false, false],
      ["Mark as unread", false, false],
    ]);
  });

  it("the mark entries are disabled while disconnected", () => {
    const rows = markRows(selectionMenuItems([LIVE], { connected: false, busy: false }));
    expect(rows.map((r) => r[2])).toEqual([true, true]);
  });

  it("never offers Resume or Pin", () => {
    const items = selectionMenuItems([LIVE, ENDED], UP);
    expect(items.actions.map((a) => a.label)).not.toContain("Resume");
    expect(items).not.toHaveProperty("pin");
  });

  it.each([
    [[LIVE], "Actions for 1 session"],
    [[LIVE, LIVE], "Actions for 2 sessions"],
    [[LIVE, ENDED, LIVE], "Actions for 3 sessions"],
  ])("names the count in the label for %j", (sessions, label) => {
    expect(selectionMenuItems(sessions, UP).label).toBe(label);
  });

  it("Remove… is the danger item and maps to the remove action", () => {
    const items = selectionMenuItems([ENDED, ENDED], UP);
    expect(items.actions.map((a) => [a.action, a.danger])).toEqual([["remove", true]]);
  });

  it("enabled while connected and idle", () => {
    const items = selectionMenuItems([LIVE, ENDED], UP);
    expect(items.actions.every((a) => !a.disabled)).toBe(true);
    expect(items.moveDisabled).toBe(false);
  });

  it.each([
    ["disconnected", { connected: false, busy: false }],
    ["in flight", { connected: true, busy: true }],
  ])("every item is disabled while %s", (_name, state) => {
    const items = selectionMenuItems([LIVE, ENDED], state);
    expect(items.actions.every((a) => a.disabled)).toBe(true);
    expect(items.moveDisabled).toBe(true);
  });
});
