---
name: retro
description: "Reviews a finished /orchestrate run and proposes the smallest change to the pipeline docs that would have prevented what went wrong — or says nothing needs changing."
argument-hint: "<plan-name>"
allowed-tools: Read, Grep, Glob, Bash, Edit
---

> **Maintainer note:** Runs in the main session, at the end of the session that ran
> `/orchestrate`, because the orchestrator's own stumbles (a mis-stamped state, an improvised
> wave, a prompt it had to re-send) live only in that conversation — no file records them.
> Authored 2026-09-03. Retros were previously ad hoc, and every one of the 16 since m0 netted
> +10 to +50 lines into `.claude/`: `orchestrate/SKILL.md` went 393 → 545 lines in 12 days.
> This skill exists to keep the lesson and drop the growth.

Plan: **$ARGUMENTS**

## 1. Gather evidence — measured, not remembered

```bash
S=.claude/skills/orchestrate/scripts/orch-state.py
python3 $S <plan> timings && python3 $S <plan> show        # wall-clock, retries
ls plans/<plan>/                                            # review cycles (review.cycle<N>.md), decisions/
git log --format='%h %s' main..plan/<plan>                  # commit suffixes, who committed what
```

Read every `review*.md` (all cycles), each `## Fix Attempt` in the implementation logs, the
`## Repairs` and `## E2E Implementation Bugs` tables in `test-specs.md`, and any
`decisions/*/decision.md`. Then add what only you saw: every point in this session where you
deviated from `orchestrate/SKILL.md`, re-sent a prompt, or were corrected by the user.

An incident is a **cost with a cause**: a review cycle spent on something an earlier step
should have caught, a fix that came back, a gate that passed on a broken tree, a step that ran
twice, a rule you had to improvise. Wall-clock spent doing the work correctly is not an incident.

## 2. Classify each incident against the rule that already exists

Before writing any proposal, grep `.claude/skills/`, `.claude/agents/`, every `CLAUDE.md`
(`find . -name CLAUDE.md -not -path '*/node_modules/*'`) and `docs/conventions.md` for the rule
that governs the incident, and read the whole section it sits in. Root `CLAUDE.md` is loaded into
every session, so a line there is the most expensive line in the repo — it must earn it. Then exactly one of:

| Finding | Proposal |
|---|---|
| A rule exists and was followed; the cost was the pipeline working | No finding. Say so in one line if it looks like one. |
| A rule exists and was **broken** | **Never add a sentence.** First count its edits: `git log --oneline -S'<a distinctive phrase of the rule>' -- <file>`. One commit → sharpen it in place (same line count). Two or more → rewording has already failed twice; the only proposals allowed are mechanical — a `plan-lint.sh`/`gates.sh`/`orch-state.py` check, a verdict field the orchestrator must read — or dropping the sentence (the invariants paragraph in `plan-work` was reworded three times and leaked each time). |
| No rule exists | One sentence, in the file the actor actually reads (agent behaviour → its `agents/*.md`; orchestrator behaviour → `orchestrate/SKILL.md`; plan-shape defects → `plan-work`; a fact any session touching that code needs → `CLAUDE.md`, or a `<dir>/CLAUDE.md` when it only matters inside one directory — a rule scoped to `web/` costs daemon sessions nothing there, and creating one is fine). Anecdote is at most one clause: plan name and the measurement. Pair it with a cut in the same file — an anecdote whose rule has since been mechanised, or a paragraph that now says what a script enforces. |
| One-off, environmental, or user preference | No proposal. List it under *Not proposing*. |

Every proposal states its **net line delta**, and the retro as a whole aims for ≤ 0. If a lesson
genuinely needs more than a sentence, that is a proposal to write a script, not a paragraph.

## 3. Report — short, then stop

At most three findings, most expensive first. No preamble, no per-step narrative.

```
## Retro: <plan>
<total wall-clock>, <N> review cycle(s), <M> fix wave(s), <K> validate attempt(s).

1. **<what went wrong>** — <evidence: file, cycle, minutes>.
   Proposal: <amend | mechanise | add+cut | remove> `<file>` § <section> — <the sentence or check, verbatim>. (net ±N lines)

Not proposing: <one line each, or "nothing">.
```

If nothing qualifies: `## Retro: <plan>` and one line saying the run had no incident worth a
rule. That is a legitimate result, not a failure to look hard enough.

Then stop. The user picks by number in prose; do not offer menus.

## 4. Apply what the user picks

- Edit only `.claude/skills/**`, `.claude/agents/**`, any `CLAUDE.md` (root or subdirectory,
  creating one where step 2 placed it), `docs/conventions.md`. Never `plans/`, never product
  or test code — a code defect the retro finds goes to
  `TODO.md` as a follow-up line, not into this commit.
- Commit on **`main`**, as `docs(retro): <plan> — <what changed, one line>`. If HEAD is
  `plan/<plan>` (completion left the tree clean), `git checkout main` first and say so. The plan
  branch is the review artifact and carries only the plan's own work; `docs` cuts no release.
  Stage only the files you edited — never `git add -A`, never stash. Never push.
- Report the commit sha and the measured delta: `wc -l` of each edited file before and after.

## Never

- Never write a finding from memory alone — every one cites a file, a cycle, or a timing row.
- Never propose a rule for a cost that an existing, followed rule already paid for by design.
- Never add a sentence where a sentence already exists — sharpen it or mechanise it.
- Never apply an edit the user did not pick.
