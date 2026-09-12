---
id: knowledge
type: spec
status: active
date: 2026-09-12
summary: Typed knowledge records, the kb tool that indexes and gates them, and the generated rules and indexes.
features: [knowledge]
tags: [pipeline]
go: [internal/kb/**, tools/kb/**]
web: []
e2e: []
protocol: []
refs: [kb:adr/knowledge-protocol-sections-addressed-by-anchor-ids, docs/conventions.md]
---
Project knowledge is a store of typed Markdown records with strict frontmatter, read and
gated by `go run ./tools/kb` (docs/conventions.md "Knowledge records"). It exists so that
pipeline agents load the records their feature needs instead of whole documents.

**Records.** Seven types, each in its own directory: rules, decisions in `docs/adr`, facts in
`docs/facts`, lessons in `docs/lessons`, runbooks, references, and one spec per feature at
`docs/features/<name>/spec.md`. A record answers one question and stays inside a word
budget: three hundred words, eight hundred for a spec, six hundred for a runbook. The common
frontmatter is `id`, `type`, `status`, `date`, `summary`, `features`, `tags` from a closed
list, `files`, `tests` and `refs`; a decision adds `supersedes`, a fact adds a `verified`
version range and a `guard` test, a lesson adds `roles`, and a spec adds `go`, `web`, `e2e`
and `protocol` globs, which are the feature registry. A record is cited as a token,
`kb:<type>/<id>`, in prose and in Go and TypeScript comments; `refs` carry provenance as
plan names, issue numbers, URLs or repo paths.

**Anchors.** Sections of `docs/protocol.md` are addressed by stable `kb:anchor` ids in HTML
comments before each heading, never by number; a spec's `protocol` list names them, and the
generated per-feature contract is sliced from them
(kb:adr/knowledge-protocol-sections-addressed-by-anchor-ids).

**Generated files.** `gen` renders the store index, each feature's INDEX and contract, a
per-feature rules file under `.claude/rules` truncated to a fixed line budget, and the kb
fragments inside every CLAUDE.md. Generated files are never edited by hand; `make gen-kb`
regenerates and `make check-kb` gates.

**Checks.** `check` enforces every invariant: ids match filenames, types match directories,
statuses and tags are from their lists, summaries fit, budgets hold, globs match files,
tests and guards exist, every citation in scope resolves to a live record or anchor, a
fact's verified range sits inside the observed Claude Code range, a superseded decision
has a successor, and a generated file is neither stale nor hand-edited.

**Queries.** `pack` assembles the records for a plan, role and feature set into one context
bundle and reports its word count; `for` and `why` list the features and records covering a
repo path; `show`, `cite`, `find` and `ls` look records up by id, word, type, feature, status,
role or missing guard.

The store does not hold history: how a decision was reached lives in `docs/history`.
