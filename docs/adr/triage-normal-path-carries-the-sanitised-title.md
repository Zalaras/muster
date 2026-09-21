---
id: triage-normal-path-carries-the-sanitised-title
type: decision
status: accepted
date: 2026-09-21
summary: A trusted, unflagged issue renders with the sanitised title; it is the second attacker-derived field in the backlog and HeaderSafe is its guard.
features: [triage]
tags: [security, pipeline, user-decision]
files: [internal/triage/render.go, internal/triage/route.go, internal/triage/proposal.go, .githooks/pre-commit]
tests: [TestZeroPathIsFactsOnly, TestHeaderSafe, TestRenderNormalSurvivesHostileTitles, TestRenderFactsOnlyIsUnchanged, TestPreCommitHookAcceptsARenderedNormalEntry]
refs: [kb:adr/triage-program-not-model-between-github-and-todo, kb:adr/triage-owner-filed-artifacts-readable-in-session, docs/history/design/triage-hardening.md]
supersedes: []
---
**Context.** `PathNormal` was computed from the first day and never reached the renderer: `apply` called one facts-only template for every issue. So twenty entries filed on 2026-09-21 read `**dashboard: wrong-output**` and closed by sending the reader to the raw ticket — relocating the unsafe read to a session holding Bash and Edit rather than removing it, and asserting "reporter not trusted" about the repository owner. kb:adr/triage-program-not-model-between-github-and-todo is ambiguous on the point: it says no model-authored prose ever reaches the backlog, then that *untrusted* issues render from enums.

**Options.** (A) Leave it; entries stay unusable and keep prescribing the read. (B) Carry the title, which the program sanitises and no model sees. (C) Carry a title and a proposer-written summary, putting model prose in the backlog.

**Decision.** B, settled with the developer; C was considered and cut. No model authors any part of an entry, so that decision holds unchanged rather than being superseded — this resolves its ambiguity in the strict direction. What genuinely changes is narrower: `error_string` was the one attacker-derived field reaching the backlog and the title makes it two. The two are guarded differently on purpose: a quote is optional, so a bad one is rejected and holds the issue; a title is not, so `HeaderSafe` replaces what it cannot allow and the entry still files.

**Consequences.** `HeaderSafe` neutralises `*`, `|`, backtick and `](`, which `Sanitize` preserves by design, and collapses the newline a truncated title carries inside `TruncationMarker`. Without it a single `*` makes the pre-commit hook refuse the commit, so a test drives the real hook, not a copy of its regex. `PathFactsOnly` became the zero value of `Path`: an unset route must render the strict form, and every `Artifact` literal in the tests had meant "normal" by accident.
