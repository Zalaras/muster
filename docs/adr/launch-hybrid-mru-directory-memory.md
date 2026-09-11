---
id: launch-hybrid-mru-directory-memory
type: decision
status: accepted
date: 2026-08-16
summary: Directory memory is hybrid MRU plus promotion; v1 recognises a worktree it is pointed at but never creates one.
features: [launch]
tags: [ux, store]
files: [internal/store/repo.go, internal/server/repos.go, internal/gitutil/gitutil.go]
tests: [TestListRepos_OrdersPinnedThenMostRecentlyLaunched, web/e2e/launch.spec.ts]
refs: [docs/history/spec-changelog.md, docs/design/ux-flows.md, kb:anchor/repos.list, kb:anchor/sessions.create, SPEC.md]
supersedes: []
---
**Context.** The launch dialog needed a source of directories to offer, and the spec left open how much of a repo registry and worktree manager v1 should carry. The data layer had to serve a later worktree feature without a schema repaint.

**Options.** (A) An explicit registry: the user registers repos before launching. (B) Pure most-recently-used: every launch is remembered, nothing is curated. (C) Hybrid: every launch auto-remembers its directory as a repo row, and a row becomes promoted only when it carries per-repo configuration. For worktrees: (D) create them from the dashboard in v1, (E) only recognise one the launcher is pointed at, (F) ignore them.

**Decision.** C for directory memory and E for worktrees. Sessions launch into the checkout picked; the worktree column stays null; the launcher tells a worktree from a plain checkout by comparing git's common dir with its git dir so the rail shows repo and branch truthfully.

**Consequences.** No upfront registration step exists. The repo list orders pinned rows first, then most recently launched. A later worktree manager adds one launch-form field and creates rows in a table that already exists, repainting nothing.
