---
id: knowledge-kb-tool-is-a-separate-module
type: decision
status: accepted
date: 2026-10-08
summary: The kb tool is the public module github.com/Zalaras/kb, pinned by a go.mod tool directive and run as go tool kb; this repo keeps kb.yaml and the records.
features: [knowledge]
tags: [pipeline, deps]
files: [kb.yaml, go.mod, docs/protocol-anchors.tsv]
tests: []
refs: [plan:kb-extract, https://github.com/Zalaras/kb, kb:adr/knowledge-repo-values-live-in-kb-yaml, kb:adr/knowledge-refs-and-scope-are-kb-subcommands]
supersedes: []
---
**Context.** Once every repo value lived in `kb.yaml`
(kb:adr/knowledge-repo-values-live-in-kb-yaml), four couplings still tied the tool to this
repo: `internal/kb` imported `internal/claudecode` for the observed-versions record, one test
read this repo's agent directory, the defaults and fixtures carried this repo's names, and
generated text spelled `go run ./tools/kb`. Another repo wanting the tool had to fork it, and
the fork would drift.

**Options.** (A) Keep the tool here and let other repos fork. (B) A subtree split carrying the
history. (C) A fresh public module with a clean first commit, its own decision records, no
reference to this repo, consumed here through a Go `tool` directive.

**Decision.** C. The tool is `github.com/Zalaras/kb`; `go.mod` requires it and declares
`tool github.com/Zalaras/kb/cmd/kb`, so `go tool kb` runs the pinned version and `tools/kb` is
gone. The observed-versions coupling became a generic version record: `versions.file` names
`internal/claudecode/observed_versions.txt` and `versions.ceiling_word` keeps `canary`, and
`internal/claudecode` keeps its own embedded parser for the daemon — two parsers of a
six-line format, by design. The agent-roles test became the `agents` section `kb check`
enforces. Generated text spells `commands.cli` and `commands.regen`. The protocol anchors
table, a record of this repo, moved to `docs/protocol-anchors.tsv`.

**Consequences.** Every caller says `go tool kb`; a tool upgrade is a `go get -tool` and a
`go.mod` diff. The module's own decisions live in its repo, not here. Accepted decisions
that name `internal/kb` or `tools/kb` keep their text; `refs.whitelist` names both paths.
