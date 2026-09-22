---
name: review-maintainability
description: "A newcomer's read of a plan's code changes with the sibling modules open and the plan withheld: duplication, divergence from neighbours, layering, guards, size reasons."
argument-hint: "<plan-name> [cycle N] | <plan-name> Scope: <paths>"
allowed-tools: Agent, Read
disable-model-invocation: true
---

Spawn the `review-maintainability` agent — `Agent` tool, `subagent_type: "review-maintainability"` — with the prompt:

```
Execute the maintainability review for plan: $ARGUMENTS
Project root: <the directory containing .claude/>
GATES_LOG_DIR: <the gate run's log directory, or "none — standalone run">
```

Pass any cycle word or `Scope:` line in `$ARGUMENTS` through verbatim (a cleanup session uses
`Scope:` to review a directory instead of a plan's diff). Do not read
`.claude/agents/review-maintainability.md` and follow it inline: its boundaries only hold when spawned.
