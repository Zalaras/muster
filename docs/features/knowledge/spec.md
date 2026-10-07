---
id: knowledge
type: spec
status: active
date: 2026-09-12
summary: Typed knowledge records, the kb tool that indexes and gates them, and the generated rules and indexes.
features: [knowledge]
tags: [pipeline]
go: []
web: []
e2e: []
protocol: []
files: [kb.yaml, docs/protocol-anchors.tsv]
refs: [kb:adr/knowledge-protocol-sections-addressed-by-anchor-ids, kb:adr/knowledge-repo-values-live-in-kb-yaml, kb:adr/knowledge-refs-and-scope-are-kb-subcommands, kb:adr/knowledge-kb-tool-is-a-separate-module, docs/conventions.md, https://github.com/Zalaras/kb]
---
Project knowledge is a store of typed Markdown records with strict frontmatter, read and
gated by `go tool kb` (docs/conventions.md "Knowledge records"). It exists so that
pipeline agents load the records their feature needs instead of whole documents. The tool is
the module `github.com/Zalaras/kb`, pinned by the `tool` directive in `go.mod`; this repo
holds no tool code (kb:adr/knowledge-kb-tool-is-a-separate-module). Everything specific to
this repo — the record directories, the closed tag and role lists, the paths the tool reads
and writes, the version record and its `canary` ceiling word, the agent directory the role
list is checked against, how generated text spells `go tool kb` and `make gen-kb`, the
budgets, which sections each role packs, and the refs and scope settings — is `kb.yaml` at
the repo root, parsed strictly; the record model is the module's code
(kb:adr/knowledge-repo-values-live-in-kb-yaml). `docs/protocol-anchors.tsv` is the table of
protocol section numbers to anchor ids, a record of this repo, read by nobody but people.

**Records.** Eight types, each in its own directory: rules, decisions in `docs/adr`, diagrams
in `docs/diagrams`, facts in `docs/facts`, lessons in `docs/lessons`, runbooks, references, and
one spec per feature at `docs/features/<name>/spec.md`. A record answers one question and
stays inside a word budget: three hundred words, eight hundred for a spec, six hundred for a
runbook; the source inside a mermaid fence is not counted. The common frontmatter is `id`,
`type`, `status`, `date`, `summary`, `features`, `tags` from the closed list, `files`, `tests`
and `refs`; a decision adds `supersedes`, a fact adds a `verified` version range and a `guard`
test, a lesson adds `roles`, a diagram adds `kind` from the closed list, and a spec adds `go`,
`web`, `e2e` and `protocol` globs, which are the feature registry. A diagram record holds
exactly one mermaid fence opening with its kind's keyword; a mermaid fence in any record
must open with one of the eight keywords (kb:adr/knowledge-diagrams-are-mermaid-records). A record is cited as a token,
`kb:<type>/<id>`, in prose and in Go and TypeScript comments; `refs` carry provenance as
plan names, issue numbers, URLs or repo paths.

**Anchors.** Sections of `docs/protocol.md` are addressed by stable `kb:anchor` ids in HTML
comments before each heading, never by number; a spec's `protocol` list names them, and the
generated per-feature contract is sliced from them
(kb:adr/knowledge-protocol-sections-addressed-by-anchor-ids).

**Generated files.** `gen` renders the store index, each feature's INDEX and contract, a
per-feature rules file under `.claude/rules` truncated to a line budget, and the kb
fragments inside every CLAUDE.md. Generated files are never edited by hand; `make gen-kb`
regenerates and `make check-kb` gates.

**Checks.** `check` enforces every invariant: ids match filenames, types match directories,
statuses and tags are from their lists, summaries fit, budgets hold, globs match files,
tests and guards exist, every citation in scope resolves to a live record or anchor, a
fact's verified range sits inside the observed Claude Code range, every role has an agent
file and every agent file a role, a superseded decision has a successor, a generated file is
neither stale nor hand-edited, and every repo path,
`make` target and `musterd` flag a markdown line or a code comment cites exists — the
`refs` pass, also runnable alone over the files a branch changed or an explicit list
(kb:adr/knowledge-refs-and-scope-are-kb-subcommands).

**Queries.** `pack` assembles the records for a plan, role and feature set into one context
bundle and reports its word count, carrying only the sections the role acts on — decisions,
facts, contracts, design documents and conventions sections are scoped per role, and a dropped
section leaves a one-line pointer (`kb:adr/knowledge-pack-sections-scoped-by-role`); a plan's
`**Touches**` features pack as spec and contract only, except for review
(`kb:adr/process-touched-features-widen-without-stopping`); `for` and `why` list the features and records covering a
repo path, and `owners` prints the owning features of many paths in one tab-separated line
each; `scope` checks that every source file a branch changed belongs to a feature its plan's
Features or Touches header names, widening Touches itself with `--touch`; `show`, `cite`,
`find` and `ls` look records up by id, word, type, feature, status, role or missing guard.

The store does not hold history: how a decision was reached lives in `docs/history`.
