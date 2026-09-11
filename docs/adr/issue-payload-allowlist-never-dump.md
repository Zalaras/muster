---
id: issue-payload-allowlist-never-dump
type: decision
status: accepted
date: 2026-08-31
summary: The issue snapshot is assembled by explicit field copy from a pinned allowlist; prompt-derived, identifying and account-usage data are excluded forever.
features: [issue]
tags: [security, user-decision]
files: [internal/server/issue.go, web/src/features/issue.ts]
tests: [TestBuildIssueSnapshot_SessionScope_KeySetMatchesAllowlistExactly, TestBuildIssueSnapshot_HardExclusionsNeverLeak_AcrossEveryReachableState, web/e2e/issue-capture.spec.ts]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:issue-capture, kb:anchor/issue.captures, kb:adr/issue-preview-is-the-leak-check]
supersedes: []
---
**Context.** A one-click issue button files the machine context that makes friction diagnosable. Everything Muster touches is downstream of prompt text, and the repository may be open-sourced, so a filed issue is a potential leak of the user's work.

**Options.** (A) Serialise the state snapshot and redact known-sensitive fields. (B) Copy named fields from a pinned allowlist and treat everything else as excluded by construction.

**Decision.** B. Hard-excluded forever: prompt text, hook payload bodies, raw status-line JSON, pane captures, assistant-generated text such as titles, last activity and failure messages, identifying data such as directory, branch, worktree flag, repository name and the Claude session id value, and all account usage. Per-session context percentages are included on purpose so long-context friction stays diagnosable.

**Consequences.** Adding a field is an allowlist edit reviewed as such. Tests assert the key set equals the allowlist exactly and that the exclusions never leak from any reachable state. Unknown values render the word unknown, never zero.
