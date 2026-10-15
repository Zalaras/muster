---
id: focus-effort-dismiss-404-uses-shared-body
type: decision
status: accepted
date: 2026-10-15
summary: The effort-warning dismiss route's 404 is the shared unknown_session body, "unknown session id", through the shared id parse and writer.
features: [focus]
tags: [user-decision]
files: [internal/server/effort.go]
tests: []
refs: [plan:effort, plans/effort/decisions/dismiss-404-message/decision.md]
supersedes: []
---
**Context.** The effort plan's Protocol Contract gave `DELETE /api/sessions/{id}/effort-warning` a
404 message of `no session with that id`, copied from the prose that describes other routes' 404
case. Every other route serves `unknown session id` through one shared writer, the spelling an
earlier cleanup collapsed six variants into.

**Decision.** The dismiss route serves `{"error": {"code": "unknown_session", "message": "unknown
session id"}}`, parsing `{id}` and writing the 404 through the same shared helpers as every other
session route. The developer chose this over a route-specific message in review cycle 1.

**Consequences.** One 404 spelling across the API; the shared envelope test covers this route too.
