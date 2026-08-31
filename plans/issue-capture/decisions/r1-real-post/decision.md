# Decision: how R1 (the real verification post) gets run

**Reached by**: user decision (AskUserQuestion, 2026-08-31)
**Source**: plans/issue-capture/review.md, Orchestrator item 1

## Question

R1 — the plan's single real post to `Zalaras/muster` — was denied by the permission
classifier inside the review subagent. Who runs it, and when?

## Outcome

**The pipeline runs R1**: after the fix waves and the delta re-review, the orchestrator
executes the four R1 steps from the main session, where Damian approves the permission
prompts live. The result is pasted into plans/issue-capture/review.md as the plan requires.
