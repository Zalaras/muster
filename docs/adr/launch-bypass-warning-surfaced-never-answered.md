---
id: launch-bypass-warning-surfaced-never-answered
type: decision
status: proposed
date: 2026-09-27
summary: Claude Code's bypass warning is surfaced from absence of signal, like the trust prompt, and never answered by Muster.
features: [launch, rail]
tags: [ux, security]
files: [web/src/sessions/card.ts]
tests: []
refs: [plan:resume-and-dangerously-allow, kb:fact/bypass-acceptance-blocks-startup, kb:adr/launch-trust-prompt-never-auto-answered]
supersedes: []
---
**Context.** An interactive bypass launch opens a warning with "No, exit" preselected; until it is
answered no hook fires and no status line posts. Whether an acceptance is remembered is
unmeasured.

**Options.** (A) Answer it for the user. (B) Surface it as the trust prompt is surfaced.

**Decision.** B. A `started` session with no Claude session id whose mode is a bypass seed says
it is likely waiting on Claude Code's bypass warning; on a first launch into the directory the
note names the trust prompt, then the warning. The note is derived from Muster's own records,
never from the pane.

**Consequences.** On a machine that already accepted, the note shows briefly until
`SessionStart` binds. Choosing "No, exit" ends the pane; the card ends with no Claude id.
