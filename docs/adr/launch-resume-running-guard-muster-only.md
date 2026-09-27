---
id: launch-resume-running-guard-muster-only
type: decision
status: proposed
date: 2026-09-27
summary: A listed session is disabled only when an alive Muster session is bound to it; sessions running outside Muster cannot be detected and stay enabled.
features: [launch]
tags: [user-decision]
files: []
tests: []
refs: [plan:resume-and-dangerously-allow, kb:fact/no-running-session-signal]
supersedes: []
---
**Context.** The developer wanted every running session disabled in the list, falling back to
Muster's own if nothing reliable exposes the rest. The probe found nothing.

**Options.** (A) Guess from transcript age or process argv. (B) Muster's alive rows only.

**Decision.** B. Nothing stable maps a running process to a session id; a guess would disable
sessions that are not running, or miss ones that are.

**Consequences.** Resuming a session also open in a plain terminal puts two processes on one
conversation; Claude Code, not Muster, owns that case.
