# Review scale — severities, tags and verdicts for the three reviewers

Read by `review-work`, `review-browser` and `review-maintainability` before they classify, and by
the orchestrator when it routes a merged `review.md`. Each reviewer's own file says which defects it
owns and gives examples at each severity; this file says what the severities and tags mean.
`orch-state.py merge-review` computes the merged verdict from the parts on exactly these rules.
Every issue states the measured defect and what a fix must make true; finding the fix is the
implementing agent's — never write, build or run one.

## Severities

- **Critical** — must fix: a requirement not implemented or not observable, a failing test or gate
  line, a hard-rule violation (CLAUDE.md), a build failure, the protocol contract broken.
- **Major** — must fix within the pipeline when a pipeline agent owns it: missing test coverage, a
  contract or plan deviation that is not a hard rule, a false statement in a user-facing document.
  Tag it to the agent that owns the file so it rides a fix wave. A Major nobody in the pipeline can fix
  (doc upkeep, a plan defect) is tagged `[orchestrator]`.
- **Minor** — a real, small change you want made: naming, a cosmetic defect. Tag it with the owning agent. The
  orchestrator routes it in that agent's wave and verifies the fix against the diff itself; a
  Minor never blocks approval and never causes a re-review
  (kb:adr/process-minors-verified-not-re-reviewed). It still costs a wave, so keep the line to Note sharp.
- **Note** — an observation with no change requested. Tag it `[note]`, never with an agent tag — an
  agent tag is a request for work. List notes under their own `### Notes` heading. Code comments are
  not reviewed: no issue or note asks for, judges or cites one — the comment pass owns them
  (kb:adr/process-review-never-reviews-comments).

## Identity and confidence — every issue carries both

Directly under an issue's first line, indented three spaces, one line:

```
   id: <file>:<symbol-or-anchor>:<two-to-four-word-claim> | confidence: <0–100>
```

The **id** is the finding's fingerprint: the file it lives in, the symbol (function, type, CSS
selector, spec title) it is about, and the claim in a few words — `internal/server/restart.go:restartNow:second batch runner`.
A later cycle names prior findings by id, so spell the same defect the same way. **Confidence** is
how sure you are the defect is real *as stated*, not how serious it is: 90+ you reproduced or
measured it and pasted the evidence; 70–89 you read the code path end to end; 40–69 you infer it
from a pattern or a name; below 40 a hunch. `merge-review` enforces the thresholds: a Major
under 80 or a Minor under 60 is moved, text intact, to `## Below threshold` and reaches the
developer as a backlog proposal; it never routes to a wave. A Critical has no threshold — a
Critical you are unsure of is a Major with your real confidence. A `[note]` needs no line.

**Struck findings.** After the parts are written the orchestrator spawns `review-critic`, which
sees only the diff and your findings and may strike one the diff directly contradicts, quoting the
hunk. `merge-review` drops struck ids before computing the verdict and lists them under
`## Struck by critic`. Nothing is added by that step; a judgement call is never struck.

**Contesting a finding.** A fix-wave agent may answer a finding with `counter:` (the finding is
wrong as stated) or `refute:` (it is right but the fix would do harm) only by naming the concrete
harm or pasting the measurement that contradicts it; otherwise it fixes. The orchestrator carries
contested ids and their evidence into the next cycle's prompt; the reviewer rules on them by id.

## Tags

- `[daemon-impl]` / `[web-impl]` / `[daemon-tests]` / `[web-tests]` / `[render-tests]` / `[e2e-specs]` — that agent
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

- **approved** — no Critical, and no Major tagged to a pipeline agent. Minors, `[orchestrator]`
  items, decision items and `[note]`s may stand and must be listed: they never block approval, though
  decision items block completion until settled and Minors until the orchestrator's Minor check passes.
- **needs-changes** — any Critical, any agent-tagged Major, a red gate line, or a
  missing must-have requirement.
- **blocked** — review-browser only: its rig cannot start on this tree.

The merged verdict is computed, never edited: `blocked` if any part is blocked or unusable, else
`needs-changes` if a gate failed, a part said so or any part carries an agent-tagged Critical or
Major that survives the critic's strikes and the confidence thresholds, else `approved`. Issue
numbering restarts in each part file, so cross-reference by part ("browser Major 1").
