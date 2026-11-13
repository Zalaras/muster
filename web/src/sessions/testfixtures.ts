// The one place a unit test gets a whole `Session`. A file whose tests start from a different
// session wraps `makeSession` with just those fields, never a second whole literal.
import type { Session, SessionRepo } from "../protocol/session";

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
    addedDirs: [],
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
    effort: null,
    effortWarning: null,
    claudeVersion: null,
    restartPending: false,
    note: null,
    cache: null,
    scratchpadDir: null,
    ...overrides,
  };
}

/** A plain checkout of `muster` on `main`. */
export function makeRepo(overrides: Partial<SessionRepo> = {}): SessionRepo {
  return { name: "muster", branch: "main", isWorktree: false, ...overrides };
}
