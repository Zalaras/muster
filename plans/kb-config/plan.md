# Plan: kb-config

**Created**: 2026-10-07
**Status**: Approved
**Work Type**: tooling (no release; a plan and a commit, not an /orchestrate run)
**Features**: knowledge

## Problem

The knowledge audit of 2026-10-07 found `internal/kb` to be the one extractable piece of
Muster's knowledge management, but it hardcoded about a dozen repo-specific values (record
directories, tag and role lists, pack scoping per role, owned source roots, budgets, the
observed-versions path). Two orchestration scripts, `dead-refs.py` and `features-scope.sh`,
reimplemented kb path logic in regex and awk with no tests, and `plan-lint.sh` built a temporary
kb binary to parse `kb for` output.

## Decision

- Every repo-specific value moves into a strict, required `kb.yaml` at the repo root, parsed by
  `github.com/goccy/go-yaml` with `Strict()`; the record model stays code
  (kb:adr/knowledge-repo-values-live-in-kb-yaml, kb:adr/stack-config-yaml-goccy-strict).
- The two scripts become `kb refs` and `kb scope`, plus a machine-readable `kb owners`; the full
  refs pass is folded into `kb check`, so `make check` drops its separate `refs` step and the
  gates drop their `dead-refs` line (kb:adr/knowledge-refs-and-scope-are-kb-subcommands).
- `plan-lint.sh` resolves registered features through `kb ls --type spec` and path owners
  through one `kb owners` call.

## Changes

- `internal/kb/config.go` (new), `budget.go` (struct + defaults), `refs.go`, `scope.go`,
  `git.go` (new); the config threaded through `load`, `record`, `feature`, `index`, `anchor`,
  `gen`, `tree`, `cite`, `check`, `pack`, `query`; `tools/kb/main.go` dispatches `refs`, `scope`,
  `owners` and exits 2 on `ErrUsage`.
- `kb.yaml` with every key spelled out; `go.mod` gains goccy as a direct dependency.
- `Makefile`, `gates.sh`, `comment-checks.py`, `orch-state.py`, `plan-lint.sh`, the orchestrate,
  land and retro skills, `CLAUDE.md`, `.gitignore` point at the subcommands; the two scripts are
  deleted.
- Three ADRs; `files:` entries naming the old scripts repointed; the knowledge spec,
  `docs/conventions.md` and `tools/CLAUDE.md` say what is true now.

## Verification

- `make check` green; `go run ./tools/kb check` reports 0 problems.
- The Go port counts exactly the references the Python script counted on the same tree
  (3713 each, token-for-token diff empty, 2026-10-07).
- `kb scope --plan kb-config` names `knowledge`; `kb owners` prints tab-separated lines;
  `plan-lint.sh groups` is clean; `comment-checks.py daemon-impl` runs through `kb refs`.

## Doc Delta

- **knowledge** — becomes true: repo values come from `kb.yaml`; `check` covers cited paths,
  make targets and flags; `refs`, `scope` and `owners` are subcommands. Stops being true:
  "truncated to a fixed line budget".

## Out of scope

- Extracting `internal/kb` to its own module; moving the observed-versions parser out of its
  import graph.
- `plan-lint.sh` check 13's hardcoded 800 and its own mermaid stripping.
- Renaming the `dead-refs:` and `features-scope:` output prefixes.
- The unused `rule` record type and the three `proposed` ADRs on main the audit found.
