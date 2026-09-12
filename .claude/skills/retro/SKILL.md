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

Before writing any proposal, run `go run ./tools/kb find <words>` and grep `.claude/skills/`, `.claude/agents/`, every `CLAUDE.md`
(`find . -name CLAUDE.md -not -path '*/node_modules/*'`) and `docs/conventions.md` for the rule or lesson
that governs the incident, and read the whole section it sits in. Root `CLAUDE.md` is loaded into
every session and every subagent, so a line there is the most expensive line in the repo — it
must earn it. Then exactly one of:

| Finding | Proposal |
|---|---|
| A rule exists and was followed; the cost was the pipeline working | No finding. Say so in one line if it looks like one. |
| A rule exists and was **broken** | **Never add a sentence.** First count its edits: `git log --oneline -S'<a distinctive phrase of the rule>' -- <file>`. One commit → sharpen it in place, no more words than before. Two or more → rewording has already failed twice; the only proposals allowed are mechanical — a `plan-lint.sh` / `gates.sh` / `dead-refs.py` / `orch-state.py` check, a verdict field the orchestrator must read — or dropping the sentence. |
| No rule exists | A **lesson record**, not a sentence: `docs/lessons/<slug>.md` with `roles:` (the agents that pay next time), `refs: [plan:<name>, <evidence file>]`, and one sentence of lesson — `kb pack` delivers it to those roles. An agent file changes only for a **rule** (a must/never a gate or the reviewer enforces), in the file the actor reads: agent → its `agents/*.md`; orchestrator → `orchestrate/SKILL.md`; plan shape → `plan-work`; a fact any session in one directory needs → that directory's `CLAUDE.md`, hand-written part. |
| One-off, environmental, or user preference | No proposal. List it under *Not proposing*. |

**Every proposal states its net word delta** for the file it edits (`wc -w` before → after).
A lesson record has no delta to state; it counts toward the pack-size table in § 5 instead.
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
line why a script cannot carry the lesson instead.

## 3. Report — short, then stop

At most three findings, most expensive first. No preamble, no per-step narrative.

```
## Retro: <plan>  (inferred | from files only, in-session stumbles unavailable)
<total wall-clock>, <N> review cycle(s), <M> fix wave(s), <K> validate attempt(s).

1. **<what went wrong>** — <evidence: file, cycle, minutes>.
   Proposal: <amend | mechanise | add | remove | retire | lesson> `<file, or docs/lessons/<slug>.md roles [r]>` § <section> — <the sentence, check or lesson, verbatim>. (<file>: <w> → <w> words)

Not proposing: <one line each, or "nothing">.
```

If nothing qualifies: `## Retro: <plan>` and one line saying the run had no incident worth a
rule. That is a legitimate result, not a failure to look hard enough.

Then stop. The user picks by number in prose; do not offer menus.

## 4. Apply what the user picks

- Edit only `.claude/skills/**`, `.claude/agents/**`, any `CLAUDE.md` (root or subdirectory,
  creating one where step 2 placed it), `docs/conventions.md`, and `docs/lessons/*.md`. After a
  record: `make gen-kb && make check-kb`; the regenerated files ride the same commit. Never `plans/`, never product
  or test code — a code defect the retro finds goes to `TODO.md` as a follow-up line, not into
  this commit.
- Commit on **`main`**, as `docs(retro): <plan> — <what changed, one line>`. If HEAD is
  `plan/<plan>` (completion left the tree clean), `git checkout main` first and say so. Stage
  only the files you edited — never `git add -A`, never stash. Never push.
- Report the commit sha and the measured delta: `wc -w` and `wc -l` of each edited file before
  and after, and whether any file is over its threshold.

## 5. `--audit` — the pipeline docs themselves

Run when Damian asks. Read-only: it writes only the report, every line a numbered proposal
Damian picks from (step 4 applies the picks).

```bash
for f in CLAUDE.md .claude/agents/*.md .claude/skills/*/SKILL.md; do
  printf '%6d %6d %4d  %s\n' "$(wc -l <"$f")" "$(wc -w <"$f")" "$(awk 'length>400' "$f" | wc -l)" "$f"; done   # lines words long-lines
python3 .claude/skills/orchestrate/scripts/dead-refs.py --all
make check-kb
P=$(ls -t plans/*/orchestration-state.json | head -1 | xargs dirname | xargs basename)
for r in planner daemon-impl web-impl daemon-tests web-tests e2e-specs review orchestrator; do
  printf '%6d %s\n' "$(go run ./tools/kb pack --plan "$P" --role $r | wc -w)" "$r"; done   # pack sizes
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
   clause) as *move to a lesson record* proposals (roles = the agent whose file holds it).
5. **Review-cycle trend** — cycles per run in date order; if the last three runs each needed
   two or more, name the cycle-one Major class they share.
6. **Pack size** — the table above; a pack over 5,000 words warns exactly like an agent file (it
   is read on top of one) and names the record class that grew (`kb ls --role <r>`, by `date`); a
   lesson no plan has cited in the last five runs is a *retire* proposal.

The previous audit is `plans/_audit/skills-agents-audit.md` (2026-09-06); write the new one
beside it as `plans/_audit/audit-<date>.md` only if Damian asks for a file.

## Never

- Never write a finding from memory alone — every one cites a file, a cycle, or a timing row.
- Never propose a rule for a cost that an existing, followed rule already paid for by design.
- Never add a sentence where a sentence already exists — sharpen it or mechanise it.
- Never apply an edit the user did not pick, retirements included.
