# Decision: a resumed session with no recorded model reads "unknown"

**Reached by**: user decision (the developer, 2026-09-27; put to the developer instead of the decide skill because it was a small Minor asked alongside two user-decisions)
**Raised by**: review cycle 1, browser Minor 1 `[orchestrator:decision]`.

**Options.** (A) The mainhead meta renders `model unknown` for a null model, and a spec asserts it. (B) Amend the States row to "the clause is omitted".

**Outcome.** A. "We'll use unknown." This matches the plan's States row as approved; no plan text changes.
→ kb:adr/launch-resume-null-model-reads-unknown
