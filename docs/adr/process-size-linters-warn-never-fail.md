---
id: process-size-linters-warn-never-fail
type: decision
status: accepted
date: 2026-09-22
summary: Function length, duplication and file length are warnings the maintainability reviewer reads beside the stated reason, never gate failures; a race fails.
features: []
tags: [pipeline]
files: [.claude/skills/orchestrate/scripts/size-warn.sh, .claude/skills/orchestrate/scripts/gates.sh, Makefile, docs/conventions.md, .claude/agents/review-maintainability.md]
tests: []
refs: [kb:adr/process-go-lint-complexity-ceiling-fifteen, kb:adr/process-review-split-three-reviewers-computed-verdict, plans/_audit/code-quality-2026-09-22.md]
supersedes: []
---
**Context.** The gates covered only the shallow end of code quality: `gocyclo` at 15 and Biome's
cognitive-complexity ceiling pass clean while, measured 2026-09-22, `funlen` reports 57 functions,
`dupl` 7 duplicated blocks (all in tests), 13 non-test files exceed 500 lines, and `go test -race`
failed on a test fake. No gate or reviewer had looked.

**Options.** (A) Enable `funlen`, `dupl` and a file-length check as failing gates. (B) Run them as
a warning line the runner never counts, and require a reason in Decisions when exceeding on
purpose, for a reviewer to judge. (C) Leave size to the reviewer's eye.

**Decision.** B. There can always be a reason to exceed a length — a table-driven dispatch, a state
machine's `applyInput`, a protocol file as long as the protocol — and a threshold cannot tell a
reason from a rationalisation; a reader can. The developer's rule for the pipeline's own size
thresholds already says warn, never refuse. The race detector is different in kind: a data race has
no legitimate reason, so `make test-race` is a failing baseline gate. The complexity ceilings
(kb:adr/process-go-lint-complexity-ceiling-fifteen, Biome's 15) stay hard.

**Consequences.** `size-warn.sh` prints `WARN` lines and exits 0; `gates.sh`'s `run_warn` never
touches the failure count and the baseline runs it scoped to the branch's changed files (`make
size-warn` is the whole-tree form). Implementation agents read the warning in their own Code
Quality step and write the reason in Decisions; the maintainability reviewer reads warning and
reason together — a reason that holds is a note, a missing one a Minor, one the code contradicts a
Major — and never asks for a split to silence a line. Thresholds are `funlen`'s defaults and 500
lines per file; changing them needs no ADR, because nothing fails on them.
