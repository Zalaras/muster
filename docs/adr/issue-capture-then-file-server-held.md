---
id: issue-capture-then-file-server-held
type: decision
status: accepted
date: 2026-08-31
summary: Filing is two steps: the daemon holds an immutable snapshot in a small expiring store, and the file request names the held capture, never a client payload.
features: [issue]
tags: [security, store]
files: [internal/server/issue.go]
tests: [TestCaptureStore_Reserve_ExpiredReturnsNil, TestCaptureStore_Consume_ClearsInFlightAndPermanentlyBlocksReuse, TestHandleCreateIssue_D11_CaptureIsImmutable_FiledBodyReflectsPreTransitionState]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:issue-capture, kb:anchor/issue.captures, kb:anchor/issue.create]
supersedes: []
---
**Context.** If the dashboard posted the body it displayed, the allowlist would be enforced in the client and a tampered or stale page could file anything.

**Options.** (A) One request carrying the client's body. (B) A capture request that returns a handle to a snapshot held in memory with a short lifetime and a small capacity cap, then a file request carrying only the handle and the user's note.

**Decision.** B. The held capture is immutable, so the filed body reflects state at capture time, and a consumed capture can never be filed twice.

**Consequences.** Expiry is an explicit error naming the remedy: capture again. A failed post releases the capture so a retry needs no recapture. A filed issue is not Muster state, so nothing is broadcast and the wire gains no message.
