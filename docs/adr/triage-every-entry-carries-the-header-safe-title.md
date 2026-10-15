---
id: triage-every-entry-carries-the-header-safe-title
type: decision
status: accepted
date: 2026-10-15
summary: One entry template on every route: HeaderSafe title, summary, quoted error, a fact line from validated snapshot leaves, labels; the header stays on one line.
features: [triage]
tags: [pipeline]
files: [internal/triage/render.go, .githooks/pre-commit]
tests: [TestRenderEntryNormal, TestRenderEntryRestricted, TestRenderNormalSurvivesHostileTitles, TestRenderEntryWraps, TestFactLine, TestPreCommitHookAcceptsARenderedNormalEntry]
refs: [kb:adr/triage-bounded-proposer-summary-reaches-the-backlog, kb:adr/triage-snapshot-untrusted-drop-and-count]
supersedes: [triage-normal-path-carries-the-sanitised-title]
---
**Context.** Two templates: a normal one carrying the title, and a facts-only one that led with enums and closed by prescribing a re-fetch and a proposer run for the detail — deferring the unsafe read rather than removing it. The snapshot's validated leaves (versions, view, state) never reached an entry, and a pasted screenshot vanished without trace.

**Options.** (A) Keep two templates and add the summary to the normal one. (B) One template for every route, with the restricted route marked by a prefix on the summary alone.

**Decision.** B. The title goes through `HeaderSafe` on every route, as the superseded decision already guarded it; the title was the second attacker-derived field in the backlog and the two summary sentences are now the third and fourth, each with its own guard. The fact line is assembled from the filing date GitHub asserted and from snapshot leaves the schema's checks admitted — version and token charsets admit no structure — plus a count of attached images; every clause is optional and the line is omitted when nothing validated. The summary wraps at 100 columns with two-space continuations; the header never breaks before the link, because that is the line the pre-commit hook matches.

**Consequences.** The hook checks only lines carrying `issues/<digit>`, so the program's free-text rules are what keep `<`, `>` and `issues/` off continuation lines; a test drives the real hook over a full entry. A restricted entry differs from a normal one by its prefix only, so the owner rule changes nothing about shape.
