---
id: issue-preview-is-the-leak-check
type: decision
status: accepted
date: 2026-08-31
summary: The issue dialog renders the daemon's snapshot markdown verbatim before posting, and E2E asserts the preview is byte-identical to the body GitHub receives.
features: [issue]
tags: [security, ux, testing]
files: [web/src/features/issue.ts, internal/server/issue.go]
tests: [web/e2e/issue-capture.spec.ts, TestComposeIssueBody_NoteThenSnapshotMarkdown_NoTrailingNewline]
refs: [docs/history/spec-changelog.md, plan:issue-capture, kb:adr/issue-payload-allowlist-never-dump, kb:anchor/issue.captures]
supersedes: []
---
**Context.** An allowlist nobody can see is a rule nobody trusts. The user needed to know exactly what would leave the machine before it did.

**Options.** (A) Show a client-side summary of the snapshot. (B) Have the daemon render the markdown body it will post and show that text unchanged, with the test suite proving the two are the same bytes.

**Decision.** B. The preview is the leak check.

**Consequences.** The rendering lives in one place, the daemon, and the dialog is a viewer. A note the user types is appended above the snapshot and normalised the same way on both sides so the equality holds under real keystrokes.
