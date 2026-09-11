// Pure derivation for the M3 context-row gauge (design-system §5's card `.r3` / tile
// `.ctxinfo`; REQ-13's "one derivation, two renderers" — render/context.ts is the only
// DOM consumer). Honesty rule 1 (design-system §6): unknown context never derives a
// percentage or a track — `usedPct`/`totalInputTokens`/`windowSize` are all-null or
// all-non-null on the wire (protocol INV-2), so checking either of the first two is
// sufficient to know the whole triple's state.
import type { SessionContext } from "../protocol";
import { formatTokens, GAUGE_WARN_THRESHOLD } from "./format";

export interface ContextRowViewModel {
  known: boolean;
  /** Rounded, display-only (kb:anchor/ws.usage: percentages are floats end-to-end). Null iff
   * `!known`. */
  pct: number | null;
  /** `formatTokens(totalInputTokens)`. Null iff `!known`. */
  tokensText: string | null;
  /** design-system §5 "Gauge thresholds": raw (unrounded) `usedPct` >= 60. Always false
   * when unknown. */
  hot: boolean;
  compactions: number;
}

export function buildContextRowViewModel(context: SessionContext): ContextRowViewModel {
  const { usedPct, totalInputTokens, compactions } = context;
  if (usedPct === null || totalInputTokens === null) {
    return { known: false, pct: null, tokensText: null, hot: false, compactions };
  }
  return {
    known: true,
    pct: Math.round(usedPct),
    tokensText: formatTokens(totalInputTokens),
    hot: usedPct >= GAUGE_WARN_THRESHOLD,
    compactions,
  };
}
