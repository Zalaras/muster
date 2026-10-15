---
id: triage-bounded-proposer-summary-reaches-the-backlog
type: decision
status: accepted
date: 2026-10-15
summary: The Read-only proposer's two bounded, ASCII, link-free, tripwire-checked sentences reach TODO.md; a program still owns everything from fetch to commit.
features: [triage]
tags: [security, pipeline, user-decision]
files: [internal/triage/proposal.go, internal/triage/render.go, .claude/agents/triage-proposer.md, .claude/skills/triage/SKILL.md]
tests: [TestValidateProposalFreeText, TestValidateProposalRejects, TestRenderEntryRestricted, TestFetchThenApply]
refs: [kb:adr/triage-sandboxing-rejected-for-read-only-proposer, kb:adr/triage-auto-close-never, docs/history/design/triage-hardening.md]
supersedes: [triage-program-not-model-between-github-and-todo]
---
**Context.** The superseded decision let no model-authored prose into the backlog: an entry was a title, two coarse enums and an 80-character quote. Not one such entry survived: every one was rewritten by hand from the body, and most `docs(triage)` commits were session-written prose, so the rule was routed around rather than followed. What an entry needs — what happened, what should have — is in the body, and only a model can summarise it.

**Options.** (A) Keep enums and accept hand rewriting. (B) Let the session read every sanitised body and write prose. (C) Keep the Read-only proposer and widen its reply to two bounded sentences the program validates hard, plus labels from closed lists.

**Decision.** C, settled with the developer. `symptom` and `expected` are each at most 240 bytes of printable ASCII — which rules out line breaks, tabs and hidden runes — with none of the structure-forging sequences, no `://` or `www.`, no `issues/` (a continuation line carrying it would be checked as a header by the pre-commit hook), never empty, and the tripwire runs over both plus the quote so a proposer talked into relaying an instruction holds the issue. A restricted entry opens its summary with "Summary of an unverified report:". The superseded rule's core survives: a program fetches, sanitises, routes, renders, splices, commits and labels; the proposer holds nothing but Read; a malformed reply holds the issue.

**Consequences.** Model prose from an outside body now lands in a file later sessions read with tools. The residual is stated, not closed: a paraphrased instruction that passes every rule is possible; the bound, the prefix and the "Expected:" framing make it read as a report, and the 240-byte cap limits what it can say. The daemon-side rule is untouched: musterd still only creates issues.
