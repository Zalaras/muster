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

/** REQ-9 (plan m4-reconcile): within the ended group, most-recently-ended first —
 * descending `endedAt`, negated so ascending numeric sort reads as descending time. A
 * (defensive — can't happen per REQ-1/3/5's paired alive/endedAt invariant) null
 * `endedAt` sorts last within the group rather than throwing. */
function endedOrderKey(session: Session): number {
  return session.endedAt ? -parseTime(session.endedAt) : Number.POSITIVE_INFINITY;
}

/** Pure, total order over sessions. Every `alive:false` session sorts after every
 * `alive:true` one (REQ-9) regardless of state; the live group keeps the existing
 * state-priority order, the ended group orders by recency of `endedAt`. Never mutates the
 * input array. */
export function sortSessions(sessions: readonly Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (!a.alive) {
      const byEnded = endedOrderKey(a) - endedOrderKey(b);
      if (byEnded !== 0) return byEnded;
      return a.id - b.id;
    }
    const byPriority = STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state];
    if (byPriority !== 0) return byPriority;
    const byOrder = orderKey(a) - orderKey(b);
    if (byOrder !== 0) return byOrder;
    return a.id - b.id;
  });
}
