---
id: launch-resume-in-original-mode-else-default
type: decision
status: accepted
date: 2026-09-28
summary: A session resumed from the list is launched with its transcript's last permission mode as an explicit flag, or default when none is recorded, and no --model.
features: [launch]
tags: [claude-code-format, user-decision]
files: [internal/claudecode/launch.go]
tests: []
refs: [plan:resume-and-dangerously-allow, kb:fact/resume-restores-model-and-mode-except-plan, kb:fact/permission-mode-no-flag-follows-configured-default]
supersedes: []
---
**Context.** With no flags, a resume keeps the transcript's model and mode except plan, which
comes back as the configured default. The Resume tab has no Model or Start-in row.

**Options.** (A) Pass no mode flag. (B) Pass the transcript's last mode explicitly, and `default`
when none is recorded. (C) Pass no flag when none is recorded.

**Decision.** B, the developer's "comes back in the original mode". `default` for the unknown
case because the configured default can be auto and manual never escalates. No `--model`: the
transcript's model already comes back.

**Consequences.** Plan survives a resume. A bypass session resumes into bypass, so its row carries
the chip and the button reads `Resume without checks`.
