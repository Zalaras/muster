---
id: triage
type: spec
status: active
date: 2026-10-15
summary: GitHub issues into TODO.md through a program, with a Read-only proposer's bounded summary and labels, and the pre-commit link guard.
features: [triage]
tags: [pipeline, security]
files: [.githooks/pre-commit, .claude/skills/triage/**, .claude/agents/triage-proposer.md]
go: [tools/triage/**, internal/triage/**]
web: []
e2e: []
protocol: []
refs: [kb:adr/triage-routing-by-signals-not-counts, kb:adr/triage-bounded-proposer-summary-reaches-the-backlog, kb:adr/triage-every-entry-carries-the-header-safe-title, kb:adr/triage-labels-from-validated-names, kb:adr/triage-section-defaults-to-issues, kb:adr/triage-owner-issues-normal-unless-held, kb:adr/triage-snapshot-untrusted-drop-and-count, kb:adr/triage-sandboxing-rejected-for-read-only-proposer, kb:adr/triage-state-derived-from-todo, kb:adr/triage-auto-close-never, kb:adr/triage-issue-closes-when-fix-lands, kb:adr/issue-daemon-creates-issues-only]
---
Triage brings open GitHub issues, including those the dashboard's Issue button files
(kb:spec/issue), into `TODO.md` as backlog entries with their labels, and audits the two lists
against each other. It is a development workflow, not part of the product; nothing here ships
in a release. It pulls issues in and nothing more: grouping and ranking the backlog is a hand
edit afterwards.

Issue bodies are attacker-controlled text on a public repository, so a program owns everything
from fetch to commit and the only model in the path is a proposer holding nothing but the Read
tool (kb:adr/triage-bounded-proposer-summary-reaches-the-backlog,
kb:adr/triage-sandboxing-rejected-for-read-only-proposer). `go run ./tools/triage fetch` reads
the open issues — or one named issue, triaged or not — sanitises each body through a fixed
transform order (bidi rejection, truncation, link and image stripping, URL defanging, HTML
escaping, non-ASCII escaping), parses the attached snapshot against a strict union schema that
drops and counts unknown fields (kb:adr/triage-snapshot-untrusted-drop-and-count), and writes
one artifact per issue. What the sanitiser had to do is counted and reported, never routed on;
an issue routes on danger signals alone (kb:adr/triage-routing-by-signals-not-counts): a bidi
override, a hit in one of eight rule families or a classifier score at the hold threshold holds
it, so it reaches no model and is reported to the developer with flag names only; hidden
zero-width text or a score at the restrict threshold restricts it; an issue the repository
owner filed with no signal takes the normal path, and the session may read its sanitised
artifact and nothing else (kb:adr/triage-owner-issues-normal-unless-held). The classifier is an
optional command (`--scorer`, or `MUSTER_TRIAGE_SCORER`) speaking one JSON line in and
`{"id","p"}` out; none ships, and `scan --state all` prints every issue's route and flags for
calibrating one without writing anything.

One proposer per non-held issue summarises its artifact into a JSON proposal: a kind, one or
two areas and any modifiers from the closed label lists, two sentences of at most 240 printable
ASCII characters each saying what the report observes and what should happen instead, a
verbatim quote of the error if one is named, and a section hint. `apply` validates every field
— the ack, the lists (`needs-info` only on a restricted artifact: the developer's own report is
always actionable), the shape of the free text, the quote's provenance in the sanitised body,
and the tripwire over the summary — and renders one entry on every route
(kb:adr/triage-every-entry-carries-the-header-safe-title): the title through `HeaderSafe`, the
summary (prefixed "Summary of an unverified report:" when the issue was not the owner's clean
one), the quoted error, a fact line from the filing date and the validated snapshot leaves, and
the labels. Entries splice at the end of `## Issues` unless `--section` or a decisions file says
otherwise (kb:adr/triage-section-defaults-to-issues); `apply` stages `TODO.md` alone and commits
it, then labels each filed issue through `gh issue edit` with validated names only
(kb:adr/triage-labels-from-validated-names). `--dry-run` prints the entries and touches nothing.
The triage comment stays a manual, prompted `gh issue comment` in the skill; `audit` compares
the backlog with the tracker.

Triage state is derived, not stored: an issue is triaged iff its link appears in `TODO.md`
or the done history (kb:adr/triage-state-derived-from-todo). Triage never closes an issue;
a held one waits for the developer (kb:adr/triage-auto-close-never). An issue closes when
its fix lands on `main` with a closing reference in the squash subject
(kb:adr/triage-issue-closes-when-fix-lands, kb:spec/release).

The pre-commit hook guards the result mechanically: an added backlog entry's header line
must carry an issue number equal to the one in its own link and no angle brackets, so a
model with an edit tool cannot forge an entry whatever the skill says. It checks header lines
only, so the program's free-text rules are what keep angle brackets and `issues/` off an
entry's continuation lines. The same hook refuses to commit while the repository carries a
repo-local git identity.
