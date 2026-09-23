---
id: reader-plan-sticky-once-named
type: decision
status: accepted
date: 2026-09-23
summary: Once a session's plan has been named, a transcript scan that finds no plan keeps it and re-checks the file; only a scan naming another plan replaces it.
features: [reader, lifecycle]
tags: [claude-code-format, user-decision]
files: [internal/server/reader.go, internal/session/manager.go]
tests: []
refs: [plan:frontmatter, kb:adr/reader-plan-located-by-transcript-scan, kb:fact/clear-mints-new-session-id, kb:fact/plan-file-path-in-transcript]
supersedes: []
---
**Context.** The plan slot showed whatever the session's latest transcript named, and a scan that found nothing wrote no plan. A clear mints a fresh transcript that names none, and a transcript deleted from disk reads as none, so a plan the user had gone through could vanish from the reader while its file sat untouched. A report of exactly that could not be reproduced.

**Options.** (A) Keep the latest-transcript rule. (B) Keep the last named plan for the session row's lifetime; a scan naming a plan replaces it. (C) Keep every plan the session has named and offer a history.

**Decision.** B, at the developer's call: if the session has had a plan, show it. A planless scan keeps the path and re-derives whether the file exists. The straggler gate is unchanged, and the rule has one owner in the daemon.

**Consequences.** This closes every route by which a scan empties the slot, not one root-caused route. After a clear and a second plan only the latest is reachable; a history is out of scope. The accepted scan decision stands unchanged — it never stated that a clear empties the slot; only the protocol comment did, and that comment now says the opposite.
