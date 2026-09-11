---
id: triage-issue-closes-when-fix-lands
type: decision
status: accepted
date: 2026-08-31
summary: An issue closes when the fix lands on main via a closes reference in the squash subject, never at triage; duplicates and invalid issues close with approval.
features: [triage, release]
tags: [pipeline, user-decision]
files: [.claude/skills/triage/SKILL.md, .claude/skills/land/SKILL.md, docs/conventions.md]
tests: []
refs: [docs/history/spec-changelog.md, kb:adr/issue-daemon-creates-issues-only, kb:adr/process-land-skill-is-the-landing-ritual]
supersedes: []
---
**Context.** The issue button makes filing cheap, so a policy was needed for what a filed issue's open state means.

**Options.** (A) Close at triage once the item is in the backlog. (B) Close only when the fix reaches main, by a closes reference in the landing commit's subject.

**Decision.** B. Closing at triage would make closed mean "we read it", destroying the one status field that survives open-sourcing, reading as a brush-off to a future reporter, and removing the duplicate-filing guard that matters most when re-filing is one click. The close is free at the other end because the subject convention already exists.

**Consequences.** The one exception is a duplicate or invalid issue, closed as such with explicit approval, a real resolution rather than a filing convention. The orchestrator never closes an issue; it records the numbers and hands off.
