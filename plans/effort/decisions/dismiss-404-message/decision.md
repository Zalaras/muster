# Decision: the dismiss route's 404 body

**Reached by**: user decision (2026-10-15, review cycle 1)
**Raised by**: review.maintainability.md Major 1 `[orchestrator:decision]` — routed as a user decision because it changes the protocol contract.

**Options**
- A — keep the contract as written: the dismiss route serves `no session with that id` through its own writer and its own id parse.
- B — change the contract to the shared body: `{"error": {"code": "unknown_session", "message": "unknown session id"}}`, served through `parseSessionID` and `writeUnknownSession` like every other route.

**Outcome**: B. The plan's contract copied `docs/protocol.md`'s prose description of the 404 case as the message text; every route serves the shared `unknown session id`, which an earlier cleanup made the single spelling and `respond_unknown_session_test.go` guards.

**Recorded as**: kb:adr/focus-effort-dismiss-404-uses-shared-body (proposed).
