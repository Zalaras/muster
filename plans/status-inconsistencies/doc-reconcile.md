# Doc Reconcile: status-inconsistencies

**Verdict**: reconciled
**Pack**: kb: pack 40464 words (budget 20000)
**Features derived**: lifecycle, ingest, rail, connection, actions, surfaces, focus, tiles (plan header: lifecycle, ingest, rail, connection, actions, surfaces, focus, tiles)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| lifecycle | Turn-activity events include `PostToolBatch` | `internal/claudecode/interpret.go:114` | added |
| lifecycle | Permission wait remembers its agent; other agent's activity ignored; main Stop keeps a subagent's wait | `internal/session/machine.go:applyInput, applyTurnClosed`; `session.go:waitOwnedByOther` | added |
| lifecycle | `idle_prompt` with no prompt id changes nothing | `machine.go:KindNeedsInputIdle` | added |
| lifecycle | Interrupt read from the transcript each poll tick while a turn is open; closes into idle; diagram edges from active and needs_input | `internal/session/interrupt.go:sweepInterrupts`, `liveness.go:112`, `machine.go:applyTurnInterrupted`, `session.go:inOpenTurn` | added (inputs sentence, diagram, machine prose) |
| lifecycle | `backgroundTasks` counts running background work the latest Stop reported; never a state input | `claudecode/interpret.go:interpretStop`, `machine.go:applyTurnClosed` | added |
| lifecycle | Clear-rebind keeps closed prompt ids | `machine.go:applyBind` (comment and code) | added |
| lifecycle | "No arm guards on the source state" / "derived only from hook events..." | machine.go arms above | deleted/reworded |
| ingest | Twelve events registered, `PostToolBatch` among them | `internal/claudecode/settings.go:allHookEvents` | added |
| ingest | every "eleven events" count | tree-wide grep: only `release` commitlint types remain, unrelated | none in spec |
| rail | Live card offers no action button; `1 background task` / `<n> background tasks` is the last line | `web/src/sessions/card.ts:backgroundLine, buildCardViewModel (actions)`, `web/index.html:325` | added |
| rail | "a live card offers End" | same | deleted |
| actions | End/Resume/Remove in mainhead, tile footers and ended rail/strip card rows; live card none | `web/src/render/tiles.ts:274`, `card.ts:371`, `render/mainhead.ts` | reworded |
| protocol.md | Session `backgroundTasks`, tracked variables, transitions rows (merged at approval) | `machine.go`, `apply.go` | verified; two sentences corrected |

## Contradictions
None in the delta. Two sentences already merged into `docs/protocol.md` were wrong and are corrected: `backgroundTasks` is "set by every Stop" (code sets it only when the Stop carries a `background_tasks` list, `interpretStop` returns nil otherwise), and "a Stop whose count is unchanged adds no upsert of its own" (`apply.go:Apply` persists and broadcasts once per event; no such suppression exists).

## For the orchestrator
- [orchestrator] `kb:adr/rail-live-card-offers-no-actions` is still `proposed` and the rail and actions specs cite it; flip to accepted at Completion. It supersedes `actions-placement-mainhead-and-card-rows`, which the actions spec still also cites.
- [orchestrator] The lifecycle spec only fit its 800-word budget by compressing prose (no true fact removed except wording); it is at the budget edge.

## Checks
`make gen-kb && make check-kb`: kb: 476 records, 24 features, 0 problem(s); kb: all checks pass.
Spec word counts (file incl. frontmatter): lifecycle, ingest, rail, actions as printed by wc; bodies pass the 800 budget.
