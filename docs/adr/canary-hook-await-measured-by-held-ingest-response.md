---
id: canary-hook-await-measured-by-held-ingest-response
type: decision
status: accepted
date: 2026-09-23
summary: To measure whether Claude Code waits on PostToolUse, the canary's capture server holds its reply to those posts; the hook settings stay production's.
features: [canary]
tags: [claude-code-format, testing]
files: [test/canary/harness_test.go, test/canary/harness_turns_test.go, internal/claudecode/settings.go]
tests: [TestPostToolUseNotAwaited]
refs: [kb:fact/hook-await-per-event, kb:adr/canary-refresh-interval-key-canary-only, kb:adr/lifecycle-prompt-ordering-guards]
supersedes: []
---
**Context.** kb:fact/hook-await-per-event says a `PostToolUse` hook does not hold the next tool, so a later tool's `PreToolUse` can arrive before an earlier tool's `PostToolUse`. The state machine's ordering guards absorb that. A version that started awaiting the hook would slow every tool call by the hook's cost. The probe saw the inversion only by making the hook slow: it put a `sleep` in the hook command.

**Options.** (A) Leave it probe-only. (B) Write a delayed `PostToolUse` command into the canary's settings. (C) Keep the settings as they are, and have the capture server wait before replying to one run's `PostToolUse` posts.

**Decision.** C. Production's wrapper runs `curl --max-time 2` synchronously, so a reply held for 1.5 s makes the hook last about 1.5 s. That gives the same measurement as B, without adding a second settings departure beside kb:adr/canary-refresh-interval-key-canary-only. The hold applies only to run H's `$MUSTER_SESSION`, so no other run's timing moves.

**Consequences.** Captures are stamped on arrival, before the hold, so a gap under 1 s from a `PostToolUse` to the next `PreToolUse` means the hook was not awaited. On 2.1.280 the gaps were 0.50–0.53 s with a 1 s hold and 0.22–0.25 s with 1.5 s: the next call starts when it is ready, so the line sits well clear of both. Only calls that shared one assistant message are compared, read from run H's stream-json stdout, because `PostToolBatch` legitimately waits between messages. If the model stops batching, the test fails with its own message instead of misreading the timing. The hold must stay under the wrapper's 2 s curl limit.
