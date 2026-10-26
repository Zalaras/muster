# Proposed backlog — usage-bar-consistency

Follow-up this run found. Nothing here is filed; `/land` puts each one to the developer.

### Pair a status post and a usage call for one window to confirm the reset rounding rule

- **Summary**: The REQ-9 round-up rule rests on one usage-API sample; a paired probe capture would settle it.
- **Source**: review.md cycle 2, correctness Note 1; kb:fact/rate-limit-resets-differ-in-precision-across-sources (`guard: none`).
- **Change requested**: no — "A paired `/interface-probe` capture would settle it." If the rule is wrong the cost is an extra row and broadcast, never a wrong display.
- **Suggested section**: Tooling and docs
- **Pre-existing**: no — this branch introduced the rule.

### Refresh usage button stays enabled when polling is off

- **Summary**: With `-usage-poll 0` the Refresh usage button looks enabled while its endpoint answers 404.
- **Source**: review.md browser part, cycle 1 Note 1 (repeated cycle 2).
- **Change requested**: no — "I am not asking for a change here; it may belong in the backlog."
- **Suggested section**: Tweaks
- **Pre-existing**: yes — the plan does not change it.

### Comment pass drops rewritten doc comments that existed on main

- **Summary**: Cycle 1's comment pass removed rewritten doc comments (`Aggregator`'s lock/writer note among them) as "added".
- **Source**: review.md maintainability part, cycle 1 report and cycle 2 Note 8.
- **Change requested**: no — reviewers file nothing on comments; raised for the developer and `/retro`.
- **Suggested section**: Tooling and docs
- **Pre-existing**: yes — comment-pass behaviour, not this plan's code.

## Decisions (the developer, 2026-10-26)

1. Pair a status post and a usage call — done before landing: probe on 2.1.310 (`test/rig/captures/capture-3.jsonl`) gave status-line resets `22:10:00`/`14:00:00` and API resets `22:10:00.826680`/`14:00:00.826698`, so rounding up does not meet the status line when the API is after the boundary. Landed as is; not filed.
2. Refresh usage button enabled when polling is off — not doing.
3. Comment pass drops rewritten doc comments — not doing.
