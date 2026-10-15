---
id: triage-owner-issues-normal-unless-held
type: decision
status: accepted
date: 2026-10-15
summary: An OWNER-filed issue takes the normal path unless a danger signal fires — counts never demote it — and is then readable in the session; MEMBER earns nothing
features: [triage]
tags: [security, pipeline, user-decision]
files: [internal/triage/route.go]
tests: [TestRoute, TestRouteCountsNeverDemoteOwner, TestReadableRequiresOwnerAndNormal, TestCorpusAdversarialNeverNormal]
refs: [kb:adr/triage-routing-by-signals-not-counts, kb:adr/triage-bounded-proposer-summary-reaches-the-backlog]
supersedes: [triage-owner-filed-artifacts-readable-in-session]
---
**Context.** The superseded decision made an owner issue readable only when "unflagged", and every sanitiser count was a flag. The developer files nearly every issue and wants their own reports pulled in without friction; a screenshot or a `<` in a log line was enough to shut one.

**Options.** (A) Keep the count-based gate. (B) Owner plus no danger signal — bidi, a rule-family hit, zero-width text, a classifier score — takes the normal path.

**Decision.** B, settled with the developer, and implemented as the last code commit of plan `triage-rework` so the restricted path had been run over every real issue first: nothing trusted, 92 of 94 restricted, the two planted injection tests held. The gate stays `OWNER`, not the wider member set, for the reason the superseded decision gave: a collaborator added later must not widen a grant silently. Signals still dominate: the developer's own issue with a family hit is held.

**Consequences.** `Readable` is unchanged in shape — owner and normal — but normal now means "no signal", so the developer's screenshots, links and log lines are readable. The adversarial corpus is built as owner-filed and must never route normal, which is what makes this rule safe to enable.
