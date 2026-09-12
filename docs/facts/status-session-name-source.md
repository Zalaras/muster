---
id: status-session-name-source
type: fact
status: active
date: 2026-09-11
summary: Status-line session_name carries --name when given, otherwise a title Claude Code auto-generates; it is absent until one exists.
features: [rename, usage]
tags: [claude-code-format]
files: [internal/claudecode/status.go, internal/session/manager.go]
tests: [TestInterpretStatus_PreFirstResponse_SessionNameSurfacesAsTitle, TestInterpretStatus_EmptySessionNameDoesNotSurfaceAsATitle]
refs: [spikes/FINDINGS.md]
verified: 2.1.233..2.1.267
guard: none
---
`session_name` in the status line has two sources. With `--name "Spike Title Probe"` it carries
that name (kb:fact/name-flag-reaches-title). Without `--name`, Claude Code auto-generates one
from session content (observed: `"Run echo hello bash command"`). It is absent from the
earliest posts, before a title has been derived, and a one-turn "say hi" session may never
derive one: on the 2.1.246 canary it was absent on every post of the interactive run, 2/2
runs. Treat it as optional.

Evidence: 2.1.233 spikes (FINDINGS §6) and the 2.1.246 canary. A resume inherits the name:
run E is launched without `--name` and its last status post still read `"Muster Canary"`
(2.1.269, 2026-09-12).

Stays a `/interface-probe` ritual, deliberately (2026-09-12). The `--name` half is asserted by
`TestStatusLineFields`; the auto-generated half would need a second interactive run without
`--name`, and by this record's own measurement a one-turn "say hi" session may never derive a
name at all — so the assertion would pass or fail on luck, which is worse than no gate.
