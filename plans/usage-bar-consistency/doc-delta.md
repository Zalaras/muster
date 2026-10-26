# Doc delta — usage-bar-consistency

Seeded from `plan.md` § Doc Delta, then amended with the implementation logs' `doc-delta:` lines
(orchestrator, 2026-10-26).

## From the plan

**usage** (`docs/features/usage/spec.md`, 758 words; may pass 800 — the size-budget review in `TODO.md` § Tooling and docs covers it, so no true sentence is cut to fit) — becomes true:
- § Account-level bars: "The masthead shows a five-hour bar and a seven-day bar, each with a used
  percentage and its reset time, from the status line's rate-limit buckets
  (kb:fact/rate-limits-wire-shape) and the usage call below (kb:fact/usage-api-oauth-shape); each
  bucket takes the newest value whose reset is still ahead."
- § Account-level bars: "After a daemon restart the buckets are unknown until the start-up usage
  call or a status post (kb:adr/usage-no-hydration-across-restart)."
- § Account-level bars, third-bar paragraph: "The daemon calls Claude Code's OAuth usage endpoint
  at start, on the `-usage-poll` interval (zero disables it), at each bar's reset, and when the
  masthead refresh control asks through `kb:anchor/usage.refresh`, coalesced to one in-flight
  call."
- § Honesty: "A bar whose reset has passed reads unknown until a fresh value arrives."

**usage** — stops being true:
- "from the status line's rate-limit buckets (kb:fact/rate-limits-wire-shape)" as the sole source.
- "After a daemon restart the buckets are unknown until the next status post".
- "The daemon polls Claude Code's OAuth usage endpoint on the `-usage-poll` interval, where zero
  disables it, and a masthead refresh control wakes it early through `kb:anchor/usage.refresh`,
  coalesced to one in-flight fetch".

`docs/protocol.md` — as the Protocol Contract (merged at approval).

## From the implementation logs

- daemon-impl: `docs/features/usage/spec.md` "Does not": "one aggregator carry both sources" stays
  true; the `Aggregator` is now two-writer, so no sentence there may claim one writer.
- daemon-impl: the usage poller is built also when only the buckets matter, so any spec text
  calling it "the per-model poller" is now "the usage poller".
- daemon-impl: `internal/usage/CLAUDE.md` invariants — already done by the orchestrator
  (b5fb869b); not doc-reconcile's.
- web-impl: none beyond the plan's Doc Delta.

## From review cycle 1 (orchestrator)

- correctness Major 2 — **usage** § Honesty, stops being true: "Rate limits are unknown before a
  session's first response" — the start-up usage call now fills the 5h and 7d bars before any
  session responds. Still true: they are absent under API-key authentication (the call fails
  without OAuth). kb:fact/unknown-before-first-response stays true of the status line itself.
- correctness Minor 1 — `docs/protocol.md` § `ws.usage`: the `sampledAt` field comment "when the
  last bucket value was adopted" becomes "when the last change was adopted" (a model-only change
  re-stamps it too, as the section's prose already says).

## From review cycle 2 (orchestrator)

- correctness Minor 1 — `docs/protocol.md` § `ws.usage` example (~line 1441): the modelScoped
  `resetsAt` `"2026-09-01T13:59:59Z"` becomes `"2026-09-01T14:00:00Z"` — the daemon now rounds the
  usage call's `resets_at` up to the whole second (kb:adr/usage-call-resets-rounded-up-to-the-second).
  Any other usage-call `resetsAt` example in that section with a :59 second follows the same rule.
