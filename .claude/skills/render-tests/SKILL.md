---
name: render-tests
description: "Writes Playwright render tests for a plan's display properties against generated daemon fixtures, no daemon."
argument-hint: "<plan-name>"
allowed-tools: Agent, Read
disable-model-invocation: true
---

Spawn the `render-tests` agent — `Agent` tool, `subagent_type: "render-tests"` — with the prompt:

```
Execute the render testing task for plan: $ARGUMENTS
Project root: <the directory containing .claude/>
```

Pass `$ARGUMENTS` through verbatim. Do not read `.claude/agents/render-tests.md`
and follow it inline: its model, boundaries and output contract only hold when the agent is spawned.
