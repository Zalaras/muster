---
id: proof-swap-in-shared-worktree
type: lesson
status: active
date: 2026-09-24
summary: Test agents proved fails-on-old-code by overwriting files in the shared worktree while another agent edited them; nothing was lost, by luck.
features: []
tags: [testing, pipeline]
roles: [daemon-tests, web-tests, orchestrator]
files: [.claude/agents/daemon-tests.md, .claude/agents/web-tests.md]
tests: []
refs: [plan:maintainability-cleanup, plans/maintainability-cleanup/findings.md]
---
**What happened.** A test agent showed that its new tests fail on the old code by writing `git show HEAD:<file>` over five server files in the shared worktree, running the tests, and restoring its own saved copies. A comment-sweep agent was editing those same files at the time. An edit landing inside that window would have been silently overwritten.

**Cost.** Nothing was lost, which was confirmed afterwards by hit counts and citation counts. The risk was real, and only the timing saved it.

**What changed.** The old-code proof runs in a throwaway copy (`git archive HEAD | tar -x` into a scratch directory, with the new tests dropped in). The shared tree is never overwritten. Later agents in the same run did this.
