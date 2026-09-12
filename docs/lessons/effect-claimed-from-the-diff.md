---
id: effect-claimed-from-the-diff
type: lesson
status: active
date: 2026-09-10
summary: A 'closed' world-readable window left the WAL sidecar readable; 'references updated' missed a Go comment. Effects are measured and pasted, absences grepped.
features: []
tags: [pipeline, security]
roles: [daemon-impl, web-impl, review]
files: []
tests: []
refs: [plan:m1-sessions, plan:version-claude-interface, CLAUDE.md, .claude/skills/orchestrate/scripts/dead-refs.py]
---
**What happened.** Two claims stated from the diff were false. An implementer wrote that a world-readable window on the database was closed; the file mode was fixed, but the WAL sidecar was still readable, and only an `ls -l` showed it. Another wrote "remaining references updated" after a rename; a Go comment still cited the old name and the reviewer's tree-wide grep found it.

**Cost.** A review finding each, one of them security-relevant, on work the logs had declared complete.

**What changed.** A claim about an effect, nothing can leak, the row is hidden, the handler returns immediately, is verified by a measurement pasted into the log: the `ls -l`, the curl, the query output, the observed DOM. A claim that a symbol, path or wording no longer exists needs the tree-wide grep pasted, and `dead-refs.py` fails the gate on a cited path that does not exist.
