---
name: review-work
description: "Reviews all of a plan's implementation and test changes against the plan and Muster's hard rules."
argument-hint: "<plan-name> [cycle N]"
allowed-tools: Agent, Read
---

Spawn the `review-work` agent — `Agent` tool, `subagent_type: "review-work"` — with the prompt:

```
Execute the review task for plan: $ARGUMENTS
Project root: <the directory containing .claude/>
```

Pass any mode or cycle word in `$ARGUMENTS` through verbatim. Do not read `.claude/agents/review-work.md`
and follow it inline: its model, boundaries and output contract only hold when the agent is spawned.
