import { describe, expect, it } from "vitest";
import type { Session } from "../protocol";
import { buildCardViewModel } from "./card";

const NOW = new Date("2026-08-22T00:00:10Z");

function makeSession(overrides: Partial<Session> & { id: number }): Session {
  return {
    title: null,
    state: "idle",
    stateSince: "2026-08-22T00:00:00Z",
    alive: true,
    endedAt: null,
    attention: null,
    failure: null,
    directory: "/Users/damian/code/muster",
    repo: null,
    model: null,
    permissionMode: { value: "default", source: "seed" },
    context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
    lastActivity: null,
    claudeSessionId: null,
    tmuxTarget: "muster:@1",
    firstLaunchHere: false,
    createdAt: "2026-08-22T00:00:00Z",
    ...overrides,
  };
}

describe("buildCardViewModel — title (REQ-15 'untitled' fallback)", () => {
  it("renders the title verbatim when present", () => {
    const vm = buildCardViewModel(makeSession({ id: 1, title: "fix the thing" }), NOW);
    expect(vm.title).toBe("fix the thing");
  });

  it("renders 'untitled' when title is null", () => {
    const vm = buildCardViewModel(makeSession({ id: 1, title: null }), NOW);
    expect(vm.title).toBe("untitled");
  });
});

describe("buildCardViewModel — badge word and state class (every displayed state)", () => {
  it.each([
    ["started", "started", "s-start"],
    ["planning", "planning", "s-plan"],
    ["working", "working", "s-work"],
    ["needs_input", "needs input", "s-blocked"],
    ["failed", "failed", "s-failed"],
    ["idle", "idle", "s-idle"],
  ] as const)("maps state %s to badge %p and class %p", (state, badge, stateClass) => {
    const vm = buildCardViewModel(makeSession({ id: 1, state }), NOW);
    expect(vm.badge).toBe(badge);
    expect(vm.stateClass).toBe(stateClass);
  });

  it("badge word is always lowercase in the view-model (CSS may uppercase, per Testable UI Elements)", () => {
    const vm = buildCardViewModel(makeSession({ id: 1, state: "needs_input" }), NOW);
    expect(vm.badge).toBe(vm.badge.toLowerCase());
  });
});

describe("buildCardViewModel — repo / branch line", () => {
  it("renders 'name / branch' when repo is present with a branch", () => {
    const vm = buildCardViewModel(
      makeSession({ id: 1, repo: { name: "muster", branch: "main", isWorktree: false } }),
      NOW,
    );
    expect(vm.repoLine).toBe("muster / main");
  });

  it("renders an em-dash for a repo with no branch (git repo, detached or unreadable)", () => {
    const vm = buildCardViewModel(makeSession({ id: 1, repo: { name: "muster", branch: null, isWorktree: false } }), NOW);
    expect(vm.repoLine).toBe("muster / —");
  });

  it("appends a worktree marker when isWorktree is true", () => {
    const vm = buildCardViewModel(
      makeSession({ id: 1, repo: { name: "muster", branch: "feature/x", isWorktree: true } }),
      NOW,
    );
    expect(vm.repoLine).toBe("muster / feature/x (worktree)");
  });

  it("falls back to the directory basename when repo is null (REQ-15)", () => {
    const vm = buildCardViewModel(makeSession({ id: 1, repo: null, directory: "/Users/damian/code/muster" }), NOW);
    expect(vm.repoLine).toBe("muster");
  });

  it("handles a directory with a trailing slash when falling back to basename", () => {
    const vm = buildCardViewModel(makeSession({ id: 1, repo: null, directory: "/Users/damian/code/muster/" }), NOW);
    expect(vm.repoLine).toBe("muster");
  });
});

describe("buildCardViewModel — activity", () => {
  it("is null when lastActivity is null (no Stop yet)", () => {
    const vm = buildCardViewModel(makeSession({ id: 1, lastActivity: null }), NOW);
    expect(vm.activity).toBeNull();
  });

  it("prefixes lastActivity with 'last: ' when present", () => {
    const vm = buildCardViewModel(makeSession({ id: 1, lastActivity: "Fixed the bug." }), NOW);
    expect(vm.activity).toBe("last: Fixed the bug.");
  });
});

describe("buildCardViewModel — note precedence: attention > failure > first-launch", () => {
  // Review cycle 1 / Fix Attempt 2 (Major 4): the attention note now appends a
  // since-timer derived from `attention.since` (not `stateSince`) — plan line 287 +
  // design-system §3's escalating Needs-Input timer. NOW is 10s after `since` in these
  // fixtures, so `formatTimer` yields "00:10".
  it("shows the permission attention note with reason 'permission', plus the since-timer", () => {
    const vm = buildCardViewModel(
      makeSession({
        id: 1,
        state: "needs_input",
        attention: { reason: "permission", since: "2026-08-22T00:00:00Z" },
      }),
      NOW,
    );
    expect(vm.noteKind).toBe("attention");
    expect(vm.noteText).toBe("needs your permission — 00:10");
  });

  it("shows the idle attention note with reason 'idle', plus the since-timer", () => {
    const vm = buildCardViewModel(
      makeSession({
        id: 1,
        state: "needs_input",
        attention: { reason: "idle", since: "2026-08-22T00:00:00Z" },
      }),
      NOW,
    );
    expect(vm.noteKind).toBe("attention");
    expect(vm.noteText).toBe("waiting for your input — 00:10");
  });

  it("drives the since-timer from attention.since, not stateSince (they diverge on re-entry)", () => {
    // stateSince is far in the past (would format as "1h"); attention.since is recent
    // (30s ago -> "00:30"). If the note ever regresses to reading stateSince, this fails.
    const vm = buildCardViewModel(
      makeSession({
        id: 1,
        state: "needs_input",
        stateSince: "2026-08-21T22:00:00Z",
        attention: { reason: "permission", since: "2026-08-21T23:59:40Z" },
      }),
      NOW,
    );
    expect(vm.noteText).toBe("needs your permission — 00:30");
  });

  it("shows the raw failure token verbatim plus the human message (honesty rule 4 — never switched on)", () => {
    const vm = buildCardViewModel(
      makeSession({
        id: 1,
        state: "failed",
        failure: { error: "ETOOLERROR_9000", message: "Something a human can read." },
      }),
      NOW,
    );
    expect(vm.noteKind).toBe("failure");
    expect(vm.noteText).toBe("ETOOLERROR_9000 — Something a human can read.");
  });

  it("prefers attention over failure when (defensively) both are set", () => {
    const vm = buildCardViewModel(
      makeSession({
        id: 1,
        state: "needs_input",
        attention: { reason: "permission", since: "2026-08-22T00:00:00Z" },
        failure: { error: "X", message: "y" },
      }),
      NOW,
    );
    expect(vm.noteKind).toBe("attention");
  });

  it("has no note when none of attention/failure/first-launch apply", () => {
    const vm = buildCardViewModel(makeSession({ id: 1, state: "working" }), NOW);
    expect(vm.noteKind).toBe("none");
    expect(vm.noteText).toBeNull();
  });
});

describe("buildCardViewModel — REQ-17 first-launch honesty note", () => {
  it("shows the trust-prompt note for a first-launch started session with no claudeSessionId", () => {
    const vm = buildCardViewModel(
      makeSession({
        id: 1,
        state: "started",
        claudeSessionId: null,
        firstLaunchHere: true,
        createdAt: "2026-08-22T00:00:00Z",
      }),
      new Date("2026-08-22T00:00:00Z"),
    );
    expect(vm.noteKind).toBe("trust");
    expect(vm.noteText).toBe("first launch here — likely waiting on Claude Code's trust prompt");
  });

  it("shows no note before the 10s no-signal threshold for a known (non-first-launch) directory", () => {
    const vm = buildCardViewModel(
      makeSession({
        id: 1,
        state: "started",
        claudeSessionId: null,
        firstLaunchHere: false,
        createdAt: "2026-08-22T00:00:00Z",
      }),
      new Date("2026-08-22T00:00:09Z"),
    );
    expect(vm.noteKind).toBe("none");
  });

  it("shows the no-signal note exactly at the 10s threshold for a known directory", () => {
    const vm = buildCardViewModel(
      makeSession({
        id: 1,
        state: "started",
        claudeSessionId: null,
        firstLaunchHere: false,
        createdAt: "2026-08-22T00:00:00Z",
      }),
      new Date("2026-08-22T00:00:10Z"),
    );
    expect(vm.noteKind).toBe("no-signal");
    expect(vm.noteText).toBe("no signal yet");
  });

  it("shows no first-launch/no-signal note once claudeSessionId is bound, even if still 'started'", () => {
    const vm = buildCardViewModel(
      makeSession({
        id: 1,
        state: "started",
        claudeSessionId: "claude-session-abc",
        firstLaunchHere: true,
        createdAt: "2026-08-22T00:00:00Z",
      }),
      new Date("2026-08-22T00:05:00Z"),
    );
    expect(vm.noteKind).toBe("none");
  });

  it("shows no first-launch/no-signal note once the state has moved past 'started'", () => {
    const vm = buildCardViewModel(
      makeSession({
        id: 1,
        state: "working",
        claudeSessionId: null,
        firstLaunchHere: true,
        createdAt: "2026-08-22T00:00:00Z",
      }),
      new Date("2026-08-22T00:05:00Z"),
    );
    expect(vm.noteKind).toBe("none");
  });
});

describe("buildCardViewModel — ended (alive:false, REQ-18 degraded state)", () => {
  it("is false for a live session", () => {
    const vm = buildCardViewModel(makeSession({ id: 1, alive: true }), NOW);
    expect(vm.ended).toBe(false);
  });

  it("is true for a dead session, keeping its last state's badge/class", () => {
    const vm = buildCardViewModel(makeSession({ id: 1, alive: false, state: "working" }), NOW);
    expect(vm.ended).toBe(true);
    expect(vm.badge).toBe("working");
    expect(vm.stateClass).toBe("s-work");
  });
});

describe("buildCardViewModel — actions (REQ-11: live -> End; ended -> Resume, Remove)", () => {
  it("offers only End for a live session", () => {
    const vm = buildCardViewModel(makeSession({ id: 1, alive: true }), NOW);
    expect(vm.actions).toEqual(["End"]);
  });

  it("offers Resume then Remove, in that order, for an ended session", () => {
    const vm = buildCardViewModel(makeSession({ id: 1, alive: false, endedAt: "2026-08-22T00:00:00Z" }), NOW);
    expect(vm.actions).toEqual(["Resume", "Remove"]);
  });
});

describe("buildCardViewModel — ended timer (REQ-9): 'ended <age>' from endedAt, not the running stateSince timer", () => {
  it("reads 'ended <age>' from endedAt, ignoring stateSince entirely", () => {
    const vm = buildCardViewModel(
      makeSession({
        id: 1,
        alive: false,
        // stateSince is far in the past (would format as "1h" via formatTimer) — the
        // ended timer must derive from endedAt (10s ago -> "now"), not stateSince.
        stateSince: "2026-08-21T22:00:00Z",
        endedAt: "2026-08-22T00:00:00Z",
      }),
      NOW,
    );
    expect(vm.timer).toBe("ended now");
  });

  it("uses formatEndedAge's minute/hour/day buckets in the timer text", () => {
    const vm = buildCardViewModel(
      makeSession({ id: 1, alive: false, endedAt: "2026-08-21T23:54:00Z" }),
      NOW, // 6 minutes before NOW
    );
    expect(vm.timer).toBe("ended 6m");
  });

  it("does not use the 'ended' prefix for a live session's timer", () => {
    const vm = buildCardViewModel(makeSession({ id: 1, alive: true, stateSince: "2026-08-22T00:00:00Z" }), NOW);
    expect(vm.timer).not.toMatch(/^ended /);
    expect(vm.timer).toBe("00:10");
  });
});
