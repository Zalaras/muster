# Doc delta — new-session-improvement

Seeded from plan.md § Doc Delta, then amended by the orchestrator from the implementation logs.


**launch** (`docs/features/launch/spec.md`) — becomes true:
- § The form: "Model and Start in default to the directory's last-used values; with none, Start
  in is auto. A value picked before those values arrive is kept."
- § The form: "Every Start-in mode, manual included, is sent as an explicit `--permission-mode`
  flag, because with none Claude Code starts in its own configured default
  (kb:fact/permission-mode-no-flag-follows-configured-default)."
- § What launch does, as its new first sentence: "Before anything is written, the launch checks
  the model against the installed Claude Code's model catalog with a zero-token `--bare` run
  (kb:fact/model-catalog-precheck-zero-token). An unrecognised model is refused with
  `model_unrecognized`; a check that cannot run lets the launch proceed
  (kb:adr/launch-refuses-model-outside-binary-catalog)."
- § What launch does: "A launch opens the launched session: Focus focuses it, and both views
  put keyboard focus in its terminal (kb:adr/launch-opens-launched-session)."
- § One launch, end to end: the inline sequence diagram carries the pre-check step and refusal
  `alt` from this plan's Diagrams section.
- Frontmatter `refs` gain the three new facts and the three new ADRs, and lose
  `kb:adr/launch-model-presets-passed-verbatim` and
  `kb:adr/launch-permission-modes-offered-four-tabbed` (superseded).

**launch** — stops being true:
- "(kb:adr/launch-model-presets-passed-verbatim, kb:fact/fable-model-alias)" becomes
  "(kb:fact/fable-model-alias)". The sentence still says the value is passed verbatim, which
  stays true.
- "(kb:adr/launch-permission-modes-offered-four-tabbed, kb:fact/permission-mode-flag-on-wire)"
  cites the superseding ADR instead.
- § One launch, end to end, the lead's second clause: "and the card is broadcast from the
  inserted row, before any hook has arrived". It duplicates § What launch does, and deleting it
  offsets the added words. The spec is at 718 of 800 words; net growth must stay ≤ 80.

**focus** (`docs/features/focus/spec.md`) — becomes true:
- "A launch focuses the launched session and puts keyboard focus in its terminal
  (kb:adr/launch-opens-launched-session)."

**focus** — stops being true: nothing.

**tiles** (`docs/features/tiles/spec.md`) — becomes true:
- The sentence "A session launched from Tiles is promoted into the grid, demoting the
  lowest-priority tile when full" gains ", and keyboard focus moves to its terminal", plus the
  citation kb:adr/launch-opens-launched-session.

**tiles** — stops being true: nothing.

**protocol** (`docs/protocol.md` § sessions.create): the Protocol Contract delta above, merged
at approval.


**Orchestrator amendments (from the run):**
- The new files this plan ships are `owned by no feature` in `make check-kb` and need globs in a
  feature spec's frontmatter: `internal/claudecode/modelcheck.go`,
  `internal/claudecode/modelcheck_test.go`, `web/src/features/launch-restore.ts`,
  `web/src/features/launch-restore.test.ts`, `web/e2e/launch-defaults.spec.ts`,
  `web/e2e/launch-model-check.spec.ts`, `web/e2e/launch-opens-session.spec.ts`. All belong under
  **launch** (`go:` gains `internal/claudecode/modelcheck*.go`; `web:` gains
  `web/src/features/launch-restore*.ts`; `e2e:` gains the three specs). `make check-kb` must be
  green before the run completes.
- Implementation logs: daemon-implementation.md and web-implementation.md report no
  `doc-delta:` beyond the plan's own.
- **Diagram insertion point (review cycle 1, code orchestrator Minor 1):** the Doc Delta's
  "inserted before `UpsertRepo`" is wrong against the code. `sessions.go` runs the check before
  the gitutil probes, so in the launch spec's "One launch, end to end" fence the `S->>A`
  CheckModel step and its refusal `alt` go right after `UI->>S: POST /api/sessions` (and the
  validate step), **before** `S->>G`, not directly before `UpsertRepo`.
- **Moved module (review cycle 1, maintainability Major 3):** `web/src/features/launch-restore.ts`
  is now `web/src/render/launchrestore.ts` (and its test moves beside it in wave 2). The launch
  `web:` glob to add is therefore `web/src/render/launchrestore*.ts`, not
  `web/src/features/launch-restore*.ts`. `openFallback` no longer exists, and `repoRestore`/`DEFAULT_MODEL`
  are the one owner of a repo's restore values.
- **Focus (review cycle 1, maintainability Major 2):** focus.ts's "bring a session forward in
  the current view" is now `FocusHandle.bringForward`. The number chords and a launch both call it.
- **Globs already landed (user decision, decisions/check-kb-before-approval):** the launch spec's
  frontmatter `go:`/`web:`/`e2e:` globs for this plan's new files were added by the orchestrator
  before the approving cycle (commit ac20108). `make check-kb` is green. Verify them and leave them;
  the prose claims above are still yours to promote.
- **Rail scroll (decisions/launched-card-scroll, kb:adr/rail-launch-leaves-rail-scroll-untouched):**
  if the focus spec's new sentence mentions the rail marker, it must not imply the launched card
  is scrolled into view. The rail's scroll is untouched on launch.
- **Frontmatter refs (launch):** also gain `kb:adr/launch-open-outcome-decided-in-controller`, and
  **rail**/**focus** refs may cite `kb:adr/rail-launch-leaves-rail-scroll-untouched` where the
  sentence lands.
