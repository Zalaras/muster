---
id: process-review-critic-confidence-fingerprints
type: decision
status: accepted
date: 2026-11-07
summary: Findings carry an id and a confidence; a diff-only critic strikes what the diff contradicts; low confidence goes to the backlog; cycle 3 escalates.
features: []
tags: [pipeline, user-decision]
files: [.claude/skills/orchestrate/review-scale.md, .claude/agents/review-critic.md, .claude/agents/review-work.md, .claude/agents/review-browser.md, .claude/agents/review-maintainability.md, .claude/skills/orchestrate/scripts/orch-state.py, .claude/skills/orchestrate/SKILL.md, .claude/skills/fix-batch/SKILL.md, .claude/skills/orchestrate/worker-rules.md, kb.yaml]
tests: []
refs: [kb:adr/process-review-split-three-reviewers-computed-verdict, kb:adr/process-minors-verified-not-re-reviewed, kb:lesson/finding-severity-misrouted, plans/_audit/agentic-practice-improvements.md, plans/_audit/agentic-practice-review-2026-11-05.md]
---
**Context.** Three parallel reviewers each generate findings with their own calibration; nothing
filtered them before a wave, nothing deduplicated across reviewers or cycles, and a later cycle
could re-find on unchanged code. The field review measured AI reviewers at low precision and about sixty percent
run-to-run consistency; what raised precision was system design: a filter that sees only the
diff and may only delete, a confidence cutoff, delta-only re-review, escalation over repetition.
Anthropic's own review of Claude Code uses a voting filter and tags; its official plugin drops
findings scored under 80. The three lenses themselves stay: the browser and maintainability parts
found 21 and 31 cycle-one blockers nothing else measures (counted 2026-11-07).

**Options.** (A) One reviewer. (B) The three lenses with a filter, scores and fingerprints. (C)
A hard cycle cap.

**Decision.** B; A loses the information boundaries the split exists for and C was rejected by
the developer earlier. Each issue carries `id: <file>:<symbol>:<claim> | confidence: <0–100>`.
`review-critic` (Sonnet) reads the diff and the parts and may strike a finding only by quoting the
hunk that contradicts it. `merge-review` drops struck ids, moves a Major under 80 or a Minor under
60 to `## Below threshold` for the proposed backlog, and computes the verdict from what survives.
A delta cycle rules on prior ids as resolved, unresolved or moot; a new Critical on an untouched
file needs pasted reproduction. A fix-wave agent may `counter:` or `refute:` an id only with the
measurement or harm beside it. The cycle-3 fix wave spawns the implementer on Opus.

**Consequences.** Fewer waves spent on duplicates and hunches; findings reach the developer with
their confidence attached; an old-format part merges as before. The filtering is unit-tested by
`orch_state_test.py` under `make hooks-test`.
