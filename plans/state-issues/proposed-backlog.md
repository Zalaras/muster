# Proposed backlog — state-issues

### Shell-registry tests fail when `make test` runs inside a Muster session
**Summary**: two `internal/server` shell-registry tests fail when `make test` inherits `MUSTER_SESSION`/`TMUX` from a Muster pane.
**Source**: `plans/state-issues/daemon-tests.md` (daemon-tests gate run): `TestShellRegistry_EnsurePaneEnvironmentNeverCarriesMusterSession` and `TestShellRegistry_RespawnsAfterExternalKillWithNoMusterSession` saw `MUSTER_SESSION=[9]`; both pass under `env -u MUSTER_SESSION -u TMUX`.
**Change requested**: no. The tester reported it as unrelated to the plan, and the orchestrator ran its gates with both variables unset.
**Suggested section**: tests / tooling
**Pre-existing**: yes. This branch does not touch `internal/server`.

### Comment pass re-judges a whole pre-existing doc block when a plan edits one word of it
**Summary**: `commentpass strip` treats an edited pre-existing comment block as added, so the judge can drop main's doc wholesale.
**Source**: `review.maintainability.cycle1.md` Note 1 and `review.code.cycle1.md` Note 1. The cycle-1 pass dropped Apply's contract, `restoreChangedFields`' rationale, `FromSubagent`'s doc and others. The orchestrator restored the verbatim ones (660dff46). Cycle 2 dropped the two whose wording had to change (`FromSubagent`'s boundary doc, the pending-resume graduation note in `bindIdentity`).
**Change requested**: yes. The maintainability reviewer: "restore those blocks and/or bring the tool in line with its ADR (kb:adr/process-comment-pass-owns-code-comments)".
**Suggested section**: pipeline tooling (also material for `/retro`)
**Pre-existing**: yes. It is the tool's behaviour; this branch only exposed it.

### Stale comment above TestApply_CompactionEndedBinding
**Summary**: `internal/session/manager_cardstate_test.go:118` still says the compact SessionStart "is a binder"; after decision B it is not.
**Source**: `review.code.md` (cycle 2) Notes.
**Change requested**: no. It is a `[note]`, and `commentpass drop` does not reach test files.
**Suggested section**: tests
**Pre-existing**: no. This branch added it.

## Decisions (the developer, 2026-10-13)

1. Shell-registry tests fail inside a Muster session — duplicate of TODO.md § Together — `MUSTER_SESSION` from the surrounding environment, "`make test` fails inside a Muster session". Not filed.
2. Comment pass re-judges a whole pre-existing doc block — duplicate of TODO.md § Pre-v1, "The comment pass keeps comments a plan did not write". Not filed.
3. Stale comment above TestApply_CompactionEndedBinding — not filed: fixed directly on `main` after the land, as a `docs` commit.
