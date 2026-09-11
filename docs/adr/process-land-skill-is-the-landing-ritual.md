---
id: process-land-skill-is-the-landing-ritual
type: decision
status: accepted
date: 2026-08-31
summary: Landing is its own step: it gates on an approved review, composes the closing subject, shows the predicted bump, pushes, and deletes the branch by content diff.
features: [release, triage]
tags: [pipeline, user-decision]
files: [.claude/skills/land/SKILL.md, .claude/skills/orchestrate/SKILL.md]
tests: []
refs: [docs/history/spec-changelog.md, kb:adr/triage-issue-closes-when-fix-lands, kb:adr/release-versioning-automatic-from-conventional-commits]
supersedes: []
---
**Context.** Merging an approved plan branch had been an undocumented end-of-session request: the subject convention lived only as a pattern in the log, and whether an issue closed depended on the merging session noticing a link in a ticked backlog item.

**Options.** (A) Let the orchestrator merge and push when the review approves. (B) A separate landing skill run by the user, which the orchestrator hands off to with the issue numbers recorded in its state file.

**Decision.** B. An approved verdict is the reviewer's opinion, not the user's acceptance; a branch can still be rejected or reworked.

**Consequences.** The skill refuses rather than warns on any failed precondition, composes the conventional subject with the closes references, and shows the predicted bump before pushing, so landing is where the version is chosen. It deletes the branch by a tree comparison, because a merged-branch query is defeated by squash merging. Pushing is what cuts the release and closes the issue.
