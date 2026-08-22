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
