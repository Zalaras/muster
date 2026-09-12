---
id: rg-shim-invisible-to-bare-subshell
type: lesson
status: active
date: 2026-08-29
summary: An authored check ran rg via bash -c and failed: rg is Claude Code's shell-function shim, not a binary on PATH, so a bare subshell cannot see it.
features: []
tags: [pipeline]
roles: [orchestrator, e2e-validate, review]
files: []
tests: []
refs: [plan:m4-hook-lifetime, .claude/skills/orchestrate/scripts/gates.sh, .claude/skills/orchestrate/SKILL.md]
---
**What happened.** An authored check ran `rg` through `bash -c` and failed with command not found. In Claude Code's shell `rg` is a shell-function shim over the `claude` binary, not an executable on PATH, so a bare subshell cannot see it and the check fails on a green tree.

**Cost.** A gate reported red for a tool-resolution reason and had to be re-derived by hand.

**What changed.** A check run outside the gates runner is run in the interactive shell, never via `bash -c` or `sh -c`; the gates script itself runs the baseline checks. A spurious red is diagnosed before it is reported.
