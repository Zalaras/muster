// Tile membership logic for the Tiles view (plan m2-terminal, REQ-8/REQ-11 — sticky
// live-tile membership over top-N-by-attention). Pure, no DOM and no socket — main.ts's
// surface manager is the only caller (docs/conventions.md: keep state-derivation logic
// in pure modules separate from DOM code).
//
// Sticky rule (plan "Two structural decisions ... 2"): the live set is recomputed to
// top-N-by-attention only at view entry (`initialLive`) and density change
// (`applyDensity`'s grow/shrink); afterwards membership changes only by user action
// (`promote`) or a newly-launched session filling a genuinely free slot — `applyDensity`
// is idempotent once already at capacity with valid members, which is what lets it be
// called on every session-list change without reshuffling anything a user chose.
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
 * current member. No-op (same members, re-sorted) if `id` is already live or isn't a
 * known session. The live set's size never changes.
 */
export function promote(live: readonly number[], id: number, sessions: readonly Session[]): number[] {
  const order = sortedIds(sessions);
  const byOrder = (a: number, b: number): number => order.indexOf(a) - order.indexOf(b);

  if (live.includes(id) || !order.includes(id)) {
    return [...live].sort(byOrder);
  }

  let worst: number | undefined;
  let worstRank = -1;
  for (const liveId of live) {
    const rank = order.indexOf(liveId);
    // An already-invalid live id (shouldn't happen — applyDensity keeps this clean)
    // sorts last, so it is the first to be demoted.
    const effectiveRank = rank === -1 ? Number.POSITIVE_INFINITY : rank;
    if (effectiveRank > worstRank) {
      worstRank = effectiveRank;
      worst = liveId;
    }
  }
  if (worst === undefined) return [...live].sort(byOrder);

  return live.map((liveId) => (liveId === worst ? id : liveId)).sort(byOrder);
}

/**
 * Grows or shrinks the live set to size `n`, preserving existing members (sticky):
 * growing appends the next sessions by sort order into freed slots; shrinking drops the
 * lowest-priority current members. Also the mechanism that lets a newly-launched session
 * fill a free slot (plan edge case 7) — calling this on every session-list change is a
 * no-op once already at capacity with only valid members.
 */
export function applyDensity(live: readonly number[], n: number, sessions: readonly Session[]): number[] {
  const order = sortedIds(sessions);
  const known = new Set(order);
  const byOrder = (a: number, b: number): number => order.indexOf(a) - order.indexOf(b);

  const stillValid = live.filter((id) => known.has(id)).sort(byOrder);
  if (stillValid.length >= n) return stillValid.slice(0, n);

  const result = [...stillValid];
  for (const id of order) {
    if (result.length >= n) break;
    if (!result.includes(id)) result.push(id);
  }
  return result;
}

export interface SurfaceDiff {
  toOpen: number[];
  toClose: number[];
  toKeep: number[];
}

/** Which session ids need a new terminal socket opened, closed, or left alone, given the
 * previously-live and newly-desired live sets (REQ-11/INV-3: only actually-changed live
 * surfaces are ever touched). */
export function surfaceDiff(before: readonly number[], after: readonly number[]): SurfaceDiff {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    toOpen: after.filter((id) => !beforeSet.has(id)),
    toClose: before.filter((id) => !afterSet.has(id)),
    toKeep: after.filter((id) => beforeSet.has(id)),
  };
}
