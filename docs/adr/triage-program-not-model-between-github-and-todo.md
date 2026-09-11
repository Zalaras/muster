---
id: triage-program-not-model-between-github-and-todo
type: decision
status: accepted
date: 2026-09-11
summary: Nothing between GitHub and the backlog diff is a model with tools: a program fetches, sanitises, routes, splices and commits; a Read-only subagent summarises.
features: [triage]
tags: [security, pipeline, user-decision]
files: [tools/triage/main.go, internal/triage/fetch.go, internal/triage/sanitize.go, internal/triage/route.go, internal/triage/splice.go, internal/triage/apply.go, .claude/agents/triage-proposer.md, .claude/skills/triage/SKILL.md]
tests: [TestFetchThenApply, TestBuildAdversarial, TestSanitizeMarkersAreUnforgeable, TestValidateProposalRejects, TestSpliceIsPureInsertion]
refs: [docs/history/spec-changelog.md, docs/design/triage-hardening.md, kb:adr/triage-state-derived-from-todo, kb:adr/issue-daemon-creates-issues-only, kb:adr/process-repo-public, kb:adr/triage-snapshot-untrusted-drop-and-count, kb:adr/triage-auto-close-never, kb:adr/triage-sandboxing-rejected-for-read-only-proposer]
supersedes: []
---
**Context.** Once the repository was public an issue body became attacker-controlled text. The triage skill read one straight into the main session, and its allowed-tools list, which grants rather than restricts, pre-approved prompt-free shell for that very turn. The real target was the backlog file: every later planning and orchestration session reads it with full tools, so a payload can lie dormant and fire weeks later in a more capable session.

**Options.** (A) Keep the skill and add prompt hygiene. (B) Sandbox the reading session. (C) A dev-only program does everything mechanical, fetch through commit, and the one step that needs judgement, naming component, symptom, quoted error and section, is a subagent whose tools field, a genuine allowlist, holds nothing but Read; its reply is enum-constrained, validated by the program, and a malformed reply holds the issue.

**Decision.** C, settled with Damian. The dormancy is the risk, so the defence is that no model-authored prose ever reaches the backlog; untrusted issues render from enums plus one verbatim-checked quote.

**Consequences.** The proposer is the first agent in the repository with a tools field. Its reply still enters the main session's context, a residual stated rather than papered over. The program refuses to run without the pre-commit hook armed. Damian's involvement is unchanged: pick a section, approve a duplicate close, read a held list that is empty on a normal run.
