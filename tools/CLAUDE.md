# tools — dev tools, never shipped

**Owns**: three `go run`-only commands: `tools/kb` (index, gate and generate the `docs/` knowledge base), `tools/versions` (the Claude Code verified-range record and its fragments), `tools/triage` (the program half of `/triage`). `.goreleaser.yaml` builds only `./cmd/musterd`. **Features**: canary, knowledge, triage.

**Invariants** (violations are review-Critical):
- A `main.go` only dispatches; logic lives in `internal/kb`, `internal/triage`, or beside the command with table tests.
- `gen` writes only changed files and refuses while sources have findings; `check` exits 1 listing every finding; `make check` runs both.
- Generated files (`docs/INDEX.md`, `docs/features/*/INDEX.md`, `docs/features/*/contract.md`, `.claude/rules/*.md`, kb fragments) are never hand-edited; edit the record, regenerate.
- Protocol citations are anchor ids from `tools/kb/anchors.tsv`, never section numbers (kb:adr/knowledge-protocol-sections-addressed-by-anchor-ids).
- The verified range is observed, not pinned: `bump` appends after a green canary and edits nothing inside the range (kb:adr/canary-verified-range-observed-not-pinned).
- Nothing between GitHub and `TODO.md` is a model with tools; triage is a program and never closes an issue (kb:adr/triage-program-not-model-between-github-and-todo).

**Exemplar**: `tools/versions/main.go` + `main_test.go` — subcommand dispatch with one test per refusal path; copy this shape for a new tool.

**Gotchas**:
- `versions` reads `internal/claudecode/observed_versions.txt` from disk, not the embedded copy; `go run` compiles before `bump` appends.
- `bump` refuses on a dirty record or a failing `git diff`; commit the appended row yourself.
- `kb check` tells a stale generated file from a hand-edited one and names the remedy.
- A nested `CLAUDE.md` is budgeted at 400 words outside kb fragments, the root at 150 lines (`internal/kb/budget.go`).

<!-- kb:trailer -->
<!-- kb:hash 25eaa23ca7ed88d9 -->
- **canary** — The verified Claude Code version range, canary tiers, and the fragments tools/versions regenerates. → `docs/features/canary/INDEX.md`
- **knowledge** — Typed knowledge records, the kb tool that indexes and gates them, and the generated rules and indexes. → `docs/features/knowledge/INDEX.md`
- **triage** — GitHub issues into TODO.md through a program, and the pre-commit link guard. → `docs/features/triage/INDEX.md`
- 3 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
