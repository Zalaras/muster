---
id: process-comment-pass-owns-code-comments
type: decision
status: accepted
date: 2026-10-06
summary: A comment pass before the gates strips every added production comment, a Sonnet judge keeps the load-bearing few, and review files no finding on a comment.
features: [comment-pass]
tags: [pipeline]
files: [tools/commentpass/*.go, internal/commentpass/*.go, .claude/agents/comment-judge.md, .claude/skills/orchestrate/SKILL.md, .claude/skills/orchestrate/review-scale.md, .claude/skills/orchestrate/worker-rules.md, .claude/skills/orchestrate/scripts/gates.sh]
tests: [TestStrip_FindsExactlyTheAddedBlocks, TestApply_KeepAllIsByteIdentical, TestVerify_FailsOnCommentAddedAfterApply]
refs: [plan:comment-pass, kb:lesson/comment-truth-is-plan-wide-not-diff-wide]
supersedes: []
---
**Context.** Review owned code comments; a comment finding cost a full Opus cycle and gate run. Across `plans/*/review*.md`, 94 of 576 agent-tagged findings
concerned a comment; 20 of the 24 most recent cycles had one; four cycles (mermaid-support
c2–c4, new-session-improvement c3) plus three in the groups run went to a single comment
each (kb:lesson/comment-truth-is-plan-wide-not-diff-wide).

**Options.** (A) Keep review ownership with the groups run's `[comment]` tag fast path — still
one cycle per comment. (B) A `claude -p` classifier inside a Stop hook — a nested CLI under a
60 s hook timeout; the orchestrator already has the Agent tool. (C) An in-code stamp such
as `WHY:` — a model copies it, so it carries no information once common. (D) A mechanical pass
before the gates: strip, judge, reconstruct.

**Decision.** D. `tools/commentpass` (logic in `internal/commentpass`) runs once per review
cycle, before the gates, from the orchestrator. `strip` snapshots and removes every
comment the branch added to production code (`cmd/`, `internal/` non-test, `web/src` non-test)
plus pre-existing comments naming an identifier the diff removed, and writes
`candidates.md`. A fresh Sonnet `comment-judge`, plan withheld, reads only that file and writes
`verdicts.json`: keep or drop, one reason per keep naming the edit the comment prevents
(measured on one landed diff: Haiku kept 14 of 65, Sonnet 6). `apply` reconstructs each file from
its snapshot minus the dropped spans and appends a cycle to `plans/<plan>/comment-pass.json`.
`verify` runs in the baseline gates and fails on any added comment that is not a ledger keep.
The orchestrator runs `drop <path:line>` when a reviewer's `[note]` names a false or stale
comment. Directives are never candidates.

**Consequences.** Review files no finding on a comment at any severity; the one-comment cycle
is gone. Test files stay with the `comment-checks.py` regex hook, and legacy comments on
`main` are out of scope.
