---
name: review-work
description: "Correctness review of a plan's implementation and test changes against the plan, the protocol contract and Muster's hard rules."
argument-hint: "<plan-name> [cycle N]"
allowed-tools: Agent, Read
disable-model-invocation: true
---

Spawn the `review-work` agent — `Agent` tool, `subagent_type: "review-work"` — with the prompt:

```
Execute the review task for plan: $ARGUMENTS
Project root: <the directory containing .claude/>
```

Pass any cycle word in `$ARGUMENTS` through verbatim. Do not read `.claude/agents/review-work.md`
and follow it inline: its model, boundaries and output contract only hold when the agent is spawned.
