---
id: triage-section-from-hint
type: decision
status: accepted
date: 2026-11-20
summary: A bug files under Bugs; any other kind under the proposer's validated hint (Features, Enhancements or Tweaks), else Tweaks; --section wins.
features: [triage]
tags: [pipeline, user-decision]
files: [internal/triage/apply.go, internal/triage/proposal.go, tools/triage/main.go, .claude/agents/triage-proposer.md, TODO.md]
tests: [TestApplyFilesByKind]
refs: [kb:adr/process-backlog-entries-are-the-users-to-file, kb:adr/triage-labels-from-validated-names, kb:adr/triage-bounded-proposer-summary-reaches-the-backlog]
supersedes: [triage-section-by-kind, triage-section-defaults-to-issues]
---
**Context.** Under filing by kind, #131 (a new notifications capability) landed in Tweaks and
#130 (a dialog that jumps around) was labelled `enhancement` and landed there too. Both were
moved by hand. The reason given for ignoring the hint — `enhancement` cannot say how big an ask
is — was true of the label, but the proposer already returns a `section_hint` that can.

**Options.** (A) Keep filing by kind. (B) File by the hint alone. (C) A bug always files under
Bugs; any other kind files under the hint, restricted to the places triage files into.

**Decision.** C, settled with the developer. The hint is drawn from a closed list `apply`
validates, so a program can route on it, as it does on `kind`. Bugs is reserved for the `bug`
kind, so a hint of Bugs on a non-bug, and a hint of Post v1, fall back to Tweaks. The proposer
agent defines each section by how the work is done (a feature needs a spec or a protocol change;
an enhancement extends something that exists; a tweak is a small change), and defines `bug` as
the product doing something it shouldn't, a visual jump included. `--section` and the per-issue
decisions file still override, and the run never asks.

**Consequences.** The proposer's hint now decides, so a wrong hint misfiles an entry; it stays a
hand move, and the report still names where each entry went. A Tweak that research shows is
feature-sized is still routed out by `/fix`.
