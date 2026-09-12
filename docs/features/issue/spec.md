---
id: issue
type: spec
status: active
date: 2026-09-12
summary: Issue capture and GitHub issue creation from the dashboard.
features: [issue]
tags: [security]
go: [internal/server/issue*.go, internal/ghissue/**]
web: [web/src/features/issue*.ts]
e2e: [web/e2e/issue-capture.spec.ts, web/e2e/helpers/issue.ts, web/e2e/helpers/ghapi.ts]
protocol: [issue.captures, issue.create]
refs: [kb:adr/issue-capture-then-file-server-held, kb:adr/issue-payload-allowlist-never-dump, kb:adr/issue-preview-is-the-leak-check, kb:adr/issue-auth-gh-token-at-time-of-use, kb:adr/issue-daemon-creates-issues-only, kb:adr/stack-git-and-gh-clis-not-go-git]
---
A masthead Issue button files a GitHub issue against Muster's own repository with a snapshot
of the dashboard's state attached, so a bug report carries what the daemon knew.

Filing is two steps (kb:adr/issue-capture-then-file-server-held). Opening the dialog takes a
capture through `kb:anchor/issue.captures`, scoped to the focused session or to the
dashboard as a whole via a Session select built from the rail's order. The daemon assembles
the snapshot by explicit field copy from a pinned allowlist: daemon and Claude Code versions
and classification, host OS and architecture, dashboard counts and view state, and for a
session its state, timings, liveness, attention reason, raw failure token, model,
permission mode, context figures, compaction count, tmux target and event counts. Prompt
text, hook payloads, pane captures, the last activity and failure message, the title,
directory, branch, repo name, the Claude session id and every account-usage figure are
excluded forever (kb:adr/issue-payload-allowlist-never-dump). Captures are held in memory,
a few at a time, and expire after a short window.

The dialog renders the daemon's snapshot markdown verbatim as a preview above a title field
and an optional note; the posted body is exactly the note section followed by that markdown,
so the preview is byte-identical to what GitHub receives
(kb:adr/issue-preview-is-the-leak-check). Submit sends `kb:anchor/issue.create` naming the
held capture, never a client payload. A successful file consumes the capture and the dialog
shows the issue number and link; a failure leaves the capture so a retry needs no
re-capture, and nothing is queued or written to disk.

The daemon obtains a bearer token by running the GitHub CLI's token command at time of use;
nothing is stored and there is no OAuth flow (kb:adr/issue-auth-gh-token-at-time-of-use,
kb:adr/stack-git-and-gh-clis-not-go-git). The target repository and API base are flags; an
empty API base disables both endpoints and the button. The daemon's involvement ends at
creation: no reading, labels or status sync (kb:adr/issue-daemon-creates-issues-only);
bringing issues into the backlog is kb:spec/triage.
