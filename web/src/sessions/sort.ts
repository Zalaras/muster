// The client-side rail sort (REQ-16, docs/protocol.md §5.2, ux-flows §3.4). The daemon
// never orders for display — this is the one place that priority table lives, kept pure
// so Vitest can pin every state and tiebreak without a DOM.
import type { Session, SessionState } from "../protocol";

const STATE_PRIORITY: Record<SessionState, number> = {
  needs_input: 0,
  failed: 1,
  planning: 2,
  working: 3,
  started: 4,
  idle: 5,
};

function parseTime(iso: string): number {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** The within-group ordering key, ascending:
 * - needs_input: longest-blocked first — `attention.since` ascending (oldest first).
 * - failed: most-recent first — negated `stateSince` so descending reads as ascending.
 * - planning/working/started/idle: `stateSince` ascending (the plan's explicit
 *   tiebreak for the first three; for idle it's also literally "longest-idle first"). */
function orderKey(session: Session): number {
  if (session.state === "needs_input") {
    return session.attention ? parseTime(session.attention.since) : Number.POSITIVE_INFINITY;
  }
  if (session.state === "failed") {
    return -parseTime(session.stateSince);
  }
  return parseTime(session.stateSince);
}

/** Pure, total order over sessions. Never mutates the input array. */
export function sortSessions(sessions: readonly Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const byPriority = STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state];
    if (byPriority !== 0) return byPriority;
    const byOrder = orderKey(a) - orderKey(b);
    if (byOrder !== 0) return byOrder;
    return a.id - b.id;
  });
}
