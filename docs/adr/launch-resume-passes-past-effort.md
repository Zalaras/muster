---
id: launch-resume-passes-past-effort
type: decision
status: accepted
date: 2026-10-15
summary: Both resume paths pass the session's past effort as --effort (row's last-known level, or the transcript's last assistant effort) and show it at once.
features: [actions, past-sessions]
tags: [claude-code-format, user-decision]
files: []
tests: []
refs: [plan:effort, kb:fact/resume-does-not-restore-effort, kb:adr/launch-resume-in-original-mode-else-default, kb:adr/session-effort-tri-state-from-status-line, "#68"]
supersedes: []
---
**Context.** `--resume` does not bring effort back; `--effort` on a resume applies, and every
transcript `assistant` line records its turn's effort (kb:fact/resume-does-not-restore-effort).

**Decision.** The Resume button passes `--effort <effort.level>` when the row's last-known level is
non-null, and keeps `effort` unchanged, so the header shows that level at once. A Resume-tab resume
passes the transcript's last assistant `effort` verbatim when recorded and seeds the row's `effort`
with it, else passes none and seeds null. Neither raises the launch-mismatch warning. The developer's
call (2026-10-15): `(…)` is only for a new session with no information yet.

**Consequences.** A level shown right after a resume is what was asked for until the next status
post confirms or corrects it.
