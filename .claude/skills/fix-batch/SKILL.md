---
name: fix-batch
description: "One batch of a /fix sweep, run unattended in a fresh `claude -p` process inside the batch's worktree: small-shape plan, red test → green, gates, the reviewers the diff needs, reconcile, Final Validation, the subject for landing, then its retro. Never asks; a question it cannot answer is written to batch-result.json."
argument-hint: "<sweep> <n>"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent
---

> Maintainer note: `/orchestrate` with the parallel tracks removed, driven from `scripts/sweep.py`
> (kb:adr/process-fix-sweep-fresh-process-per-batch). It runs with no developer present: every
> decision it needs was made at `/fix`'s one stop and sits in the research files. It lands nothing
> — the loop squash-merges a completed branch and ticks the entries.

Invoked with: **$ARGUMENTS** — `<sweep> <n>`. The plan name is `<sweep>-<n>`, the branch
`plan/<sweep>-<n>`, and this process already runs in that branch's worktree.
`S=.claude/skills/orchestrate/scripts/orch-state.py` throughout. Every rule in CLAUDE.md § Hard
rules, `docs/conventions.md` and `.claude/skills/orchestrate/worker-rules.md` binds.

## 0. Pre-flight and the result file

`git rev-parse --abbrev-ref HEAD` prints `plan/<sweep>-<n>`; `git rev-parse --git-common-dir` is
not `.git`; `plans/<sweep>/sweep.json` exists and names batch `<n>`. Read its entries' research
files (`plans/<sweep>/research/<id>.md`), `## Answers` included. If
`plans/<sweep>-<n>/orchestration-state.json` exists this is a resume: continue from its
`current_step` (`/orchestrate` § Resume Logic) and skip the steps below it has completed.

Every exit path ends by writing `plans/<sweep>-<n>/batch-result.json` and committing it
(`chore(<sweep>-<n>): batch result`):

```json
{"status": "completed" | "failed", "subject": "<type>(<scope>): <summary> (closes #N, closes #M)",
 "closes": [97, 105], "error": null | "<what stopped it, one paragraph>",
 "question": null | "<the decision the developer has to make, with the two options>"}
```

`failed` with a `question` is the right outcome for a decision the interview missed — never guess
it, never pick a side. `failed` with an `error` is for a blocked step after its budget. The
loop reports both; `scripts/sweep.py resume` re-runs the batch once the developer has answered
in the research file.

## 1. The small-shape plan

Write `plans/<sweep>-<n>/plan.md` from the research — a `/plan-work` plan with whole sections
dropped, never renamed (`plan-lint.sh`, `gates.sh` and the agents read these names):

```markdown
# Plan: <sweep>-<n>

**Status**: Approved
**Shape**: fix | perf | refactor | chore          ← the squash commit's type; the batch's widest route
**Work Type**: daemon | web | full-stack
**E2E Scope**: new-specs | none                   ← new-specs iff any Proof is an E2E spec
**Fixture plan**: none | <spec> daemon|startDaemon|fileDaemon (<reason>)
**Render fixtures**: none | <scenario>[, new: <scenario> (<what it holds>)]
**Features**: <every feature the research files name>
**Description**: <one line covering every entry>

## Symptom
<each entry's TODO block verbatim, with its issue link, under a `### <id> — <title>` heading>

## Findings
<each entry's research: reproduced output, cause (file:line), what did not hold, the developer's answers>

## Requirements
### Must Have
- **REQ-1**: <observable behaviour after the change> (<id>)      ← at least one per entry

## Affected Files
### Daemon (daemon-impl)   / ### Web (web-impl)
- `internal/<pkg>/<file>.go` — REQ-1: <what changes>
### Existing tests this breaks
- none | `<file>`: <why>

## Proof
<one per entry: the test that is red today and green after — file, name, the assertion, who
writes it (daemon-tests | web-tests | render-tests | e2e-specs)>

## Edge Cases
None.   | 1. <case> → D1 | W1 | R1 | E1 | untested: <why>

## Acceptance Criteria
### Automated Checks
```checks
D1 go test -count=1 -run 'TestX' ./internal/<pkg>/      ← every Proof command, each its own line
D2 make lint
```
### Reviewer-Verified
- <what only a reader can check, or "None">

## Doc Delta
No doc change.   | **<feature>** — becomes true: … / stops being true: …

## Out of scope
Nothing.   | - <follow-up the developer may file>
```

`.claude/skills/orchestrate/scripts/plan-lint.sh <sweep>-<n>` — fix every `FAIL`. Then:

```bash
git add plans/<sweep>-<n>/plan.md && git commit -m "docs(<sweep>-<n>): approved plan"
python3 $S <sweep>-<n> init --step <daemon-tests | web-tests | render-tests | e2e-specs>   # the first Proof's agent
git add plans/<sweep>-<n>/plan.md plans/<sweep>-<n>/orchestration-state.json && git commit -m "chore(<sweep>-<n>): init"
```

Do **not** tick `TODO.md` — the loop ticks on `main` when the batch lands, so parallel batches
never conflict on it.

## 2. The tests go red first

For each test agent `## Proof` names (one message when several), `subagent_type:
"daemon-tests"` | `"web-tests"` | `"render-tests"` | `"e2e-specs"`:

```
Execute the <daemon|web|render|e2e> test task for plan: <sweep>-<n> — red-first.
Project root: <this tree>
No implementation log exists and nothing is handed off: write only the tests ## Proof names for
your level, run them, paste their red output, commit test(<sweep>-<n>): …, and finish authored.
A test that passes today is blocked — name it.
```

`authored` with every red assertion pasted is the diagnosis holding. `blocked` on a test that
passes today means that entry's research was wrong: `failed` with an `error` quoting the green
run and the entry id, and the other entries of this batch continue only if their Proofs are
independent of it (delete the entry's REQ and Proof from the plan, say so in the result's error).

## 3. Green

Spawn `subagent_type: "daemon-impl"` and/or `"web-impl"` (both for full-stack, one message):

```
Execute the <daemon|web> implementation task for plan: <sweep>-<n>
Project root: <this tree>
Small track (plan header **Shape**: <shape>). The plan has no Protocol Contract, no UI
Specifications and no test-specs.md; its ## Requirements and ## Affected Files are the whole
brief. plans/<sweep>-<n>/<daemon|web>-tests.md (or test-specs.md) holds regression tests that
are red by design and that you may not edit — you are done when every one is green. Your commit
subject type is <shape>(<sweep>-<n>). <web-impl, no e2e Proof:> Write **E2E smoke**: no spec authored.
```

Run every Proof line from the checks block yourself and read the result. Green: read the impl
log's `## Decisions`; a `Measured:` line or a behaviour the REQs never named has no test yet —
spawn the Proof agent in its ordinary mode (`Execute the <side> test task for plan: <sweep>-<n>`,
reading the impl log's Handoff), expected `pass`
(kb:lesson/small-track-impl-extras-had-no-tester-pass). Red: re-spawn the same impl agent once
in FIX MODE (`Execute in FIX MODE for plan: <sweep>-<n>` … `This is fix attempt 2 of 2.` …
`Read the test output at plans/<sweep>-<n>/<side>-tests.md` … `Read the change log at
plans/<sweep>-<n>/<side>-implementation.md`), re-run; still red → `python3 $S <sweep>-<n> status
blocked --step <side>-impl` and `failed` with the red output as the error. For an E2E Proof
whose fix is a flake, spawn `e2e-specs` in VALIDATE MODE after green.

## 4. Doc upkeep, comments, gates

1. `.claude/skills/orchestrate/doc-upkeep.md` bullets 3–5: an ADR for every `deviation:` line in
   an impl log (`status: proposed`, `refs: [plan:<sweep>-<n>]` — accepted at step 7), a fact
   record for any measured Claude Code fact, every diagram `kb for <path>` names for a changed
   file still true or updated. `make gen-kb`.
2. The comment pass, exactly as `/orchestrate` Step 6 item 1: `go run ./tools/commentpass strip
   <sweep>-<n> --out $TMPDIR/comment-pass-<sweep>-<n>-c1`, `comment-judge` if candidates > 0,
   `apply`.
3. Gates, in the foreground (`timeout: 600000`; exit 75 is a busy lock — rerun, never poll; the
   loop sets `GATES_LOCK_WAIT` high enough to outwait another batch's sweep):
   ```bash
   GATES_LOG_DIR=$TMPDIR/gates-<sweep>-<n>-c1 .claude/skills/orchestrate/scripts/gates.sh <sweep>-<n>
   ```
   Scoped e2e per cycle, the whole suite once at step 7
   (kb:adr/process-e2e-gates-scoped-full-sweep-once-at-completion). Never `--baseline-only`. If
   the `features` gate widened `**Touches**`, commit `docs(<sweep>-<n>): touch <owner>` before
   any re-run. Note the summary's `<F> failed`.

## 5. Review — the set the diff needs

`python3 $S <sweep>-<n> start review`. From `git diff --stat main...HEAD`: `review-work` always;
`review-browser` when the branch changed `web/src` outside `*.test.ts`; `review-maintainability`
when `**Shape**` is `refactor` or the branch touches more than eight production files. Spawn
them in one message with `/orchestrate` Step 6 item 3's prompt (`This is review cycle 1.
GATES_LOG_DIR: … (<F> failed lines). Write your part file only; do not commit`). Then:

```bash
python3 $S <sweep>-<n> merge-review --gates-failed <F>
git add plans/<sweep>-<n>/review*.md && git commit -m "review(<sweep>-<n>): cycle 1"
python3 $S <sweep>-<n> reviewed "$(git rev-parse HEAD)"
```

`needs-changes`: fix waves as `/orchestrate` Step 6 — `archive review.md`, then `archive
review.<part>.md` per part, `retry review`; the tagged agent in FIX MODE with the issues quoted
verbatim and `(review cycle <c>)` as its commit suffix; gates again; a delta re-review; merge and
commit as `cycle <c>`. Budget: three cycles. An `[orchestrator:decision]` item goes to the
`decide` skill before the wave (two per batch); an `[orchestrator:user-decision]` item, or a
fourth cycle still not approved, is `failed` with that item as the `question` (or the open issues
as the `error`) — written verbatim, options included, so the developer answers once in the
research file and `resume` picks the batch up here. A `[orchestrator]`-tagged Minor is yours, in
a `docs(<sweep>-<n>)` commit.

## 6. Reconcile

When `## Doc Delta` is not "No doc change." or any log carries a `doc-delta:` line: seed
`plans/<sweep>-<n>/doc-delta.md` from the plan, fold the log lines in, `python3 $S <sweep>-<n>
start doc-reconcile`, spawn `doc-reconcile` with the plan name and root, require `reconciled`
(`contradiction` → `reopen review`, one more wave, counts as a cycle). Otherwise record the skip
in one line. Then `go tool kb ls --feature <f> --status proposed` for every Features/Touches name
shows no record with `refs: plan:<sweep>-<n>` — flip any to `accepted`, `date:` today.
`make gen-kb && make check-kb`.

## 7. Final Validation and the result

```bash
.claude/skills/orchestrate/scripts/gates.sh <sweep>-<n> --full-e2e   # --no-e2e when **E2E Scope**: none
```

A red spec outside the batch's scope is a regression the batch caused: one more fix wave as in
step 5, this run again, a delta re-review. Then:

1. `python3 $S <sweep>-<n> closes <N> …` — every issue an entry links that this batch fully
   resolves; with no numbers when it closes none.
2. `python3 $S <sweep>-<n> status completed` (refused unless `review.md` says approved and the
   run above was green on this tree); commit `chore(<sweep>-<n>): complete`.
3. Compose the subject exactly as `/land` § 3 does: `<Shape>(<scope>): <imperative summary>
   (closes #N, …)`, summary ≤ 72 characters before the tail, written as the release note it
   becomes, covering every entry. Write `batch-result.json` with `status: completed`, the
   subject and the `closes` list; commit it.

## 8. Retro

Run `/retro <sweep>-<n>` here, in this process: it is the session that ran the batch, and the
loop will squash the branch away. A question this batch had to write is always an incident —
its lesson names what `/fix` § 3 should have asked. Commit `docs(retro): …` on the branch.

End with one paragraph: the entries, the Proof tests (red then green), the gates summary, the
review verdict and cycles, the subject, and the retro's one-line finding.
