---
id: ingest-sessionstart-command-wrapper
type: decision
status: superseded
date: 2026-08-16
summary: SessionStart is delivered through a command-wrapper hook because it is never delivered over an http hook; the other events stay http.
features: [ingest]
tags: [claude-code-format, envelope]
files: [internal/claudecode/settings.go]
tests: []
refs: [docs/history/spec-changelog.md, kb:fact/sessionstart-not-over-http, spikes/FINDINGS.md]
supersedes: []
---
**Context.** The spec had promised no wrapper scripts: every hook would be an http hook posting straight to the daemon. The spike then showed that the one event that starts a session is silently dropped on that transport.

**Options.** (A) Do without SessionStart and infer the start from the first later event. (B) Register SessionStart alone as a command wrapper that posts its stdin, keeping every other event on http. (C) Make every hook a command wrapper.

**Decision.** B. One wrapper for one event was the smallest change that kept the http design and the transport facts consistent.

**Consequences.** Muster writes one script into its data dir and registers it for SessionStart; that script is also where the envelope that binds a Claude session to a Muster session is first added. The mixed transport lasted until the http entries' own costs were measured, at which point the superseding record made every hook a wrapper.
