---
id: canary-cache-test-follows-live-regime
type: decision
status: accepted
date: 2026-10-26
summary: The server picks the main thread's cache regime, so the canary asserts the idle behaviour of whichever regime it sees and fails only on an unknown ttl.
features: [canary, usage]
tags: [claude-code-format, testing]
files: [test/canary/state_test.go]
tests: [TestPromptCacheIdleFollowsRegime]
refs: [kb:fact/main-cache-ttl-selected-per-model-off-binary, kb:fact/prompt-cache-5m-keepalive, kb:fact/prompt-cache-1h-no-keepalive-warm-flips-at-expiry, kb:adr/usage-cache-warmth-follows-keepalive-horizon]
supersedes: []
---
**Context.** The canary's idle-cache test asserted the 5m keep-alive regime and failed when
2.1.310 got a 1h ttl. The probe showed the regime is switched per model on dates, off the
binary: 2.1.308 reported 5m on 2026-10-22 and 1h on 2026-10-26
(kb:fact/main-cache-ttl-selected-per-model-off-binary). A red canary is meant to mean an
interface change, and the daemon already handles both regimes
(kb:adr/usage-cache-warmth-follows-keepalive-horizon), so a regime flip must not turn it red.

**Decision.** The test reads the ttl of run O's turn and asserts that regime's idle behaviour.
On 5m, keep-alives move `expires_at` on. On 1h, `expires_at` holds still. Either way `requests`
is unchanged and `warm` is true. Any other ttl fails, naming it.

**Consequences.** A run checks only the live regime, so the other regime's fact keeps its last
measured range until the server serves it again. A regime that changes between Stop and
/compact still fails. The 1h `warm` flip at expiry stays unguarded, since it needs an hour.
