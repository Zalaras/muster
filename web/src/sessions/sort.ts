// The client-side rail sort (REQ-16, docs/protocol.md §5.2, ux-flows §3.4). The daemon
// never orders for display — this is the one place that priority table lives, kept pure
// so Vitest can pin every state and tiebreak without a DOM.
import type { RailSort, Session, SessionState } from "../protocol";

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

/** REQ-6 (plan order-sidebar): pinned block first (by `railPos`, `id` tiebreak), the
 * unpinned group after — `manual` orders that unpinned group by `railPos`/`id` too
 * (INV-3: independent of `state`/`alive`/`attention`/`stateSince`), `attention` orders it
 * by `sortSessions`'s existing §3.4 priority (INV-4: the pinned block still precedes
 * every unpinned session in this mode). Never mutates its input — the rail, the Tiles
 * strip and `features/focus.ts`'s default-focus pick all read display order through this one
 * function rather than calling `sortSessions` directly. */
export function orderRail(sessions: readonly Session[], mode: RailSort): Session[] {
  const pinned = sessions.filter((s) => s.pinned).sort((a, b) => a.railPos - b.railPos || a.id - b.id);
  const unpinned = sessions.filter((s) => !s.pinned);
  if (mode === "manual") {
    return [...pinned, ...unpinned.sort((a, b) => a.railPos - b.railPos || a.id - b.id)];
  }
  return [...pinned, ...sortSessions(unpinned)];
}

/** REQ-6 (plan shortcut-fixes): the single highest-attention *live* session, by
 * `sortSessions`'s own §2.1 priority order — ignoring `railSort`, `pinned` and `railPos`
 * entirely (INV-4), unlike `orderRail`. `null` when no session is `alive` (REQ-7): the
 * `alive` filter runs before the sort, so an ended session is never handed back even
 * though `sortSessions` would otherwise sort it last rather than excluding it. */
export function pickNeediest(sessions: readonly Session[]): Session | null {
  return sortSessions(sessions.filter((s) => s.alive))[0] ?? null;
}
