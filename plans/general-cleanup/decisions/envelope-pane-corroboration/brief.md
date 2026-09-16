# Decision brief: envelope-pane-corroboration

**Question**: When an ingest envelope names a Muster session, how does the daemon use the envelope's `tmuxPane` to corroborate it before routing?
**Source**: user question (Damian, 2026-09-16, during `/plan-work general-cleanup`)
**Option A**: Lenient three-way. An envelope without a pane routes as today (bare `Manager.Exists`); a pane present and equal to the session's stored `TmuxPane` routes; a pane present and different is persisted unrouted (NULL `event.session_id`) and logged. Both fixture helpers (`web/e2e/helpers/payloads.ts`, `internal/claudecode/claudecodetest`) change their default from the fake pane `%12` to *no pane*; one e2e test and one daemon unit test exercise the match/mismatch paths, reading the real pane through the existing tmux helper. No protocol change.
**Option B**: Strict. An enveloped event routes only when its pane is present and equals the stored pane; absent or mismatched is persisted unrouted and logged. Every enveloped fixture helper takes the pane (e2e: a new `daemon.tmuxPaneId(tmuxTarget)` helper querying `list-panes -F '#{pane_id}'` on the scratch socket; Go: the seeded `%1`), and all ~139 e2e call sites plus the daemon test sites are updated to pass it. No protocol change.

## Pinned reading list (both advocates read all of it before turn 1)
- `internal/server/ingest.go` — `resolveSessionID` (the code under decision) and the `TmuxPane: ev.TmuxPane` persist at ~line 128
- `internal/claudecode/ingest.go:21-45,60-95` — envelope shape (`musterSession`, `tmuxPane`)
- `internal/claudecode/settings.go:299-312` — `writeEnvelopeScript`: `tmuxPane` is sent iff `$TMUX_PANE` is set
- `internal/session/manager.go:270-285,570-580,610-620` — where `TmuxPane` is stored and updated (launch, resume, reconcile repair)
- `internal/claudecode/claudecodetest/` — `EnvelopedHookBody`, `EnvelopedSessionStart` (default pane `%12`)
- `internal/server/reader_test.go:255-269` — `seedLiveSessionInDir` records pane `%1`
- `web/e2e/helpers/payloads.ts:19-27,87-115` — `envelope`, `envelopedSessionStart` (default `tmuxPane: "%12"`)
- `web/e2e/helpers/daemon.ts:880-900` — `tmuxPaneExists`, the existing scratch-socket tmux query pattern
- `plans/plain-terminal-session/test-specs.md:196` — the repo being bitten once by a fixture that silently enveloped to session 1
- `docs/protocol.md` — search `tmuxPane` (line ~711: "from $TMUX_PANE; absent outside tmux (headless probes)") and `kb:anchor/ingest.envelope`
- ADRs: `kb:adr/ingest-envelope-authoritative-binding`, `kb:adr/ingest-monotonic-rebind`, `kb:adr/lifecycle-session-ids-monotonic-never-reused`, `kb:adr/ingest-envelope-binds-never-cwd`, `kb:adr/ingest-wire-shaped-fixtures-via-claudecodetest` (`go run ./tools/kb show <slug>`)
- `TODO.md` — the "Ingest: corroborate an envelope against the pane it came from" entry (the item's own statement of the residual risk)
- `docs/conventions.md` § Testing (fixture rules; `make e2e-soak`)

## The issue, verbatim
> **Ingest: corroborate an envelope against the pane it came from** — `resolveSessionID` (`internal/server/ingest.go`) trusts an envelope's `musterSession` on bare map membership (`Manager.Exists`): no pane check, no `created_at`, no generation. `session.tmux_pane` has been labelled "envelope corroboration" since `0002_sessions.sql:24` and is compared nowhere, and `event.tmux_pane` is persisted and never read. Deferred from plan `session-lifecycle`, which closed the severe case a different way — ids are now monotonic (`kb:adr/lifecycle-session-ids-monotonic-never-reused`), so a stale pane can no longer bind to a *different* session that reused its id. The residual window is a straggler from before a resume, on the same row, which is benign. Worth its own plan because the e2e fixtures hardcode `musterSession: 1` (`web/e2e/helpers/payloads.ts:84-108`), so the blast radius is wide — and `plans/plain-terminal-session/test-specs.md:196` records this repo already being bitten once by a fixture that silently enveloped to session 1.

User constraints (verbatim): "it should just be updating how the ID works in the tests. While it might be touching a lot of code it should be small changes or a helper function, if needed, but it shouldn't be a 'big' change." Hook delivery is best-effort and unordered; a stale pane after a resume is the residual case; ids are monotonic so a stale envelope can never bind to a different session.

## Rules
Up to 3 turns each, ≤400 words per turn, advocate-a opens. Argue from the pinned docs and
measurable consequences; cite file:line; steelman before rebutting; concede when convinced.
Append each turn to debate.md before sending it. The ending turn's author reports once to
`main`. Agent names: advocate-a (Option A), advocate-b (Option B).
