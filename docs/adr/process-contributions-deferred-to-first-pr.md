---
id: process-contributions-deferred-to-first-pr
type: decision
status: accepted
date: 2026-09-04
summary: No CLA or DCO pre-emptively; inbound contributions are decided at the first real pull request, and the README says issues yes, pull requests not yet.
features: []
tags: [user-decision, deferred]
files: [README.md, docs/design/open-sourcing.md]
tests: []
refs: [docs/history/spec-changelog.md, docs/design/open-sourcing.md, kb:adr/process-licence-mit, kb:adr/process-repo-public]
supersedes: []
---
**Context.** Choosing a licence raised the neighbouring question of inbound contributions: whether to require a contributor agreement or a signed-off certificate before anyone sends code.

**Options.** (A) Adopt a developer certificate of origin or a contributor licence agreement now, before going public. (B) Publish under the inbound-equals-outbound norm and decide when the first real pull request arrives.

**Decision.** B, Damian's decision. The tool is a personal one and the README sets expectations: issues are welcome, pull requests are not accepted at this time, so the machinery would guard a door that is closed.

**Consequences.** The first pull request is the trigger to revisit, and the decision then can weigh a real contributor. Nothing in the repository automates contributor checks. The licence choice was made independent of this question.
