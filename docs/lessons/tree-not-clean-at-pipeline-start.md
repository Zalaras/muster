---
id: tree-not-clean-at-pipeline-start
type: lesson
status: active
date: 2026-09-04
summary: A plan branch 20 commits behind main, a dirty tracked README in Affected Files, an untracked screenshot: three pre-flight states that nearly corrupted runs.
features: []
tags: [pipeline]
roles: [orchestrator]
files: []
tests: []
refs: [plan:shortcut-fixes, plan:tmux-installation, plan:order-sidebar, .claude/skills/orchestrate/SKILL.md]
---
**What happened.** Three pre-flight states across three runs. A plan branch existed with zero unique commits and was 20 commits behind `main`, because planning had landed elsewhere. A tracked `README.md` was dirty and also in the plan's Affected Files, so its owning agent would have folded the user's change into its own commit; the user chose to commit it on `main` first. An untracked screenshot sat outside the plan directory, referenced by nothing.

**Cost.** Each would have produced a branch that lied about what the plan changed.

**What changed.** A plan branch is resumed only if it has commits `main` lacks, otherwise `git merge --ff-only main` first. A dirty tracked file stops the run with exactly three dispositions, never `git add -A` or a stash, and leaving it dirty is flagged unsafe when the file is in Affected Files. An untracked stray nothing references is left alone, never added, and listed in the completion summary.
