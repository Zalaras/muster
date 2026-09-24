// Pure derivation for one masthead usage bucket's readout (design-system §5 "Gauge
// thresholds"; §6.1 honesty rule) — one derivation, one renderer (render/masthead.ts's
// `renderUsageBucket`), matching `sessions/context.ts`'s `buildContextRowViewModel` /
// `render/context.ts` pair for the context gauge (review Major 2). `#usage-5h`,
// `#usage-7d` and `#usage-model-week`'s own percent/bar/resets slice all share this same
// shape — a `UsageBucket` and a `ModelWindow` (protocol/usage.ts) carry the same
// `usedPct`/`resetsAt` pair, just from two different daemon sources.
import { formatResets, GAUGE_WARN_THRESHOLD } from "./format";

/** The subset of `UsageBucket`/`ModelWindow` this derivation needs — both protocol types
 * already carry exactly these two fields. */
export interface UsageBucketSource {
  usedPct: number;
  resetsAt: string;
}

export interface UsageBucketViewModel {
  /** `"42%"`, or `"unknown"` — design-system §6.1: never a percentage guessed from a
   * stale or absent sample. */
  percentText: string;
  /** design-system §5 "Gauge thresholds": raw (unrounded) `usedPct` >= 60. Always false
   * when unknown. */
  warn: boolean;
  /** Rounded, display-only. `null` iff the bucket is unknown — honesty rule 1: no track
   * at all, never a 0%-filled one. */
  fillPercent: number | null;
  /** `null` iff the bucket is unknown. */
  resetsText: string | null;
}

export function buildUsageBucketViewModel(
  bucket: UsageBucketSource | null,
  now: Date,
): UsageBucketViewModel {
  if (!bucket) {
    return { percentText: "unknown", warn: false, fillPercent: null, resetsText: null };
  }
  const pct = Math.round(bucket.usedPct);
  return {
    percentText: `${pct}%`,
    warn: bucket.usedPct >= GAUGE_WARN_THRESHOLD,
    fillPercent: pct,
    resetsText: `· ${formatResets(bucket.resetsAt, now)}`,
  };
}
