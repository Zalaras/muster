---
id: nongoal-generic-agent-abstraction-layer
type: decision
status: rejected
date: 2026-08-16
summary: Other agent CLIs are a maybe; the only concession is the internal/claudecode adapter boundary, not a generic multi-agent plugin layer.
features: [ingest, launch]
tags: [claude-code-format, revisit, user-decision]
files: [internal/claudecode/doc.go]
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, CLAUDE.md, kb:adr/ingest-wire-shaped-fixtures-via-claudecodetest, kb:adr/canary-version-gated-adapters-not-built, kb:adr/process-naming-muster]
supersedes: []
---
**Context.** The name Muster was chosen so nothing ties the tool to Claude, and supporting another agent CLI someday is plausible. Designing for that now would mean an abstraction over hooks, status lines and launch flags that only one implementation would exercise.

**Options.** (A) A generic agent interface with Claude Code as its first plugin. (B) One package boundary: everything that knows Claude Code's formats lives in a single adapter package, and no abstraction above it until a second agent exists.

**Decision.** B. A generic layer was dismissed as over-engineering for a personal tool.

**Consequences.** The boundary is a hard rule: hook payload shapes, status-line JSON, CLI flags and transcript paths never leak into other packages, and a fix that wants to leak is a sign the boundary is being violated. Tests outside the package get wire-shaped fixtures from a helper package. A second agent would be a second adapter package and the moment to consider an interface.
