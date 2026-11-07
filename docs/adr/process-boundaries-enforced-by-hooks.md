---
id: process-boundaries-enforced-by-hooks
type: decision
status: accepted
date: 2026-11-07
summary: The zero-exception pipeline rules are refused at the tool call by PreToolUse hooks and agent tool limits; prose names them, hooks hold them.
features: []
tags: [pipeline, user-decision]
files: [.claude/hooks/pretool-guard.py, .claude/hooks/pretool_guard_test.py, .claude/hooks/format-on-write.sh, .claude/settings.json, .claude/skills/orchestrate/worker-rules.md, .claude/agents/review-work.md, .claude/agents/review-browser.md, .claude/agents/review-maintainability.md, .claude/agents/judge.md, .claude/agents/debater.md, Makefile]
tests: []
refs: [kb:lesson/worktree-shares-git-config, kb:lesson/test-pinned-signature-bent-the-design, kb:lesson/handoff-commit-defects, kb:adr/process-comment-pass-owns-code-comments, plans/_audit/agentic-practice-improvements.md]
---
**Context.** The rules the pipeline rests on — implementers never edit tests, testers never edit
implementation, nobody stashes, rebases or sets a repo-local identity, reviewers never commit — were
prose in CLAUDE.md, the worker rules and fourteen agent files, with one hook that failed open.
Prose compliance decays within a session and after compaction; Anthropic's guidance sends a
rule missed twice to a hook; a permission deny rule matches text (`git push` misses `git -C . push`).

**Options.** (A) Keep the prose and sharpen it. (B) Permission deny rules in settings. (C) A
PreToolUse command hook reading the whole command and the payload's `agent_type`, plus tool
limits in agent frontmatter.

**Decision.** C. `pretool-guard.py` denies `git stash` and a repo-local `git config user.*` for
every caller, and for subagents also `git push`, `git add -A`/`.`, `git reset --hard`, `git clean`,
`git checkout -- <path>` and `git rebase`; on Edit/Write it checks the path against the role's
file kinds (tests to testers, implementation to implementers, review parts to reviewers, specs
and protocol to doc-reconcile; every role may write its `plans/<plan>/` logs). Quoted strings and
heredoc bodies are stripped first: the first version denied the main session writing this record.
The main session is otherwise unrestricted, so `/land` and the developer are untouched. Every
hook carries `onFailure: "block"`, the SubagentStop check included. Reviewers, the judge and the
debaters carry `disallowedTools: Edit, Write` and a turn cap; a PostToolUse hook formats written
Go and web files. Prose an author reads before acting stays; prose read only after the hook goes.

**Consequences.** A denied call returns the rule as its reason at the moment it matters (measured
in the main session the moment settings changed). The guard is unit-tested
(`.claude/hooks/pretool_guard_test.py`, `make hooks-test`, in `make check`). Turn caps sit only on bounded read-only roles, generously.
