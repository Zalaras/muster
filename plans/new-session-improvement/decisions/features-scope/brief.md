# Decision brief: features-scope

**Question**: The branch's wave-1 gate fails `features-scope.sh` because files this plan edits are
co-owned by features outside the `**Features**` header. How should the run get that gate green?
**Source**: user question (orchestrator, pre-review, after daemon-impl's pre-review fix; the
developer said "Use the decider")
**Option A**: Widen `**Features**` to `launch, focus, tiles, surfaces, connection, actions, rail, rename`,
recorded as a plan amendment in the completion summary.
**Option B**: Change `features-scope.sh` so a changed file passes when *any* of its owning features
is in `**Features**` (a co-owned file counts as in scope), and add only `surfaces` to the header,
because `web/src/terminal/pane.ts` is owned by surfaces alone. The script change is tooling outside
this plan, done as a separate commit on `main`.

## Pinned reading list (both advocates read all of it before turn 1)
- `plans/new-session-improvement/decisions/features-scope/gate-features.log`, the failing gate
  output (quoted below)
- `.claude/skills/orchestrate/scripts/features-scope.sh`, the whole file and especially its "Why"
  header
- `.claude/agents/doc-reconcile.md` § "Step 1 — Derive the feature set, and stop if it widened".
  It enforces the same rule after review, so Option B must reckon with it too.
- `plans/frontmatter/doc-reconcile.cycle1.md`, the incident that motivated the gate (lines 13–45)
- `plans/new-session-improvement/plan.md`: the header (line 8 `**Features**`), § Affected Files,
  § Doc Delta
- `.claude/skills/orchestrate/SKILL.md`: § Pre-flight, § Step 7, the "Never debated" note in
  `.claude/skills/decide/SKILL.md`
- For each file in the log: `go run ./tools/kb for <path>`, and `git diff main...HEAD -- <path>`
  to see what this plan changed there
- `tools/kb`'s pack command, to see what `--features` pulls into a pack
- Memory/feedback in force: size thresholds warn, never refuse (kb:adr/process-size-linters-warn-never-fail)

## Measurements (orchestrator, 2026-09-23, `kb pack --plan new-session-improvement --features <h>`)
| Header | review pack | daemon-impl pack | orchestrator pack |
|---|---|---|---|
| launch, focus, tiles (current) | 17 841 words | 11 268 | 19 204 |
| + surfaces | 23 716 | 17 416 | 25 166 |
| + surfaces, connection, actions, rail, rename (Option A) | 34 778 | 28 024 | 35 774 |
Budget is 8 000 words and warns only. Every pack is already over it.

## The gate output, verbatim
```
internal/server/server.go → feature 'connection', not in **Features**: launch  focus  tiles
internal/server/sessions_test.go → feature 'actions', not in **Features**: launch  focus  tiles
internal/server/sessions_test.go → feature 'rail', not in **Features**: launch  focus  tiles
internal/server/sessions_test.go → feature 'rename', not in **Features**: launch  focus  tiles
internal/server/sessions.go → feature 'actions', not in **Features**: launch  focus  tiles
internal/server/sessions.go → feature 'rail', not in **Features**: launch  focus  tiles
internal/server/sessions.go → feature 'rename', not in **Features**: launch  focus  tiles
web/e2e/helpers/daemon.ts → feature 'connection', not in **Features**: launch  focus  tiles
web/src/api.test.ts → feature 'connection', not in **Features**: launch  focus  tiles
web/src/api.ts → feature 'connection', not in **Features**: launch  focus  tiles
web/src/main.ts → feature 'connection', not in **Features**: launch  focus  tiles
web/src/terminal/pane.ts → feature 'surfaces', not in **Features**: launch  focus  tiles
Widening **Features** is the developer's call — stop the pipeline and ask (kb pack keys on the header).
```

## Context the orchestrator already established
- What each change is:
  - `sessions.go`: the Launch handler's model check, a `checkModel` field and the
    `modelUnrecognized` error.
  - `sessions_test.go`: D7–D9.
  - `server.go`: one line wiring `checkModel`.
  - `api.ts`: the `permissionModeToCheck` fallback. `api.test.ts` holds its test rows.
  - `main.ts`: one-line `initLaunch(app, { tiles, surfaces })`.
  - `web/e2e/helpers/daemon.ts`: the stub-claude `--bare` branch.
  - `pane.ts`: a `focus()` doc comment, because launch is now a second caller of surfaces' focus
    contract.
- Every listed file (except `pane.ts`) is also matched by launch's own globs, or is the file
  launch's behaviour goes through.
- The plan was approved with these files in Affected Files. `features-scope.sh` landed in the
  commit just before this plan (7610bc6); this is its first run on a multi-owner plan.
- Review agents (review-work, review-browser, review-maintainability) and doc-reconcile have not
  run yet, so a header change now reaches every later pack.

## Rules
Up to 3 turns each, ≤400 words per turn, advocate-a opens. Argue from the pinned docs and
measurable consequences; cite file:line; steelman before rebutting; concede when convinced.
Append each turn to debate.md before sending it. The ending turn's author reports once to
`main`. Agent names: advocate-a (Option A), advocate-b (Option B).
