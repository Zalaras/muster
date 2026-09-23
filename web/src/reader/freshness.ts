// Pure freshness-cue text (REQ-18, W9; kb:adr/reader-change-signal-is-the-write-hook) —
// the docbar's `.chg` element renders this whenever a write has been seen for the open
// file; render/reader.ts omits the element entirely otherwise (REQ-24), never calling
// this with a null timestamp.
import { ageAgo } from "../sessions/format";

/** `changed <age> ago`, reusing the same relative-age buckets ("now", "2m", "1h", "2d")
 * and the same "now", not "now ago" grammar every other "how stale is this" readout in
 * the dashboard already uses via `ageAgo` — a fresh bucket every tick's re-render, not a
 * distinct per-second formatter of its own. */
export function changedText(writtenAtIso: string, now: Date): string {
  return `changed ${ageAgo(writtenAtIso, now)}`;
}
