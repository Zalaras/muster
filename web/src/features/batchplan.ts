// Which sessions a batch Stop or Remove confirms, counts and sends: DOM-free, so the rule is
// pinned by a unit test and read in one place by `actions.dispatchMany` and the header menu's
// Stop all… enablement (kb:adr/actions-bulk-stop-remove-are-daemon-batches).

/** The two fields the plan reads; a `Session` satisfies it. */
export interface PlannedSession {
  id: number;
  alive: boolean;
}

export interface BatchPlan {
  /** The ids the request carries, in the order of `sessions`. */
  ids: number[];
  /** How many of `ids` are alive; Remove says so, since each is stopped first. */
  live: number;
}

/** What a batch of `ids` does against `sessions`, or `null` when there is nothing to confirm.
 * An id not in `sessions` (removed by another window since it was chosen) is dropped. Stop only
 * reaches a live session, so an ended one is dropped too; Remove keeps every known id. */
export function batchPlan(
  action: "end" | "remove",
  ids: readonly number[],
  sessions: readonly PlannedSession[],
): BatchPlan | null {
  const known = sessions.filter((s) => ids.includes(s.id));
  const kept = action === "end" ? known.filter((s) => s.alive) : known;
  if (kept.length === 0) return null;
  return {
    ids: kept.map((s) => s.id),
    live: kept.filter((s) => s.alive).length,
  };
}
