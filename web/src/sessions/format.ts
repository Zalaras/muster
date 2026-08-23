// Pure time formatters (docs/protocol.md Implementation Notes: "stateSince/
// attention.since are daemon truth; the ticking is rendering. Keep formatters pure for
// Vitest."). Design-system §2: every value that changes over time gets tabular-nums —
// enforced in CSS, not here, but these functions are what feeds those elements.

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Elapsed whole seconds between `sinceIso` and `now`, clamped to zero — an unparsable
 * timestamp or a clock that races the render tick must never show a negative duration. */
export function elapsedSeconds(sinceIso: string, now: Date): number {
  const since = Date.parse(sinceIso);
  if (Number.isNaN(since)) return 0;
  return Math.max(0, Math.floor((now.getTime() - since) / 1000));
}

/** The ticking rail-card timer. MM:SS under an hour, then `Nh`, then `Nd` — precision
 * that stops mattering past the first hour. */
export function formatTimer(sinceIso: string, now: Date): string {
  const seconds = elapsedSeconds(sinceIso, now);
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${pad2(minutes)}:${pad2(secs)}`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h`;
  }
  return `${Math.floor(seconds / 86400)}d`;
}

/** Coarse relative age for the launch modal's MRU list (ux-flows §1.1: "2m", "1h", "2d"). */
export function formatAge(sinceIso: string, now: Date): string {
  const seconds = elapsedSeconds(sinceIso, now);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// M3 (plan m3-gauges): the single ≥60%-used threshold shared by every gauge surface —
// a masthead usage bar takes `warn` and a context track takes `hot` at this value
// (design-system §5 "Gauge thresholds"). Compared against the raw (unrounded) percentage,
// never the display-rounded one, so a bar reading "60%" on screen because of rounding a
// 59.6 doesn't also falsely claim the threshold.
export const GAUGE_WARN_THRESHOLD = 60;

/** W5: absolute token counts, compact. `< 1000` verbatim, `< 1_000_000` as "NNk",
 * `>= 1_000_000` as "N.NM" (one decimal, per design-system's tabular-nums numbers). */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${Math.round(tokens / 1000)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

/** W6/REQ-14: a usage bucket's or session context's reset time, compactly — same local
 * day as `now` renders `resets HH:MM`, otherwise the short weekday (`resets Fri`). Uses
 * the client's local timezone (R5) — the daemon ships UTC RFC3339Nano; `Date`'s local
 * getters do the conversion. */
export function formatResets(resetsAtIso: string, now: Date): string {
  const resetsAt = new Date(resetsAtIso);
  const sameDay =
    resetsAt.getFullYear() === now.getFullYear() &&
    resetsAt.getMonth() === now.getMonth() &&
    resetsAt.getDate() === now.getDate();
  if (sameDay) {
    return `resets ${pad2(resetsAt.getHours())}:${pad2(resetsAt.getMinutes())}`;
  }
  return `resets ${resetsAt.toLocaleDateString(undefined, { weekday: "short" })}`;
}
