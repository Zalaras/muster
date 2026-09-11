---
id: status-posts-arrive-in-pairs
type: fact
status: active
date: 2026-09-11
summary: Status-line posts are event-driven, ~50 ms after tool activity, and arrive in close pairs a median 435 ms apart.
features: [usage]
tags: [claude-code-format]
files: [internal/server/usage.go]
tests: []
refs: [spikes/FINDINGS.md]
verified: 2.1.233..2.1.267
guard: none
---
Status-line invocation is event-driven, not interval-driven: posts follow tool activity and
assistant turns (typically within ~50 ms of a `PostToolUse`) and arrive in close pairs, median
435 ms apart. Near-simultaneous posts must be de-duplicated before a `usage_sample` is
persisted.

Evidence: 2.1.233 spike captures (FINDINGS §5b). Not asserted; a timing assertion on a shared
machine would flake — ritual-only.
