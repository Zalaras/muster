---
id: process-naming-muster
type: decision
status: accepted
date: 2026-08-16
summary: The tool is named Muster, chosen against two constraints; no collision with an existing product or trademark, and nothing tying it to Claude.
features: []
tags: [user-decision]
files: [README.md, go.mod]
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, kb:adr/nongoal-generic-agent-abstraction-layer, kb:adr/surfaces-one-tmux-session-per-session]
supersedes: []
---
**Context.** The working titles were CCC, for Claude Code Control, and Claude Control Plane, and the mockup used Relay. Damian set two constraints: the name must not collide with an existing product or trademark, and it must not contain Claude or cc, because a possible future supports other agent CLIs.

**Options.** Checked and rejected: tower, an existing Git client; wheelhouse, a registered trademark; belfry, an active company; roost and pitwall, crowded; ccmux, Claude-specific; Relay, a working name Damian never chose. Runners-up: reeve and drover. Muster: only two dormant Go libraries, no product, no trademark, and it describes the job of assembling a group and reviewing it.

**Decision.** Muster. The daemon binary is musterd and the module path carries the name.

**Consequences.** tmux sessions, the tmux socket, the data directory and the settings entries all carry the muster prefix. Supporting another agent CLI costs no rename.
