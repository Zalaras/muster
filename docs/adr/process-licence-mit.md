---
id: process-licence-mit
type: decision
status: accepted
date: 2026-09-04
summary: The licence is MIT, over Apache-2.0 and AGPL-3.0; copyright is retained, so relicensing or sale stays open.
features: []
tags: [user-decision]
files: [LICENSE, docs/design/open-sourcing.md, README.md]
tests: []
refs: [docs/history/spec-changelog.md, docs/design/open-sourcing.md, kb:adr/process-contributions-deferred-to-first-pr, kb:adr/release-distribution-github-release-not-brew, kb:adr/process-repo-public, docs/history/interview-notes.md]
supersedes: []
---
**Context.** The spec had left the licence to be decided later, and a licence file was the one hard blocker to making the repository public. The open-sourcing note recorded the candidates and what comparable individual-maintainer tools chose.

**Options.** (A) Apache-2.0, for its explicit patent grant and trademark clause. (B) AGPL-3.0, to keep hosted derivatives open. (C) MIT.

**Decision.** C, Damian's decision. The Apache advantages do not bite here: a copyright licence never grants trademark rights, so MIT withholds the name just as well; there are no patents to grant on a tmux session dashboard; inbound contributions follow the inbound-equals-outbound norm regardless. MIT is GPLv2-compatible where Apache is not, and it is what every comparable individual-maintainer tool chose. AGPL's network clause never fires for a localhost single-user daemon, and many employers forbid engineers from reading AGPL code.

**Consequences.** Copyright is retained and MIT is a non-exclusive grant, so relicensing or sale remains possible. The visibility flip is a separate step that waited on the remaining chores and on Damian confirming his employment IP terms. The dependency set is all permissive, so nothing is inherited.
