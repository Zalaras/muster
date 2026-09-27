---
id: launch-resume-listed-from-transcripts-by-cwd
type: decision
status: proposed
date: 2026-09-27
summary: The Resume tab lists a directory's Claude Code sessions by reading its transcript folder's tails, filtered by each line's recorded cwd.
features: [launch]
tags: [claude-code-format, user-decision]
files: []
tests: []
refs: [plan:resume-and-dangerously-allow, kb:fact/transcript-dir-encoding, kb:fact/transcript-session-lines, "#62"]
supersedes: []
---
**Context.** Issue #62 asked to resume sessions Muster did not start. Claude Code keeps every
session's transcript under its projects directory, in a folder named by a lossy encoding of the
working directory.

**Options.** (A) Launch `claude --resume` with no id and let Claude Code's own picker run in the
terminal. (B) Muster lists the sessions in the dialog from the transcripts.

**Decision.** B with the New | Resume tabs of mockup A, the developer's choice. The daemon
locates the folder by the encoded name (by 200-character prefix when long), reads each
transcript's last 64 KB for title, last prompt, mode and model, and lists only sessions whose
recorded `cwd` is the directory. Every session is listed the same way, whoever started it.

**Consequences.** Muster depends on the transcript layout, measured on 2.1.283 and owned by
`internal/claudecode` alone. The daemon only reads there. The projects path is a flag so tests
never read the real one.
