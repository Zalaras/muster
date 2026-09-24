# Decision brief: sessionend-alive-hint

**Question**: Should a non-clear `SessionEnd` hook keep setting a session's `alive=false` and `endedAt` directly, given that the accepted liveness ADR says `alive` comes from the pane check alone?
**Source**: `plans/maintainability-cleanup/review.maintainability.a-session.md` Notes, item 1 (session reviewer, 2026-09-23). The developer asked for it to be debated on 2026-09-24.
**Option A**: Supersede `kb:adr/lifecycle-liveness-from-pane-existence` and fix the package CLAUDE.md. The behaviour stays: a non-clear `SessionEnd` is an early death hint that sets `alive=false` and `endedAt` right away, and the pane check remains the authority.
**Option B**: Delete the `KindDeathHint` arm and the protocol row. `alive` comes from the pane check alone. `SessionEnd` keeps whatever else it does today, for example nudging a liveness check.

## Pinned reading list (both advocates read all of it before turn 1)
- `plans/maintainability-cleanup/review.maintainability.a-session.md`: Notes item 1 (quoted below)
- `docs/adr/lifecycle-liveness-from-pane-existence.md` (accepted), `docs/adr/lifecycle-alive-flag-not-a-state.md`
- `docs/facts/sessionend-reason-ambiguous.md`, and any other fact `go run ./tools/kb for internal/session/machine.go` lists about SessionEnd, kill -9 or StopFailure
- `internal/session/machine.go` around the `claudecode.KindDeathHint` arm (search for it), and `internal/claudecode/interpret.go`, where SessionEnd becomes KindDeathHint or KindClearDeathHint
- `internal/session/liveness.go`: `Nudge`, `checkLiveness`, `checkOneLiveness`, `markEnded`. Note whether a poll can ever set `alive` back to true.
- `internal/server/ingest.go`: whether SessionEnd triggers a `Nudge`
- `docs/protocol.md`: the SessionEnd rows near line 1304-1305, line 984 ("alive/endedAt: live from the liveness poll and the SessionEnd hint"), and the liveness section near line 1344
- `internal/session/CLAUDE.md` invariants
- `internal/session/machine_test.go`: the test asserting `alive := false` on SessionEnd (search `DeathHint`)
- the git history: `git log -S"KindDeathHint" --format='%h %ad %s' --date=short` (introduced in M1, 0767b9f)

## The issue, verbatim
> **[note]** For review-work or `[orchestrator:decision]` (likely Critical by the package CLAUDE.md's own rule): `machine.go:113–116` sets `Alive=false` from a `SessionEnd` payload. kb:adr/lifecycle-liveness-from-pane-existence says SessionEnd "never sets or clears alive" and "any code path that would set alive from a payload is a boundary violation". `internal/session/CLAUDE.md` repeats it. `docs/protocol.md:1305` and `machine_test.go:890` say the opposite (`alive := false`). Options: (A) supersede the ADR and fix the package CLAUDE.md, or (B) delete the arm and the protocol row.

## Constraints for both sides
- The CLAUDE.md hard rules bind: hook delivery is best-effort, at-most-once and unordered, and never derive state from terminal output.
- The measured Claude Code facts bind.
- Argue from user-visible consequences: how long a card shows alive after Claude exits, a wrong "ended" that never recovers, and reconcile after restart. Also argue from which document tells the truth.

## Rules
Up to 3 turns each, ≤400 words per turn. advocate-a-sessionend opens. Argue from the pinned docs and measurable consequences, cite file:line, steelman before rebutting, and concede when convinced. Append each turn to `debate.md` before sending it. The author of the ending turn reports once to `main`. Agent names are advocate-a-sessionend (Option A) and advocate-b-sessionend (Option B).
