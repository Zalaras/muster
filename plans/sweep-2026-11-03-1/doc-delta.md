# Doc delta: sweep-2026-11-03-1

Seeded from `plan.md` § Doc Delta, then amended with the `doc-delta:` lines in
`daemon-implementation.md` and review cycle 1's `[orchestrator]` items. The `internal/store/CLAUDE.md`
gotcha was fixed by the orchestrator in `docs(sweep-2026-11-03-1): widen the doc delta …`; the
`docs/protocol.md` `kb:anchor/ws.session-removed` line ("Startup sweeps send nothing") is the
protocol item below. Cite kb:adr/lifecycle-ended-rows-kept-until-remove wherever the old sweep ADRs
are cited for the removed rule.

**lifecycle** — becomes true: a daemon start deletes no row; an ended row, however it ended
(a pane that died while musterd was down, End, `-on-exit kill`), stays a resumable card until
Remove (kb:adr/lifecycle-ended-rows-kept-until-remove). Stops being true: "ended rows are deleted"
and "kept for one resume" in `docs/features/lifecycle/spec.md` § Liveness, reconcile, shutdown.

**protocol** (`docs/protocol.md`) — stops being true: `:1267` "or by the start-up sweep of an
already-ended row" (the note is deleted with its row by Remove only); `:1512-1514` "Startup sweeps
… send nothing — swept rows are simply absent from the first snapshot" and "until removed or
swept" (now "until removed"); `:1893-1898` "swept on the *following* startup" and the whole
absent/`alive=0` → deleted bullet (now: kept as it is, `endedAt` unchanged); `:1916` "so the next
startup sweeps it" (now: so the next startup shows it ended and resumable). The cited ADR becomes
kb:adr/lifecycle-ended-rows-kept-until-remove.

**actions** (`docs/features/actions/spec.md:55-57`) — stops being true: "Dead sessions ended in an
earlier daemon lifetime are swept at the next start … so a Resume chance is one daemon lifetime
long". Becomes true: a dead session stays resumable until it is removed
(kb:adr/lifecycle-ended-rows-kept-until-remove).

**notes** (`docs/features/notes/spec.md:28-29`) — stops being true: "until Remove or the next daemon
start" and "the start-up sweep of an already-ended row deletes its note with the row". Becomes
true: an ended session keeps its note until Remove; a restart keeps every row and its note.

**Code comment** (`cmd/musterd/onexit.go:29-31`) — stops being true: a racing tick would "race a
restart's Reconcile into sweeping a row it should have kept". Now the row is kept either way; the
race only changes its `endedAt`.

**Package guide** (`internal/store/CLAUDE.md` Gotchas) — stops being true: "Ended rows are swept on
the next start". Fixed by the orchestrator in a docs commit.
