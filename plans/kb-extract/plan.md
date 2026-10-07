# Plan: kb-extract

**Created**: 2026-10-08
**Status**: Approved
**Work Type**: tooling (no release; a plan and a commit, not an /orchestrate run)
**Features**: knowledge

## Problem

`internal/kb` and `tools/kb` were the one part of this repo's knowledge management another
repository could use, and kb:adr/knowledge-repo-values-live-in-kb-yaml left them one step short
of that: the code still imported `internal/claudecode` for the observed-versions record, a test
read this repo's `.claude/agents`, the defaults and fixtures carried this repo's names, and the
generated text spelled `go run ./tools/kb`. Anyone else wanting the tool had to fork it.

## Decision

- The tool is its own public module, `github.com/Zalaras/kb` (dir `../kb`, binary `kb`, MIT),
  with a fresh history and no reference to this repo; its decisions are its own records
  (kb:adr/knowledge-kb-tool-is-a-separate-module).
- This repo depends on it through a `tool` directive in `go.mod` and runs it as `go tool kb`;
  `tools/kb` is deleted and every caller is rewritten. The anchors table moves to
  `docs/protocol-anchors.tsv`.
- `kb.yaml` grows the keys the generic tool needs spelled out: `versions` (file and the word
  `canary`), `agents` (the roles-to-agent-files check that replaces `TestRoles_MatchTheAgentFiles`),
  `commands` (`go tool kb`, `make gen-kb`), and whitelist entries for the paths accepted
  decisions still name.

## Changes

- `go.mod`/`go.sum`: require `github.com/Zalaras/kb v0.1.0`, `tool github.com/Zalaras/kb/cmd/kb`.
- Delete `internal/kb/` and `tools/kb/`; move `tools/kb/anchors.tsv` to `docs/protocol-anchors.tsv`.
- `Makefile` `gen-kb`/`check-kb`/`refs` → `go tool kb …`; `.githooks/commit-msg` unshipped
  regex drops `internal/kb`; `internal/commentpass/blocks_test.go` picks another out-of-scope path.
- `go run ./tools/kb` → `go tool kb` in `CLAUDE.md`, `.claude/agents/*`, `.claude/skills/*`, `docs/*`.
- Records: new ADR; `docs/features/knowledge/spec.md` (no `go` globs, body says where the tool
  lives); `docs/conventions.md` (§ Knowledge records, Stack row, § Commits table); `tools/CLAUDE.md`;
  `docs/diagrams/daemon-components.md` prose; `docs/protocol.md:20`; metadata-only `files`/`tests`
  edits on the accepted records naming vanished paths; `make gen-kb`.

## Verification

- `go tool kb check` from the root and from `internal/`; `make gen-kb` twice (second run fresh).
- A bogus role added to `kb.yaml` makes `go tool kb check` fail through the `agents` check; reverted.
- `make check` green.
- `git grep -n 'tools/kb\|internal/kb'` shows only `plans/`, `docs/history/`, whitelisted accepted
  decision bodies and the new ADR.

## Doc Delta

- **knowledge** — becomes true: the tool is the `github.com/Zalaras/kb` module, run as `go tool kb`;
  this repo holds `kb.yaml`, the records and `docs/protocol-anchors.tsv`; the agent-roles check is
  `kb check`'s `agents` section. Stops being true: "`internal/kb`", "`tools/kb`", "`go run ./tools/kb`",
  "TestRoles_MatchTheAgentFiles".

## Out of scope

- Teaching `internal/claudecode` to import the module's version-record parser: the daemon ships
  its own embedded copy and the format is six lines; two parsers by design.
- Any change to the record model.
