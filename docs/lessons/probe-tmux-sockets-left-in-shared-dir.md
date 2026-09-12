---
id: probe-tmux-sockets-left-in-shared-dir
type: lesson
status: active
date: 2026-08-23
summary: A quick probe started tmux with -L names and left sockets in the shared /private/tmp/tmux-*/ dir; probes use -S in a scratch dir and kill-server.
features: []
tags: [tmux, testing]
roles: [daemon-impl, daemon-tests, e2e-validate]
files: []
tests: []
refs: [plan:m2-terminal, .claude/agents/daemon-impl.md, CLAUDE.md, .claude/skills/orchestrate/scripts/orch-cleanup.sh]
---
**What happened.** An implementer verified a change with a throwaway tmux server started with `-L <name>`. Named sockets live in the shared `/private/tmp/tmux-<uid>/` directory, so the probe's sockets sat beside the daemon's own and the server outlived the session.

**Cost.** Stray servers and socket files to find and kill by hand, and a later test could have attached to the wrong server.

**What changed.** Ad-hoc probes follow the same hygiene as tests: `-S <path>` inside a scratch directory that is deleted afterwards, and `kill-server` when done. The orchestrator's cleanup script sweeps stale `-L` sockets at completion.
