---
name: daemon-tests
description: "Writes Go unit tests for a plan's daemon implementation."
argument-hint: "<plan-name>"
allowed-tools: Agent, Read
disable-model-invocation: true
---

Spawn the `daemon-tests` agent — `Agent` tool, `subagent_type: "daemon-tests"` — with the prompt:

```
Execute the daemon testing task for plan: $ARGUMENTS
Project root: <the directory containing .claude/>
```

Pass any mode or cycle word in `$ARGUMENTS` through verbatim. Do not read `.claude/agents/daemon-tests.md`
and follow it inline: its model, boundaries and output contract only hold when the agent is spawned.
