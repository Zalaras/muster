// Pure time/number formatters — `stateSince`/`attention.since` (`kb:anchor/ws.session`)
// are daemon truth; the ticking is rendering, so these formatters stay pure for Vitest.
// Design-system §2: every value that changes over time gets tabular-nums —
// enforced in CSS, not here, but these functions are what feeds those elements. Also
// holds the one gauge-warn threshold (`GAUGE_WARN_THRESHOLD`) every usage/context surface
// shares, and `formatTokens`, since both travel with the readouts these formatters feed.

export function pad2(n: number): string {
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

/** Coarse relative age since `sinceIso`, in one bucket ("now", "2m", "1h", "2d") — the
 * launch modal's MRU list (ux-flows §1.1), a session's ended-timer, and every other
 * "how long ago" readout in the dashboard that isn't ticking-seconds precision. */
export function formatAge(sinceIso: string, now: Date): string {
  const seconds = elapsedSeconds(sinceIso, now);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/** Every caller that composes "<age> ago" copy around `formatAge` must go through this
 * instead of appending " ago" directly — the sub-minute bucket is the literal string
 * "now" (format.test.ts asserts this deliberately), and "now ago" is ungrammatical on the
 * dashboard's most common path (looking at a session, or a file, right after the event). */
export function agoSuffix(age: string): string {
  return age === "now" ? "now" : `${age} ago`;
}

/** `agoSuffix(formatAge(...))` — mainhead, `.endbar`/`.endcap`, the tile footer, the
 * reader's changed-file readout and the update checker's "checked <age> ago" line all
 * render this instead of composing the pair themselves. */
export function ageAgo(sinceIso: string, now: Date): string {
  return agoSuffix(formatAge(sinceIso, now));
}

// The single ≥60%-used threshold shared by every gauge surface —
// a masthead usage bar takes `warn` and a context track takes `hot` at this value
// (design-system §5 "Gauge thresholds"). Compared against the raw (unrounded) percentage,
// never the display-rounded one, so a bar reading "60%" on screen because of rounding a
// 59.6 doesn't also falsely claim the threshold.
export const GAUGE_WARN_THRESHOLD = 60;

/** Absolute token counts, compact. `< 1000` verbatim, `< 1_000_000` as "NNk",
 * `>= 1_000_000` as "N.NM" (one decimal, per design-system's tabular-nums numbers). */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${Math.round(tokens / 1000)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

/** A usage bucket's or session context's reset time, compactly — same local
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
