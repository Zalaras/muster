---
id: triage
type: spec
status: active
date: 2026-09-12
summary: GitHub issues into TODO.md through a program, and the pre-commit link guard.
features: [triage]
tags: [pipeline, security]
files: [.githooks/pre-commit, .claude/skills/triage/**]
go: [tools/triage/**, internal/triage/**]
web: []
e2e: []
protocol: []
refs: [kb:adr/triage-program-not-model-between-github-and-todo, kb:adr/triage-snapshot-untrusted-drop-and-count, kb:adr/triage-sandboxing-rejected-for-read-only-proposer, kb:adr/triage-state-derived-from-todo, kb:adr/triage-auto-close-never, kb:adr/triage-issue-closes-when-fix-lands, kb:adr/issue-daemon-creates-issues-only]
---
Triage brings open GitHub issues, including those the dashboard's Issue button files
(kb:spec/issue), into `TODO.md` as backlog entries and audits the two lists against each
other. It is a development workflow, not part of the product; nothing here ships in a release.

Issue bodies are attacker-controlled text on a public repository, so nothing between GitHub
and the backlog diff is a model holding tools (kb:adr/triage-program-not-model-between-github-and-todo).
The `/triage` skill runs in the main session and never reads an issue body. `go run
./tools/triage fetch` reads the open issues, sanitises each body through a fixed transform
order (bidi rejection, truncation, link and image stripping, URL defanging, HTML escaping,
non-ASCII escaping), parses the attached snapshot against a strict union schema that drops
and counts unknown fields (kb:adr/triage-snapshot-untrusted-drop-and-count), and writes one
artifact per issue. A proposer subagent holding only the Read tool summarises one artifact
into a JSON proposal naming component, symptom and section; capability removal, not
sandboxing, is the wall (kb:adr/triage-sandboxing-rejected-for-read-only-proposer). The
session sees only numbers, URLs, flag names and validated enums, and makes the one judgement
that is Damian's: which section an entry belongs in. `apply` renders entries from a fixed
template, splices them into `TODO.md` and commits that file alone; `audit` compares the
backlog with the tracker.

Triage state is derived, not stored: an issue is triaged iff its link appears in `TODO.md`
or the done history (kb:adr/triage-state-derived-from-todo). Triage never closes an issue;
a tripwire hit holds it for Damian (kb:adr/triage-auto-close-never). An issue closes when
its fix lands on `main` with a closing reference in the squash subject
(kb:adr/triage-issue-closes-when-fix-lands, kb:spec/release).

The pre-commit hook guards the result mechanically: an added backlog entry's header line
must carry an issue number equal to the one in its own link and no angle brackets, so a
model with an edit tool cannot forge an entry whatever the skill says. The same hook refuses
to commit while the repository carries a repo-local git identity.
