import { describe, expect, it } from "vitest";
import type { RailSort, Session, SessionState } from "../protocol";
import { orderRail, sortSessions } from "./sort";

// Minimal valid Session fixture; each test overrides only the fields it cares about.
function makeSession(overrides: Partial<Session> & { id: number }): Session {
  return {
    title: null,
    state: "idle",
    stateSince: "2026-08-22T00:00:00Z",
    alive: true,
    endedAt: null,
    attention: null,
    failure: null,
    directory: "/tmp/repo",
    repo: null,
    model: null,
    permissionMode: { value: "default", source: "seed" },
    context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
    lastActivity: null,
    claudeSessionId: null,
    tmuxTarget: "muster:@1",
    firstLaunchHere: false,
    createdAt: "2026-08-22T00:00:00Z",
    pinned: false,
    railPos: overrides.id,
    ...overrides,
  };
}

describe("sortSessions — state priority (REQ-16)", () => {
  it("orders needs_input, failed, planning, working, started, idle", () => {
    const sessions = [
      makeSession({ id: 1, state: "idle", stateSince: "2026-08-22T00:00:00Z" }),
      makeSession({ id: 2, state: "started", stateSince: "2026-08-22T00:00:00Z" }),
      makeSession({ id: 3, state: "working", stateSince: "2026-08-22T00:00:00Z" }),
      makeSession({ id: 4, state: "planning", stateSince: "2026-08-22T00:00:00Z" }),
      makeSession({ id: 5, state: "failed", stateSince: "2026-08-22T00:00:00Z" }),
      makeSession({
        id: 6,
        state: "needs_input",
        stateSince: "2026-08-22T00:00:00Z",
        attention: { reason: "permission", since: "2026-08-22T00:00:00Z" },
      }),
    ];
    const sorted = sortSessions(sessions).map((s) => s.id);
    expect(sorted).toEqual([6, 5, 4, 3, 2, 1]);
  });

  it("never mutates the input array", () => {
    const sessions = [makeSession({ id: 2 }), makeSession({ id: 1 })];
    const original = [...sessions];
    sortSessions(sessions);
    expect(sessions).toEqual(original);
  });
});

describe("sortSessions — needs_input: longest-blocked (oldest attention.since) first", () => {
  it("orders by attention.since ascending", () => {
    const sessions = [
      makeSession({
        id: 1,
        state: "needs_input",
        attention: { reason: "permission", since: "2026-08-22T00:05:00Z" },
      }),
      makeSession({
        id: 2,
        state: "needs_input",
        attention: { reason: "idle", since: "2026-08-22T00:01:00Z" },
      }),
      makeSession({
        id: 3,
        state: "needs_input",
        attention: { reason: "permission", since: "2026-08-22T00:03:00Z" },
      }),
    ];
    expect(sortSessions(sessions).map((s) => s.id)).toEqual([2, 3, 1]);
  });

  it("treats a needs_input session with null attention as least urgent within its group (defensive — shouldn't happen per protocol)", () => {
    const sessions = [
      makeSession({
        id: 1,
        state: "needs_input",
        attention: { reason: "permission", since: "2026-08-22T00:05:00Z" },
      }),
      makeSession({ id: 2, state: "needs_input", attention: null }),
    ];
    expect(sortSessions(sessions).map((s) => s.id)).toEqual([1, 2]);
  });
});

describe("sortSessions — failed: most-recent (stateSince) first", () => {
  it("orders by stateSince descending", () => {
    const sessions = [
      makeSession({ id: 1, state: "failed", stateSince: "2026-08-22T00:01:00Z" }),
      makeSession({ id: 2, state: "failed", stateSince: "2026-08-22T00:05:00Z" }),
      makeSession({ id: 3, state: "failed", stateSince: "2026-08-22T00:03:00Z" }),
    ];
    expect(sortSessions(sessions).map((s) => s.id)).toEqual([2, 3, 1]);
  });
});

describe("sortSessions — planning/working/started: stateSince ascending", () => {
  it.each(["planning", "working", "started"] as const)("orders %s sessions by stateSince ascending", (state) => {
    const sessions = [
      makeSession({ id: 1, state, stateSince: "2026-08-22T00:05:00Z" }),
      makeSession({ id: 2, state, stateSince: "2026-08-22T00:01:00Z" }),
      makeSession({ id: 3, state, stateSince: "2026-08-22T00:03:00Z" }),
    ];
    expect(sortSessions(sessions).map((s) => s.id)).toEqual([2, 3, 1]);
  });
});

describe("sortSessions — idle: longest-idle (stateSince ascending) first", () => {
  it("orders idle sessions by stateSince ascending", () => {
    const sessions = [
      makeSession({ id: 1, state: "idle", stateSince: "2026-08-22T00:05:00Z" }),
      makeSession({ id: 2, state: "idle", stateSince: "2026-08-22T00:01:00Z" }),
    ];
    expect(sortSessions(sessions).map((s) => s.id)).toEqual([2, 1]);
  });
});

describe("sortSessions — tiebreak by id", () => {
  it("breaks an exact stateSince tie by ascending id", () => {
    const sessions = [
      makeSession({ id: 5, state: "working", stateSince: "2026-08-22T00:00:00Z" }),
      makeSession({ id: 2, state: "working", stateSince: "2026-08-22T00:00:00Z" }),
      makeSession({ id: 3, state: "working", stateSince: "2026-08-22T00:00:00Z" }),
    ];
    expect(sortSessions(sessions).map((s) => s.id)).toEqual([2, 3, 5]);
  });

  it("breaks a failed-group tie (identical stateSince) by ascending id too", () => {
    const sessions = [
      makeSession({ id: 5, state: "failed", stateSince: "2026-08-22T00:00:00Z" }),
      makeSession({ id: 2, state: "failed", stateSince: "2026-08-22T00:00:00Z" }),
    ];
    expect(sortSessions(sessions).map((s) => s.id)).toEqual([2, 5]);
  });

  it("breaks a needs_input tie (identical attention.since) by ascending id", () => {
    const since = "2026-08-22T00:00:00Z";
    const sessions = [
      makeSession({ id: 5, state: "needs_input", attention: { reason: "idle", since } }),
      makeSession({ id: 2, state: "needs_input", attention: { reason: "permission", since } }),
    ];
    expect(sortSessions(sessions).map((s) => s.id)).toEqual([2, 5]);
  });
});

describe("sortSessions — unparsable stateSince/attention.since", () => {
  it("treats an unparsable stateSince as epoch 0 (sorts first within its ascending group), not a thrown error", () => {
    const sessions = [
      makeSession({ id: 1, state: "idle", stateSince: "2026-08-22T00:05:00Z" }),
      makeSession({ id: 2, state: "idle", stateSince: "not-a-date" }),
    ];
    expect(() => sortSessions(sessions)).not.toThrow();
    expect(sortSessions(sessions).map((s) => s.id)).toEqual([2, 1]);
  });
});

describe("sortSessions — ended sessions sort last, most-recently-ended first (REQ-9, plan m4-reconcile)", () => {
  it("puts every alive:false session after every alive:true session, regardless of state priority", () => {
    // id 3 is ended but in "needs_input" (highest live priority) — must still fall after
    // a live "idle" (lowest live priority) session.
    const sessions = [
      makeSession({ id: 1, state: "idle", alive: true }),
      makeSession({
        id: 2,
        state: "needs_input",
        alive: false,
        endedAt: "2026-08-22T00:10:00Z",
        attention: { reason: "permission", since: "2026-08-22T00:00:00Z" },
      }),
    ];
    expect(sortSessions(sessions).map((s) => s.id)).toEqual([1, 2]);
  });

  it("orders the ended group by endedAt descending (most-recently-ended first)", () => {
    const sessions = [
      makeSession({ id: 1, alive: false, endedAt: "2026-08-22T00:01:00Z" }),
      makeSession({ id: 2, alive: false, endedAt: "2026-08-22T00:05:00Z" }),
      makeSession({ id: 3, alive: false, endedAt: "2026-08-22T00:03:00Z" }),
    ];
    expect(sortSessions(sessions).map((s) => s.id)).toEqual([2, 3, 1]);
  });

  it("interleaves live and ended sessions correctly: all live (state-ordered) first, then all ended (recency-ordered)", () => {
    const sessions = [
      makeSession({ id: 1, alive: false, endedAt: "2026-08-22T00:01:00Z" }),
      makeSession({ id: 2, state: "idle", alive: true }),
      makeSession({ id: 3, alive: false, endedAt: "2026-08-22T00:05:00Z" }),
      makeSession({ id: 4, state: "needs_input", alive: true, attention: { reason: "idle", since: "2026-08-22T00:00:00Z" } }),
    ];
    expect(sortSessions(sessions).map((s) => s.id)).toEqual([4, 2, 3, 1]);
  });

  it("breaks a tie in endedAt by ascending id, same convention as the live groups", () => {
    const endedAt = "2026-08-22T00:05:00Z";
    const sessions = [
      makeSession({ id: 5, alive: false, endedAt }),
      makeSession({ id: 2, alive: false, endedAt }),
    ];
    expect(sortSessions(sessions).map((s) => s.id)).toEqual([2, 5]);
  });

  it("sorts a (defensive, can't happen per REQ-1/3/5's paired alive/endedAt invariant) null endedAt last within the ended group", () => {
    const sessions = [
      makeSession({ id: 1, alive: false, endedAt: "2026-08-22T00:01:00Z" }),
      makeSession({ id: 2, alive: false, endedAt: null }),
    ];
    expect(sortSessions(sessions).map((s) => s.id)).toEqual([1, 2]);
  });

  it("never mutates the input array when ended sessions are present", () => {
    const sessions = [makeSession({ id: 1, alive: false, endedAt: "2026-08-22T00:00:00Z" }), makeSession({ id: 2, alive: true })];
    const original = [...sessions];
    sortSessions(sessions);
    expect(sessions).toEqual(original);
  });
});

describe("orderRail — manual mode (plan order-sidebar REQ-6/W3): pinned first by railPos, then unpinned by railPos, id tiebreak", () => {
  it("orders the pinned block by railPos ascending, then the unpinned block by railPos ascending", () => {
    const sessions = [
      makeSession({ id: 1, pinned: false, railPos: 30 }),
      makeSession({ id: 2, pinned: true, railPos: 20 }),
      makeSession({ id: 3, pinned: false, railPos: 10 }),
      makeSession({ id: 4, pinned: true, railPos: 5 }),
    ];
    expect(orderRail(sessions, "manual").map((s) => s.id)).toEqual([4, 2, 3, 1]);
  });

  it("keeps every pinned session before every unpinned one regardless of railPos magnitude", () => {
    // A pinned session with a numerically LARGER railPos than an unpinned one must still
    // sort first — pinned-block-membership always wins over railPos ordering.
    const sessions = [makeSession({ id: 1, pinned: false, railPos: 1 }), makeSession({ id: 2, pinned: true, railPos: 100 })];
    expect(orderRail(sessions, "manual").map((s) => s.id)).toEqual([2, 1]);
  });

  it("breaks a railPos tie within the pinned block by ascending id", () => {
    const sessions = [makeSession({ id: 5, pinned: true, railPos: 1 }), makeSession({ id: 2, pinned: true, railPos: 1 })];
    expect(orderRail(sessions, "manual").map((s) => s.id)).toEqual([2, 5]);
  });

  it("breaks a railPos tie within the unpinned block by ascending id", () => {
    const sessions = [makeSession({ id: 5, pinned: false, railPos: 1 }), makeSession({ id: 2, pinned: false, railPos: 1 })];
    expect(orderRail(sessions, "manual").map((s) => s.id)).toEqual([2, 5]);
  });

  it("handles no pinned sessions (pure railPos/id order)", () => {
    const sessions = [makeSession({ id: 1, railPos: 3 }), makeSession({ id: 2, railPos: 1 }), makeSession({ id: 3, railPos: 2 })];
    expect(orderRail(sessions, "manual").map((s) => s.id)).toEqual([2, 3, 1]);
  });

  it("handles all pinned sessions (pure railPos/id order within the one block)", () => {
    const sessions = [
      makeSession({ id: 1, pinned: true, railPos: 3 }),
      makeSession({ id: 2, pinned: true, railPos: 1 }),
      makeSession({ id: 3, pinned: true, railPos: 2 }),
    ];
    expect(orderRail(sessions, "manual").map((s) => s.id)).toEqual([2, 3, 1]);
  });

  it("handles an empty session list", () => {
    expect(orderRail([], "manual")).toEqual([]);
  });
});

describe("orderRail — manual mode is state-independent (INV-3/W4)", () => {
  it("ignores state/alive/attention/stateSince entirely — order depends only on (pinned, railPos, id)", () => {
    const states: SessionState[] = ["started", "planning", "working", "needs_input", "failed", "idle"];
    const baseline = [
      makeSession({ id: 1, pinned: true, railPos: 2 }),
      makeSession({ id: 2, pinned: true, railPos: 1 }),
      makeSession({ id: 3, pinned: false, railPos: 20 }),
      makeSession({ id: 4, pinned: false, railPos: 10 }),
    ];
    const baselineOrder = orderRail(baseline, "manual").map((s) => s.id);

    for (const state of states) {
      for (const alive of [true, false]) {
        const permuted = baseline.map((s, i) => ({
          ...s,
          state,
          alive,
          endedAt: alive ? null : "2026-08-22T00:10:00Z",
          attention: state === "needs_input" ? { reason: "permission" as const, since: "2026-08-22T00:00:00Z" } : null,
          stateSince: `2026-08-2${i + 1}T00:00:00Z`,
        }));
        expect(orderRail(permuted, "manual").map((s) => s.id)).toEqual(baselineOrder);
      }
    }
  });
});

describe("orderRail — attention mode (plan order-sidebar REQ-6/W5/W6)", () => {
  it("keeps every pinned session before every unpinned one, including a pinned idle above an unpinned needs_input (INV-4)", () => {
    const sessions = [
      makeSession({ id: 1, pinned: false, state: "needs_input", attention: { reason: "permission", since: "2026-08-22T00:00:00Z" } }),
      makeSession({ id: 2, pinned: true, state: "idle", railPos: 1 }),
    ];
    expect(orderRail(sessions, "attention").map((s) => s.id)).toEqual([2, 1]);
  });

  it("orders the unpinned group exactly as sortSessions does", () => {
    const unpinned = [
      makeSession({ id: 1, pinned: false, state: "idle", stateSince: "2026-08-22T00:05:00Z" }),
      makeSession({ id: 2, pinned: false, state: "needs_input", attention: { reason: "idle", since: "2026-08-22T00:00:00Z" } }),
      makeSession({ id: 3, pinned: false, state: "failed", stateSince: "2026-08-22T00:03:00Z" }),
    ];
    const pinned = [makeSession({ id: 4, pinned: true, railPos: 1 })];
    const sessions = [...pinned, ...unpinned];

    const result = orderRail(sessions, "attention").map((s) => s.id);
    const expectedUnpinnedOrder = sortSessions(unpinned).map((s) => s.id);
    expect(result).toEqual([4, ...expectedUnpinnedOrder]);
  });

  it("orders the pinned block by railPos/id, same as manual mode", () => {
    const sessions = [
      makeSession({ id: 1, pinned: true, railPos: 2, state: "idle" }),
      makeSession({ id: 2, pinned: true, railPos: 1, state: "needs_input", attention: { reason: "idle", since: "2026-08-22T00:00:00Z" } }),
    ];
    // Even though id 2 would sort first by attention priority, the pinned block is
    // ordered by railPos, not state — attention priority never applies inside it.
    expect(orderRail(sessions, "attention").map((s) => s.id)).toEqual([2, 1]);
  });

  it("keeps the pinned block on top from every state mix (permuted like INV-3's manual check, but attention-ordering the unpinned group)", () => {
    const states: SessionState[] = ["started", "planning", "working", "needs_input", "failed", "idle"];
    for (const pinnedState of states) {
      for (const unpinnedState of states) {
        const sessions = [
          makeSession({
            id: 1,
            pinned: true,
            railPos: 1,
            state: pinnedState,
            attention: pinnedState === "needs_input" ? { reason: "idle", since: "2026-08-22T00:00:00Z" } : null,
          }),
          makeSession({
            id: 2,
            pinned: false,
            railPos: 2,
            state: unpinnedState,
            attention: unpinnedState === "needs_input" ? { reason: "idle", since: "2026-08-22T00:00:00Z" } : null,
          }),
        ];
        expect(orderRail(sessions, "attention").map((s) => s.id)).toEqual([1, 2]);
      }
    }
  });
});

describe("orderRail — never mutates its input (W9)", () => {
  it("does not mutate the input array in manual mode", () => {
    const sessions = [makeSession({ id: 2, railPos: 2 }), makeSession({ id: 1, railPos: 1 })];
    const original = [...sessions];
    orderRail(sessions, "manual");
    expect(sessions).toEqual(original);
  });

  it("does not mutate the input array in attention mode", () => {
    const sessions = [makeSession({ id: 2, railPos: 2, pinned: true }), makeSession({ id: 1, railPos: 1 })];
    const original = [...sessions];
    orderRail(sessions, "attention");
    expect(sessions).toEqual(original);
  });

  it("returns a new array, not the same reference, for either mode", () => {
    const sessions = [makeSession({ id: 1 })];
    const mode: RailSort = "manual";
    expect(orderRail(sessions, mode)).not.toBe(sessions);
  });
});
