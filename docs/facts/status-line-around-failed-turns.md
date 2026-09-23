---
id: status-line-around-failed-turns
type: fact
status: active
date: 2026-09-23
summary: A failed turn gets one status post with no new usage; an all-failing session shows null context, and rate_limits only if an error response carries the headers.
features: [usage]
tags: [claude-code-format]
files: [internal/claudecode/status.go, internal/server/usage.go]
tests: []
refs: [test/rig/captures/capture-8.jsonl, kb:fact/unknown-before-first-response, kb:fact/unknown-model-fails-first-turn]
verified: 2.1.280..2.1.280
guard: none
---
In an interactive session where every API call fails at the fail-proxy:

- **Startup posts arrive.** There are two, carrying `context_window` with a null
  `used_percentage`, a null `current_usage` and `total_input_tokens: 0`, plus
  `cost.total_cost_usd: 0`.
- **Each failed turn gets one post.** It follows the failure within ~0.4 s (429, then 500, in
  one session) and changes no usage field. No further post came.
- **`rate_limits` comes from response headers, error responses included.** At startup Claude
  Code sends a `POST /v1/messages` before any prompt. When that returned a 429 carrying
  `anthropic-ratelimit-unified-5h-*`/`-7d-*` headers, the *first* startup post already had
  `rate_limits` (`five_hour.used_percentage: 100`, `seven_day: 42`, resets as injected). A
  later header-less 500 kept those values. The headers here were synthetic.

Against the real API the same startup `POST /v1/messages` happens. In 3 of 4 sessions every
startup post lacked `rate_limits`. In 1 of 4, the second startup post (5.6 s before the first
prompt) already carried it. So the absence that kb:fact/unknown-before-first-response
describes is usual before the first turn, but not guaranteed. The probe did not isolate what
decides it: the startup response, or state left by the account's earlier sessions.

So a session that never completes a turn shows unknown context, and its gauge data can only
come from an error response's headers. Headless runs post no status line at all.

Evidence: interface probe 2026-09-23, instance 8. 1 interactive fail-proxy session, 2 failed
turns. 4 interactive real-API sessions for the startup posts (3 direct, 1 through the
pass-through proxy with no prompt).
