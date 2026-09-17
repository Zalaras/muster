---
id: process-reviewer-owns-final-validation
type: decision
status: accepted
date: 2026-09-17
summary: The reviewer's single gates run is the cycle's final validation, and the gate runner reuses a PASS proven against an identical working tree.
features: []
tags: [pipeline]
files: [.claude/agents/review-work.md, .claude/skills/orchestrate/SKILL.md, .claude/skills/orchestrate/scripts/gates.sh]
tests: []
refs: [kb:adr/process-doc-reconcile-after-review, kb:lesson/subagent-never-woken-by-harness, kb:lesson/transient-display-is-not-an-oracle]
---
**Context.** A `needs-changes` cycle swept `make e2e` four times over a byte-identical tree: the
wave-3 fix agent, the wave-3 gate, Final Validation, and the reviewer's §1. Measured 2026-09-16,
`make e2e` peaks at 244% CPU over 30 processes, `make test` at 442% on six cores. The reviewer
also hand-ran a build/test/lint fence, then `gates.sh --checks-only`, whose ```checks block repeats
those commands — `SEEN` dedupes within one invocation and could not see them. `SKILL.md` already
said a prior run "counts — do not run it twice", but that judgement spans separate processes and
nothing enforced it. Since a gate failure is charged to the review budget, all three cycles could
be spent without the reviewer running once.

**Options.** (A) Keep the ordering, make the duplicate cheap. (B) Drop Final Validation, let the
reviewer's run be it, and reuse a pass proven against an identical tree.

**Decision.** B. The reviewer already runs every gate and is already told to review a red tree and
report gate failures as Criticals, so a gate set before it buys nothing — and costs a cycle
when it reds, with no review. Reuse keys on a working-tree fingerprint; only a PASS
is reused, so nothing masks a red.

**Consequences.** The reviewer makes one `gates.sh <plan>` call with `timeout: 600000`; a cold run
exceeds the harness's 120 s default. `web-lint`, `contrast` and `check-versions` joined the
baseline, making one run a superset of `make check`; a reused line is still reported by ID. The
ledger lives under `TMPDIR` with a 4 h TTL; `--fresh` discards it. Incidental repetition never
proved a flake fixed, so detection moves earlier: `e2e-specs` soaks every spec the plan authored or
changed. Wave gates and the Completion Final Validation are unchanged; a wave gate failure still ends a
cycle without a review, left open.
