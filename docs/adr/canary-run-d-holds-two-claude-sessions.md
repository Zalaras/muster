---
id: canary-run-d-holds-two-claude-sessions
type: decision
status: accepted
date: 2026-09-12
summary: Run D types /clear in its idle window, so one MUSTER_SESSION spans two claude session ids and every status-line view names which one it means.
features: [canary, lifecycle]
tags: [claude-code-format, testing]
files: [test/canary/harness_test.go, test/canary/canary_test.go]
tests: [TestClearMintsNewSessionID, TestShiftTabFiresNoHook]
refs: [kb:fact/clear-mints-new-session-id, kb:fact/shift-tab-mode-cycle-fires-no-hook, kb:fact/sessionend-reason-ambiguous, kb:adr/canary-drives-installed-claude-through-production-chain]
supersedes: []
---
**Context.** Run D waits about 60 s after `Stop` for the `idle_prompt` Notification, doing nothing. Three unguarded facts — `/clear` minting a new session id, Shift+Tab firing no hook, and `SessionEnd.reason` being `"clear"` for a clear — are all provable with keystrokes in exactly that window, at no token cost. But `/clear` ends run D's claude session and starts another in the same pane, so a single `$MUSTER_SESSION` stops meaning a single claude session, which is the assumption every existing status-line view in the suite was written against.

**Options.** (A) Leave the window idle and keep the three facts as probe rituals. (B) Add a sixth run for them. (C) Use the window, and make the views name the claude session they mean.

**Decision.** C. B buys a turn and a trust prompt for behaviour that costs nothing here. The views become explicit rather than implicit: `statusPostsFor(session, claudeID)` alongside `statusPosts`, and `firstHookWhere` for the events a session now emits twice. `/clear` goes last, after the Shift+Tab check, because everything upstream reads the pre-clear session.

**Consequences.** `TestStatusLineFields`, `TestStatusLineVersionMatchesInstalled` and `TestUnknownVersusZero` filter on `preClearClaudeID()`; without that filter "the last status post" would silently become one from the freshly minted session, which has no `rate_limits` at all. Both in-pane steps record their error into the fixture instead of returning it, so a typing hiccup in an interactive step fails its own test rather than every test in the package via `harness failed to build`. Run E is unaffected — it resumes the id captured at run D's first `SessionStart`, whose transcript survives the clear (verified green on 2.1.269).
