---
id: main-session-gate-list-dropped-check-kb
type: lesson
status: active
date: 2026-09-24
summary: A run gating units with a hand-picked command list left out check-kb, so two web splits landed with moved files unregistered in the feature registry.
features: []
tags: [pipeline]
roles: [orchestrator]
files: [.claude/skills/orchestrate/scripts/gates.sh]
tests: []
refs: [plan:maintainability-cleanup, plans/maintainability-cleanup/findings.md]
---
**What happened.** A cleanup run driven from the main session gated each web unit with `make web-lint web-test web-build` and `tsc`. It never ran `check-kb`. The `api.ts` and `protocol.ts` splits moved files out of the feature globs and the ADR `files:` lists, and 27 registry problems went unnoticed until the next unit's agent reported them.

**Cost.** Two commits on the branch failed `make check`, and one fix-up commit re-registered the moved files.

**What changed.** A run outside `/orchestrate` gates each unit with the pipeline's own gate script, or at least includes `make check-kb` and `make refs` whenever files move. It never uses an ad-hoc list.
