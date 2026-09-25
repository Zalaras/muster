---
name: orchestrate
description: "Runs the full multi-agent implementation pipeline for an approved plan. Spawns subagents for E2E authoring, implementation, testing, and review."
argument-hint: "<plan-name>"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent, AskUserQuestion
---

Your job is to orchestrate the execution of a plan through the multi-agent development pipeline by spawning subagents (Agent tool) for each step. You control the flow, handle retries, and ensure each agent's output feeds correctly into the next.

> **Maintainer note:** This lives in a **skill**, not an agent definition, on purpose: the orchestrator must run in the main session, because only the main session can spawn subagents (a subagent cannot spawn others). Do not convert it into an agent.

## Arguments

This pipeline runs for the plan: **$ARGUMENTS**

If no plan name was provided, list available plans from the `plans/` directory and ask the user to pick one.

## Pre-flight Checks

`S=.claude/skills/orchestrate/scripts/orch-state.py` throughout — every state edit goes through it (State Tracking). Before starting:

1. Read `plans/<plan-name>/plan.md`
2. Verify the plan status is "approved" (not "draft") and run `.claude/skills/orchestrate/scripts/plan-lint.sh <plan-name>`. A draft, or any `FAIL` line, goes back to `/plan-work` — spawn nobody. Then `go run ./tools/kb pack --plan <plan-name> --role orchestrator` — the lessons earlier runs paid for; read them now, not after the stumble.
3. Check the **Work Type** field to determine which agents to run:
   - `daemon` → skip web agents; run the E2E steps only if the plan defines `E*` acceptance criteria (a daemon-only change can still be E2E-observable through the dashboard)
   - `web` → skip daemon agents
   - `full-stack` → run all agents; the daemon and web tracks run in parallel (Steps 2 and 3)
3a. Check the **E2E Scope** field:
   - `new-specs` → Step 1 authors tests; expected verdict `authored`
   - `harness-only` → the E2E deliverable is an edit to `web/e2e/helpers/*` or fixtures, no new
     spec. Step 1 still runs e2e-specs (expected verdict `harness-only`). **Step 5 is yours, not an
     agent's**: run `make e2e` yourself, read the plan's E criteria against the diff, record it in
     `completed_steps` — both harness-only runs lost a step to a validate agent with nothing to
     validate (kb:lesson/orchestrator-work-spawned-as-agent).
   - `none` → skip Steps 1 and 5
4. Determine the project root (the directory containing `.claude/`)
4a. **Branch.** The pipeline never commits on `main`. Read `git status --short` and act on the first matching row; never `git add -A`, never stash (kb:lesson/tree-not-clean-at-pipeline-start):

| Tree state | Action |
|---|---|
| `plan/<plan-name>` exists | `git checkout` it. Resume only if it has commits `main` lacks (`git log --oneline main..plan/<plan-name>`); zero unique commits means planning landed elsewhere — `git merge --ff-only main` before spawning anyone. |
| Only the plan's own directory or planning-session doc edits are dirty (`docs/*`, `SPEC.md`, `TODO.md`, `CLAUDE.md`, `README.md`, `spikes/*`, `.claude/skills/*`, `.claude/agents/*`) | `git checkout -b plan/<plan-name>`, `git add <those files>`, `git commit -m "docs(<plan-name>): approved plan and planning-session edits"`. |
| Any other **tracked** file is dirty | Stop and offer three dispositions: **(a)** the user commits it on `main`, the pipeline branches from a clean tree; **(b)** the pipeline commits it onto `plan/<plan-name>`; **(c)** it stays dirty and every agent is told to leave it alone — unsafe when the file is in the plan's Affected Files (its owner would fold the user's change into its own commit). |
| An **untracked** file outside the plan's directory that nothing references (a stray screenshot, a scratch note) | Does not block: leave it, tell every agent to leave it alone, never `git add` it, list it in the completion summary. |

   **Commits.** Every agent commits its own files at the end of its step (their definitions say
   how); an agent finishing with uncommitted files is a Handoff defect — have it commit before its
   gate is read. You commit **your** edits (state file, doc-upkeep, ADRs and the files `make gen-kb`
   regenerates) per `docs/conventions.md` §Commits as `docs(<plan-name>): <summary>` (`chore(...)`
   for the state file alone), never an agent's files for it. Never push.

## Pipeline Execution Order

The stage order, its parallel pairs and its retry loops are `kb:diagram/pipeline-execution-order`,
delivered by the pre-flight pack. The Agent Invocation table below is the same order in spawn terms;
Fix Wave Ordering is what happens when review sends work back.

## Agent Invocation

Spawn each step as a subagent using the Agent tool with the step's own `subagent_type`:

| Step | `subagent_type` |
|------|-----------------|
| E2E specs | `e2e-specs` |
| Daemon implementation | `daemon-impl` |
| Web implementation | `web-impl` |
| Daemon tests | `daemon-tests` |
| Web tests | `web-tests` |
| E2E validate & repair | `e2e-specs` (validate mode) |
| Review — correctness | `review-work` |
| Review — browser | `review-browser` (skipped for a daemon-only plan) |
| Review — maintainability | `review-maintainability` |
| Doc reconcile | `doc-reconcile` |

Each subagent already carries its full instructions (its agent definition is its system prompt), so the spawn prompt is the task, the mode, the plan name and the project root — **never pasted file contents** (the agent reads from disk) and never an explicit `model` (each definition pins its own: Sonnet workers, Opus reviewers).

### Verdicts and budgets

Every step ends with a `**Verdict**` in its output file. Read it from disk, then act by this table; budgets are counted with `python3 $S <plan> retry <step>`, never by editing the state file.

| Step | Verdict | Action | Budget |
|---|---|---|---|
| 1 e2e-specs | `authored` / `harness-only` | Check the Tests table (Step 1), then continue. | 1 send-back |
| 1 e2e-specs | `pass` | The agent misread its mode — the feature cannot exist yet. Re-spawn with the mode restated. | the same 1 |
| 3 daemon-tests / web-tests | `pass` | That track is done. | |
| 3 daemon-tests / web-tests | `implementation-bug` | Spawn that track's impl agent in fix mode (Step 4), then re-run the tester, per Fix Wave Ordering. | 3 per track |
| 5 e2e-validate | `pass` | Continue to Step 6. | |
| 5 e2e-validate | `implementation-bug` | Route each row of the **E2E Implementation Bugs** table to the agent in its `Route` column, per Fix Wave Ordering; then re-spawn Step 5. | 2 attempts; on exhaustion `status blocked` — never review with failing E2E tests |
| 5 e2e-validate | `authored` | The agent ignored validate mode. Re-spawn once with the mode restated. | counts against the 2 |
| 5 e2e-validate | any, with a `## Repairs` row that weakened an assertion, or without the line "No assertion was deleted, skipped, or weakened" | A failed validate attempt, not a pass. | counts against the 2 |
| 6 review | `approved` (merged, computed by `merge-review`) | Completion — after settling any open decision items (Step 6). | |
| 6 review | `needs-changes` (merged) | Review Retry Logic (Step 6). | 3 cycles; on exhaustion, Review Cycle Exhaustion |
| 6 review | a part file (`review.code.md`, `review.browser.md`, `review.maintainability.md`) missing or without a usable `**Verdict**` | `archive` it if present, re-spawn **that one reviewer** with the same prompt; then `merge-review` again. | 1 per part per cycle |
| any | `blocked` | `python3 $S <plan> status blocked --step <step>`, report to the user. | |
| any | no output file, or an unusable verdict | `python3 $S <plan> archive <file>` to preserve what it wrote, re-spawn once; a second failure is `blocked`. | 1 |
| 7 doc-reconcile | `reconciled` | Completion. | |
| 7 doc-reconcile | `contradiction` | The code disagrees with a claim review approved. `python3 $S <plan> reopen review` and run a fix wave; it counts as a review cycle. | the review budget of 3 |
| 7 doc-reconcile | `blocked` | A feature outside the plan's `**Features**`, or a spec that cannot hold its delta. `status blocked --step doc-reconcile`, report to the user — never widen the header yourself. | |
| 6 review | any, with `[orchestrator:decision]` items | `decide` skill, before any fix wave (Step 6 item 1a). | 2 debates per run; a third stops and asks the user |

### Fix Prompt Rules

When routing review issues back to fix agents:

1. **Quote the review issue verbatim** — do not paraphrase, summarize, or selectively include details. Copy the full issue text from review.md into the fix prompt.
2. **Include ALL issues for that agent** — if the review tags 3 issues as `[e2e-specs]`, all 3 must be in the prompt, not just the first one.
3. **Include file paths and line numbers** exactly as the review specifies them. Wave-2 and wave-3 prompts also carry the staleness block from Fix Wave Ordering, verbatim.
4. **Tell the agent to read review.md directly** — as a backup, always include:
   ```
   Read plans/<plan-name>/review.md for the complete issue descriptions.
   The issues tagged [<agent-tag>] are yours to fix. Fix ALL of them.
   ```
5. **State that Fix Mode rules 5–7 of the agent's definition apply** (enumerate every path, measure blast radius, re-run the reviewer's repro) — one sentence; the rules themselves live in the agent file.
6. **State the cycle label** — every fix-mode prompt **and every re-spawn** names the current review cycle
   ("This is review cycle 2's fix wave"), or the pre-review context ("this is an
   e2e-validate fix, no review has run") when routing a Step 3/5 implementation-bug;
   agents copy that label into their commit-message suffix — `(review cycle <N>)` or
   `(pre-review fix)`, the only two forms their definitions know
   (kb:lesson/handoff-commit-defects).

### Step 1: E2E Specs Agent

Spawn `subagent_type: "e2e-specs"` with prompt:
```
Execute in AUTHORING MODE the E2E specs task for plan: <plan-name>
Project root: <project-root>

The implementation does not exist yet: tests asserting NEW behaviour gate on collection only;
regression pins run green against the current tree now, per your definition's "Regression pins
run live at authoring". Finish with Verdict: authored — never `pass`.
```

For an `E2E Scope: harness-only` plan, replace the last sentence with:
```
This plan authors no new spec: its E2E deliverable is the harness/fixture edit named in the
plan's Affected Files. Make that edit, prove collection is still clean, list the existing
spec files the change now covers, and finish with Verdict: harness-only — not `authored`
(nothing was authored) and not `pass` (nothing ran).
```

Wait for completion, then verify `plans/<plan-name>/test-specs.md` exists and act on its verdict
(table above). Before continuing on `authored`, check the Tests table: at least the regression-pin
rows carry `ran-green-at-authoring` with a pasted run summary. All `collection-only` on a plan whose REQs include "unchanged"
behaviour means the agent skipped the live run — send it back once
(kb:lesson/authored-tests-never-run-before-validate). Step 5 proves the new-behaviour tests run.

### Step 2: Implementation Agents

**For full-stack plans** — spawn BOTH in the same message (two Agent calls):

`subagent_type: "daemon-impl"`:
```
Execute the daemon implementation task for plan: <plan-name>
Project root: <project-root>
```

`subagent_type: "web-impl"`:
```
Execute the web implementation task for plan: <plan-name>
Project root: <project-root>
```

As each reports, verify its output file was created and run its wave-1 gate; then spawn that
track's test agent (Step 3) without waiting for the other track.

**For daemon-only or web-only** — spawn just the relevant agent.

### Step 3: Test Agents

Spawn each track's tester the moment that track's impl agent has reported and passed its gate —
do not hold the daemon tester for the web coder or vice versa (both in one message only if both
impls finished together). daemon-tests writes only Go test files and web-tests only
`web/src/**/*.test.ts`, so a tester and the other track's coder never share a file. Tell the
tester the other coder is still running and to leave its uncommitted files alone.

`subagent_type: "daemon-tests"` and `subagent_type: "web-tests"`, each with:
```
Execute the <daemon|web> testing task for plan: <plan-name>
Project root: <project-root>
```

Wait for both to complete before Step 5.

### Step 4: Fix Mode for Test Failures

On a tester's `implementation-bug` (table above), spawn that track's implementation agent (`subagent_type: "daemon-impl"` or `"web-impl"`) with prompt:
```
Execute in FIX MODE for plan: <plan-name>
Project root: <project-root>

This is fix attempt <N> of 3.
Read the test output at plans/<plan-name>/<daemon-tests|web-tests>.md for failure details.
Read the change log at plans/<plan-name>/<daemon-implementation|web-implementation>.md for what was already attempted.
```

Count it with `python3 $S <plan> retry <daemon-tests|web-tests>`, then re-run that track's test agent, per Fix Wave Ordering (the impl fix lands and builds before the tester re-runs).

### Step 5: E2E Validate & Repair

The Step 1 e2e-specs run could only prove its tests *collect* — the feature did not exist yet. This step is where those tests are proven to actually *run*. Do it here, not in review: locator repair is authoring work, and letting the review agent discover it burns an Opus review cycle.

**Skip this step entirely** (record it in `completed_steps` with a one-line reason, do not retry) if any of:
- Step 1 was skipped (daemon plan with no `E*` criteria)
- `plans/<plan-name>/test-specs.md` does not exist, or reports `Tests created: 0` — but a harness-only plan always reports `0`, and there Step 5 is your own sweep (Pre-flight 3a), not a skip
- The spec file(s) named in test-specs.md's Tests table do not exist on disk
- `npx playwright test --list` (run from `web/`) lists 0 tests from those files

The Playwright config allocates a fresh port per run; a change to that property is a Critical defect — stop.

Spawn `subagent_type: "e2e-specs"`:
```
Execute in VALIDATE MODE for plan: <plan-name>
Project root: <project-root>
This is validate attempt <N> of 2. Spec file(s): <paths from the File column of test-specs.md's Tests table>.
Your definition's Validate Mode applies in full; never weaken an assertion — report implementation-bug instead.
```

Read `**Verdict**` and the `## Repairs` table in `plans/<plan-name>/test-specs.md` and act on them per the table above.

### Step 6: Review — gates, then three reviewers, then one merged verdict

Three focused reviewers replace the one that did everything (kb:adr/process-review-split-three-reviewers-computed-verdict).
Each files only its own class of defect and none of them commits; you run the gates, merge the
parts and commit the result.

1. **Gates, once, yours.** `python3 $S <plan> start review`, then in the foreground with
   `timeout: 600000` (a cold run exceeds the 120 s default and the harness would background it):
   ```bash
   GATES_LOG_DIR=$TMPDIR/gates-<plan>-c<N> .claude/skills/orchestrate/scripts/gates.sh <plan>   # --no-e2e for a daemon plan whose Step 1 was skipped
   ```
   Note the summary's `<F> failed` count; the ledger makes a re-run on an identical tree a reuse,
   which is why nobody runs it twice (kb:adr/process-gates-run-once-by-orchestrator-before-review).
   A red line does **not** stop the review — the reviewers report it as a Critical and one fix wave
   answers gate and findings together.
2. **Choose the reviewer set.** `review-work` always. `review-browser` unless the plan's
   `**Work Type**` is `daemon`. On a delta cycle (below), `review-browser` runs only if
   `git diff --name-only <review_commits[N-1]>..HEAD -- web/src ':!*.test.ts'` is non-empty, and
   `review-maintainability` only if `git diff --name-only <review_commits[N-1]>..HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`
   is non-empty (`python3 $S <plan> show` has `review_commits`). List the skipped ones in the
   spawn message so the merged header can say so.
3. **Spawn the set in one message**, each with `subagent_type` from the table and this prompt
   (the second line names the reviewer's task word: `review` / `browser review` / `maintainability review`):
   ```
   Execute the <task> for plan: <plan-name>
   Project root: <project-root>
   This is review cycle <N>. GATES_LOG_DIR: <the directory from item 1> (<F> failed lines).
   Write your part file only; do not commit — the orchestrator commits all parts together.
   ```
   For `review-work` and `review-maintainability` on cycle 2+, when the previous cycle's only open
   agent-tagged issues were Minors (no agent-tagged Critical/Major, in any part), append:
   ```
   Cycle <N-1>'s only open agent-tagged issues were Minors — your definition's Delta
   Re-review applies; the previous review is plans/<plan-name>/review.cycle<N-1>.md.
   ```
   That archive must exist before the re-spawn — `python3 $S <plan> archive review.md` (State
   Tracking) creates it, so run it before spawning, not after.
4. **Merge and commit.** When every spawned reviewer has reported:
   ```bash
   python3 $S <plan> merge-review --gates-failed <F>      # writes review.md; prints the verdict and any `WARN scope:` line — a user decision (1a) before wave 1
   git add plans/<plan>/review.md plans/<plan>/review.code.md [plans/<plan>/review.browser.md] [plans/<plan>/review.maintainability.md]
   git commit -- <those paths> -m "review(<plan>): cycle <N> — <verdict>"    # plus the harness trailers
   python3 $S <plan> reviewed "$(git rev-parse HEAD)"     # review_commits[N], for the next cycle's skip rules
   python3 $S <plan> finish review
   ```
   The verdict is computed — worst of the parts and the gates, `needs-changes` on any agent-tagged
   issue at any severity — never edited. Read it from `review.md`'s header and act by the table.
   Issue numbering restarts in each part; when you quote an issue anywhere, name its part
   ("browser Major 1").

**Approved with open decision items is conditional.** `[orchestrator:decision]` and
`[orchestrator:user-decision]` items never block approval but do block completion: settle each per
item 1a below. An outcome that changes no code leaves the approval standing; one that changes code
runs through the ordinary fix waves, the full suite and a delta re-review, counting one review
cycle (kb:lesson/decision-made-inside-a-fix-wave).

**Review Retry Logic** — on `needs-changes`, the sequence is always wave 1 → gate → wave 2 → gate
→ wave 3 → gate → review; never start a later wave before an earlier one has landed:

1. Read `review.md` and bucket every tagged issue **across all three parts**: `[daemon-impl]`, `[web-impl]`, `[daemon-tests]`, `[web-tests]`, `[e2e-specs]`. Quote each with its part name ("maintainability Major 2") — numbering restarts per part.
   - `[orchestrator]` issues are yours — never spawn an agent for them; handle them in Doc-Upkeep /
     Completion. A doc-only one may be fixed while a fix wave runs iff its file set (`docs/`,
     `TODO.md`, `SPEC.md`) is disjoint from every file the wave's agents may write and each wave
     prompt says to leave those files alone. `make gen-kb` runs between a wave and its gate — it rewrites
     `.claude/rules/*.md` and `internal/<pkg>/CLAUDE.md` trailers wave-1 agents hold
     (kb:lesson/orchestrator-work-spawned-as-agent).
   - **Every severity routes.** An agent with any tagged issue — Critical, Major or Minor — is spawned in its wave with all of them; Minors are never deferred to `TODO.md` (kb:lesson/finding-severity-misrouted). The cycle after a Minors-only wave is a cheap delta re-review (above).
   - **Exception — plan-log and doc-label Minors:** a Minor whose whole fix is wording or a label inside `plans/<plan>/*.md`, `docs/` or `TODO.md` (no code, test or assertion) is yours to make while the wave runs, in your own `docs(<plan-name>)` commit, cited in the completion summary; the delta re-review verifies it (kb:lesson/orchestrator-work-spawned-as-agent).
   - `[note]` items are never routed; list them in the completion summary.
1a. **Decision items first.**
   - `[orchestrator:user-decision]` (protocol contract, scope, an accepted ADR, money) →
     straight to the user via `AskUserQuestion` with the reviewer's two options quoted verbatim, no
     debate. Record the outcome in `plans/<plan>/decisions/<slug>/decision.md` with `Reached by:
     user decision` **and** a `proposed` ADR (`tags: [user-decision]`, `refs: [plan:<plan>]`), land
     the protocol/plan edits yourself (only you may edit the contract), then quote the outcome in
     the fix-wave prompt.
   - `[orchestrator:decision]` → run the `decide` skill (`.claude/skills/decide/SKILL.md`) **before** any fix wave: two `debater` agents argue the options to each other, a fresh `judge` breaks a tie, `decisions/<slug>/decision.md` records it. Quote the outcome verbatim in the implementing agent's fix-wave prompt.
   - Max 2 debates per run. A third decision item, or any item on the skill's never-debated list, stops the pipeline and asks the user (kb:lesson/decision-made-inside-a-fix-wave).
2. **Do not fan all five out at once — they are not independent.** Group the non-empty buckets into waves per Fix Wave Ordering and run them strictly in order. Within a wave, spawn its agents in parallel (multiple Agent calls in one message); between waves, wait for completion, stamp `finish <step>` for each agent that reported, and run the wave's gate.
3. A wave gate red only on that wave's own files goes back to its agent once; red again or elsewhere ends the cycle — count it and report — never start the next wave on a broken tree.
4. Do **not** run a full-suite gate between waves. The next cycle's Step 6 item 1 runs
   `gates.sh <plan>` once — the baseline suites plus every line of the ```checks block — and that
   run is the cycle's validation; a red line becomes the merged header's `**Gates**: N failed` and
   a Critical the same fix wave answers alongside the reviewers' findings.
5. `python3 $S <plan> archive review.md`, then `archive review.<part>.md` for each part file that
   exists (`code`, `browser`, `maintainability`), then `retry review` — **once per cycle**, not once
   per wave — then Step 6 from item 1.

### Review Cycle Exhaustion

If all 3 review cycles are used and the final merged verdict is still `needs-changes`:
1. Do NOT mark the pipeline as "completed"
2. `python3 $S <plan> status blocked --step review`
3. Report to the user exactly what issues remain, referencing the review.md file
4. Ask the user whether to (a) continue with more review cycles, (b) fix manually, or (c) abort. Decision items never bring you here — Step 6 item 1a settles them. A Minors-only cycle is normally followed by an approving delta re-review; if cycle 3 still ends Minors-only, this same path applies — never defer them to `TODO.md` silently.

### Step 7: Doc Reconcile

Runs **only after `review.md` says `approved`**, and before Completion. `python3 $S <plan> start
doc-reconcile`, spawn `doc-reconcile` with the plan name and project root, then read its verdict.

Before spawning, **amend `plans/<plan>/doc-delta.md`**: seed it from the plan's `## Doc Delta` if it
does not exist yet, then fold in every `doc-delta:` line from the implementation logs, fix waves
included. This is the one input the agent cannot recover for itself — it has no memory of the run —
and an unamended delta promotes a claim the fix waves already invalidated. Editing this file is not a
plan amendment: `plan.md` stays as approved.

The agent owns `docs/features/*/spec.md` and `docs/protocol.md`; you keep `TODO.md`,
`proposed-backlog.md`, ADRs, facts and
`docs/diagrams/` records. On `contradiction`, `reopen review` and run a fix wave — the code, not the
sentence, is what moves. On `blocked`, stop: a feature set wider than the plan's `**Features**` means
every agent ran this plan with an incomplete pack, and that is the user's call, not a doc edit.

## Fix Wave Ordering

Fix agents are **not** independent, and a naive fan-out of all five tags at once produces work
that has to be redone. Derive wave membership from the tags present, then run the waves strictly
in order. The same order governs `implementation-bug` verdicts before review: from Step 3, the
impl agent (wave 1), gate, the tester again (wave 2); from Step 5, the routed impl agent (wave 1),
gate, that side's unit test agent (wave 2), gate, Step 5 again (wave 3).

| Wave | Tags | Gate before the next wave starts |
|------|------|----------------------------------|
| 1 | `[daemon-impl]`, `[web-impl]` | `gates.sh <plan> --wave 1` — must exit 0 |
| 2 | `[daemon-tests]`, `[web-tests]` | `gates.sh <plan> --wave 2` — must exit 0 |
| 3 | `[e2e-specs]` | `gates.sh <plan> --wave 3` — must exit 0 |

**Why this order.** The dependency is "who reads whose output". `daemon-tests` and `web-tests` read the implementation log and the implementation files, and are forbidden from modifying them — so a test agent run before the impl fix lands fixes the wrong thing. `e2e-specs` asserts against the rendered product, so it is downstream of both.

Two concrete ways a flat fan-out goes wrong: an impl agent moves or renames a symbol, which invalidates an import in a test file that only the test agent may repair — the test agent must therefore run *after*; and a refactor cannot be re-verified by its test agent until the refactor is actually on disk.

**Rules:**

- **Skip empty waves.** Start at the first wave with issues and skip the gates of waves that did not run; a review whose criticals were all E2E locator defects starts at wave 2 or 3. **Never spawn a fix agent with no issues tagged for it** — an agent invoked in fix mode with nothing to fix invents unrequested changes.
- **An impl fix and a test fix touching the same feature** land in different waves by construction — that is the whole point. Additionally, every wave-2 and wave-3 fix prompt MUST include this line verbatim:
  ```
  Line numbers in review.md were captured BEFORE this cycle's implementation fixes and may be
  stale. Locate the code by symbol and content, not by line number. Re-read the implementation
  files (and plans/<plan-name>/<daemon|web>-implementation.md, including its latest
  ## Fix Attempt section) before you edit your tests.
  ```
  This is not defensive boilerplate: review issues cite `file:line`, and a wave-1 edit in the same cycle invalidates those line numbers for every later wave reading the same review.md.
- **Both impl agents tagged** → they run in parallel; their file trees are disjoint (`cmd/`/`internal/` vs `web/src/`). **Exception:** a review issue asking for a change to the protocol contract (the plan's **Protocol Contract** section or `docs/protocol.md`) stops the pipeline — report to the user. The contract is what lets the two agents work independently; neither may redefine it.
- **Sanctioned test-file breakage.** A wave-1 signature change may break a test file only wave 2
  may edit; the impl agent's Handoff names each such file. `gates.sh --wave 1` therefore runs
  `make lint` and `make web-build` tolerating only compile errors confined to test files
  (`_test.go` typecheck, `*.test.ts` tsc) and prints those files as a NOTE — check that the Handoff
  names every one; any other failure is real (kb:lesson/sanctioned-test-break-blinds-lint).
- **Plan amendments mid-run.** A review issue may prove a plan requirement wrong
  (kb:lesson/tiles-never-refit-behind-pattern-match). Protocol-contract changes always stop the
  pipeline (above). A **non-protocol** requirement may be amended without stopping iff:
  - the review demonstrates the defect **by measurement**, and
  - the amendment restores consistency with the plan's acceptance criteria or a decision the user already approved.

  Record it in three places: an *Amended* note inline on the requirement citing the review issue, a `proposed` ADR for the plan, and the completion summary. A scope change, or contradicting a user decision → stop and ask.
- **Every wave-3 prompt says "rebuild first"** — the agent definitions carry the order (`make web-build build`) and why; the harness serves prebuilt binaries, so a stale embed silently tests the previous tree.
- **`[e2e-specs]` always lands in wave 3**, even when its issue looks self-contained. A locator repaired against pre-fix markup is worthless, and its fix mode ends in a live run — which must happen against the post-fix tree.
- **New user-facing behaviour added by a fix wave gets E2E coverage in the same cycle.** When a
  cycle's impl fixes *add* user-visible behaviour (an error display, marker, shortcut, field), the
  wave-3 e2e-specs prompt includes: "read this cycle's ## Fix Attempt sections in both
  implementation logs and assert any new user-facing behaviour they added" — and e2e-specs runs in
  wave 3 for this **even with no tagged `[e2e-specs]` issue** (a concrete coverage task, not a spawn
  with nothing to fix). The gap lives *between* agents and only you see all waves (kb:lesson/dom-behaviour-gap-between-test-agents).
- **A review cycle's wave 3 can itself report `implementation-bug`** — a fix wave building
  better fixtures can uncover a new product defect, exactly as Step 5 does
  (kb:lesson/fix-wave-uncovers-product-defect). That verdict does not fail the wave and does not
  end the cycle — the wave's own tagged fixes are complete; fold the same cycle back on itself:
  route the new bug to the impl agent as a fresh wave 1 (that agent's still-open review issues
  ride along as usual), gate, wave 2, gate, wave 3 again, then the full-suite run and the
  re-review — all within the current cycle's single review retry. End the cycle early only when
  a wave's *own tagged fixes* are incomplete (its gate fails on its own work), never because it
  honestly surfaced someone else's defect.
- **Two agents may never be spawned concurrently if one may write a file the other may write.** The wave table already guarantees this for the five pipeline tags; apply the same test before any ad-hoc parallel spawn.

## State Tracking

After each agent completes, update `plans/<plan-name>/orchestration-state.json` **via the
bundled script** — never by hand-editing or ad-hoc Python. Run from the project root:

```bash
S=.claude/skills/orchestrate/scripts/orch-state.py
python3 $S <plan> init                              # pre-flight, fresh plan (also stamps plan.md Status)
python3 $S <plan> start <step>                      # the moment you spawn the step's agent(s) — fix re-spawns too
python3 $S <plan> finish <step>                     # a fix-mode re-spawn reported: stamp only, no step-state change
python3 $S <plan> done <step> --next <next-step>    # after a step's verdict is read
python3 $S <plan> done review --next completed      # the terminal step still needs --next
python3 $S <plan> retry <step>                      # each fix/validate/review cycle (closes a still-open attempt itself)
python3 $S <plan> archive <file>                    # before a re-spawn overwrites a verdict file (review.md → review.cycle<N>.md; parts: review.browser.md → review.browser.cycle<N>.md)
python3 $S <plan> merge-review --gates-failed <F>   # Step 6 item 4: parts → review.md with one computed **Verdict**
python3 $S <plan> reviewed <sha>                    # Step 6 item 4: the commit carrying this cycle's review.md (review_commits[N])
python3 $S <plan> closes 2 4                        # Completion step 5: issues /land will close
python3 $S <plan> status blocked --step <step>      # on exhaustion
python3 $S <plan> status completed                  # only after review = approved
python3 $S <plan> reopen <step>                     # resume from blocked/completed (keeps retry count; add --reset-retries only when the user grants a fresh budget)
python3 $S <plan> show
python3 $S <plan> timings                           # Completion step 8: per-step wall-clock table (finish − start)
```

**Every `start` needs a matching `finish` or `done`** — including each agent of a parallel pair
and every fix-mode re-spawn (a re-spawn does not end the step, so `done` is wrong there).
Per-step wall-clock is the one number a retro cannot reconstruct afterwards. Also keep each
agent's **token count and duration** from its task notification when it carries a `<usage>`
block; teammate-style notifications carry none, and then wall-clock is the only cost figure —
say so in the summary rather than leaving the column blank.

The file's current shape is whatever `python3 $S <plan> show` prints — do not hand-edit it.

### Resume Logic

When `/orchestrate` is invoked for a plan that already has an `orchestration-state.json`, read it and proceed by `status`:

**`"in-progress"`** — Resume from `current_step`:
- Skip any step listed in `completed_steps`
- For the `current_step`, check if there's an existing output file with a verdict:
  - If the verdict is `needs-changes` or `implementation-bug`, enter the retry loop for that step (respecting existing `retry_counts`)
  - If no output file exists, run the step fresh
- `doc-reconcile` is safe to re-run: its delta is assertions about files, so a second pass
  verifies what a dead run already promoted instead of promoting it twice
- `test-specs.md` is written by **both** Step 1 (`e2e-specs`) and Step 5 (validate). Read its `**Mode**` field, not just its existence: `Mode: authoring` with `Verdict: authored`/`harness-only` means Step 1 completed and Step 5 has not run. Never treat those verdicts as satisfying Step 5 — except on a harness-only plan, where Step 5 is your own sweep and `completed_steps` is its only record.
- Continue the pipeline from there

**`"blocked"`** — The pipeline previously hit max retries or an unrecoverable error:
- Report what failed (read `current_step` and the relevant output file)
- Ask the user: resume from the failed step, or abort?
- If resuming: `python3 $S <plan> reopen <step>` (retry count kept; add `--reset-retries` only when the user grants a fresh budget) and re-enter the pipeline at `current_step`

**`"completed"`** — The pipeline previously finished, but the user wants to re-run:
- Ask the user which step to re-run from (typically `"review"`), then `python3 $S <plan> reopen <step>` and resume from there

## Final Validation

Before completion, run the baseline gates and the plan's authored checks **fresh, via the bundled
runner** — never a hand-rolled loop, never a cached agent verdict:

```bash
.claude/skills/orchestrate/scripts/gates.sh <plan-name>            # baseline + ```checks block
.claude/skills/orchestrate/scripts/gates.sh <plan-name> --no-e2e   # daemon plan whose Step 1 was skipped
```

The script header documents what it runs, how it dedupes, where it logs and how it handles the `rg`
shim. Paste its summary into the completion report. **Every baseline gate and every authored check
must pass** — otherwise the pipeline is not complete. On a tree unchanged since Step 6's run this is
a ledger reuse that costs seconds and proves the tree did not move; the `WARN size` line never
counts against it.

If the plan has no ```checks block, run the baseline gates and say in the summary that the plan
predates the Automated Checks convention. Do NOT parse prose criteria for backticked commands to
substitute — a prose criterion routinely combines one runnable clause with several that are not, and
running only the runnable clause reports a pass the plan never earned.

## Doc-Upkeep Backstop

CLAUDE.md's "Doc upkeep" section binds every session, this pipeline included. **You verify and amend — you are the backstop, not primarily the author.** The split is: **records to you, present-tense docs to Step 7** (kb:adr/process-doc-reconcile-after-review).

Do this **while the Step 3 testers run** — the file set is disjoint from every agent's — commit it
as `docs(<plan-name>): doc upkeep`, and re-verify it at Completion. Never write the verdict
before it exists: no "approved", no "review cycle N", no ✅ tick until `review.md` says `approved`.
Before dispatching, check the plan's Implementation Notes for work it assigns to *you*: a requirement
whose file Affected Files gives no owner is yours, not an agent's (kb:lesson/plan-gave-no-single-owner).

1. Read the implementation logs (including `## Fix Attempt` sections) so you know what actually shipped. You don't need to re-read source.
2. Check, and fix what's missing, per `.claude/skills/orchestrate/doc-upkeep.md`: `TODO.md` ticks
   (recording each fully-resolved issue number for Completion step 5), an ADR for every `deviation:`
   line and every `decisions/<slug>/decision.md`, a fact record for every measured Claude Code
   fact. `docs/features/*/spec.md` and `docs/protocol.md` are **not yours** — Step 7 reconciles
   both after review. Finish with `make gen-kb && make check-kb`
   (between waves only — Step 6 item 1) and commit the regenerated files with the records.
3. If nothing qualifies, say so in the completion summary rather than inventing entries.

State what you found and changed in the completion summary.

## Completion

When all steps pass AND the review verdict is "approved", in this order:

0. **Step 7 has run and returned `reconciled`.** Completion never precedes it — the feature specs
   and `docs/protocol.md` describe the pre-plan world until it does.
1. Re-verify the Doc-Upkeep Backstop above (done before Step 6; fix anything the review cycles changed).
2. Resolve every `[orchestrator]`-tagged issue in review.md: do the doc edit, or propose genuine follow-up in `plans/<plan>/proposed-backlog.md` (doc-upkeep.md gives the shape) — **never as a new `TODO.md` item**, which is the user's to file (kb:adr/process-backlog-entries-are-the-users-to-file). List each one and its disposition in the completion summary. An approved review may carry these; a `completed` pipeline may not leave them unaddressed.
3. An approved review.md has no agent-tagged issue open at any severity (Verdict Rules) — if you find one, the verdict is wrong; stop and re-spawn the reviewer rather than writing it down anywhere. Every `[note]` is listed in the completion summary verbatim — no TODO line, no agent; one worth keeping goes to `proposed-backlog.md`, **Change requested: no**.
4. **Accept this plan's ADRs.** For every name in the plan's `**Features**`, `go run ./tools/kb
   ls --feature <f> --status proposed` — for each record whose `refs` carry `plan:<plan>`, Edit
   `status: accepted` and `date:` today. The ADR and the code it describes land in one squash,
   so acceptance is atomic with the merge and a rejected branch takes both with it. Then
   `make gen-kb && make check-kb`; a `FAIL` is a doc-upkeep defect — fix it now. `/land`
   refuses a branch that still carries one of this plan's `proposed` ADRs.
5. **Record the issues this plan closes**: `python3 $S <plan> closes <N> ...` — never by
   hand-editing the JSON — for every issue the Doc-Upkeep Backstop judged **fully** resolved
   (absent or `[]` means none). `/land` reads it to compose the squash subject's `closes #N`. You
   never close an issue yourself: the fix exists only on a branch the user has not accepted, and
   `approved` is the reviewer's opinion, not acceptance. The close fires when `/land` pushes to `main`.
6. **End with everything committed.** Commit your doc-upkeep and state edits, `proposed-backlog.md`
   included (`docs(<plan-name>): doc upkeep and pipeline completion`) and confirm `git status --short` on `plan/<plan-name>`
   shows nothing beyond the pre-flight strays — the branch is the review artifact (`git diff
   main...plan/<plan-name>`, then `/land <plan-name>`). An agent's uncommitted files are its defect
   (Pre-flight 4a); if it cannot commit them, commit them yourself as `chore(<plan-name>): commit
   <agent>'s uncommitted work (orchestrator)`.
7. `python3 $S <plan> status completed`. The script refuses it unless `review.md` says `approved`; you additionally refuse it while any suite or build is red, or the tree is dirty beyond the pre-flight strays.
8. Print a summary: what was done, files changed, retry count, notable issues, the `[note]` items
   verbatim, the ADR ids accepted in step 4, **a per-step cost table** (`python3 $S <plan> timings`, plus each agent's tokens and
   duration from its task notification), and the branch (`plan/<plan-name>`, `git log --oneline
   main..`). Point at **`/land <plan-name>`** (naming the issues it closes from step 5 and any
   deliberately left open) and at **`/retro`** for this run — this session, while the stumbles are
   in context. The pipeline never merges or pushes.
9. **Tear down what the run started** — `ListAgents`, then `TaskStop` every teammate this pipeline
   spawned (they survive `/clear`; 51 had accumulated across four runs), then
   `.claude/skills/orchestrate/scripts/orch-cleanup.sh --yes` for orphaned processes, stale `tmux -L` sockets and `$TMPDIR` debris. Report both counts.
10. **Decisions section** — for every debate run this pipeline (`plans/<plan>/decisions/*/decision.md`): the two options, the outcome, consensus-or-judged, the decisive argument in one or two sentences, and any dissent. The user may overrule with one line; if they do, `reopen` the affected wave and re-run it with the user's choice quoted.
