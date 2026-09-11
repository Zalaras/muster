---
name: web-tests
description: "Writes Vitest unit tests for a plan's dashboard logic."
argument-hint: "<plan-name>"
allowed-tools: Agent, Read
disable-model-invocation: true
---

Spawn the `web-tests` agent — `Agent` tool, `subagent_type: "web-tests"` — with the prompt:

```
Execute the web testing task for plan: $ARGUMENTS
Project root: <the directory containing .claude/>
```

Pass any mode or cycle word in `$ARGUMENTS` through verbatim. Do not read `.claude/agents/web-tests.md`
and follow it inline: its model, boundaries and output contract only hold when the agent is spawned.
