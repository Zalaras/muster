---
name: e2e-specs
description: "Authors or validates Playwright E2E tests for a plan (Claude Code faked via synthesized payloads)."
argument-hint: "<plan-name> [authoring|validate|fix]"
allowed-tools: Agent, Read
---

Spawn the `e2e-specs` agent — `Agent` tool, `subagent_type: "e2e-specs"` — with the prompt:

```
Execute the E2E specs task for plan: $ARGUMENTS
Project root: <the directory containing .claude/>
```

Pass any mode or cycle word in `$ARGUMENTS` through verbatim. Do not read `.claude/agents/e2e-specs.md`
and follow it inline: its model, boundaries and output contract only hold when the agent is spawned.
