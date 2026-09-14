// Pure freshness-cue text (REQ-18, W9; kb:adr/reader-change-signal-is-the-write-hook) —
// the docbar's `.chg` element renders this whenever a write has been seen for the open
// file; render/reader.ts omits the element entirely otherwise (REQ-24), never calling
// this with a null timestamp.
import { agoSuffix, formatAge } from "../sessions/format";

/** `changed <age> ago`, reusing the same relative-age buckets ("now", "2m", "1h", "2d")
 * every other "how stale is this" readout in the dashboard already uses — a fresh
 * bucket every tick's re-render, not a distinct per-second formatter of its own.
 * review markdown-viewing cycle-1 Major 2: goes through `agoSuffix` rather than
 * appending " ago" directly, so the sub-minute bucket reads "changed now", not the
 * ungrammatical "changed now ago" — the same defect `formatEndedAgo` was already fixed
 * for on the plan's most common path (a file just written). */
export function changedText(writtenAtIso: string, now: Date): string {
  return `changed ${agoSuffix(formatAge(writtenAtIso, now))}`;
}
