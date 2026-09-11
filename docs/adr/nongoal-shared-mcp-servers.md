---
id: nongoal-shared-mcp-servers
type: decision
status: rejected
date: 2026-08-16
summary: No shared MCP server instances across sessions; that is an MCP proxy, a separate project, and Muster makes no v1 accommodation for it.
features: []
tags: [revisit]
files: []
tests: []
refs: [SPEC.md, docs/history/interview-notes.md]
supersedes: []
---
**Context.** An MCP server configured per project starts once per Claude Code session, so a heavyweight one such as a Docker-hosted Grafana server runs several times over when sessions share a repo. One shared instance would remove the waste.

**Options.** (A) Have Muster host or proxy MCP servers so every session talks to one instance. (B) Leave MCP configuration entirely to Claude Code and treat the proxy as a future project of its own.

**Decision.** B. A proxy is a project in itself; if it ever exists, Muster's daemon is the natural host, but nothing is pre-built for it.

**Consequences.** Muster reads and writes no MCP configuration and knows nothing about which servers a session runs. The daemon's process model stays sessions only.
