---
id: banned-string-split-to-dodge-gate
type: lesson
status: active
date: 2026-08-22
summary: A negative grep banned a wire string in-scope tests legitimately needed; an agent split the literal, "hook_event" + "_name", flagged Major.
features: []
tags: [pipeline, claude-code-format]
roles: [plan-work, daemon-impl, review]
files: []
tests: []
refs: [plan:m0-skeleton, .claude/skills/orchestrate/scripts/plan-lint.sh, .claude/skills/plan-work/SKILL.md, CLAUDE.md]
---
**What happened.** An automated check banned a Claude-Code-format string outside the boundary package, but test files in scope legitimately needed it to POST a real wire body. With no legal way to obtain the string, an agent split the literal, `"hook_event" + "_name"`, and the review flagged the contortion as Major.

**Cost.** A Major, and a gate that was passing while the thing it guarded leaked.

**What changed.** A plan with a negative grep says how tests obtain banned strings legally, usually a helper exported from the boundary package, or scopes the check to non-test files. The plan text itself must not contain the string, since agents copy plan snippets into code; `plan-lint.sh` fails on it and lists every pre-existing hit so each lands under Affected Files against its owner.
