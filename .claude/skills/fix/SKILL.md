---
name: fix
description: "The small track: a bug fix, perf change, small refactor or chore that changes the shipped artifact without a protocol delta. Researches with evidence, stops for the developer, writes a small-shape plan, red test → green, gates, review, then hands to /land."
argument-hint: "<name> \"<description>\" | <name> #<issue>"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent, AskUserQuestion
---

> Maintainer note: a skill in the main session — it stops for the developer after research and
> spawns agents in the foreground. It is `/orchestrate` with the parallel tracks removed, not a
> second pipeline (kb:adr/process-small-track-for-fixes).

Invoked with: **$ARGUMENTS** — `<name>` kebab-case, then a quoted description, an issue number, or
a `TODO.md` entry title. With no arguments, ask for them.

**Routing.** Work needs `/orchestrate` when it changes the daemon↔UI protocol, adds a feature spec,
or adds a UI surface that needs a Testable UI Elements table. Anything else that changes the shipped
artifact is yours; the developer may route either way. Nothing here changes the daemon↔UI protocol —
if research shows it must, stop and say so: that is a `/plan-work` plan.

`S=.claude/skills/orchestrate/scripts/orch-state.py` throughout. Every rule in CLAUDE.md § Hard
rules, `docs/conventions.md` and `.claude/skills/orchestrate/worker-rules.md` binds here too.

## 0. Pre-flight

The primary checkout, on `main`, `git status --porcelain` empty apart from untracked strays nothing
references (leave them; never `git add -A`, never stash), and `git rev-parse --verify plan/<name>`
fails. A live main session that needs the primary makes this a worktree run: after step 2,
`make worktree NAME=<name>` from here and start the `/fix` session in `../muster-<name>` — the rest
is identical.

## 1. Research, then stop

The entry can be wrong — a TODO line or an issue describes a symptom from memory, and the plan is
built on what you measured, not on what it says. Before any change:

- Read the entry in full: the `TODO.md` block, the issue (`gh issue view <N>`), the description.
- `go run ./tools/kb for <path>` on every file you suspect — its features, ADRs, facts and diagrams
  are the context; read the spec and the code they name.
- Reproduce. A unit test run, a `curl` against a scratch daemon (`dev-loop` skill), an E2E spec,
  a `tmux capture-pane` — and paste the output. A real `claude` launch costs the developer's
  subscription: `--model claude-haiku-4-5-20251001`, trivial prompt, killed when done.
- Say which of these holds: the claim held as written; it held with a different cause or scope;
  it did not hold. Quote the evidence for each.

Present that in prose and **stop**. The developer confirms the diagnosis, corrects it, or drops the
work; nothing below runs before their word (memory: explain first, the developer says when to go).

## 2. The small-shape plan

Write `plans/<name>/plan.md`. It is a `/plan-work` plan with whole sections dropped, never renamed
— the agents, `plan-lint.sh`, `gates.sh` and `/land` read these names:

```markdown
# Plan: <name>

**Status**: Approved
**Shape**: fix | perf | refactor | chore          ← the squash commit's type (docs/conventions.md § Commits)
**Work Type**: daemon | web | full-stack
**E2E Scope**: new-specs | none                   ← new-specs iff the Proof is an E2E spec
**Fixture plan**: none | <spec> daemon|startDaemon|fileDaemon (<reason>)
**Features**: <every feature `kb for` named for the files below>
**Description**: <one line>

## Symptom
<the entry verbatim, with its issue link; what the developer sees>

## Findings
<step 1's evidence: what was reproduced, what the cause is, where (file:line), what did not hold>

## Requirements
### Must Have
- **REQ-1**: <observable behaviour after the change>      (a refactor: "behaviour unchanged: …")

## Affected Files
### Daemon (daemon-impl)   / ### Web (web-impl)
- `internal/<pkg>/<file>.go` — REQ-1: <what changes>
### Existing tests this breaks
- none | `<file>`: <why>

## Proof
<the test that is red today and green after: its file, name, the assertion that fails, and who
writes it — daemon-tests | web-tests | e2e-specs>

## Edge Cases
None.   | 1. <case> → D1 | W1 | E1 | untested: <why>

## Acceptance Criteria
### Automated Checks
```checks
D1 go test -count=1 -run 'TestX' ./internal/<pkg>/      ← the Proof command, always its own line
D2 make lint
```
### Reviewer-Verified
- <what only a reader can check, or "None">

## Doc Delta
No doc change.   | **<feature>** — becomes true: … / stops being true: …

## Out of scope
Nothing.   | - <follow-up the developer may file>
```

Omitted on purpose: Overview, Protocol Contract, Schema Changes, Diagrams, UI Specifications,
Implementation Notes. Then `.claude/skills/orchestrate/scripts/plan-lint.sh <name>` — fix every
`FAIL` here (the ownership check reads `## Affected Files` by name; an `! rg` string in a checks line
may not also appear in `## Symptom` prose). Show the plan; the developer approves it.

## 3. Branch and state

```bash
git checkout -b plan/<name>
git add plans/<name>/plan.md           # plus TODO.md / docs edits research made — by name
git commit -m "docs(<name>): approved plan and planning-session edits"
python3 $S <name> init --step daemon-tests     # or web-tests / e2e-specs — whichever ## Proof names
```

Tick the entry now, per `.claude/skills/orchestrate/doc-upkeep.md` bullet 1 (tick, `✅ done` line,
move the block to `docs/history/todo-done.md`), and commit it `docs(<name>): tick <entry>` — the
reviewer's DOC row checks it.

## 4. The test goes red first

Spawn the agent `## Proof` names (`subagent_type: "daemon-tests"` | `"web-tests"` | `"e2e-specs"`):

```
Execute the <daemon|web|e2e> test task for plan: <name> — red-first.
Project root: <root>
No implementation log exists and nothing is handed off: write only the test ## Proof names, run
it, paste its red output, commit test(<name>): …, and finish authored. If it passes today, blocked.
```

`authored` with the red assertion pasted is the diagnosis holding. `blocked` means the test passes
on the current tree: the plan is wrong — stop and report. The agent files define the mode.

## 5. Green

Spawn `subagent_type: "daemon-impl"` or `"web-impl"` (both for full-stack, one message):

```
Execute the <daemon|web> implementation task for plan: <name>
Project root: <root>
Small track (plan header **Shape**: <shape>). The plan has no Protocol Contract, no UI
Specifications and no test-specs.md; its ## Requirements and ## Affected Files are the whole
brief. plans/<name>/<daemon|web>-tests.md (or test-specs.md) holds a regression test that is red
by design and that you may not edit — you are done when it is green. Your commit subject type is
<shape>(<name>). <web-impl, Proof ≠ e2e-specs:> Write **E2E smoke**: no spec authored.
```

Then run the Proof line from the checks block yourself and read the result — no agent needed to
re-run one test. Red: re-spawn the same agent once in FIX MODE
(`Execute in FIX MODE for plan: <name>` … `This is fix attempt 2 of 2.` … `Read the test output at
plans/<name>/<side>-tests.md` … `Read the change log at plans/<name>/<side>-implementation.md`),
re-run, and if still red `python3 $S <name> status blocked --step <side>-impl` and report. Spawn the
test agent again only when the test itself must change, or a second regression is worth pinning.
For an E2E Proof whose fix is a flake, spawn `e2e-specs` in VALIDATE MODE after green.

## 6. Doc upkeep, comments, gates

1. `doc-upkeep.md` bullets 3–5: an ADR for every `deviation:` line in the impl log (write it
   `accepted` — the developer is here), a fact record for any measured Claude Code fact, every
   diagram `kb for <path>` names for a changed file still true or updated. `make gen-kb`.
2. The comment pass, exactly as `/orchestrate` Step 6 item 1: `go run ./tools/commentpass strip
   <name> --out $TMPDIR/comment-pass-<name>-c1`, `comment-judge` if candidates > 0, `apply`.
   Skipping this turns the `comment-ledger` gate red on the first added comment.
3. Gates, in the foreground (`timeout: 600000`; exit 75 is a busy lock — rerun, never poll):
   ```bash
   GATES_LOG_DIR=$TMPDIR/gates-<name>-c1 .claude/skills/orchestrate/scripts/gates.sh <name>   # --no-e2e when **E2E Scope**: none
   ```
   Never `--baseline-only`: it skips the checks block, where the Proof line lives. If the
   `features` gate widened `**Touches**`, commit `docs(<name>): touch <owner>` before any re-run —
   the ledger fingerprints a dirty tree as a new one. Note the summary's `<F> failed`.

## 7. Review

`python3 $S <name> start review`. Reviewer set: `review-work` always; `review-browser` when
`**Work Type**` is not `daemon` and the branch changed `web/src` outside `*.test.ts`;
`review-maintainability` when `**Shape**` is `refactor`. Spawn them in one message with
`/orchestrate` Step 6 item 3's prompt (`This is review cycle 1. GATES_LOG_DIR: … (<F> failed
lines). Write your part file only; do not commit`). Then:

```bash
python3 $S <name> merge-review --gates-failed <F>        # review.md, computed verdict; the code part alone is enough
git add plans/<name>/review*.md && git commit -m "review(<name>): cycle 1"
python3 $S <name> reviewed "$(git rev-parse HEAD)"
```

`needs-changes`: one fix wave — `python3 $S <name> retry review`, the impl agent in FIX MODE with
the issues quoted verbatim and `(review cycle 2)` as its commit suffix, a tester re-run only if a
test must change, gates again (ledger reuse is fine), a delta re-review per Step 6 item 3, merge
and commit as `cycle 2`. Still not approved: `status blocked --step review`, report the open
issues, and ask the developer. A `[orchestrator]`-tagged Minor is yours to fix in a `docs(<name>)`
commit, as in `/orchestrate`.

## 8. Reconcile and complete

1. When `## Doc Delta` is not "No doc change." or any log carries a `doc-delta:` line: seed
   `plans/<name>/doc-delta.md` from the plan, fold the log lines in, `python3 $S <name> start
   doc-reconcile`, spawn `doc-reconcile` with the plan name and root, require `reconciled`.
   Otherwise record the skip in one line.
2. `go run ./tools/kb ls --feature <f> --status proposed` for every Features/Touches name shows no
   record with `refs: plan:<name>` (flip any to `accepted`, `date:` today). `make gen-kb && make
   check-kb`.
3. `python3 $S <name> closes <N> …` — run it with no numbers when the plan closes nothing.
4. `python3 $S <name> status completed` (refused unless `review.md` says approved), commit the
   state file `chore(<name>): complete`, `git checkout main`.

Report: what the entry claimed against what research found; the Proof test (red output, then
green); what shipped, per file; the gates summary; the review verdict and cycles; doc-reconcile's
verdict or the skip; the issues `closes` recorded; anything proposed for the backlog
(`plans/<name>/proposed-backlog.md`, the developer files it). Then: run `/land <name>`.
