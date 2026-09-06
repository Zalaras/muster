---
name: daemon-impl
description: "Implements Go daemon changes from a plan: ingest, state machine, storage, tmux/PTY, HTTP/WS."
argument-hint: "<plan-name> [fix]"
allowed-tools: Agent, Read
---

Spawn the `daemon-impl` agent — `Agent` tool, `subagent_type: "daemon-impl"` — with the prompt:

```
Execute the daemon implementation task for plan: $ARGUMENTS
Project root: <the directory containing .claude/>
```

Pass any mode or cycle word in `$ARGUMENTS` through verbatim. Do not read `.claude/agents/daemon-impl.md`
and follow it inline: its model, boundaries and output contract only hold when the agent is spawned.
