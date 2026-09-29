---
name: doc-reconcile
description: "Reconciles the feature specs and protocol document with what the code actually does. Use for doc upkeep after a change that skipped the pipeline."
argument-hint: "<plan-name> | --files <path>..."
allowed-tools: Agent, Read
disable-model-invocation: true
---

Spawn the `doc-reconcile` agent — `Agent` tool, `subagent_type: "doc-reconcile"` — with the prompt:

```
Execute the doc reconciliation task for: $ARGUMENTS
Project root: <the directory containing .claude/>
```

Pass `$ARGUMENTS` through verbatim; with none, the agent reconciles the working tree against `HEAD`. Do not read `.claude/agents/doc-reconcile.md` and follow it inline:
its boundaries and output contract only hold when the agent is spawned.
