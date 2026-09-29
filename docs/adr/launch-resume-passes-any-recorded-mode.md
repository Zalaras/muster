---
id: launch-resume-passes-any-recorded-mode
type: decision
status: accepted
date: 2026-09-28
summary: A resume from the list passes the transcript's last recorded permission mode verbatim, including modes the launch form does not offer, such as dontAsk.
features: [launch]
tags: [user-decision]
files: [internal/server/launcherpast.go]
tests: []
refs: [plan:resume-and-dangerously-allow, plans/resume-and-dangerously-allow/decisions/resume-passes-any-recorded-mode/decision.md, kb:adr/launch-resume-in-original-mode-else-default]
supersedes: []
---
**Context.** A transcript can record a mode Muster never offers, such as `dontAsk`. The first implementation resumed such a session as `default`.

**Options.** (A) Pass it verbatim. (B) Fall back to `default` for any mode Muster does not offer.

**Decision.** A, the developer's call: a resumed session comes back as it was. Whether to offer `dontAsk` at launch is tracked as issue #63.

**Consequences.** Muster can run a `dontAsk` session it cannot start. The web renders any mode string it receives.
