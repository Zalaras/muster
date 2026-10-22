---
id: triage-section-by-kind
type: decision
status: accepted
date: 2026-10-22
summary: A new entry files by its kind — a bug under Bugs, any other kind under Tweaks — unless --section or an override says where; moving it up is a hand edit.
features: [triage]
tags: [pipeline, user-decision]
files: [internal/triage/apply.go, internal/triage/proposal.go, tools/triage/main.go, TODO.md]
tests: [TestApplyFilesByKind]
refs: [kb:adr/process-backlog-entries-are-the-users-to-file, kb:adr/triage-state-derived-from-todo, kb:adr/triage-labels-from-validated-names]
supersedes: [triage-section-defaults-to-issues]
---
**Context.** `TODO.md` was restructured on 2026-10-22 into sections by how an item is worked —
Features, Enhancements (each its own `/orchestrate`), Bugs, Tweaks (each a `/fix`), Tooling and
docs — so that a fix run can take the next Bug or Tweak without a sorting pass first. The
single `## Issues` landing section the superseded decision filed into no longer exists, and
every entry under it was being moved by hand anyway.

**Options.** (A) One landing section again (`## Inbox`), sorted by hand. (B) File by the
proposer's validated `kind`: `bug` → Bugs, anything else → Tweaks. (C) Map every kind:
`enhancement` → Enhancements too.

**Decision.** B, settled with the developer. The kind labels are validated names from a closed
list, so a program can route on them, and `bug` is unambiguous. `enhancement` is not: the label
covers a one-line menu option and a new panel alike, so the program never files into
Enhancements or Features; an entry starts in Tweaks and the developer moves it up by hand, as
before. `--section` and the per-issue decisions file still override, and the run never asks.

**Consequences.** `apply` validates `--section` and overrides against the new list (Features,
Enhancements, Bugs, Tweaks, Post v1); the proposer's `section_hint` draws from the same list and
still never decides. A Tweak that research shows is feature-sized is routed out by `/fix`, which
stops when the work needs a protocol change, a feature spec or a new UI surface.
