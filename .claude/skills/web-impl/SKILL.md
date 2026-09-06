---
name: web-impl
description: "Implements dashboard changes from a plan: TypeScript, Vite, no framework."
argument-hint: "<plan-name> [fix]"
allowed-tools: Agent, Read
---

Spawn the `web-impl` agent — `Agent` tool, `subagent_type: "web-impl"` — with the prompt:

```
Execute the web implementation task for plan: $ARGUMENTS
Project root: <the directory containing .claude/>
```

Pass any mode or cycle word in `$ARGUMENTS` through verbatim. Do not read `.claude/agents/web-impl.md`
and follow it inline: its model, boundaries and output contract only hold when the agent is spawned.
