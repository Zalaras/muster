import { describe, expect, it } from "vitest";
import type { Session } from "../protocol/session";
import {
  activityLines,
  backgroundLine,
  buildCardViewModel,
  bypassChip,
  deadCapPrefix,
  deadEndbarText,
  deadSurfaceText,
  claudeHover,
  claudeLocationParts,
  claudeNote,
  locationHover,
  mainheadMeta,
  type PaneState,
  type RepoParts,
  repoLine,
  repoParts,
  tileFooterAgeText,
  tileHeaderTimerText,
  unreadLabel,
} from "./card";

const NOW = new Date("2026-08-22T00:00:10Z");

function makeSession(overrides: Partial<Session> & { id: number }): Session {
  return {
    title: null,
    titleOverride: null,
    plan: null,
    state: "idle",
    stateSince: "2026-08-22T00:00:00Z",
    alive: true,
    endedAt: null,
    attention: null,
    failure: null,
    directory: "/Users/bob/code/muster",
    repo: null,
    claudeLocation: null,
    model: null,
    permissionMode: { value: "default", source: "seed" },
    context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
    lastActivity: null,
    backgroundTasks: 0,
    claudeSessionId: null,
    tmuxTarget: "muster:@1",
    firstLaunchHere: false,
    createdAt: "2026-08-22T00:00:00Z",
    pinned: false,
    railPos: overrides.id,
    unread: false,
    lastPrompt: null,
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
    const vm = buildCardViewModel(
      makeSession({ id: 1, repo: { name: "muster", branch: null, isWorktree: false } }),
      NOW,
    );
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
    const vm = buildCardViewModel(
      makeSession({ id: 1, repo: null, directory: "/Users/bob/code/muster" }),
      NOW,
    );
    expect(vm.repoLine).toBe("muster");
  });

  it("handles a directory with a trailing slash when falling back to basename", () => {
    const vm = buildCardViewModel(
      makeSession({ id: 1, repo: null, directory: "/Users/bob/code/muster/" }),
      NOW,
    );
    expect(vm.repoLine).toBe("muster");
  });
});

// Plan rail-card-improvements REQ-14 (W6): activityLines is the pure mode x state
// derivation for a card's two activity lines — covered directly, with no DOM, per
// kb:lesson/conditional-test-routing-resolves-to-nobody (this Should-Have belongs to
// web-tests, not e2e, since it's unit-testable as built).
describe("activityLines — turn mode (the pref default): your prompt while a turn is open, else the reply", () => {
  it.each(["working", "planning", "needs_input"] as const)(
    "shows 'on: <prompt>' and hides the reply while %s (a turn is open)",
    (state) => {
      const session = makeSession({
        id: 1,
        state,
        lastPrompt: "fix the flaky retry",
        lastActivity: "an earlier reply, must not show",
      });
      expect(activityLines(session, "turn")).toEqual({
        you: "on: fix the flaky retry",
        claude: null,
      });
    },
  );

  it.each(["started", "failed", "idle"] as const)(
    "shows 'claude: <reply>' and hides the prompt while %s (no turn is open — edge case 25)",
    (state) => {
      const session = makeSession({
        id: 1,
        state,
        lastPrompt: "an open prompt, must not show",
        lastActivity: "fixed the flaky retry",
      });
      expect(activityLines(session, "turn")).toEqual({
        you: null,
        claude: "claude: fixed the flaky retry",
      });
    },
  );

  it("hides the prompt line when a turn is open but no prompt has been recorded yet (no empty prefix)", () => {
    const session = makeSession({ id: 1, state: "working", lastPrompt: null });
    expect(activityLines(session, "turn")).toEqual({ you: null, claude: null });
  });
});

describe("activityLines — prompt mode: your prompt only, in every state", () => {
  it("shows 'you: <prompt>' regardless of state", () => {
    const session = makeSession({ id: 1, state: "idle", lastPrompt: "do the thing" });
    expect(activityLines(session, "prompt")).toEqual({ you: "you: do the thing", claude: null });
  });

  it("hides the line when lastPrompt is null (edge case 23)", () => {
    const session = makeSession({ id: 1, state: "working", lastPrompt: null });
    expect(activityLines(session, "prompt")).toEqual({ you: null, claude: null });
  });
});

describe("activityLines — reply mode: Claude's reply only, in every state", () => {
  it("shows 'claude: <reply>' regardless of state", () => {
    const session = makeSession({ id: 1, state: "working", lastActivity: "fixed it" });
    expect(activityLines(session, "reply")).toEqual({ you: null, claude: "claude: fixed it" });
  });

  it("hides the line when lastActivity is null (edge case 23)", () => {
    const session = makeSession({ id: 1, state: "idle", lastActivity: null });
    expect(activityLines(session, "reply")).toEqual({ you: null, claude: null });
  });
});

describe("activityLines — both mode: both sides, independently", () => {
  it("shows both lines when both sources are present", () => {
    const session = makeSession({
      id: 1,
      state: "idle",
      lastPrompt: "do the thing",
      lastActivity: "done",
    });
    expect(activityLines(session, "both")).toEqual({
      you: "you: do the thing",
      claude: "claude: done",
    });
  });

  it("shows only the prompt line when the reply is null (edge case 24)", () => {
    const session = makeSession({ id: 1, lastPrompt: "do the thing", lastActivity: null });
    expect(activityLines(session, "both")).toEqual({ you: "you: do the thing", claude: null });
  });

  it("shows only the reply line when the prompt is null (edge case 24)", () => {
    const session = makeSession({ id: 1, lastPrompt: null, lastActivity: "done" });
    expect(activityLines(session, "both")).toEqual({ you: null, claude: "claude: done" });
  });

  it("hides both lines when neither source has data yet (no data yet state, edge case 23)", () => {
    const session = makeSession({ id: 1, lastPrompt: null, lastActivity: null });
    expect(activityLines(session, "both")).toEqual({ you: null, claude: null });
  });
});

describe("buildCardViewModel — activity (REQ-14): defaults to turn mode, feeds the {you, claude} shape", () => {
  it("defaults to 'turn' mode when no mode argument is passed", () => {
    const vm = buildCardViewModel(
      makeSession({ id: 1, state: "working", lastPrompt: "fix the flaky retry" }),
      NOW,
    );
    expect(vm.activity).toEqual({ you: "on: fix the flaky retry", claude: null });
  });

  it("passes the mode argument through to activityLines", () => {
    const session = makeSession({ id: 1, state: "working", lastPrompt: "fix the flaky retry" });
    const vm = buildCardViewModel(session, NOW, "prompt");
    expect(vm.activity).toEqual(activityLines(session, "prompt"));
  });
});

describe("unreadLabel (REQ-9): the card's accessible name", () => {
  it("appends ', unread' when unread is true", () => {
    expect(unreadLabel("fix the thing", true)).toBe("fix the thing, unread");
  });

  it("returns the title verbatim when unread is false", () => {
    expect(unreadLabel("fix the thing", false)).toBe("fix the thing");
  });
});

describe("buildCardViewModel — unread (REQ-9): passes session.unread through unchanged", () => {
  it("is true when the session is unread", () => {
    const vm = buildCardViewModel(makeSession({ id: 1, unread: true }), NOW);
    expect(vm.unread).toBe(true);
  });

  it("is false when the session is read", () => {
    const vm = buildCardViewModel(makeSession({ id: 1, unread: false }), NOW);
    expect(vm.unread).toBe(false);
  });
});

describe("buildCardViewModel — note precedence: attention > failure > first-launch", () => {
  // The attention note appends a since-timer derived from `attention.since` (not
  // `stateSince`) — design-system §3's escalating Needs-Input timer. NOW is 10s after
  // `since` in these fixtures, so `formatTimer` yields "00:10".
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

// kb:adr/launch-bypass-offered-with-danger-guardrails: the danger chip a rail card, the
// Focus mainhead and a tile header all share, driven by one predicate so the three
// surfaces can never drift onto different conditions (INV-1).
describe("bypassChip (INV-1)", () => {
  it("is true when the latched permissionMode is bypassPermissions", () => {
    const session = makeSession({
      id: 1,
      permissionMode: { value: "bypassPermissions", source: "hook" },
    });
    expect(bypassChip(session)).toBe(true);
  });

  it("is false for every other permission mode", () => {
    for (const value of ["default", "acceptEdits", "plan", "auto"] as const) {
      const session = makeSession({ id: 1, permissionMode: { value, source: "seed" } });
      expect(bypassChip(session)).toBe(false);
    }
  });

  it("is true regardless of state, alive or not — the chip tracks the latch, not liveness (INV-1)", () => {
    for (const state of [
      "started",
      "idle",
      "working",
      "needs_input",
      "planning",
      "failed",
    ] as const) {
      for (const alive of [true, false]) {
        const session = makeSession({
          id: 1,
          state,
          alive,
          permissionMode: { value: "bypassPermissions", source: "hook" },
        });
        expect(bypassChip(session)).toBe(true);
      }
    }
  });

  it("flips back to false once a hook corrects the latch away from bypass (edge case 17)", () => {
    const bypassed = makeSession({
      id: 1,
      permissionMode: { value: "bypassPermissions", source: "hook" },
    });
    expect(bypassChip(bypassed)).toBe(true);
    const corrected = {
      ...bypassed,
      permissionMode: { value: "default", source: "hook" as const },
    };
    expect(bypassChip(corrected)).toBe(false);
  });
});

describe("buildCardViewModel — bypassChip field (INV-1)", () => {
  it("carries bypassChip: true on the view-model when the session is bypass-latched", () => {
    const vm = buildCardViewModel(
      makeSession({ id: 1, permissionMode: { value: "bypassPermissions", source: "seed" } }),
      NOW,
    );
    expect(vm.bypassChip).toBe(true);
  });

  it("carries bypassChip: false on the view-model for an ordinary mode", () => {
    const vm = buildCardViewModel(makeSession({ id: 1 }), NOW);
    expect(vm.bypassChip).toBe(false);
  });
});

// kb:adr/launch-bypass-warning-surfaced-never-answered: the bypass warning is the trust
// prompt's twin — surfaced from absence of signal, and (unlike the plain no-signal note)
// shown immediately, with no NO_SIGNAL_THRESHOLD_SECONDS wait (REQ-5).
describe("buildCardViewModel — bypass-warning honesty note (REQ-5)", () => {
  it("shows the combined trust-prompt-then-bypass-warning text on a first launch into a new directory", () => {
    const vm = buildCardViewModel(
      makeSession({
        id: 1,
        state: "started",
        claudeSessionId: null,
        firstLaunchHere: true,
        createdAt: "2026-08-22T00:00:00Z",
        permissionMode: { value: "bypassPermissions", source: "seed" },
      }),
      new Date("2026-08-22T00:00:00Z"),
    );
    expect(vm.noteKind).toBe("trust");
    expect(vm.noteText).toBe(
      "first launch here — likely waiting on Claude Code's trust prompt, then its bypass warning",
    );
  });

  it("shows the bypass-only warning immediately (0s elapsed) for a known directory, no NO_SIGNAL wait", () => {
    const vm = buildCardViewModel(
      makeSession({
        id: 1,
        state: "started",
        claudeSessionId: null,
        firstLaunchHere: false,
        createdAt: "2026-08-22T00:00:00Z",
        permissionMode: { value: "bypassPermissions", source: "seed" },
      }),
      new Date("2026-08-22T00:00:00Z"),
    );
    expect(vm.noteKind).toBe("trust");
    expect(vm.noteText).toBe("likely waiting on Claude Code's bypass warning");
  });

  it("shows no bypass note once claudeSessionId is bound, even while still latched bypass", () => {
    const vm = buildCardViewModel(
      makeSession({
        id: 1,
        state: "started",
        claudeSessionId: "claude-session-abc",
        firstLaunchHere: false,
        createdAt: "2026-08-22T00:00:00Z",
        permissionMode: { value: "bypassPermissions", source: "hook" },
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

describe("buildCardViewModel — actions (W1: live -> none; ended -> Resume, Remove)", () => {
  it("offers no action for a live session", () => {
    const vm = buildCardViewModel(makeSession({ id: 1, alive: true }), NOW);
    expect(vm.actions).toEqual([]);
  });

  it("offers Resume then Remove, in that order, for an ended session", () => {
    const vm = buildCardViewModel(
      makeSession({ id: 1, alive: false, endedAt: "2026-08-22T00:00:00Z" }),
      NOW,
    );
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
    const vm = buildCardViewModel(
      makeSession({ id: 1, alive: true, stateSince: "2026-08-22T00:00:00Z" }),
      NOW,
    );
    expect(vm.timer).not.toMatch(/^ended /);
    expect(vm.timer).toBe("00:10");
  });
});

const WORKTREE_AT = {
  directory: "/Users/bob/code/muster/.claude/worktrees/e7b",
  repo: { name: "e7b", branch: "worktree-e7b", isWorktree: true },
};

// REQ-10 (W1): the launch directory's readout split at the slash; the one-line `repoLine`
// is derived from the same parts, so the two cannot disagree.
describe("repoParts — the launch readout split into folder and branch lines (W1)", () => {
  const cases: Array<{
    name: string;
    session: Partial<Session>;
    want: RepoParts;
    line: string;
  }> = [
    {
      name: "repo with a branch",
      session: { repo: { name: "muster", branch: "main", isWorktree: false } },
      want: { folder: "muster /", branch: "main" },
      line: "muster / main",
    },
    {
      name: "linked worktree gets the marker on the branch line",
      session: { repo: { name: "muster", branch: "x", isWorktree: true } },
      want: { folder: "muster /", branch: "x (worktree)" },
      line: "muster / x (worktree)",
    },
    {
      name: "detached or unreadable branch reads an em-dash, never empty",
      session: { repo: { name: "muster", branch: null, isWorktree: false } },
      want: { folder: "muster /", branch: "—" },
      line: "muster / —",
    },
    {
      name: "no repo: the directory basename, no slash, no branch line",
      session: { repo: null, directory: "/Users/bob/code/muster" },
      want: { folder: "muster", branch: null },
      line: "muster",
    },
    {
      name: "no repo and a trailing slash on the directory",
      session: { repo: null, directory: "/Users/bob/code/muster/" },
      want: { folder: "muster", branch: null },
      line: "muster",
    },
  ];

  for (const { name, session, want, line } of cases) {
    it(name, () => {
      const s = makeSession({ id: 1, ...session });
      expect(repoParts(s)).toEqual(want);
      expect(repoLine(s)).toBe(line);
    });
  }
});

// REQ-12 (W2).
describe("claudeLocationParts — the `↳` readout (W2)", () => {
  const cases: Array<{
    name: string;
    location: Session["claudeLocation"];
    want: RepoParts | null;
  }> = [
    {
      name: "null while Claude is in the launch checkout",
      location: null,
      want: null,
    },
    {
      name: "same shape as repoParts, with the bare branch (no worktree marker) for a worktree",
      location: WORKTREE_AT,
      want: { folder: "e7b /", branch: "worktree-e7b" },
    },
    {
      name: "a null branch reads an em-dash",
      location: {
        directory: "/Users/bob/other",
        repo: { name: "other", branch: null, isWorktree: false },
      },
      want: { folder: "other /", branch: "—" },
    },
    {
      name: "falls back to the location directory's basename when its repo is null",
      location: { directory: "/tmp/scratch/", repo: null },
      want: { folder: "scratch", branch: null },
    },
  ];

  for (const { name, location, want } of cases) {
    it(name, () => {
      expect(claudeLocationParts(makeSession({ id: 1, claudeLocation: location }))).toEqual(want);
    });
  }
});

// REQ-14, REQ-15 (W3): lines 1-2 always, 3 while moved, 4 while moved with a location branch.
describe("locationHover, claudeHover, claudeNote — the hover text (W3)", () => {
  const base = { repo: { name: "muster", branch: "main", isWorktree: false } };
  const cases: Array<{
    name: string;
    session: Partial<Session>;
    hover: string;
    claudeHover: string | null;
    note: string | null;
  }> = [
    {
      name: "not moved: exactly lines 1 and 2",
      session: base,
      hover: "muster / main\n/Users/bob/code/muster",
      claudeHover: null,
      note: null,
    },
    {
      name: "moved: lines 1 to 4",
      session: { ...base, claudeLocation: WORKTREE_AT },
      hover:
        "muster / main\n/Users/bob/code/muster\nClaude is in /Users/bob/code/muster/.claude/worktrees/e7b\non worktree-e7b",
      claudeHover: "Claude is in /Users/bob/code/muster/.claude/worktrees/e7b\non worktree-e7b",
      note: "Claude is in /Users/bob/code/muster/.claude/worktrees/e7b",
    },
    {
      name: "moved with a null location repo: lines 1 to 3",
      session: {
        ...base,
        claudeLocation: { directory: "/tmp/scratch", repo: null },
      },
      hover: "muster / main\n/Users/bob/code/muster\nClaude is in /tmp/scratch",
      claudeHover: "Claude is in /tmp/scratch",
      note: "Claude is in /tmp/scratch",
    },
    {
      name: "moved with a null location branch: line 4 is omitted, not 'on —'",
      session: {
        ...base,
        claudeLocation: {
          directory: "/tmp/detached",
          repo: { name: "detached", branch: null, isWorktree: false },
        },
      },
      hover: "muster / main\n/Users/bob/code/muster\nClaude is in /tmp/detached",
      claudeHover: "Claude is in /tmp/detached",
      note: "Claude is in /tmp/detached",
    },
    {
      name: "launch session with no repo: line 1 is the basename",
      session: { repo: null },
      hover: "muster\n/Users/bob/code/muster",
      claudeHover: null,
      note: null,
    },
  ];

  for (const { name, session, hover, claudeHover: ch, note } of cases) {
    it(name, () => {
      const s = makeSession({ id: 1, ...session });
      expect(locationHover(s)).toBe(hover);
      expect(claudeHover(s)).toBe(ch);
      expect(claudeNote(s)).toBe(note);
    });
  }
});

describe("buildCardViewModel — carries the split readout and hover texts", () => {
  it("fills repo, claudeAt, claudeHover, claudeNote and hover from the same session", () => {
    const session = makeSession({
      id: 1,
      repo: { name: "muster", branch: "main", isWorktree: false },
      claudeLocation: WORKTREE_AT,
    });
    const vm = buildCardViewModel(session, NOW);
    expect(vm.repo).toEqual({ folder: "muster /", branch: "main" });
    expect(vm.repoLine).toBe("muster / main");
    expect(vm.claudeAt).toEqual({ folder: "e7b /", branch: "worktree-e7b" });
    expect(vm.claudeHover).toBe(claudeHover(session));
    expect(vm.claudeNote).toBe(claudeNote(session));
    expect(vm.hover).toBe(locationHover(session));
  });

  it("leaves the `↳` fields null for a session in its launch checkout", () => {
    const vm = buildCardViewModel(makeSession({ id: 1 }), NOW);
    expect([vm.claudeAt, vm.claudeHover, vm.claudeNote]).toEqual([null, null, null]);
  });
});

describe("mainheadMeta — the structured Focus header view-model (W4)", () => {
  // kb:adr/launch-resume-null-model-reads-unknown: a null model reads the word
  // "unknown" rather than omitting the clause.
  it("reads 'unknown' for a null model", () => {
    expect(mainheadMeta(makeSession({ id: 1, model: null }), NOW).model).toBe("unknown");
  });

  it("reads the model's display name when present", () => {
    const session = makeSession({
      id: 1,
      model: { id: "claude-x", displayName: "Sonnet 5" },
    });
    expect(mainheadMeta(session, NOW).model).toBe("Sonnet 5");
  });

  it("carries the repo block, the `↳` block and the hover", () => {
    const session = makeSession({
      id: 1,
      repo: { name: "muster", branch: "main", isWorktree: false },
      claudeLocation: WORKTREE_AT,
    });
    const meta = mainheadMeta(session, NOW);
    expect(meta.repo).toEqual(repoParts(session));
    expect(meta.claudeAt).toEqual(claudeLocationParts(session));
    expect(meta.hover).toBe(locationHover(session));
  });

  const ended: Array<{
    name: string;
    session: Partial<Session>;
    want: string | null;
  }> = [
    { name: "alive session: no ended clause", session: {}, want: null },
    {
      name: "dead with an endedAt: 'ended <age>'",
      session: { alive: false, endedAt: "2026-08-21T23:54:00Z" }, // 6 minutes before NOW
      want: "ended 6m ago",
    },
    {
      name: "dead with no endedAt (defensive; alive:false always pairs with endedAt): no clause",
      session: { alive: false, endedAt: null },
      want: null,
    },
  ];
  for (const { name, session, want } of ended) {
    it(name, () => {
      expect(mainheadMeta(makeSession({ id: 1, ...session }), NOW).ended).toBe(want);
    });
  }
});

describe("tileHeaderTimerText: alive ticks via formatTimer; dead shows the bare age, no 'ended' prefix", () => {
  it("ticks the same MM:SS timer as buildCardViewModel's own timer for a live session", () => {
    const session = makeSession({ id: 1, alive: true, stateSince: "2026-08-22T00:00:00Z" });
    expect(tileHeaderTimerText(session, NOW)).toBe("00:10");
  });

  it("shows the bare age (no 'ended' word) for a dead session with an endedAt", () => {
    const session = makeSession({ id: 1, alive: false, endedAt: "2026-08-21T23:54:00Z" }); // 6m before NOW
    expect(tileHeaderTimerText(session, NOW)).toBe("6m");
  });

  it("is empty for a dead session with no endedAt (defensive)", () => {
    const session = makeSession({ id: 1, alive: false, endedAt: null });
    expect(tileHeaderTimerText(session, NOW)).toBe("");
  });
});

describe("tileFooterAgeText: '✕ ended <age> ago', or bare '✕ ended' with no endedAt", () => {
  it("reads '✕ ended <age> ago' for a dead session with an endedAt", () => {
    const session = makeSession({ id: 1, alive: false, endedAt: "2026-08-21T23:54:00Z" }); // 6m before NOW
    expect(tileFooterAgeText(session, NOW)).toBe("✕ ended 6m ago");
  });

  it("reads 'now', never 'now ago', for a sub-minute endedAt (agoSuffix's own honesty rule)", () => {
    const session = makeSession({ id: 1, alive: false, endedAt: "2026-08-22T00:00:05Z" }); // 5s before NOW
    expect(tileFooterAgeText(session, NOW)).toBe("✕ ended now");
  });

  it("falls back to bare '✕ ended' when endedAt is null (defensive)", () => {
    const session = makeSession({ id: 1, alive: false, endedAt: null });
    expect(tileFooterAgeText(session, NOW)).toBe("✕ ended");
  });
});

describe("deadEndbarText: 'ended <age> · last state <badge> · last captured screen, not a live client'", () => {
  it("composes the age, badge word and fixed tail for a dead session with an endedAt", () => {
    const session = makeSession({
      id: 1,
      alive: false,
      state: "working",
      endedAt: "2026-08-21T23:54:00Z", // 6m before NOW
    });
    expect(deadEndbarText(session, NOW)).toBe(
      "ended 6m ago · last state working · last captured screen, not a live client",
    );
  });

  it.each([
    ["started", "started"],
    ["planning", "planning"],
    ["needs_input", "needs input"],
    ["failed", "failed"],
    ["idle", "idle"],
  ] as const)("uses the lowercase badge word for state %s", (state, word) => {
    const session = makeSession({ id: 1, alive: false, state, endedAt: "2026-08-22T00:00:00Z" });
    expect(deadEndbarText(session, NOW)).toContain(`last state ${word}`);
  });

  it("omits the age clause (no leading 'ended <age>') when endedAt is null, defensively", () => {
    const session = makeSession({ id: 1, alive: false, state: "idle", endedAt: null });
    expect(deadEndbarText(session, NOW)).toBe(
      "ended · last state idle · last captured screen, not a live client",
    );
  });
});

describe("deadCapPrefix: '<age> · last state: <badge>', or without the age clause when endedAt is null", () => {
  it("composes the age and badge word for a dead session with an endedAt", () => {
    const session = makeSession({
      id: 1,
      alive: false,
      state: "failed",
      endedAt: "2026-08-21T23:54:00Z", // 6m before NOW
    });
    expect(deadCapPrefix(session, NOW)).toBe("6m ago · last state: failed");
  });

  it("omits the age clause when endedAt is null, defensively", () => {
    const session = makeSession({ id: 1, alive: false, state: "idle", endedAt: null });
    expect(deadCapPrefix(session, NOW)).toBe("last state: idle");
  });
});

// The one composer render/dead.ts's renderDeadSurface calls for every dead-surface
// string — covered directly here since deadSurfaceText itself, not renderDeadSurface's DOM
// assignment, is what decides these strings.
describe("deadSurfaceText: the endbar/snapshot/capBody triple for each pane fetch outcome", () => {
  function okPane(capturedAt: string, text = "$ claude\nWorking..."): PaneState {
    return { status: "ok", text, capturedAt };
  }

  it("appends ' · captured <age>' after the base endbar text when the pane fetch succeeded", () => {
    const session = makeSession({ id: 1, state: "idle", endedAt: "2026-08-22T00:00:05Z" });
    const result = deadSurfaceText(session, okPane("2026-08-21T23:54:10Z"), NOW);

    expect(result.endbar).toBe(`${deadEndbarText(session, NOW)} · captured 6m ago`);
    expect(result.snapshot).toBe("$ claude\nWorking...");
    expect(result.capBody).toBe(deadCapPrefix(session, NOW));
  });

  it("never renders 'captured now ago' — sub-minute capture age reads 'captured now'", () => {
    const session = makeSession({ id: 1, endedAt: "2026-08-22T00:00:05Z" });
    const result = deadSurfaceText(session, okPane("2026-08-22T00:00:00Z"), NOW); // 10s elapsed

    expect(result.endbar).toMatch(/· captured now$/);
    expect(result.endbar).not.toContain("captured now ago");
  });

  it("crosses the now/1m-ago boundary at exactly 60 elapsed seconds", () => {
    const session = makeSession({ id: 1 });
    const justUnder = deadSurfaceText(session, okPane("2026-08-21T23:59:11Z"), NOW); // 59s
    expect(justUnder.endbar).toMatch(/· captured now$/);

    const atBoundary = deadSurfaceText(session, okPane("2026-08-21T23:59:10Z"), NOW); // 60s
    expect(atBoundary.endbar).toMatch(/· captured 1m ago$/);
  });

  it("renders an hour bucket once the capture is over an hour old", () => {
    const session = makeSession({ id: 1 });
    const result = deadSurfaceText(session, okPane("2026-08-21T23:00:09Z"), NOW); // 3661s
    expect(result.endbar).toMatch(/· captured 1h ago$/);
  });

  it("does not append a captured clause when the pane is 'missing' — 'no snapshot captured' reads as a confirmed negative", () => {
    const session = makeSession({ id: 1 });
    const result = deadSurfaceText(session, { status: "missing" }, NOW);

    expect(result.endbar).toBe(deadEndbarText(session, NOW));
    expect(result.snapshot).toBe("");
    expect(result.capBody).toBe("no snapshot captured");
  });

  it("does not append a captured clause while the pane fetch is still 'loading' — distinct from 'missing', not silently blank", () => {
    const session = makeSession({ id: 1 });
    const result = deadSurfaceText(session, { status: "loading" }, NOW);

    expect(result.endbar).toBe(deadEndbarText(session, NOW));
    expect(result.snapshot).toBe("");
    expect(result.capBody).toBe("loading last screen…");
  });

  it("still appends the captured clause when the session's own endedAt is null (defensive branch, no leading age)", () => {
    const session = makeSession({ id: 1, endedAt: null });
    const result = deadSurfaceText(session, okPane("2026-08-21T23:59:10Z"), NOW); // 60s

    expect(result.endbar).toBe(`${deadEndbarText(session, NOW)} · captured 1m ago`);
  });

  it("the captured age can differ from the endbar's own ended age — snapshot capture and End don't share a clock", () => {
    // Session ended 10 minutes ago; the last capture was taken 3 minutes before that.
    const session = makeSession({ id: 1, endedAt: "2026-08-21T23:50:10Z" });
    const result = deadSurfaceText(session, okPane("2026-08-21T23:47:10Z"), NOW);

    expect(result.endbar).toBe(`${deadEndbarText(session, NOW)} · captured 13m ago`);
  });
});

describe("backgroundLine (W2, W3)", () => {
  it.each([
    { alive: true, n: 0, want: null },
    { alive: true, n: 1, want: "1 background task" },
    { alive: true, n: 2, want: "2 background tasks" },
    { alive: true, n: 12, want: "12 background tasks" },
    { alive: false, n: 0, want: null },
    { alive: false, n: 1, want: null },
    { alive: false, n: 5, want: null },
  ])("alive=$alive n=$n -> $want", ({ alive, n, want }) => {
    const session = makeSession({ id: 1, alive, backgroundTasks: n });
    expect(backgroundLine(session)).toBe(want);
    expect(buildCardViewModel(session, NOW).backgroundLine).toBe(want);
  });
});
