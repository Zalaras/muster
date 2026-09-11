// Tile membership + ordering logic for the Tiles view (plan m2-terminal, REQ-8/REQ-11 —
// sticky live-tile membership over top-N-by-attention; plan move-tiles REQ-1/REQ-2/REQ-3
// — the grid is slot-stable and user-orderable). Pure, no DOM and no socket —
// features/tiles.ts is the only caller (docs/conventions.md: keep state-derivation logic
// in pure modules separate from DOM code).
//
// Sticky rule (plan "Two structural decisions ... 2"): the live set is recomputed to
// top-N-by-attention only at view entry (`initialLive`) and density change
// (`applyDensity`'s grow/shrink); afterwards membership changes only by user action
// (`promote`) or a newly-launched session filling a genuinely free slot — `applyDensity`
// is idempotent once already at capacity with valid members, which is what lets it be
// called on every session-list change without reshuffling anything a user chose.
//
// Slot-stable ordering (plan move-tiles, amends ux-flows §3.7): `promote` and
// `applyDensity` used to re-sort the whole live array back to §3.4 order on every call,
// which meant a bare priority change (no membership change at all) moved every tile in
// the grid. Neither function re-sorts anymore — §3.4 order is used only to decide *which*
// ids are members (the demoted slot on promote, which members survive a shrink, which
// members backfill a grow), never to reorder the array itself. The only way the array's
// order changes is `moveTile`, which is a user drag.
import type { Density, Session } from "../protocol";
import { sortSessions } from "./sort";

export function densityCount(density: Density): number {
  return density === "3x2" ? 6 : 4;
}

function sortedIds(sessions: readonly Session[]): number[] {
  return sortSessions(sessions).map((s) => s.id);
}

/** Top-N session ids by §3.4 sort order — the live set at view entry. */
export function initialLive(sessions: readonly Session[], n: number): number[] {
  return sortedIds(sessions).slice(0, n);
}

/**
 * Promotes `id` into the live set, demoting the single lowest-priority (worst-sorted)
 * current member INTO ITS OWN SLOT (plan move-tiles REQ-1/REQ-8/edge case 8) — every
 * other member keeps its index. No-op (identical array) if `id` is already live or isn't
 * a known session. The live set's size never changes and the result is never re-sorted.
 */
export function promote(live: readonly number[], id: number, sessions: readonly Session[]): number[] {
  const order = sortedIds(sessions);

  if (live.includes(id) || !order.includes(id)) {
    return [...live];
  }

  let worst: number | undefined;
  let worstIndex = -1;
  let worstRank = -1;
  live.forEach((liveId, index) => {
    const rank = order.indexOf(liveId);
    // An already-invalid live id (shouldn't happen — applyDensity keeps this clean)
    // sorts last, so it is the first to be demoted.
    const effectiveRank = rank === -1 ? Number.POSITIVE_INFINITY : rank;
    if (effectiveRank > worstRank) {
      worstRank = effectiveRank;
      worst = liveId;
      worstIndex = index;
    }
  });
  if (worst === undefined) return [...live];

  const result = [...live];
  result[worstIndex] = id;
  return result;
}

/**
 * Grows or shrinks the live set to size `n`, preserving existing members' relative order
 * (slot-stable, plan move-tiles REQ-1/REQ-7/edge case 7): shrinking drops the
 * lowest-§3.4-priority current members but leaves the survivors in their existing
 * relative order; growing/backfilling appends the next sessions by §3.4 order into freed
 * slots; an id no longer in `sessions` is removed and the rest shift left. Also the
 * mechanism that lets a newly-launched session fill a free slot — calling this on every
 * session-list change is a no-op once already at capacity with only valid members.
 */
export function applyDensity(live: readonly number[], n: number, sessions: readonly Session[]): number[] {
  const order = sortedIds(sessions);
  const known = new Set(order);
  const byOrder = (a: number, b: number): number => order.indexOf(a) - order.indexOf(b);

  const stillValid = live.filter((id) => known.has(id));
  if (stillValid.length >= n) {
    // Shrink: the members to KEEP are the top n by §3.4 order, but they stay in their
    // existing relative order rather than being re-sorted to §3.4 order.
    const toKeep = new Set([...stillValid].sort(byOrder).slice(0, n));
    return stillValid.filter((id) => toKeep.has(id));
  }

  const result = [...stillValid];
  for (const id of order) {
    if (result.length >= n) break;
    if (!result.includes(id)) result.push(id);
  }
  return result;
}

/**
 * Pure reorder (plan move-tiles REQ-3): removes `draggedId` and reinserts it at
 * `targetId`'s current index (insert-and-shift — see plan edge case 2 for the forward/
 * backward worked examples). Identity (same contents, new array) when the two ids are
 * equal or either is not a member of `live` — a drop on self, a departed drag source, or
 * a departed drop target are all no-ops (plan edge cases 1/6).
 */
export function moveTile(live: readonly number[], draggedId: number, targetId: number): number[] {
  if (draggedId === targetId || !live.includes(draggedId) || !live.includes(targetId)) {
    return [...live];
  }
  // Target's index must be read from the ORIGINAL array, before the dragged id is
  // removed. Removing it first (and indexing into the shortened array) shifts every
  // index after the dragged id's original slot down by one, which only happens to be
  // harmless for backward drags (dragged id after target — nothing before the target
  // moves) but silently lands forward drags one slot too early (dragged id before
  // target — the removal shifts the target's own index down by one before it's read).
  const targetIndex = live.indexOf(targetId);
  const withoutDragged = live.filter((id) => id !== draggedId);
  const result = [...withoutDragged];
  result.splice(targetIndex, 0, draggedId);
  return result;
}

