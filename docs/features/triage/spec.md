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
The `/triage` skill runs in the main session. It may read the sanitised artifact of an issue the
repository owner filed that carries no sanitiser flag, and nothing else — not a raw ticket, not
`index.json`, not a facts-only or held artifact (kb:adr/triage-owner-filed-artifacts-readable-in-session).
`go run ./tools/triage fetch` reads the open issues, sanitises each body through a fixed transform
order (bidi rejection, truncation, link and image stripping, URL defanging, HTML escaping,
non-ASCII escaping), parses the attached snapshot against a strict union schema that drops
and counts unknown fields (kb:adr/triage-snapshot-untrusted-drop-and-count), and writes one
artifact per issue. The version field accepts every shape `git describe --tags --always
--dirty` can produce for `musterd.version` — a tagged release, a `-<N>-g<hash>` dev-build
tail, a `-dirty` suffix, or the bare hex fallback on an untagged clone. A proposer subagent holding only the Read tool summarises one artifact
into a JSON proposal naming component, symptom and section; capability removal, not
sandboxing, is the wall (kb:adr/triage-sandboxing-rejected-for-read-only-proposer). Beyond a readable
artifact the session sees only numbers, URLs, flag names and validated enums, and makes the one
judgement that is the developer's: which section an entry belongs in — from the table `triage
table` prints, never from a `gh` call. `apply` renders each entry on the path its route names: a
trusted, unflagged issue carries the sanitised title through `HeaderSafe`, everything else renders
from enums plus one verbatim-checked quote, and no model authors any part of either
(kb:adr/triage-normal-path-carries-the-sanitised-title). It splices them into `TODO.md` and commits
that file alone; `audit` compares the backlog with the tracker.

Triage state is derived, not stored: an issue is triaged iff its link appears in `TODO.md`
or the done history (kb:adr/triage-state-derived-from-todo). Triage never closes an issue;
a tripwire hit holds it for the developer (kb:adr/triage-auto-close-never). An issue closes when
its fix lands on `main` with a closing reference in the squash subject
(kb:adr/triage-issue-closes-when-fix-lands, kb:spec/release).

The pre-commit hook guards the result mechanically: an added backlog entry's header line
must carry an issue number equal to the one in its own link and no angle brackets, so a
model with an edit tool cannot forge an entry whatever the skill says. The same hook refuses
to commit while the repository carries a repo-local git identity.
