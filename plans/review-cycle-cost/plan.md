# Plan: review-cycle-cost

**Status**: completed
**Shape**: chore
**Work Type**: tools
**Features**: none
**Description**: A Minor costs a fix wave and an orchestrator diff check, never a review cycle; every review cycle after the first is a delta by the parts that raised a Critical or Major.

## Symptom

The developer, 2026-11-04: "no matter how many times I retro and audit I keep running into
sessions that take way too long for what they do", with the day's two runs as examples
(popped-out-note-enhance 5.8 h with 1.0 h to a green validate and 4.8 h in three review cycles;
restart-latest-claude 6.4 h and counting).

## Findings

Measured from `orchestration-state.json` across every run and the `review.cycle*.md` files of
session-notes, see-added-dirs, stale-dirs-models-branches, docs-search-bar and the two runs above:

- Review cycles per feature run since October: 2–4, median 3, flat; pipeline docs 31k → 65k words
  (2026-09-01 → 2026-11-04), lessons 59 → 72. The retro loop adds a rule per cause; the cycle
  count did not move.
- A cycle costs ~1–1.5 h: fix wave with gates (wave gates 1.5–12 min, cycle gate 14–22 min) plus
  three Opus reviewers (20–60 min).
- Later cycles carried mostly Minors, `[orchestrator]` bookkeeping, partial fixes and new findings
  on code unchanged since cycle 1. see-added-dirs cycle 3 and docs-search-bar cycle 4 existed to
  approve one Minor each.
- `review-scale.md` made any agent-tagged Minor `needs-changes`; the "cheap delta re-review" applied
  only after a Minors-only cycle and re-ran browser and maintainability whenever `web/src` changed.

## Change

- `orch-state.py`: `has_blocking_issue` counts Critical and Major only; the merged verdict ignores Minors.
- `review-scale.md`: a Minor rides its wave, is checked by the orchestrator, never blocks or re-reviews.
- `orchestrate/SKILL.md`: cycle 2+ is always a delta — `review-work` always, the other two only
  when their previous part carried a Critical or Major; the Minor wave and check
  (`plans/<plan>/minor-check.md`) after approval; completion step 3 reads it.
- `review-work.md`, `review-browser.md`, `review-maintainability.md`: delta rules verify the part's
  own prior Critical/Major items against the diff; outside-the-delta findings are notes.
- `fix-batch/SKILL.md`: the same Minor path for a sweep batch.
- ADR `process-minors-verified-not-re-reviewed`.

## Out of scope

Rejected by the developer: a two-cycle cap. Noted in `TODO.md` § Tooling and docs for a later
discussion: plan size, the kb pack budget. Not now: `/retro --audit`.

## Automated Checks

- `python3 .claude/skills/orchestrate/scripts/orch-state.py --help` parses; a fixture part file with
  only a tagged Minor merges to `approved`, one with a tagged Major to `needs-changes`.
- `make check-kb`.
