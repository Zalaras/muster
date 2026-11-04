// The restart dialog's classification (W3): which sessions are offered, which restart now and
// which wait until free, the reason words and the confirm label. Pure, no DOM.
import { describe, expect, it } from "vitest";
import type { Session } from "../protocol/session";
import { makeSession } from "../sessions/testfixtures";
import {
  buildDialogModel,
  buildRestartPlan,
  isFree,
  isOfferedRestart,
  restartConfirmLabel,
  restartReason,
  sessionsRunOlder,
} from "./restartplan";

const BEHIND = { running: "2.1.316", behind: true };

function behindSession(id: number, overrides: Partial<Session> = {}): Session {
  return makeSession({ id, claudeVersion: BEHIND, ...overrides });
}

describe("isFree", () => {
  it.each<[string, Partial<Session>, boolean]>([
    ["idle with no tasks", { state: "idle", backgroundTasks: 0 }, true],
    ["failed", { state: "failed", backgroundTasks: 0 }, true],
    ["failed with tasks", { state: "failed", backgroundTasks: 2 }, true],
    ["idle with background tasks", { state: "idle", backgroundTasks: 1 }, false],
    ["working", { state: "working" }, false],
    ["planning", { state: "planning" }, false],
    ["needs_input", { state: "needs_input" }, false],
    ["started", { state: "started" }, false],
  ])("%s", (_label, overrides, expected) => {
    expect(isFree(makeSession({ id: 1, ...overrides }))).toBe(expected);
  });
});

describe("isOfferedRestart", () => {
  it.each<[string, Partial<Session>, boolean]>([
    ["alive and behind", {}, true],
    ["unknown version (no status post yet)", { claudeVersion: null }, false],
    ["current", { claudeVersion: { running: "2.1.318", behind: false } }, false],
    ["dead", { alive: false }, false],
    ["already pending", { restartPending: true }, false],
  ])("%s", (_label, overrides, expected) => {
    expect(isOfferedRestart(behindSession(1, overrides))).toBe(expected);
  });
});

describe("restartReason", () => {
  it.each<[Partial<Session>, string]>([
    [{ state: "idle" }, "idle"],
    [{ state: "failed" }, "failed"],
    [{ state: "working" }, "working"],
    [{ state: "planning" }, "planning"],
    [{ state: "needs_input" }, "waiting on you"],
    [{ state: "started" }, "starting"],
    [{ state: "idle", backgroundTasks: 1 }, "idle · 1 background task"],
    [{ state: "idle", backgroundTasks: 3 }, "idle · 3 background tasks"],
  ])("%j reads %s", (overrides, expected) => {
    expect(restartReason(makeSession({ id: 1, ...overrides }))).toBe(expected);
  });
});

describe("restartConfirmLabel", () => {
  it.each([
    [2, 3, "Restart 2, queue 3"],
    [1, 0, "Restart 1"],
    [0, 4, "Queue 4"],
    [5, 1, "Restart 5, queue 1"],
  ])("now %i queued %i reads %s", (now, queued, label) => {
    expect(restartConfirmLabel(now, queued)).toBe(label);
  });
});

describe("sessionsRunOlder", () => {
  it.each([
    [1, "1 live session runs"],
    [2, "2 live sessions run"],
    [14, "14 live sessions run"],
  ])("%i", (n, text) => {
    expect(sessionsRunOlder(n)).toBe(text);
  });
});

describe("buildRestartPlan", () => {
  it("returns null when no session is offered", () => {
    expect(buildRestartPlan([])).toBeNull();
    expect(
      buildRestartPlan([
        makeSession({ id: 1 }),
        behindSession(2, { restartPending: true }),
        behindSession(3, { alive: false }),
      ]),
    ).toBeNull();
  });

  it("splits free from busy, keeps listed order, excludes pending and current sessions", () => {
    const plan = buildRestartPlan([
      behindSession(1, { title: "a" }),
      behindSession(2, { title: "b", state: "working" }),
      behindSession(3, { title: null, state: "failed" }),
      behindSession(4, { state: "idle", backgroundTasks: 2 }),
      behindSession(5, { state: "planning", restartPending: true }),
      makeSession({ id: 6, claudeVersion: { running: "2.1.318", behind: false } }),
      behindSession(7, { state: "needs_input" }),
    ]);
    expect(plan).toEqual({
      now: [
        { id: 1, title: "a", reason: "idle" },
        { id: 3, title: "untitled", reason: "failed" },
      ],
      whenFree: [
        { id: 2, title: "b", reason: "working" },
        { id: 4, title: "session-4", reason: "idle · 2 background tasks" },
        { id: 7, title: "session-7", reason: "waiting on you" },
      ],
      ids: [1, 3, 2, 4, 7],
      confirmLabel: "Restart 2, queue 3",
    });
  });

  it("an all-free plan reads Restart N and an all-busy plan Queue M", () => {
    expect(buildRestartPlan([behindSession(1)])?.confirmLabel).toBe("Restart 1");
    expect(buildRestartPlan([behindSession(1, { state: "working" })])?.confirmLabel).toBe(
      "Queue 1",
    );
  });
});

describe("buildDialogModel", () => {
  it("names the installed version, the count and the label", () => {
    const plan = buildRestartPlan([behindSession(1), behindSession(2, { state: "working" })])!;
    const model = buildDialogModel(plan, "2.1.318");
    expect(model.title).toBe("Restart sessions on Claude Code 2.1.318");
    expect(model.intro).toContain("2 live sessions run an older Claude Code");
    expect(model.confirmLabel).toBe("Restart 1, queue 1");
    expect(model.now).toBe(plan.now);
    expect(model.whenFree).toBe(plan.whenFree);
  });

  it("uses the singular for one session", () => {
    const plan = buildRestartPlan([behindSession(1)])!;
    expect(buildDialogModel(plan, "2.1.318").intro).toContain("1 live session runs");
  });
});
