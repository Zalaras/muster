// The one Session fixture the sessions-, groups- and launch-group-shaped unit tests share, beside
// `api/testfakes.ts`. Older test files keep the private copy each declared before this existed.
import type { Session } from "../protocol/session";

/** A live, idle, ungrouped, unpinned session; a test overrides only what it is about. `railPos`
 * follows `id` unless overridden, so ids read as manual order. */
export function makeSession(overrides: Partial<Session> & { id: number }): Session {
  return {
    title: `session-${overrides.id}`,
    titleOverride: null,
    plan: null,
    state: "idle",
    stateSince: "2026-08-22T00:00:00Z",
    alive: true,
    endedAt: null,
    attention: null,
    failure: null,
    directory: "/tmp/repo",
    repo: null,
    claudeLocation: null,
    model: null,
    permissionMode: { value: "default", source: "seed" },
    context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
    lastActivity: null,
    backgroundTasks: 0,
    claudeSessionId: null,
    tmuxTarget: `muster:@${overrides.id}`,
    firstLaunchHere: false,
    createdAt: "2026-08-22T00:00:00Z",
    pinned: false,
    railPos: overrides.id,
    unread: false,
    lastPrompt: null,
    groupId: null,
    ...overrides,
  };
}
