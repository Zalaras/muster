---
id: triage-owner-filed-artifacts-readable-in-session
type: decision
status: accepted
date: 2026-09-21
summary: The session may read an OWNER-filed, unflagged issue's sanitised artifact — never the raw ticket, and OWNER rather than the wider trusted set.
features: [triage]
tags: [security, pipeline, user-decision]
files: [internal/triage/route.go, internal/triage/artifact.go, tools/triage/main.go, .claude/skills/triage/SKILL.md]
tests: [TestReadable, TestWriteDispatchCarriesTitleOnlyWhenReadable]
refs: [kb:adr/triage-program-not-model-between-github-and-todo, kb:adr/triage-normal-path-carries-the-sanitised-title, docs/history/design/triage-hardening.md]
supersedes: []
---
**Context.** The skill may not read an issue body, so `dispatch.json` carried numbers, paths and acks alone. But the developer must rank each issue into a section, and numbers do not support that judgement. On 2026-09-21 the session reached for `gh issue list` to get titles — pulling raw, unsanitised tracker text into the very session the design protects, to serve a step the design requires. The rule was not preventing the read; it was routing it around the sanitiser.

**Options.** (A) Keep the rule and keep paying it in `gh` calls nobody sanitises. (B) Let the session read the raw ticket for trusted issues. (C) Let it read the *sanitised artifact*, for owner-filed unflagged issues only.

**Decision.** C, settled with the developer. Every transform still runs — bidi rejected, links stripped, URLs defanged, HTML escaped, non-ASCII escaped — so this widens what the session may read, never what reaches it unexamined. The gate is `OWNER` rather than `TrustedAssociations`: that set is `{OWNER, MEMBER}` and equals self-filed only because the repository currently has no other members, which is a fact about the collaborator list and not about the code. Keyed on it, the grant would widen the day someone is added, silently.

This narrows kb:adr/triage-program-not-model-between-github-and-todo rather than replacing it: that rule governs what writes the backlog diff, and a program still does all of it.

**Consequences.** `Readable` is the single predicate and requires both halves, so a flagged owner issue and a clean member issue are both unreadable. A dispatch row carries `title` only when readable, and `tools/triage table` builds the ranking table from validated pipeline output instead of `gh`. A held issue never reaches dispatch at all and so can never become readable. The residual is unchanged and stated: the proposer's reply still enters the session's context.
