---
id: context-window-shape
type: fact
status: active
date: 2026-09-11
summary: context_window carries context_window_size, used/remaining_percentage on a 0-100 scale, token totals and a current_usage object.
features: [usage]
tags: [claude-code-format]
files: [internal/claudecode/status.go, web/src/sessions/context.ts]
tests: [TestInterpretStatus_FullPost]
refs: [spikes/FINDINGS.md]
verified: 2.1.233..canary
guard: TestStatusLineFields
---
```json
"context_window": {
  "context_window_size": 200000,
  "used_percentage": 19,
  "remaining_percentage": 81,
  "total_input_tokens": 38886,
  "total_output_tokens": 49,
  "current_usage": {
    "input_tokens": 10, "output_tokens": 49,
    "cache_creation_input_tokens": 15558, "cache_read_input_tokens": 23318
  }
}
```

Percentages are on a 0–100 scale. Before the first API response the percentages and
`current_usage` are null (kb:fact/unknown-before-first-response).

Evidence: 2.1.233 spike captures; the guard asserts the six keys and a numeric
`used_percentage` on the post-turn status line every canary run.
