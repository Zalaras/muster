---
id: rename-pushed-to-claude-once
type: decision
status: accepted
date: 2026-10-15
summary: A rename is sent to Claude Code once, via the next UserPromptSubmit reply's sessionTitle or --name on resume; no duplicate-name warning or registry read-back.
features: [rename, ingest, launch]
tags: [claude-code-format, ux, user-decision]
files: []
tests: []
refs: [plan:rename-claude-session, kb:adr/rename-muster-owned-title-override-wins, kb:adr/ingest-seq-assigned-at-ingest, kb:fact/hook-output-sets-session-title, kb:fact/session-name-uniqueness-flagged, kb:fact/session-name-survives-clear-compact-resume, "#71"]
supersedes: [rename-pushed-to-claude-via-prompt-hook]
---
**Context.** kb:adr/rename-pushed-to-claude-via-prompt-hook chose the prompt-hook route, but sent
the title "while an override differs from Claude Code's name". With Claude Code's uniqueness flag
on, a duplicate name comes back suffixed (kb:fact/session-name-uniqueness-flagged), never matches,
and would be re-sent — and re-suffixed — on every prompt. Its duplicate-name warning needed a
daemon↔UI protocol change, and its registry read-back a Claude Code file format first seen on
2.1.289.

**Options.** (A) Keep the 2026-10-05 decision whole. (B) The same route, each override value sent
once, without the warning or the read-back.

**Decision.** B, chosen by the developer. A rename to a new value arms one send: the next routed
`UserPromptSubmit` reply carries it as `hookSpecificOutput.sessionTitle`, or a resume passes it as
`--name`, whichever comes first. Nothing re-sends it, whatever name Claude Code then reports. A
value already equal to Claude Code's last-known name is not sent. What was sent is held in memory,
so a daemon restart can send a pending value once more.

**Consequences.** Claude Code never refuses a duplicate name, so no rename errors; a suffixed name
stays suffixed in Claude Code, and the dashboard follows it
(kb:adr/rename-claude-change-after-delivery-clears-override). A lost reply is not retried until the next rename or a resume. The hook wrapper prints a
2xx body to stdout; every other reply is empty, so ingest still answers at once.
