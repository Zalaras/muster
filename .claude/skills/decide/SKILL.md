---
name: decide
description: "Settles a product/design decision by an honest two-agent Opus debate (advocates talk directly, a fresh judge breaks a tie). Used by /orchestrate for [orchestrator:decision] review issues; also usable standalone for a question with exactly two options."
argument-hint: "<plan-name> <slug> | standalone question"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent, SendMessage
---

You run a decision debate. Two `debater` agents argue assigned sides of a two-option decision
**directly to each other** over `SendMessage`; you only hear the result. If they do not reach
consensus, a fresh `judge` agent rules on the transcript. You record the outcome and land it
in the documents that own it. You do not argue and you do not decide — you brief, run, record.

> This lives in a skill (main-context) because it spawns agents; a subagent cannot spawn.

## When this runs

- From `/orchestrate`: for every `review.md` issue tagged `[orchestrator:decision]`, before
  the fix wave that will implement the outcome. Max **2 debates per pipeline run**; a third
  decision item stops the pipeline and asks the user.
- Standalone (`/decide`): when the user poses a question with exactly two options. Ask for the
  second option if only one was given; do not invent it.

**Never debated — stop and ask the user instead:** protocol-contract changes
(`docs/protocol.md` / a plan's Protocol Contract), anything that widens or narrows plan scope,
anything contradicting a decision already recorded in `SPEC.md` or an accepted or rejected ADR,
anything that spends money (real `claude` runs), and anything the review marked as a hard-rule
question. A debate settles *taste and trade-off*, not authority.

## Step 1 — Brief

Create `plans/<plan>/decisions/<slug>/` (standalone: `plans/decisions/<slug>/`) and write
`brief.md`:

```markdown
# Decision brief: <slug>

**Question**: <one sentence>
**Source**: <review.md issue N, cycle M | user question>
**Option A**: <verbatim from the source>
**Option B**: <verbatim from the source>

## Pinned reading list (both advocates read all of it before turn 1)
- plans/<plan>/review.md — issue N (quoted below)
- plans/<plan>/plan.md — REQ-…, Testable UI Elements rows …
- plans/<plan>/mockups/… (if a rendered reference exists)
- docs/design/design-system.md §…
- docs/design/ux-flows.md §…
- SPEC.md §…, kb:adr/… (relevant accepted and rejected ADRs)
- <existing measurements: the reviewer's numbers, screenshots, E2E results>

## The issue, verbatim
<paste>

## Rules
Up to 3 turns each, ≤400 words per turn, advocate-a opens. Argue from the pinned docs and
measurable consequences; cite file:line; steelman before rebutting; concede when convinced.
Append each turn to debate.md before sending it. The ending turn's author reports once to
`main`. Agent names: advocate-a (Option A), advocate-b (Option B).
```

**Sides are assigned, not chosen:** Option A as listed in the source → `advocate-a`;
Option B → `advocate-b`. No hashing, no preference. Create an empty `debate.md` with a
`# Debate: <slug>` heading.

## Step 2 — Spawn both advocates in one message

Two `Agent` calls, `subagent_type: "debater"`, in the same message:

```
name: advocate-a          (and advocate-b)
prompt:
  Debate for plan <plan>, decision <slug>.
  brief: plans/<plan>/decisions/<slug>/brief.md
  transcript: plans/<plan>/decisions/<slug>/debate.md
  side: A                  (B)
  opponent: advocate-b     (advocate-a)
  Read the brief and its whole reading list, then <open with turn 1 | wait for turn 1>.
```

Then **wait**. Do not poll, do not message either agent, do not read `debate.md` while it is
live. The advocates' idle/progress notifications will also reach `main` after each turn, and
their wrap-ups may re-narrate the result — ignore all of it; act only on the one explicit
report: `consensus: …` or `no consensus — …` (order-sidebar's debate produced six messages).
If both agents' completion notifications arrive with no message to `main`, read `debate.md`
and treat its last turn as the ending turn.

## Step 3 — Judge (only on `no consensus`)

Spawn `subagent_type: "judge"`, `name: judge-<slug>`:

```
brief: plans/<plan>/decisions/<slug>/brief.md
transcript: plans/<plan>/decisions/<slug>/debate.md
ruling: plans/<plan>/decisions/<slug>/ruling.md
```

Wait for it. Its final text carries the `**Decision**` line; `ruling.md` carries the reasoning.

## Step 4 — Record

Write `decision.md`:

```markdown
# Decision: <slug>

**Outcome**: <A | B | hybrid> — <the option's text>
**Reached by**: consensus (advocate-x conceded in turn n) | judged (see ruling.md)
**Decisive argument**: <one paragraph, quoting the turn>
**Dissent to honour**: <from the concession or ruling.md; "None" allowed>
**Landed in**: <files edited below>
```

Then land it where it belongs — you are the only party allowed to edit these:

- the plan: an *Amended* note inline on the affected REQ / UI row citing `decisions/<slug>`;
- `docs/history/spec-changelog.md`: one entry naming both options and the outcome;
- `docs/design/design-system.md` or `ux-flows.md` when the decision is a design rule;
- `TODO.md` when the dissent names follow-up work.

Return the outcome to the caller (the orchestrator quotes it in the next fix-wave prompt).

## Step 5 — Report

The orchestrator's completion summary gets a **Decisions** section, one block per debate:
the two options, the outcome, consensus-or-judged, the decisive argument in one or two
sentences, and any dissent. The user can overrule with one line; the orchestrator then
reopens the affected wave with the user's choice.

## Guards

- A debater that edits anything other than `debate.md`, messages `main` mid-debate, or spawns
  agents has broken protocol: stop the debate, record it in `decision.md` as `aborted`, and
  ask the user.
- If `debate.md` and the messages disagree, the file is the record.
- Cost: ~one Opus review cycle per debate. Do not run more than two per pipeline run.
