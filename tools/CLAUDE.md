# tools — dev tools, never shipped

**Owns**: four dev-only commands: `tools/versions` (the Claude Code verified-range record and its fragments), `tools/triage` (the program half of `/triage`), `tools/commentpass` (strip, judge-apply, verify and drop a plan branch's added production comments; logic in `internal/commentpass`) — all `go run` — and `tools/gatelock` (the machine-wide gate lock: exclusive round every Playwright run, shared round `make test`/`test-race`; exit 75 = busy, rerun), built to `bin/gatelock` because `go run` exits 1 for any non-zero program exit and would mask that 75. `.goreleaser.yaml` builds only `./cmd/musterd`. **Features**: canary, knowledge, triage.

**Invariants** (violations are review-Critical):
- A `main.go` only dispatches; logic lives in `internal/triage` or beside the command with table tests.
- The knowledge tool is not here: `go tool kb` runs the `github.com/Zalaras/kb` module `go.mod` pins (kb:adr/knowledge-kb-tool-is-a-separate-module); this repo's side is `kb.yaml` and the records. `make check` runs `kb check`, which covers `kb refs --all`.
- Generated files (`docs/INDEX.md`, `docs/features/*/INDEX.md`, `docs/features/*/contract.md`, `.claude/rules/*.md`, kb fragments) are never hand-edited; edit the record, regenerate.
- Protocol citations are anchor ids from `docs/protocol-anchors.tsv`, never section numbers (kb:adr/knowledge-protocol-sections-addressed-by-anchor-ids).
- The verified range is observed, not pinned: `bump` appends after a green canary and edits nothing inside the range (kb:adr/canary-verified-range-observed-not-pinned).
- Nothing between GitHub and `TODO.md` is a model with tools; triage is a program and never closes an issue (kb:adr/triage-program-not-model-between-github-and-todo).
- The comment pass never edits a directive comment (`go:`, `nolint`, `biome-ignore`, `@ts-`) or a test file, and `apply` reconstructs from `strip`'s snapshot, never re-inserts (kb:adr/process-comment-pass-owns-code-comments).

**Exemplar**: `tools/versions/main.go` + `main_test.go` — subcommand dispatch with one test per refusal path; copy this shape for a new tool.

**Gotchas**:
- `versions` reads `internal/claudecode/observed_versions.txt` from disk, not the embedded copy; `go run` compiles before `bump` appends.
- `bump` refuses on a dirty record or a failing `git diff`; commit the appended row yourself.
- `kb check` tells a stale generated file from a hand-edited one and names the remedy.
- Every repo-specific value the knowledge tool reads — record dirs, roles, tags, budgets (a nested `CLAUDE.md` 400 words outside kb fragments, the root 150 lines), pack scoping, the version record, the agents directory — is `kb.yaml`; upgrade the tool with `go get -tool github.com/Zalaras/kb/cmd/kb@<version>`.

<!-- kb:trailer -->
<!-- kb:hash 09b10f5bb97d6848 -->
- **canary** — The verified Claude Code version range, canary tiers, and the fragments tools/versions regenerates. → `docs/features/canary/INDEX.md`
- **comment-pass** — The orchestrator's comment pass — strip a plan branch's added comments, a Sonnet judge keeps the load-bearing few, a ledger the gates verify. → `docs/features/comment-pass/INDEX.md`
- **triage** — GitHub issues into TODO.md through a program, and the pre-commit link guard. → `docs/features/triage/INDEX.md`
- 6 records name files in this directory: `go tool kb for <path>` lists them for one file.
<!-- /kb:trailer -->
