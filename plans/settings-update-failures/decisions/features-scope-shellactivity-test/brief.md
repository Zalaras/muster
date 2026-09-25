# Decision brief: features-scope-shellactivity-test

**Question**: With one test line in a `surfaces`-owned file changed by a constructor refactor, does the plan widen its **Features** header to include `surfaces`, or revert the refactor so the file stays untouched?
**Source**: cycle 2 wave-2 gate (`features-scope.sh`) red; the developer asked for the decide debate. (Widening scope is normally on this skill's never-debated list; the developer chose the debate explicitly, so it runs.)
**Option A**: widen the plan's **Features** header to `update, connection, surfaces` (one plan.md line; remaining agents' packs gain the surfaces records; the Doc Delta names no surfaces change).
**Option B**: keep surfaces out by reverting the constructor change so shellactivity_test.go is untouched — the logger then arrives by the post-construction patch maintainability flagged, or a test-only zero-arg constructor in production code — which reopens maintainability Minor 1 and costs a review cycle (cycle 3 of 3 is the last).

## Pinned reading list (both advocates read all of it before turn 1)
- `plans/settings-update-failures/decisions/features-scope-shellactivity-test/features-scope.log` — the gate's output
- `.claude/skills/orchestrate/scripts/features-scope.sh` header (lines 1–20) — why the gate exists (frontmatter retro)
- `.claude/skills/orchestrate/scripts/plan-lint.sh` rule 12 (~line 131) — the pre-flight twin, and its `web/src/style.css` exemption as precedent for shared files
- `plans/settings-update-failures/plan.md` — header (`**Features**`), Affected Files, Doc Delta, Out of scope
- `plans/settings-update-failures/review.md` — cycle 2, maintainability Minor 1 (quoted below)
- `plans/settings-update-failures/review.maintainability.cycle1.md` — cycle 1 Minor 1 (the drain warning that motivated a hub logger)
- `plans/settings-update-failures/daemon-implementation.md` — `## Fix Attempt 2` and `## Fix Attempt 3` (the hub logger's history)
- `internal/server/ws.go` (`newWSHub`, `drainOutboxes`), `internal/server/server.go` (`New`), `internal/server/shellactivity_test.go:439`
- `docs/conventions.md` § Composition roots and § Design
- `go run ./tools/kb for internal/server/shellactivity_test.go` — what owns the file
- `docs/features/surfaces/spec.md` (skim) — what a `surfaces` pack would add
- `kb:lesson/tiles-never-refit-behind-pattern-match`, `kb:adr/process-size-linters-warn-never-fail`, `.claude/skills/orchestrate/SKILL.md` § Fix Wave Ordering ("Plan amendments mid-run") and § Review Cycle Exhaustion

## The issue, verbatim

Gate output (cycle 2 wave-2, everything else green — make test, lint, test-race, web tests, check-kb):
```
internal/server/shellactivity_test.go → feature 'surfaces', not in **Features**: update  connection
Widening **Features** is the developer's call — stop the pipeline and ask (kb pack keys on the header).
```

Cycle 2 maintainability Minor 1, verbatim:

1. **[daemon-impl]** `wsHub` gets its logger by a patch after construction, not through its constructor: `internal/server/server.go:154-157` sets `s.hub.log = cfg.Logger` after `hub: newWSHub()`.
   - **Sibling shape:** every other logger-bearing type in the package takes the logger as a constructor parameter. `rg -n "func new[A-Z][a-zA-Z]*\(" internal/server -g '!*_test.go' | rg -i "log"` lists 20 of them.
   - **Why it stands out:** it is the only post-construction field patch in the composition root, whose rule is "build dependencies and register each feature in one line" (`docs/conventions.md` § Composition roots, first bullet).
   - **Why the stated reason doesn't hold:** the Decisions reason ("`newWSHub()`'s signature could stay untouched for `shellactivity_test.go`'s existing bare call") keeps one test call site compiling. The same wave changed `drainOutboxes`' signature and accepted breaking `wshub_drain_test.go:154,175` to do it.
   - **Cost of the zero-value default:** a hub built by `newWSHub()` drops the "ws outbox drain did not finish" warning without a trace.
   - **A fix must make true:** `wsHub` receives its logger at construction; `New` holds no post-construction field patch; the one bare call at `shellactivity_test.go:439` is updated with it (the `[daemon-tests]` half).

State of the fix now on the branch: daemon-impl changed `newWSHub()` → `newWSHub(log zerolog.Logger)` (c973ed3); daemon-tests changed `shellactivity_test.go:439` to `newWSHub(zerolog.Nop())` (fb2ae45). That one line is the only reason `surfaces` appears in the branch diff; no surfaces behaviour changed. Remaining run: cycle 2 wave 3 (e2e-specs), then the cycle-3 review — the last of 3 cycles.

## Rules
Up to 3 turns each, ≤400 words per turn, advocate-a opens. Argue from the pinned docs and
measurable consequences; cite file:line; steelman before rebutting; concede when convinced.
Append each turn to debate.md before sending it. The ending turn's author reports once to
`main`. Agent names: advocate-a (Option A), advocate-b (Option B).
