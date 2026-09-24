// The client-side rail sort (kb:adr/rail-user-owned-manual-order-default,
// kb:anchor/ws.snapshot, ux-flows §3.4). The daemon never orders for display — this is the
// one place that priority table lives, kept pure so Vitest can pin every state and
// tiebreak without a DOM.
import type { RailSort } from "../protocol/prefs";
import type { Session } from "../protocol/session";

/** kb:adr/rail-attention-order-your-turn-before-active: the attention priority table.
 * `idle` splits on `unread`, sorting into the "your turn" group (ahead of `started`) when
 * unread and staying last, after `working`, when read. `started` sits ahead of
 * `planning`/`working` in the "your turn" group too (a launched session is waiting for
 * its first prompt). One function, not a static `Record`, since `idle`'s rank depends on
 * a second field. */
function statePriority(session: Session): number {
  switch (session.state) {
    case "needs_input":
      return 0;
    case "failed":
      return 1;
    case "idle":
      return session.unread ? 2 : 6;
    case "started":
      return 3;
    case "planning":
      return 4;
    case "working":
      return 5;
  }
}

function parseTime(iso: string): number {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** The within-group ordering key, ascending:
 * - needs_input: longest-blocked first — `attention.since` ascending (oldest first).
 * - failed: most-recent first — negated `stateSince` so descending reads as ascending.
 * - planning/working/started/idle: `stateSince` ascending (for idle it's also literally
 *   "longest-idle first"). */
function orderKey(session: Session): number {
  if (session.state === "needs_input") {
    return session.attention ? parseTime(session.attention.since) : Number.POSITIVE_INFINITY;
  }
  if (session.state === "failed") {
    return -parseTime(session.stateSince);
  }
  return parseTime(session.stateSince);
}

/** Within the ended group, most-recently-ended first — descending `endedAt`, negated so
 * ascending numeric sort reads as descending time. A (defensive — `endedAt` is only ever
 * null while `alive:true`, kb:anchor/state.liveness) null `endedAt` sorts last within the
 * group rather than throwing. */
function endedOrderKey(session: Session): number {
  return session.endedAt ? -parseTime(session.endedAt) : Number.POSITIVE_INFINITY;
}

/** Pure, total order over sessions. Every `alive:false` session sorts after every
 * `alive:true` one regardless of state; the live group keeps the existing state-priority
 * order, the ended group orders by recency of `endedAt`. Never mutates the input array. */
export function sortSessions(sessions: readonly Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (!a.alive) {
      const byEnded = endedOrderKey(a) - endedOrderKey(b);
      if (byEnded !== 0) return byEnded;
      return a.id - b.id;
    }
    const byPriority = statePriority(a) - statePriority(b);
    if (byPriority !== 0) return byPriority;
    const byOrder = orderKey(a) - orderKey(b);
    if (byOrder !== 0) return byOrder;
    return a.id - b.id;
  });
}

/** The manual/pinned-block ordering key, ascending: `railPos`, `id` tiebreak. */
function byRailPos(a: Session, b: Session): number {
  return a.railPos - b.railPos || a.id - b.id;
}

/** kb:adr/rail-user-owned-manual-order-default: pinned block first (by `railPos`, `id`
 * tiebreak), the unpinned group after — `manual` orders that unpinned group by
 * `railPos`/`id` too (independent of `state`/`alive`/`attention`/`stateSince`), `attention`
 * orders it by `sortSessions`'s existing §3.4 priority (the pinned block still precedes
 * every unpinned session in this mode too). Never mutates its input — the rail, the Tiles
 * strip and `features/focus.ts`'s default-focus pick all read display order through this one
 * function rather than calling `sortSessions` directly. */
export function orderRail(sessions: readonly Session[], mode: RailSort): Session[] {
  const pinned = sessions.filter((s) => s.pinned).sort(byRailPos);
  const unpinned = sessions.filter((s) => !s.pinned);
  if (mode === "manual") {
    return [...pinned, ...unpinned.sort(byRailPos)];
  }
  return [...pinned, ...sortSessions(unpinned)];
}

/** kb:adr/shortcuts-jump-to-neediest-option-command-zero: the single highest-attention
 * *live* session, by `sortSessions`'s own §2.1 priority order — ignoring `railSort`,
 * `pinned` and `railPos` entirely, unlike `orderRail`. `null` when no session is `alive`:
 * the `alive` filter runs before the sort, so an ended session is never handed back even
 * though `sortSessions` would otherwise sort it last rather than excluding it. */
export function pickNeediest(sessions: readonly Session[]): Session | null {
  return sortSessions(sessions.filter((s) => s.alive))[0] ?? null;
}
