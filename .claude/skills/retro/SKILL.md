---
name: retro
description: "Reviews a finished /orchestrate run and proposes the smallest change to the pipeline docs that would have prevented what went wrong — or says nothing needs changing. --audit reviews the pipeline docs themselves: size, retirement candidates, dead references, review-cycle trend."
argument-hint: "[plan-name] | --audit"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

> **Maintainer note:** Runs in the main session, normally at the end of the session that ran
> `/orchestrate` — the orchestrator's own stumbles (a mis-stamped state, an improvised wave, a
> re-sent prompt) live only in that conversation. It also works later, from the files alone;
> say so in the header when it does. Authored 2026-09-03 because ad-hoc retros netted +10 to
> +50 lines each into `.claude/` (`orchestrate/SKILL.md` went 393 → 545 lines in 12 days);
> re-cut 2026-09-11 when the line budget turned out to be satisfied by longer lines.

Argument: **$ARGUMENTS**

- No argument → the plan is inferred: `plan/<name>` if HEAD is on one, else the
  `plans/*/orchestration-state.json` with the latest `updated_at` whose `status` is
  `completed`. Name it in the report header.
- `<plan-name>` → that run.
- `--audit` → § 5, nothing else.

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
twice, a rule you had to improvise, **a review finding that a comment or doc statement was
false or pointed at something deleted** (doc drift — check whether `dead-refs` could have
caught it, or the comment self-check in the agent's Verify section should have). Wall-clock
spent doing the work correctly is not an incident.

## 2. Classify each incident against the rule that already exists

Before writing any proposal, grep `.claude/skills/`, `.claude/agents/`, every `CLAUDE.md`
(`find . -name CLAUDE.md -not -path '*/node_modules/*'`) and `docs/conventions.md` for the rule
that governs the incident, and read the whole section it sits in. Root `CLAUDE.md` is loaded into
every session and every subagent, so a line there is the most expensive line in the repo — it
must earn it. Then exactly one of:

| Finding | Proposal |
|---|---|
| A rule exists and was followed; the cost was the pipeline working | No finding. Say so in one line if it looks like one. |
| A rule exists and was **broken** | **Never add a sentence.** First count its edits: `git log --oneline -S'<a distinctive phrase of the rule>' -- <file>`. One commit → sharpen it in place, no more words than before. Two or more → rewording has already failed twice; the only proposals allowed are mechanical — a `plan-lint.sh` / `gates.sh` / `dead-refs.py` / `orch-state.py` check, a verdict field the orchestrator must read — or dropping the sentence. |
| No rule exists | One sentence, in the file the actor actually reads (agent behaviour → its `agents/*.md`; orchestrator behaviour → `orchestrate/SKILL.md`; plan-shape defects → `plan-work`; a fact any session touching that code needs → `CLAUDE.md`, or a `<dir>/CLAUDE.md` when it only matters inside one directory). Anecdote is at most one clause: plan name and the measurement. |
| One-off, environmental, or user preference | No proposal. List it under *Not proposing*. |

**Every proposal states its net word delta** for the file it edits (`wc -w` before → after).
Words, not lines — lines were gamed by length. **Whenever a proposal touches a file, also
read that file for sentences whose class a script now enforces** (`plan-lint.sh`, `gates.sh`,
`dead-refs.py`, `e2e-lint.sh`, `orch-state.py`, `.githooks/*`) and list each as a *retire*
proposal naming the covering check. Retirement is always a proposal; Damian vets.

### Size thresholds — warnings, never refusals

| File | Warn above | Basis |
|---|---|---|
| `CLAUDE.md` | 150 lines | loaded into every session and subagent; the docs say "keep it short" and prune what Claude already does |
| `.claude/skills/*/SKILL.md` | 500 lines **or** 5,000 words | Claude Code docs: keep SKILL.md under 500 lines, move reference material to supporting files |
| `.claude/agents/*.md` | 500 lines **or** 5,000 words | same as skills; supporting files live in the agent's wrapper skill dir (`.claude/skills/<agent>/`) and are read on demand |

When a proposal would leave a file over its threshold, say so in the proposal and state in one
line why a script cannot carry the lesson instead. That is all the threshold does.

## 3. Report — short, then stop

At most three findings, most expensive first. No preamble, no per-step narrative.

```
## Retro: <plan>  (inferred | from files only, in-session stumbles unavailable)
<total wall-clock>, <N> review cycle(s), <M> fix wave(s), <K> validate attempt(s).

1. **<what went wrong>** — <evidence: file, cycle, minutes>.
   Proposal: <amend | mechanise | add | remove | retire> `<file>` § <section> — <the sentence or check, verbatim>. (<file>: <w> → <w> words)

Not proposing: <one line each, or "nothing">.
```

If nothing qualifies: `## Retro: <plan>` and one line saying the run had no incident worth a
rule. That is a legitimate result, not a failure to look hard enough.

Then stop. The user picks by number in prose; do not offer menus.

## 4. Apply what the user picks

- Edit only `.claude/skills/**`, `.claude/agents/**`, any `CLAUDE.md` (root or subdirectory,
  creating one where step 2 placed it), `docs/conventions.md`. Never `plans/`, never product
  or test code — a code defect the retro finds goes to `TODO.md` as a follow-up line, not into
  this commit.
- Commit on **`main`**, as `docs(retro): <plan> — <what changed, one line>`. If HEAD is
  `plan/<plan>` (completion left the tree clean), `git checkout main` first and say so. Stage
  only the files you edited — never `git add -A`, never stash. Never push.
- Report the commit sha and the measured delta: `wc -w` and `wc -l` of each edited file before
  and after, and whether any file is over its threshold.

## 5. `--audit` — the pipeline docs themselves

Run when Damian asks, not on a schedule. Read-only: it writes nothing but the report, and
every line of it is a numbered proposal Damian picks from (step 4 then applies the picks).

```bash
for f in CLAUDE.md .claude/agents/*.md .claude/skills/*/SKILL.md; do
  printf '%6d %6d %4d  %s\n' "$(wc -l <"$f")" "$(wc -w <"$f")" "$(awk 'length>400' "$f" | wc -l)" "$f"; done   # lines words long-lines
python3 .claude/skills/orchestrate/scripts/dead-refs.py --all
grep -ohE '\b[a-z0-9-]+\b' .claude/agents/*.md .claude/skills/*/SKILL.md | grep -xF -f <(ls plans) | wc -l   # anecdotes
for p in plans/*/; do [ -f "$p/orchestration-state.json" ] && echo "$(ls "$p" | grep -c '^review') $(basename "$p")"; done | sort -n   # review cycles per run
```

Report, in this order, each item numbered:
1. **Size** — every file over a threshold, with its numbers and the section that grew most
   since the last audit (`git log -p` on the file).
2. **Retirement candidates** — sentences whose class a script now enforces (method as in § 2),
   each with file, line, the sentence, and the covering check.
3. **Dead references** — the `dead-refs.py --all` output, or "clean".
4. **Anecdote load** — the count, and the ten longest anecdotes (plan name plus more than a
   clause) as *shrink* proposals.
5. **Review-cycle trend** — cycles per run in date order; if the last three runs each needed
   two or more, name the cycle-one Major class they share.

The previous audit is `plans/_audit/skills-agents-audit.md` (2026-09-06); write the new one
beside it as `plans/_audit/audit-<date>.md` only if Damian asks for a file.

## Never

- Never write a finding from memory alone — every one cites a file, a cycle, or a timing row.
- Never propose a rule for a cost that an existing, followed rule already paid for by design.
- Never add a sentence where a sentence already exists — sharpen it or mechanise it.
- Never apply an edit the user did not pick, retirements included.
