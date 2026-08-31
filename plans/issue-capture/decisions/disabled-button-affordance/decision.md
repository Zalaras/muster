# Decision: disabled-button affordance (review cycle 1, Minor 5)

**Reached by**: user decision (AskUserQuestion, 2026-08-31)
**Source**: plans/issue-capture/review.md, Minor 5 `[orchestrator:decision]`

## Question

No disabled button anywhere in Muster has a visual disabled state, and this plan is the
first to disable a filled amber primary (`#issue-submit-button` measured pixel-identical
enabled vs disabled). Scope question — reviewer's two options quoted in review.md.

## Outcome

**Option B — leave it, file the sweep.** Ship as-is (consistent with every other disabled
button today); an app-wide `.btn:disabled` token pass goes to `TODO.md`. No code change in
this plan.
