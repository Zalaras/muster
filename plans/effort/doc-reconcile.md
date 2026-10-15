# Doc Reconcile: effort

**Verdict**: reconciled
**Pack**: kb: pack 28758 words (budget 30000)
**Features derived**: launch, focus, card-location, past-sessions, actions, ingest (plan header Features: launch, focus, card-location, past-sessions, actions, ingest; Touches: usage, lifecycle, connection, rail, tiles, canary). Changed files outside the six map only to Touches features or to none of the specs' unlisted features.

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| launch | Effort segmented control default/low..max; level to `--effort`, default none | `web/index.html` radios; `web/src/features/launch.ts:selectedEffort`; `internal/claudecode/launch.go:BuildArgv` | added |
| launch | Model, Effort, Start default to last-used; Recent restores model, effort, mode | `web/src/features/launchrestore.ts`; `internal/store/repo.go:LastEffort` | edited |
| launch | First-report mismatch raises the warning | `internal/session/effort.go:checkLaunchedEffort` | added |
| launch | Cache-identity and unrecognised-sentence sentences | already stated by `kb:anchor/models.check` and the diagram | deleted |
| focus | Meta line model plus bracketed effort, `(…)`, none for dead/never-reported, width reserved | `web/src/sessions/effort.ts:effortBrackets,effortReadout` | added |
| focus | Warning strip, tint, per-session Dismiss, persisted | `web/src/render/effortstrip.ts`; `internal/session/effort.go:ClearEffortWarning`; `internal/session/row.go:effortWarningToRow` | added |
| card-location | Effort from status line `effort.level`, null when absent | `internal/claudecode/status.go:interpretEffort`; `internal/session/status.go` adoptEffort | added |
| past-sessions | Resume adds `--effort` from transcript; row shows it | `internal/server/launcherpast.go:117-143`; `internal/claudecode/launchtranscripts.go` | edited (+ diagram argv) |
| actions | Resume passes last-known effort, none if never reported; header keeps it | `internal/server/launcher.go:552` (`sess.EffortLevel()`) | added |
| actions | Resume cancels pending first-report check; restart keeps it | `internal/session/actions.go:301`, `reconcile.go:240`, `row.go` effortRequested persisted | added |
| ingest | Status-line row carries effort | `internal/session/status.go:57` | edited |
| protocol | Dismiss 404 uses shared `unknown_session` body | `docs/protocol.md` line ~1034 (no `no session with that id` on that route) | verified, no edit |
| design-system | `--warn` row, §3 rule, §5 strip | `docs/design/design-system.md` lines 41, 126, 196 | verified, no edit |
| dir guides | `features/CLAUDE.md` names effort.ts; `server/CLAUDE.md` names effort.go; `render/CLAUDE.md` lists no per-module mainhead files | verified | none needed |

## Contradictions
None

## For the orchestrator
- [orchestrator] The delta marks `ingest` as promoted from Touches to Features; the plan header already lists it under Features, so nothing further.
- [orchestrator] Touches features (lifecycle, connection etc.) had no spec claim in the delta; no promotion needed.

## Checks
`make gen-kb && make check-kb`: `kb: all generated files fresh`, `kb: 598 records, 27 features, 0 problem(s)`, `kb: all checks pass`. Launch needed 8 words of extra trimming (unclaimed redundancies) to fit 800. Raw whole-body counts (including mermaid): launch 921, focus 659, card-location 467, past-sessions 636, actions 625, ingest 894.
