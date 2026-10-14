import type { Session, SessionCache, SessionState } from "../protocol/session";
import { remainingSeconds, remainingText } from "./format";

export type CacheState = "warm" | "cooling" | "cold" | "unknown";

export interface Warmth {
  state: CacheState;
  fraction: number;
  hover: string;
}

const COOLING_PERCENT = 15;

const WAITING_STATES: ReadonlySet<SessionState> = new Set(["idle", "needs_input", "failed"]);

export function cacheWarmth(cache: SessionCache | null, now: Date): Warmth {
  if (cache === null) return { state: "unknown", fraction: 0, hover: "cache unknown" };
  const remaining = remainingSeconds(cache.expiresAt, now);
  if (remaining <= 0) return { state: "cold", fraction: 0, hover: "cache cold" };
  const cooling = remaining * 100 <= cache.ttlSeconds * COOLING_PERCENT;
  return {
    state: cooling ? "cooling" : "warm",
    fraction: Math.min(1, remaining / cache.ttlSeconds),
    hover: `cache warm · cold in ${remainingText(remaining)}`,
  };
}

export function waitingMembers(cards: readonly Session[]): Session[] {
  return cards.filter((card) => card.alive && WAITING_STATES.has(card.state));
}

export function latestEntered(members: readonly Session[]): Session | null {
  let latest: Session | null = null;
  for (const member of members) {
    if (latest === null || Date.parse(member.stateSince) > Date.parse(latest.stateSince)) {
      latest = member;
    }
  }
  return latest;
}

export function groupWarmthHover(members: readonly Session[], now: Date): string {
  const remaining = members.flatMap((m) =>
    m.cache ? [remainingSeconds(m.cache.expiresAt, now)] : [],
  );
  if (remaining.length === 0) return "cache unknown";
  const warm = remaining.filter((r) => r > 0);
  if (warm.length === 0) return `all ${remaining.length} cold`;
  return `${warm.length} of ${remaining.length} warm · next cold in ${remainingText(Math.min(...warm))}`;
}
