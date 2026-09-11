---
id: triage-state-derived-from-todo
type: decision
status: accepted
date: 2026-08-31
summary: Triage state is derived, not stored: an issue is triaged iff its number appears in the backlog file; no labels, no close state, no second list to keep in sync.
features: [triage]
tags: [pipeline]
files: [.claude/skills/triage/SKILL.md, TODO.md]
tests: []
refs: [docs/history/spec-changelog.md, kb:adr/triage-issue-closes-when-fix-lands]
supersedes: []
---
**Context.** Once closing was ruled out as a triage signal, something still had to say which open issues had been looked at.

**Options.** (A) A triaged label on GitHub. (B) A local list of handled numbers. (C) Derive it: an issue is triaged exactly when its number appears in the backlog file.

**Decision.** C. There is nothing to keep in sync, and it self-heals: deleting a backlog item makes its issue correctly reappear as untriaged.

**Consequences.** The triage command's audit compares the two lists in both directions. Ticked items move to the done history and still count, so a fixed issue never resurfaces as untriaged.
