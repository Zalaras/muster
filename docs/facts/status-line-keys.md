---
id: status-line-keys
type: fact
status: active
date: 2026-09-11
summary: Status-line top-level keys; permission_mode is never among them. Newer versions add scratchpad_dir and prompt_cache (superset).
features: [usage, ingest]
tags: [claude-code-format]
files: [internal/claudecode/status.go]
tests: [TestInterpretStatus_FullPost]
refs: [spikes/FINDINGS.md]
verified: 2.1.233..canary
guard: TestStatusLineFields
---
Top-level keys of every status-line post: `context_window`, `cost`, `cwd`,
`exceeds_200k_tokens`, `fast_mode`, `model`, `output_style`, `prompt_id`, `rate_limits`,
`session_id`, `session_name`, `thinking`, `transcript_path`, `version`, `workspace`. Added
later, superset only: `scratchpad_dir` (2.1.259+), `prompt_cache` (first seen 2.1.267,
contents uninspected, nothing reads it).

`permission_mode` is absent from every capture — read it from hooks. `rate_limits` is absent
until the first API response (kb:fact/unknown-before-first-response) and `session_name` until a
title exists (kb:fact/status-session-name-source).

Shapes of the minor keys: `cost` = `{total_cost_usd, total_duration_ms, total_api_duration_ms,
total_lines_added, total_lines_removed}`; `workspace` = `{current_dir, project_dir,
added_dirs[]}`; `output_style{name}`, `thinking{enabled}`; `exceeds_200k_tokens` and
`fast_mode` are booleans.

Evidence: 2.1.233 spike captures; the guard asserts the fourteen stable keys plus
`session_name` on the last post of run D, asserts `permission_mode` absent, and logs any
extra keys.
