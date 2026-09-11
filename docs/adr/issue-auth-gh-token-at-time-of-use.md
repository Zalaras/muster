---
id: issue-auth-gh-token-at-time-of-use
type: decision
status: accepted
date: 2026-08-31
summary: Issue filing uses the GitHub CLI's token read at time of use; nothing is stored, there is no OAuth flow, and the GitHub host is a single flag default.
features: [issue]
tags: [auth, security, testing]
files: [internal/ghissue/ghissue.go, cmd/musterd/main.go, web/e2e/helpers/ghapi.ts]
tests: [TestGhCLITokenReader_Success_ParsesTrimmedStdoutAndPassesExpectedArgs, TestGhCLITokenReader_StdoutNeverEchoedIntoTheErrorEvenOnFailure, TestHandleCreateIssue_AuthFailure_Returns502IssueAuthFailed]
refs: [docs/history/spec-changelog.md, plan:issue-capture, kb:anchor/issue.create, kb:adr/usage-keychain-token-read-only]
supersedes: []
---
**Context.** Posting to GitHub needs a credential. The developer machine already has the GitHub CLI logged in.

**Options.** (A) A personal access token in Muster's config. (B) Muster's own OAuth device flow. (C) Ask the GitHub CLI for its token each time an issue is filed and hold it for that request only.

**Decision.** C, mirroring how the usage poller borrows Claude Code's credential. A missing or failing CLI is a distinct error the dialog shows with the underlying message selectable for copying.

**Consequences.** The GitHub package imports nothing Muster-internal and knows the host only through a flag whose default lives in the daemon's entry point, so E2E always points it at a stub. One real post to the repository verifies the path, run by the pipeline from the main session under live approval, recorded separately. Error text never contains the token.
