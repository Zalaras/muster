import { describe, expect, it } from "vitest";
import { CARD_MENU_LABELS, cardMenuItems } from "./railmenuitems";

const UP = { connected: true, busy: false };

describe("cardMenuItems (REQ-2, REQ-3, REQ-10, W5)", () => {
  it("a live session offers only Stop…", () => {
    const items = cardMenuItems({ alive: true, claudeSessionId: "c", pinned: false }, UP);
    expect(items.actions.map((a) => a.label)).toEqual(["Stop…"]);
    expect(items.actions[0]?.action).toBe("end");
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
