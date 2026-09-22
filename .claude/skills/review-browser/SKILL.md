---
name: review-browser
description: "Drives the real dashboard against a scratch daemon and measures a plan's user-facing claims across every host view and data state."
argument-hint: "<plan-name> [cycle N]"
allowed-tools: Agent, Read
disable-model-invocation: true
---

Spawn the `review-browser` agent — `Agent` tool, `subagent_type: "review-browser"` — with the prompt:

```
Execute the browser review for plan: $ARGUMENTS
Project root: <the directory containing .claude/>
GATES_LOG_DIR: <the gate run's log directory, or "none — standalone run">
```

Pass any cycle word in `$ARGUMENTS` through verbatim. Do not read `.claude/agents/review-browser.md`
and follow it inline: its model, rig isolation and output contract only hold when the agent is spawned.
