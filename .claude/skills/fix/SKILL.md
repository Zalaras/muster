---
name: fix
description: "The small track, as a sweep: takes any number of Bugs and Tweaks from TODO.md, researches them all, asks every question once, then runs them in batches as fresh `claude -p` processes that land on local main. One push at the end, through /land --sweep."
argument-hint: "[<sweep-name>] --bugs | --tweaks | --all | #N … | \"<entry title>\" … [--max N] [--parallel N] [--batch-size N]"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent, AskUserQuestion
---

> Maintainer note: a skill in the main session — it researches, stops **once** for the developer,
> and starts a loop of fresh processes. The batches run `/fix-batch`, which is `/orchestrate` with
> the parallel tracks removed; this file never implements anything
> (kb:adr/process-fix-sweep-soft-batch-cap).

Invoked with: **$ARGUMENTS**. The first token is the sweep name when it is kebab-case and not a
selector; otherwise the name is `sweep-<YYYY-MM-DD>` (a second sweep the same day gets `-b`).
Selectors, any mix: `--bugs` (every open entry under `## Bugs`), `--tweaks`, `--all` (both),
`#N` (the entry whose link is issue N), a quoted entry title. `--max N` caps the entries taken, in
TODO order. `--parallel N` is how many batches run at once (default 1). `--batch-size N` raises or lowers the
per-batch entry cap (default 4). No selector → ask for one.

**Routing.** Only `## Bugs` and `## Tweaks` are sweepable. An entry whose research shows a
protocol change, a new feature spec or a new UI surface is not small-track work: it is raised at
the stop (step 3) and dropped from the sweep unless the developer says otherwise — never parked
mid-run. Nothing in a sweep changes the daemon↔UI protocol.

Every rule in CLAUDE.md § Hard rules, `docs/conventions.md` and
`.claude/skills/orchestrate/worker-rules.md` binds here and in every batch.

## 0. Pre-flight

The primary checkout, on `main`, `git status --porcelain` empty apart from untracked strays nothing
references (leave them; never `git add -A`, never stash). `plans/<sweep>/` does not exist. No other
sweep is running (`ls plans/*/sweep-state.json`, any batch `running` with a live pid). This
session stays in the primary: the batches get their own trees.

## 1. Select

Read `TODO.md`. Resolve the selectors to open entries in their TODO order, each with its section,
title, issue number if linked, and its block verbatim. Give each an id `e1`, `e2`, …. Print the
list and the count; `--max` trims it here.

## 2. Research, all at once

One `general-purpose` agent per entry, all spawned in one message, each told: the entry block
verbatim; the hard rules; **no edits, no commits** — research only; write
`plans/<sweep>/research/<id>.md`; and to return exactly these headings:

- **Reproduced** — the command and its pasted output (a unit test run, a `curl` against a scratch
  daemon via the `dev-loop` skill, an E2E spec, a `tmux capture-pane`; a real `claude` only with
  `--model claude-haiku-4-5-20251001`, a trivial prompt, killed after).
- **Holds** — the claim held as written; held with a different cause or scope; did not hold.
- **Cause** — `file:line`, in one paragraph.
- **Files** — every file the fix touches, and `go tool kb for <path>` for each (its features,
  ADRs, facts, diagrams).
- **Work type** — `daemon` | `web` | `full-stack`.
- **Proof** — the test that is red today and green after: level
  (kb:adr/process-test-levels-journey-property-logic), file, name, the failing assertion, and
  which test agent writes it.
- **Route** — `fix` | `perf` | `refactor` | `chore`, or `not-small-track: <protocol | spec |
  ui-surface>`.
- **Questions** — what the developer must decide before this can be implemented unattended:
  an ambiguous expected behaviour, a choice between two fixes, an ADR the fix would reverse.
  "None" is the common answer.

Read each file as it lands. An agent that edited anything or returned no pasted output is
re-spawned once with the omission quoted.

## 3. The one stop

Tell the developer, per entry, in plain words without paths or pipeline terms: the problem in
two sentences, what research found if it differs, the fix in one sentence, and its questions. Then
list the entries routed `not-small-track`, with why. Ask everything in prose, in one message —
**not** an `AskUserQuestion` menu, and nothing is asked again after this. The developer answers
per entry: go, a changed wording, an answer to each question, or drop; and may set the batch
size here as well. Record each answer
verbatim in `plans/<sweep>/research/<id>.md` under `## Answers`; an entry with an unanswered
question is not in the sweep. This is the last message before the run; everything a batch could
need to ask is asked here, and a batch that still has to ask is a retro item
(kb:lesson/decision-made-inside-a-fix-wave).

## 4. Batch

From the research files:

1. Two entries that touch the same file are in the same batch, always.
2. Otherwise group by work type, then by a shared feature.
3. Fill batches in TODO order, at most the batch size each (`--batch-size`, or what the developer
   set at the stop; default 4, a soft cap; rule 1 may exceed it). A batch of one is fine.
4. Number them `1..k` in the order the first entry of each appears in TODO.

## 5. Write the sweep and start it

`plans/<sweep>/sweep.json`:

```json
{"sweep": "<name>", "created_at": "<iso>", "selector": "<the arguments>", "parallel": <N>,
 "entries": [{"id": "e1", "title": "<exact TODO title>", "issue": 97, "section": "Bugs",
              "work_type": "web", "features": ["rail"], "files": ["web/src/…"],
              "route": "fix", "research": "plans/<sweep>/research/e1.md", "batch": 1}],
 "batches": [{"n": 1, "entries": ["e1", "e3"], "work_type": "web"}]}
```

Commit `plans/<sweep>/` on `main`: `docs(<sweep>): sweep of <k> batches over <n> entries`
(every batch tree branches from `main` and reads this file). Then start the loop in the
background and let it run:

```bash
scripts/sweep.py start <sweep> --parallel <N>        # make sweep NAME=<sweep> PARALLEL=<N>
```

Per batch it runs `make worktree NAME=<sweep>-<n>`, then `claude -p "/fix-batch <sweep> <n>"`
in that tree (log: `plans/<sweep>/batch-<n>.log`), reads the batch's
`plans/<sweep>-<n>/batch-result.json`, squash-merges a completed branch onto local `main` with
the subject the batch composed, ticks its entries into `docs/history/todo-done.md`, and removes
the tree and branch. It never pushes. State: `plans/<sweep>/sweep-state.json`;
`scripts/sweep.py status <sweep>` prints it; `resume` re-runs anything failed.

## 6. Report

When the loop exits: the status table; for each batch its landed SHA and subject, or its error
or the question it wrote; the batches' retro commits (`git log --grep 'docs(retro)'`). A batch
that failed on a question is the interview's miss — say what should have been asked. Then:
`scripts/sweep.py resume <sweep>` once the failure is addressed, and `/land --sweep <sweep>` for
the one push and the proposals.
