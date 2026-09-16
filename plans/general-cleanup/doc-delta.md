# Doc Delta — general-cleanup (amended by the orchestrator for /doc-reconcile)

Seeded from the plan's `## Doc Delta`, then amended with what the run actually changed.
Where this file and `plan.md` disagree, this file is newer and wins.


**ingest** — becomes true:
- `docs/features/ingest/spec.md` § The envelope says the envelope routes only when its `tmuxPane` equals the session's recorded pane, that an absent or different pane is persisted unrouted, and that a session whose pane is not yet recorded routes on `musterSession` alone (`kb:adr/ingest-envelope-pane-must-corroborate`).
- `docs/protocol.md` `kb:anchor/ingest.envelope` carries the Protocol Contract sentence above.

**ingest** — stops being true:
- The unqualified "a stale or unknown value is persisted unrouted, never guessed from `cwd`" (spec ~line 102) — replaced by the qualified sentence, not appended to.

**lifecycle** — becomes true:
- § Liveness, reconcile, shutdown: "`kill` also kills every shell and the prompt counts them; `leave` leaves shells as it leaves sessions" (cites the new ADR).

**lifecycle** — stops being true:
- The clause "unknown Muster-shaped tmux sessions are logged and never adopted, and every shell tmux session is killed" is compressed to "unknown `muster-` names are logged, never adopted; shells are killed" (the ADR citations carry the detail). *Amended 2026-09-16:* the body is 647 words, not at the 800-word cap, so this compression is a readability choice, not a budget necessity — see R4.

**surfaces** — becomes true:
- "dies on exit, Remove, reconcile or a kill shutdown" (spec line 58), citing the superseding ADR.

**surfaces** — stops being true:
- "dies on exit, Remove or reconcile" and its citation of `kb:adr/surfaces-shell-lifetime-until-exit-remove-or-reconcile` (now superseded).

**actions**, **launch**, **surfaces** (shell spawn) — becomes true:
- One sentence each: a 5xx `message` is a fixed phrase; the raw tmux/OS error is in the daemon log only.

**actions**, **launch**, **surfaces** — stops being true:
- Nothing (no spec sentence claims raw errors today).

**connection** — becomes true:
- The pop-out reads `connecting…` until its first `hello` and follows theme broadcasts, sharing `kb:adr/connection-banner-only-after-first-hello`'s rule.

**reader** — becomes true:
- § The reader: "the pop-out's status line shows `connecting…` until its first `hello`, the unreachable text after a lost connection, and its theme follows the dashboard's live" (replaces the existing "shows daemon-down in the reader's own status line" phrasing if present — one sentence, not two).

**theme** — becomes true:
- The pop-out applies `prefs` and `claudeTheme` broadcasts like the dashboard.

**triage** — becomes true:
- The version check accepts `git describe` dev-build strings (`v`, `-N-gHASH`, `-dirty`).

**triage**, **connection**, **theme**, **reader** — stops being true:
- Nothing.

**protocol.md** — see Protocol Contract (two prose sentences).


## Amendments from the run (orchestrator, 2026-09-16)

These override the corresponding lines above.

**lifecycle — the net ≤ 0 constraint is dropped.** The plan's Delta claimed the body was "at the
800-word cap". Measured twice (review cycle 1 Major 2, and again by the orchestrator): the body is
**647 words** excluding the mermaid fence, leaving 153 words of headroom. R4 was amended in
`plan.md` accordingly. Compress the clause if it reads better, but do not distort the delta to
hit a word budget that was never real. The cap `make check-kb` enforces is the real constraint.

**lifecycle — one more sentence becomes true.** Once shutdown has begun, the dying process stops
recording pane deaths: the periodic liveness poll and the PTY-EOF nudge no longer persist
`alive=false`, so the on-exit policy or the next boot's reconcile is the sole authority on a
session's final `alive` state (`kb:adr/lifecycle-liveness-writes-stop-at-shutdown`). `End`'s own
path is unaffected, so `-on-exit=kill` still marks ended. This was not in the plan — it is the fix
for a regression REQ-13 introduced and this run caught and closed.

**Already landed by the orchestrator — do not redo:**
- `kb:diagram/web-components`: module counts corrected (`render/` 21, `reader/` 9) and the
  `Rel(doc, features, …)` edge now names `theme` (review Major 1).
- `web/e2e/general-cleanup.spec.ts` is registered in the `e2e:` frontmatter of **connection,
  ingest, theme and reader** (review Major 3). The file is named for the plan rather than a
  feature seam, which `docs/conventions.md` § Composition roots would not have chosen; the plan's
  Affected Files specified that name, so it is a plan defect, not an agent's. Multi-feature
  registration is the cheap fix, not splitting the file.
- `docs/conventions.md` § Testing now names `tmux`'s `Client` alongside its preflighter as an
  injectable-run-func exemplar, since this run added that seam.

**Unchanged from the plan:** every ingest, surfaces, actions, launch, connection, reader, theme and
triage bullet above, and both `docs/protocol.md` sentences in § Protocol Contract. No
implementation log carried a `doc-delta:` line the plan's Delta omits; both logs' `deviation:`
lines read `deviation: none`.
