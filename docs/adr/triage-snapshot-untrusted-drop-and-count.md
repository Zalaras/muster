---
id: triage-snapshot-untrusted-drop-and-count
type: decision
status: accepted
date: 2026-09-11
summary: The issue's snapshot JSON is untrusted like the body; a union schema of every shape ever emitted drops and counts unknown fields; the table says reported.
features: [triage, issue]
tags: [security, claude-code-format]
files: [internal/triage/schema.go, internal/triage/snapshot.go, internal/server/issue_snapshot_drift_test.go]
tests: [TestValidateSnapshotDrops, TestValidateSnapshotAcceptsRetiredSchema, TestSchemaKeepsRetiredRows, TestIssueSnapshotSchemaDrift]
refs: [docs/history/spec-changelog.md, docs/history/design/triage-hardening.md, kb:adr/triage-program-not-model-between-github-and-todo, kb:adr/issue-payload-allowlist-never-dump, kb:anchor/issue.captures, "#9"]
supersedes: []
---
**Context.** Issues filed from the dashboard carry a JSON snapshot the daemon emitted. It is tempting to treat it as trustworthy because Muster owns the schema. But an author can edit their own issue forever and nothing binds the JSON to anything the daemon produced. The schema had also already drifted: an early issue carries the pinned-and-drift shape while the daemon now emits the range shape, so a validator written against the current struct would drop fields from a genuine self-filed report.

**Options.** (A) Trust the snapshot and act on its version facts. (B) Drop the JSON entirely, losing the version facts triage needs. (C) Reject any block with an unknown or malformed field. (D) Validate against a union of every shape ever emitted, retired rows kept and marked, dropping and counting anything unknown.

**Decision.** D. Owning the schema buys a strict parser, never trust. A drift test asserts one direction only, that every path the daemon can emit has a row.

**Consequences.** The regenerated table is labelled reported, not verified, and a version field never justifies closing a report. Any unknown field routes the issue to the facts-only path, so the day the daemon gains a snapshot field every issue routes that way until the schema is updated; the drift test stops that arriving as a surprise.
