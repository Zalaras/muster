# Review scale — severities, tags and verdicts for the three reviewers

Read by `review-work`, `review-browser` and `review-maintainability` before they classify, and by
the orchestrator when it routes a merged `review.md`. Each reviewer's own file says which defects it
owns and gives examples at each severity; this file says what the severities and tags mean.
`orch-state.py merge-review` computes the merged verdict from the parts on exactly these rules.

## Severities

- **Critical** — must fix: a requirement not implemented or not observable, a failing test or gate
  line, a hard-rule violation (CLAUDE.md), a build failure, the protocol contract broken.
- **Major** — must fix within the pipeline when a pipeline agent owns it: missing test coverage, a
  contract or plan deviation that is not a hard rule, a false statement in a user-facing document or
  a code comment about behaviour this plan shipped. Tag it to the agent that owns the file so it
  rides a fix wave (kb:lesson/finding-severity-misrouted). A Major nobody in the pipeline can fix
  (doc upkeep, a plan defect) is tagged `[orchestrator]`.
- **Minor** — a real, small change you want made: naming, comment *style*, a cosmetic defect. Tag it
  with the owning agent. The orchestrator routes it in that agent's wave, and the cycle after a
  Minors-only wave is a delta re-review. A Minor costs a fix wave and a re-review, so keep the line
  to Note sharp.
- **Note** — an observation with no change requested. Tag it `[note]`, never with an agent tag — an
  agent tag is a request for work. List notes under their own `### Notes` heading.

## Tags

- `[daemon-impl]` / `[web-impl]` / `[daemon-tests]` / `[web-tests]` / `[e2e-specs]` — that agent
  fixes it in its wave.
- `[note]` — nobody; listed in the completion summary, never routed.
- `[orchestrator]` — work no pipeline agent may do: `TODO.md` ticks (ticks only — follow-up worth
  keeping is *proposed* in `plans/<plan>/proposed-backlog.md`, and filing it is the developer's call:
  kb:adr/process-backlog-entries-are-the-users-to-file), an ADR for a `deviation:` line, an
  unamended `doc-delta:` line, a plan defect (a missing ```checks block, contradictory criteria).
  Doc upkeep is never `[daemon-impl]` — that agent may not write `docs/`.
- `[orchestrator:decision]` — a product or design choice rather than a defect (placement, a colour's
  semantics, whether a behaviour is in scope). Give the two options as two labelled lines with their
  measured trade-offs; the orchestrator runs the `/decide` debate on exactly that pair. Never assign
  a decision to an impl agent (kb:lesson/decision-made-inside-a-fix-wave).
- `[orchestrator:user-decision]` — a decision on the `decide` skill's never-debated list
  (`.claude/skills/decide/SKILL.md` § When this runs). The orchestrator takes it straight to the
  developer.

## Verdicts

- **approved** — no Critical, and no issue of any severity tagged to a pipeline agent. `[orchestrator]`
  items, decision items and `[note]`s may stand and must be listed: they never block approval, though
  decision items block completion until settled.
- **needs-changes** — any Critical, any agent-tagged Major **or Minor**, a red gate line, or a
  missing must-have requirement.
- **blocked** — review-browser only: its rig cannot start on this tree.

The merged verdict is computed, never edited: `blocked` if any part is blocked or unusable, else
`needs-changes` if a gate failed, a part said so or any part carries an agent-tagged issue, else
`approved`. Issue
numbering restarts in each part file, so cross-reference by part ("browser Major 1").
