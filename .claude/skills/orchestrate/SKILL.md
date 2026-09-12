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

Before starting:

1. Read `plans/<plan-name>/plan.md`
2. Verify the plan status is "approved" (not "draft") and run `.claude/skills/orchestrate/scripts/plan-lint.sh <plan-name>`. A draft, or any `FAIL` line, goes back to `/plan-work` — spawn nobody.
3. Check the **Work Type** field to determine which agents to run:
   - `daemon` → skip web agents; run the E2E steps only if the plan defines `E*` acceptance criteria (a daemon-only change can still be E2E-observable through the dashboard)
   - `web` → skip daemon agents
   - `full-stack` → run all agents
3a. Check the **E2E Scope** field:
   - `new-specs` → Step 1 authors tests; expected verdict `authored`
   - `harness-only` → the E2E deliverable is an edit to `web/e2e/helpers/*` or fixtures, no new
     spec. Step 1 still runs e2e-specs (expected verdict `harness-only`). **Step 5 is yours, not an
     agent's**: run `make e2e` yourself, read the plan's E criteria against the diff, record it in
     `completed_steps` — both harness-only runs lost a step to a validate agent with nothing to
     validate (kb:lesson/orchestrator-work-spawned-as-agent).
   - `none` → skip Steps 1 and 5
4. Determine the project root (the directory containing `.claude/`)
4a. **Branch.** The pipeline never commits on `main`.
   - `plan/<plan-name>` exists → `git checkout` it. Resume only if it has commits `main` lacks (`git log --oneline main..plan/<plan-name>`); zero unique commits means planning landed elsewhere — `git merge --ff-only main` before spawning anyone (kb:lesson/tree-not-clean-at-pipeline-start).
   - Otherwise read `git status --short`. If every dirty file is the plan's own directory or a planning-session doc edit (`docs/*`, `SPEC.md`, `TODO.md`, `CLAUDE.md`, `README.md`, `spikes/*`, `.claude/skills/*`, `.claude/agents/*`): `git checkout -b plan/<plan-name>`, `git add <those files>`, `git commit -m "docs(<plan-name>): approved plan and planning-session edits"`.
   - Any other **tracked** file dirty → stop and offer exactly three dispositions (never `git add
     -A`, never stash): **(a)** the user commits it on `main` and the pipeline branches from a clean
     tree; **(b)** the pipeline commits it onto `plan/<plan-name>` as part of this changeset;
     **(c)** it stays dirty and every agent is told to leave it alone. Flag (c) as unsafe when the
     file is also in the plan's Affected Files — its owning agent would fold the user's change into
     its own commit (kb:lesson/tree-not-clean-at-pipeline-start).
   - An **untracked** file outside the plan's directory that nothing references (a stray screenshot, a scratch note) does not block: leave it, tell every agent to leave it alone, never `git add` it, list it in the completion summary (kb:lesson/tree-not-clean-at-pipeline-start).
   - Every agent commits its own files at the end of its step (their definitions say how). You
     commit **your** edits (state file, doc-upkeep, decisions) per `docs/conventions.md` §Commits as
     `docs(<plan-name>): <summary>` (`chore(...)` for the state file alone), never an agent's files
     for it. An agent finishing with uncommitted files is a Handoff defect — have it commit before
     its gate is read. Never push.

## Pipeline Execution Order

```
┌─────────────────┐
│    E2E Specs    │  Playwright E2E test AUTHORING (collection gate only —
└────────┬────────┘  the feature doesn't exist yet, so tests can't pass)
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│   Daemon Impl   │     │     Web Impl     │
└────────┬────────┘     └────────┬─────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│  Daemon Tests   │     │    Web Tests     │
└────────┬────────┘     └────────┬─────────┘
         │                       │
         │  ◄── retry loops ────┘  (max 3 each)
         │
         ▼
┌────────────────────────────┐
│  E2E Validate & Repair     │  e2e-specs re-invoked in VALIDATE mode: runs its
│   (e2e-specs, validate)    │  own spec file LIVE and repairs its own locators
└────────┬───────────────────┘  (max 2 attempts)
         │
         ▼  implementation-bug → impl agent → that side's unit tests → back here
         │
┌─────────────────┐
│     Review      │  FULL E2E suite (regression sweep) + code review
└────────┬────────┘
         │
         ▼  (if issues, route back in dependency WAVES — see Fix Wave
            Ordering, max 3 cycles)
```

**Parallel execution**: For `full-stack` plans, daemon and web tracks run in parallel:
- Spawn daemon-impl and web-impl simultaneously using two Agent tool calls in a single message
- **Each track's test agent starts the moment its own impl agent reports** — do not hold the
  daemon tester for the web coder or vice versa. daemon-tests writes only Go test files and
  web-tests only `web/src/**/*.test.ts`, so a tester and the other track's coder never share a
  file (the concurrency test in Fix Wave Ordering is satisfied). Tell the tester the other coder
  is still running and to leave its uncommitted files alone. ui-text-and-focus: daemon-impl
  finished 23 minutes before web-impl; starting daemon-tests immediately saved 13 minutes.
- Wait for both testers to complete
- Then run E2E Validate & Repair (Step 5) — a single agent, not parallel
- Then run review

For `daemon` or `web` only plans, run the relevant track sequentially. Skip Steps 1 and 5 for `daemon` plans with no `E*` criteria (no E2E tests were authored).

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
| Review | `review-work` |

Each subagent already carries its full instructions (its agent definition is its system prompt), so the spawn prompt only needs the task, the plan name, and the project root. Do **not** pass an explicit `model` — each agent's definition pins its own model (Sonnet workers, Opus review).

**CRITICAL**: Do NOT paste file contents into subagent prompts. Each subagent has full file access and will read what it needs from disk. Keep prompts lean — just tell the agent what to do, which plan to work on, and the project root path.

### Fix Prompt Rules

When routing review issues back to fix agents:

1. **Quote the review issue verbatim** — do not paraphrase, summarize, or selectively include details. Copy the full issue text from review.md into the fix prompt.
2. **Include ALL issues for that agent** — if the review tags 3 issues as `[e2e-specs]`, all 3 must be in the prompt, not just the first one.
3. **Include file paths and line numbers** exactly as the review specifies them — but for wave-2 and wave-3 prompts, also include the staleness warning from `## Fix Wave Ordering`, since a wave-1 edit in the same cycle invalidates those line numbers.
4. **Tell the agent to read review.md directly** — as a backup, always include:
   ```
   Read plans/<plan-name>/review.md for the complete issue descriptions.
   The issues tagged [<agent-tag>] are yours to fix. Fix ALL of them.
   ```
5. **State that Fix Mode rules 5–7 of the agent's definition apply** (enumerate every path, measure blast radius, re-run the reviewer's repro) — one sentence; the rules themselves live in the agent file.

6. **State the cycle label** — every fix-mode prompt **and every re-spawn** names the current review cycle
   ("This is review cycle 2's fix wave"), or the pre-review context ("this is an
   e2e-validate fix, no review has run") when routing a Step 4/5 implementation-bug;
   agents copy that label into their commit-message suffix — `(review cycle <N>)` or
   `(pre-review fix)`, the only two forms their definitions know
   (kb:lesson/handoff-commit-defects).

### Step 1: E2E Specs Agent

Spawn `subagent_type: "e2e-specs"` with prompt:
```
Execute in AUTHORING MODE the E2E specs task for plan: <plan-name>
Project root: <project-root>

The implementation does not exist yet, so tests that assert NEW behaviour are expected to fail if
executed; for those your gate is the collection check only. Tests that pin UNCHANGED behaviour
(REQs phrased "still"/"unaffected"/"does not", INV source states, controls the plan marks
Existing) must run green against the current tree now — see your definition's "Regression pins
run live at authoring" — and a red one is your locator defect to fix before you log. Finish with
Verdict: authored — do not report `pass`.
```

For an `E2E Scope: harness-only` plan, replace the last sentence with:
```
This plan authors no new spec: its E2E deliverable is the harness/fixture edit named in the
plan's Affected Files. Make that edit, prove collection is still clean, list the existing
spec files the change now covers, and finish with Verdict: harness-only — not `authored`
(nothing was authored) and not `pass` (nothing ran).
```

Wait for completion. Verify `plans/<plan-name>/test-specs.md` exists and reports `**Verdict**:
authored` (`harness-only` for a harness-only plan). A `pass` verdict means the agent misread its
mode — the feature cannot exist yet. Check the Tests table: each row is `ran-green-at-authoring` or
`collection-only`, and at least the regression-pin rows carry the former with a pasted run summary.
All `collection-only` on a plan whose REQs include "unchanged" behaviour means the agent skipped the
live run — send it back once (kb:lesson/authored-tests-never-run-before-validate). Step 5 proves the new-behaviour
tests run.

### Step 2: Implementation Agents

**For full-stack plans** — spawn BOTH in the same message (parallel):

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

**For full-stack plans** — spawn each track's tester as soon as that track's impl agent has
reported and passed its gate (both in one message only if both impls finished together):

`subagent_type: "daemon-tests"` and `subagent_type: "web-tests"`, each with:
```
Execute the <daemon|web> testing task for plan: <plan-name>
Project root: <project-root>
```

Wait for both to complete before Step 5.

### Step 4: Handle Test Results

Read each test agent's output file and check the **Verdict** field:

- `pass` → that track is done
- `implementation-bug` → route back to the implementation agent in fix mode
- `blocked` → stop pipeline, report to user

**Fix mode** — spawn the implementation agent (`subagent_type: "daemon-impl"` or `"web-impl"`) with prompt:
```
Execute in FIX MODE for plan: <plan-name>
Project root: <project-root>

This is fix attempt <N> of 3.
Read the test output at plans/<plan-name>/<daemon-tests|web-tests>.md for failure details.
Read the change log at plans/<plan-name>/<daemon-implementation|web-implementation>.md for what was already attempted.
```

After the impl agent fixes, re-run the corresponding test agent. Max 3 retry cycles per track.

Route these fixes per `## Fix Wave Ordering` — an impl fix must land and build before its test agent re-runs.

### Step 5: E2E Validate & Repair

The Step 1 e2e-specs run could only prove its tests *collect* — the feature did not exist yet. This step is where those tests are proven to actually *run*. Do it here, not in review: locator repair is authoring work, and letting the review agent discover it burns an opus review cycle.

**Skip this step entirely** (record it in `completed_steps` with a one-line reason, do not retry) if any of:
- Step 1 was skipped (daemon plan with no `E*` criteria)
- `plans/<plan-name>/test-specs.md` does not exist, or reports `Tests created: 0` — but a harness-only plan always reports `0`, and there Step 5 is your own sweep (§3a), not a skip
- The spec file(s) named in test-specs.md's Tests table do not exist on disk
- `npx playwright test --list` (run from `web/`) lists 0 tests from those files

No port pre-flight is needed: the Playwright config allocates a fresh per-run port and never reuses an existing server. If that config property has been changed, treat it as a Critical defect and stop.

Spawn `subagent_type: "e2e-specs"`:
```
Execute in VALIDATE MODE for plan: <plan-name>
Project root: <project-root>
This is validate attempt <N> of 2. Spec file(s): <paths from the File column of test-specs.md's Tests table>.
Your definition's Validate Mode applies in full: rebuild first, run your file live, repair only your
own locators, then sweep the full suite; never weaken an assertion — report implementation-bug instead.
```

Read `**Verdict**` in `plans/<plan-name>/test-specs.md`:

- `pass` → continue to Step 6
- `implementation-bug` → read the **E2E Implementation Bugs** table. Route each row to the agent named in its `Route` column, following `## Fix Wave Ordering`: impl fix first, then that side's unit test agent, then re-spawn this step. Increment `retry_counts["e2e-validate"]`.
- `blocked` → set `status: "blocked"`, `current_step: "e2e-validate"`, report to the user
- `authored` → the agent ignored validate mode. Re-spawn once with the mode requirement restated; that re-spawn does count against the budget.

Also read the `## Repairs` table. If any row weakened an assertion, or the agent could not write "No assertion was deleted, skipped, or weakened," treat it as a failed validate attempt rather than a pass.

**Max 2 validate attempts** (`retry_counts["e2e-validate"]`). On exhaustion do NOT proceed to review with failing E2E tests: set `status: "blocked"` and report which tests still fail.

### Step 6: Review Agent

Spawn `subagent_type: "review-work"`:
```
Execute the review task for plan: <plan-name>
Project root: <project-root>
This is review cycle <N>. When your review is written, commit plans/<plan-name>/review.md
yourself (your definition says how).
```

For cycle 2+, when the previous cycle's only open agent-tagged issues were Minors (no
agent-tagged Critical/Major), append this line so the reviewer runs its lighter mode:
```
Cycle <N-1>'s only open agent-tagged issues were Minors — your definition's §9 Delta
Re-review applies; the previous review is plans/<plan-name>/review.cycle<N-1>.md.
```
That archive must exist before the re-spawn — `python3 $S <plan> archive review.md` (State
Tracking) is what creates it, so run it before spawning, not after.

**Approved with open decision items is conditional.** An `approved` verdict may carry
`[orchestrator:decision]` / `[orchestrator:user-decision]` items (they never block approval),
but they block completion. Settle each per step 1a below before anything else. If the settled
outcome changes no code, the approval stands — continue to Completion. If it changes code,
implement it through the ordinary fix waves (Fix Wave Ordering) with gates, re-run the full
suite, then a delta-focused re-review — counting one review cycle
(kb:lesson/decision-made-inside-a-fix-wave).

**Review Retry Logic**: If the review verdict is `needs-changes`:

1. Read `review.md` and bucket every tagged issue: `[daemon-impl]`, `[web-impl]`, `[daemon-tests]`, `[web-tests]`, `[e2e-specs]`.
   - `[orchestrator]` issues are yours — never spawn an agent for them; handle them in Doc-Upkeep / Completion. A doc-only one may be fixed while a fix wave runs iff its file set (`docs/`, `TODO.md`, `SPEC.md`, `spikes/`) is disjoint from every file the wave's agents may write and each wave prompt says to leave those files alone (kb:lesson/orchestrator-work-spawned-as-agent).
   - **Every severity routes.** An agent with any tagged issue — Critical, Major or Minor — is spawned in its wave with all of them; Minors are never deferred to `TODO.md` (kb:lesson/finding-severity-misrouted). The cycle after a Minors-only wave is a cheap delta re-review (Step 6).
   - **Exception — plan-log and doc-label Minors:** a Minor whose whole fix is wording or a label inside `plans/<plan>/*.md`, `docs/` or `TODO.md` (no code, test or assertion) is yours to make while the wave runs, in your own `docs(<plan-name>)` commit, cited in the completion summary; the delta re-review verifies it (kb:lesson/orchestrator-work-spawned-as-agent).
   - `[note]` items are never routed; list them in the completion summary.
1a. **Decision items first.**
   - `[orchestrator:user-decision]` (protocol contract, scope, a recorded SPEC decision, money) →
     straight to the user via `AskUserQuestion` with the reviewer's two options quoted verbatim, no
     debate. Record the outcome in `plans/<plan>/decisions/<slug>/decision.md` with `Reached by:
     user decision`, land the protocol/plan/SPEC edits yourself (only you may edit the contract),
     then quote the outcome in the fix-wave prompt.
   - `[orchestrator:decision]` → run the `decide` skill (`.claude/skills/decide/SKILL.md`) **before** any fix wave: two `debater` agents argue the options to each other, a fresh `judge` breaks a tie, `decisions/<slug>/decision.md` records it. Quote the outcome verbatim in the implementing agent's fix-wave prompt.
   - Max 2 debates per run. A third decision item, or any item on the skill's never-debated list, stops the pipeline and asks the user (kb:lesson/decision-made-inside-a-fix-wave).
2. **Do not fan all five out at once — they are not independent.** Group the non-empty buckets into waves per `## Fix Wave Ordering` below, and run the waves strictly in order. Within a wave, spawn its agents in parallel (multiple Task calls in one message); between waves, wait for completion, stamp `finish <step>` for each agent that reported, and run the wave's gate.
3. If a wave's gate fails, that wave's fix was incomplete. End the cycle there — count it against the review budget and report — rather than starting the next wave on a broken tree.
4. **MANDATORY**: after the last wave completes and its gate passes, re-run the full suite fresh:
   - `go build ./...` and `make test` — exit 0
   - `make lint` — exit 0
   - `make web-build` and `make web-test` — exit 0
   - `make e2e` — required whenever this cycle included a `[daemon-impl]`, `[web-impl]` or `[e2e-specs]` wave. May be skipped only for a cycle whose waves were unit-test-only. If wave 3's gate already ran the full suite and nothing has changed since, that run satisfies this requirement — do not run it twice.
   - Every line of the plan's ```checks block — run the whole list above through `.claude/skills/orchestrate/scripts/gates.sh <plan>` (see `## Final Validation`) rather than one command at a time
   - If any of these fail, the fix was incomplete — count it against the retry budget
5. Only AFTER all of the above pass, re-spawn the review agent.
6. Increment `retry_counts["review"]` **once per cycle**, not once per wave. Max 3 review cycles total.

**The sequence is always: wave 1 → gate → wave 2 → gate → wave 3 → gate → full test run → review. Never skip the test step, and never start a later wave before an earlier one has landed.**

### Review Cycle Exhaustion

If all 3 review cycles are used and the final verdict is still `needs-changes`:
1. Do NOT mark the pipeline as "completed"
2. Update orchestration state to `status: "blocked"`, `current_step: "review"`
3. Report to the user exactly what issues remain, referencing the review.md file
4. Ask the user whether to (a) continue with more review cycles, (b) fix manually, or (c) abort. Decision items never bring you here — cycle 1a settles them. A Minors-only cycle is normally followed by an approving delta re-review; if cycle 3 still ends Minors-only, this same path applies — never defer them to `TODO.md` silently.


## Fix Wave Ordering

Fix agents are **not** independent, and a naive fan-out of all five tags at once produces work that has to be redone. Derive wave membership from the tags present, then run the waves strictly in order.

| Wave | Tags | Gate before the next wave starts |
|------|------|----------------------------------|
| 1 | `[daemon-impl]`, `[web-impl]` | `go build ./...` (if daemon was touched) and `make web-build` (if web was touched) — each must exit 0 |
| 2 | `[daemon-tests]`, `[web-tests]` | `make test` (if daemon) and `make web-test` (if web) — each must exit 0 |
| 3 | `[e2e-specs]` | `make e2e` — must pass |

**Why this order.** The dependency is "who reads whose output". `daemon-tests` and `web-tests` read the implementation log and the implementation files, and are forbidden from modifying them — so a test agent run before the impl fix lands fixes the wrong thing. `e2e-specs` asserts against the rendered product, so it is downstream of both.

Two concrete ways a flat fan-out goes wrong: an impl agent moves or renames a symbol, which invalidates an import in a test file that only the test agent may repair — the test agent must therefore run *after*; and a refactor cannot be re-verified by its test agent until the refactor is actually on disk.

**Rules:**

- **Skip empty waves.** If there are no `[daemon-impl]`/`[web-impl]` issues, start at wave 2 and skip wave 1's gate (nothing ran). **Never spawn a fix agent with no issues tagged for it** — an agent invoked in fix mode with nothing to fix invents unrequested changes.
- **Only test-agent issues exist.** Waves 2 and 3 run normally. This is the common case for a review whose criticals were all E2E locator defects.
- **An impl fix and a test fix touching the same feature** land in different waves by construction — that is the whole point. Additionally, every wave-2 and wave-3 fix prompt MUST include this line verbatim:
  ```
  Line numbers in review.md were captured BEFORE this cycle's implementation fixes and may be
  stale. Locate the code by symbol and content, not by line number. Re-read the implementation
  files (and plans/<plan-name>/<daemon|web>-implementation.md, including its latest
  ## Fix Attempt section) before you edit your tests.
  ```
  This is not defensive boilerplate: review issues cite `file:line`, and a wave-1 edit in the same cycle invalidates those line numbers for every later wave reading the same review.md.
- **Both impl agents tagged** → they run in parallel; their file trees are disjoint (`cmd/`/`internal/` vs `web/src/`). **Exception:** a review issue asking for a change to the protocol contract (the plan's **Protocol Contract** section or `docs/protocol.md`) stops the pipeline — report to the user. The contract is what lets the two agents work independently; neither may redefine it.
- **Wave-1 web gate vs test-file compilation**: `make web-build` runs `tsc` over test files too, so
  a *sanctioned* wave-1 signature change can fail the gate inside a test file only wave 2 may edit.
  The gate still passes iff all of: (a) the tsc failures are confined to `*.test.ts` files the impl
  agent's Handoff names for the wave-2 update; (b) `tsc --noEmit` with those files excluded exits 0;
  (c) a standalone `vite build` exits 0 — the impl agent pastes (b) and (c) as evidence. Any failure
  outside the named files is real. The wave-2 gate (`make web-test`, then full `make web-build`
  before review) proves the handoff was honoured (kb:lesson/sanctioned-test-break-blinds-lint).
- **Wave-1 daemon gate vs test-file compilation** (the Go counterpart of the web rule above): `go build ./...` excludes test files, and `golangci-lint`
  stops at the first `typecheck` failure and reports nothing else in the repo. So a *sanctioned*
  wave-1 change that breaks a test file leaves `make lint` reporting one typecheck error and
  hiding every real finding in production code. Whenever daemon-impl's Handoff names a test file
  as sanctioned breakage, the wave-1 gate is `go build ./...` **and**
  `golangci-lint run --tests=false ./...` — both must exit 0, and the impl agent must paste the
  second as evidence. The wave-2 gate (`make test` plus the full `make lint`) then proves the
  handoff was honoured (kb:lesson/sanctioned-test-break-blinds-lint).

- **Plan amendments mid-run**: a review issue may prove a plan requirement wrong (kb:lesson/tiles-never-refit-behind-pattern-match). Protocol-contract changes always stop the pipeline
  (above). A **non-protocol** requirement may be amended without stopping iff: the review
  demonstrates the defect **by measurement**, the amendment restores consistency with the plan's
  acceptance criteria or a decision the user already approved, and it is recorded in three places —
  an *Amended* note inline on the requirement citing the review issue, a
  `docs/history/spec-changelog.md` entry, and the completion summary. A scope change, or
  contradicting a user decision → stop and ask.
- **Every wave-3 prompt says "rebuild first"** — the agent definitions carry the order (`make web-build build`) and why; the harness serves prebuilt binaries, so a stale embed silently tests the previous tree.
- **`[e2e-specs]` always lands in wave 3**, even when its issue looks self-contained. A locator repaired against pre-fix markup is worthless, and its fix mode ends in a live run — which must happen against the post-fix tree.
- **New user-facing behaviour added by a fix wave gets E2E coverage in the same cycle.** When a
  cycle's impl fixes *add* user-visible behaviour (an error display, marker, shortcut, field), the
  wave-3 e2e-specs prompt includes: "read this cycle's ## Fix Attempt sections in both
  implementation logs and assert any new user-facing behaviour they added" — and e2e-specs runs in
  wave 3 for this **even with no tagged `[e2e-specs]` issue** (a concrete coverage task, not a spawn
  with nothing to fix). The gap lives *between* agents and only you see all waves (kb:lesson/dom-behaviour-gap-between-test-agents).
- **This same wave order governs `implementation-bug` verdicts** from Step 4 and Step 5, not just review cycles. When Step 5 reports `implementation-bug`: run the routed impl agent (wave 1), gate, re-run that side's unit test agent (wave 2), gate, then re-spawn Step 5 (wave 3).
- **A review cycle's wave 3 can itself report `implementation-bug`** — a fix wave building
  better fixtures can uncover a new product defect, exactly as Step 5 does
  (new-session-dialog cycle 1: fixing an E13 Major required a 25-entry fixture, which
  exposed a missing `min-height: 0` that let the listing paint over the form). That verdict
  does not fail the wave and does not end the cycle — the wave's own tagged fixes are
  complete; fold the same cycle back on itself: route the new bug to the impl agent as a
  fresh wave 1 (that agent's still-open review issues ride along as usual), gate, wave 2,
  gate, wave 3 again, then the
  full-suite run and the re-review — all within the current cycle's single review retry.
  End the cycle early only when a wave's *own tagged fixes* are incomplete (its gate fails
  on its own work), never because it honestly surfaced someone else's defect.
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
python3 $S <plan> retry <step>                      # each fix/validate/review cycle
python3 $S <plan> archive <file>                    # before a re-spawn overwrites a verdict file (review.md → review.cycle<N>.md)
python3 $S <plan> closes 2 4                        # Completion 2c: issues /land will close
python3 $S <plan> status blocked --step <step>      # on exhaustion
python3 $S <plan> status completed                  # only after review = approved
python3 $S <plan> reopen <step>                     # resume from blocked/completed (keeps retry count; add --reset-retries only when the user grants a fresh budget)
python3 $S <plan> show
python3 $S <plan> timings                           # Completion 5: per-step wall-clock table (finish − start)
```

`start` stamps `step_started_at[<step>]` and `done` stamps `step_finished_at[<step>]`;
`timings` reports finish − start per step, and flags any row it had to estimate. **Every
`start` needs a matching `finish` or `done`**: a fix-mode re-spawn gets `start` at spawn and
`finish` when it reports (it does not end the step, so `done` is wrong there); `retry` closes a
still-open attempt itself. Call `start` for every step you spawn, including each agent of a
parallel pair and every fix-mode re-spawn — per-step wall-clock is the one number a retro
cannot reconstruct afterwards. Also keep each agent's **token count and
duration** from its task notification when it carries a `<usage>` block; teammate-style
notifications carry none, and then wall-clock is the only cost figure — say so in the summary
rather than leaving the column blank.

The file's current shape is whatever `python3 $S <plan> show` prints — do not hand-edit it.

### Resume Logic

When `/orchestrate` is invoked for a plan that already has an `orchestration-state.json`:

1. Read the state file
2. Determine how to proceed based on `status`:

**`"in-progress"`** — Resume from `current_step`:
- Skip any step listed in `completed_steps`
- For the `current_step`, check if there's an existing output file with a verdict:
  - If the verdict is `needs-changes` or `implementation-bug`, enter the retry loop for that step (respecting existing `retry_counts`)
  - If no output file exists, run the step fresh
- `test-specs.md` is written by **both** Step 1 (`e2e-specs`) and Step 5 (validate). Read its `**Mode**` field, not just its existence: `Mode: authoring` with `Verdict: authored`/`harness-only` means Step 1 completed and Step 5 has not run. Never treat those verdicts as satisfying Step 5 — except on a harness-only plan, where Step 5 is your own sweep and `completed_steps` is its only record.
- Continue the pipeline from there

**`"blocked"`** — The pipeline previously hit max retries or an unrecoverable error:
- Report what failed (read `current_step` and the relevant output file)
- Ask the user: resume from the failed step, or abort?
- If resuming: `python3 $S <plan> reopen <step>` (retry count kept; add `--reset-retries` only when the user grants a fresh budget) and re-enter the pipeline at `current_step`

**`"completed"`** — The pipeline previously finished, but the user wants to re-run:
- Ask the user which step to re-run from (typically `"review"`)
- Set `status` to `"in-progress"`, set `current_step` to the chosen step, remove it from `completed_steps`, and resume from there

## Final Validation

Before marking the pipeline as completed, run the baseline gates and the plan's authored
checks fresh **via the bundled runner** — never a hand-rolled loop:

```bash
.claude/skills/orchestrate/scripts/gates.sh <plan-name>            # baseline + ```checks block
.claude/skills/orchestrate/scripts/gates.sh <plan-name> --no-e2e   # daemon plan whose Step 1 was skipped
```

It runs the baseline gates below, then every line of the plan's ```checks block, dedupes by
exact command string (a check that names a baseline command is reported under its ID without a
second run), prints `PASS`/`FAIL` per ID with the tail of every failure, writes each command's
full output to a log dir it names in its summary, and exits non-zero on any failure. It sources
nvm for the pinned Node and recreates the `rg` shim when no real `rg` is on PATH, so its
subshells see what your interactive shell sees. Paste its summary into the completion report.

The baseline it runs is listed in the script header.

Each line in the plan's ```checks block is `<ID> <single-line shell command>`, run from the
project root exactly as written; it passes iff it exits 0. If you ever run a line by hand
instead of through the runner, run it in your interactive shell, not via `bash -c`/`sh -c` —
`rg` is Claude Code's shell-function shim over the `claude` binary, not a binary on PATH, so a
bare subshell cannot see it and the check fails spuriously (kb:lesson/rg-shim-invisible-to-bare-subshell). Report
results by ID; a command that appears under several IDs runs once and is reported under each.

**Every baseline gate and every authored check must pass.** If any fail, the pipeline is NOT complete — investigate and fix before proceeding.

If the plan has no ```checks block, run the baseline gates and state in the completion summary that the plan predates the Automated Checks convention. Do NOT parse the prose criteria for backticked commands to substitute — a prose criterion routinely combines one runnable clause with several that are not, and running only the runnable clause reports a pass the plan never earned.

Do NOT rely on cached test results or previous agent verdicts. Run the commands fresh. Agent verdict files may be stale if fixes were applied after the test agent last ran.

## Doc-Upkeep Backstop

CLAUDE.md's "Doc upkeep" section binds every session, this pipeline included. **You verify and amend — you are the backstop, not primarily the author.**

Do this **while the Step 3 testers run** — the file set is disjoint from every agent's — commit it
as `docs(<plan-name>): doc upkeep`, and re-verify it at Completion. Never write the verdict
before it exists: no "approved", no "review cycle N", no ✅ tick until `review.md` says `approved`.
Before dispatching, check the plan's Implementation Notes for work it assigns to *you*: a requirement
whose file Affected Files gives no owner is yours, not an agent's (kb:lesson/plan-gave-no-single-owner).

1. Read the implementation logs (including `## Fix Attempt` sections) so you know what actually shipped. You don't need to re-read source.
2. Check, and fix what's missing:
   - **`TODO.md`** — a finished backlog item (or sub-bullet): tick it, add its `✅ done <date> (plan
     …)` line, move the block to `docs/history/todo-done.md` under the same heading (a sub-bullet
     stays with its still-open parent). A new follow-up goes into the right milestone rather than
     evaporating. **A ticked item with a GitHub issue link → record the issue number** for
     Completion 2c, judging **full vs partial**: a plan can advance an issue without finishing it (a
     design-token issue may span two plans). Only a fully-resolved issue is a close candidate; a
     partial one is named in the completion summary as deliberately *not* closing, with what
     remains.
   - **`docs/history/spec-changelog.md`** — if the pipeline changed or settled a decision (a deviation recorded in an impl agent's `## Decisions`, a contract adjustment the user approved mid-run), add a changelog entry. Routine implementation of already-settled decisions needs no entry.
   - **`docs/facts/`** (and `spikes/FINDINGS.md` if substantive) — if the work exposed a new **measured** wire-format fact about Claude Code, write or amend a fact record (`verified:` the version measured, `guard:` the test that pins it or `none`; a fact proved wrong gets its ceiling pinned and `status: retired`, and the new shape is a new record citing it). Only measured facts, never assumptions. Then `make gen-kb && make check-kb`.
   - **`docs/protocol.md`** — must match what shipped. If plan-work merged the delta at approval and an approved mid-run adjustment changed it, reconcile the doc now.
3. If nothing qualifies, say so in the completion summary rather than inventing entries.

State what you found and changed in the completion summary.

## Completion

When all steps pass AND the review verdict is "approved":
1. Verify `review.md` on disk says `**Verdict**: approved` (kb:lesson/completion-claimed-before-approved-verdict)
2. Re-verify the Doc-Upkeep Backstop above (done before Step 6; fix anything the review cycles changed)
2a. Resolve every `[orchestrator]`-tagged issue in review.md: do the doc edit, or record it as a TODO.md entry in the right milestone if it is genuinely follow-up work. List each one and its disposition in the completion summary. An approved review may carry these; a `completed` pipeline may not leave them unaddressed.
2b. An approved review.md has no agent-tagged issue open at any severity (Verdict Rules) — if you find one, the verdict is wrong; stop and re-spawn the reviewer rather than writing a `TODO.md` line for it. Every `[note]` is listed in the completion summary verbatim — no TODO line, no agent.
2c. **Record the issues this plan closes**: `python3 $S <plan> closes <N> ...` — never by
    hand-editing the JSON — for every issue the Doc-Upkeep Backstop judged **fully** resolved
    (absent or `[]` means none). Do it before 2d so the state edit rides the same commit; `/land`
    reads it to compose the squash subject's `closes #N`. You never close an issue yourself: the fix
    exists only on a branch the user has not accepted, and `approved` is the reviewer's opinion, not
    acceptance. The close fires when `/land` pushes to `main`.

2d. **End with everything committed.** Commit your doc-upkeep and state edits (`docs(<plan-name>):
    doc upkeep and pipeline completion`) and confirm `git status --short` on `plan/<plan-name>`
    shows nothing beyond the pre-flight strays — the branch is the review artifact (`git diff
    main...plan/<plan-name>`, then `/land <plan-name>`). An agent's uncommitted files are its
    defect: have it commit; if it cannot, commit them yourself as `chore(<plan-name>): commit
    <agent>'s uncommitted work (orchestrator)`. The pipeline is not `completed` while the tree is
    dirty (pre-flight strays excepted).
4. Update orchestration state status to "completed"
5. Print a summary: what was done, files changed, retry count, notable issues, the `[note]` items
   verbatim, **a per-step cost table** (`python3 $S <plan> timings`, plus each agent's tokens and
   duration from its task notification), and the branch (`plan/<plan-name>`, `git log --oneline
   main..`). Point at **`/land <plan-name>`** (naming the issues it closes from 2c and any
   deliberately left open) and at **`/retro`** for this run — this session, while the stumbles are
   in context. The pipeline never merges or pushes.
6. **Tear down what the run started** — `ListAgents`, then `TaskStop` every teammate this pipeline
   spawned (they survive `/clear`; 51 had accumulated across four runs), then
   `.claude/skills/orchestrate/scripts/orch-cleanup.sh --yes` for orphaned processes, stale `tmux -L` sockets and `$TMPDIR` debris. Report both counts.
7. **Decisions section** — for every debate run this pipeline (`plans/<plan>/decisions/*/decision.md`): the two options, the outcome, consensus-or-judged, the decisive argument in one or two sentences, and any dissent. The user may overrule with one line; if they do, `reopen` the affected wave and re-run it with the user's choice quoted.

The state script refuses `status completed` unless `review.md` says `approved`; you additionally refuse it while any suite or build is red, or `git status --short` shows anything beyond the pre-flight strays.

## Error Handling

- An agent that produces no output file or an unusable verdict is re-spawned once, after `python3 $S <plan> archive <file>` preserves what it wrote; budget exhaustion at any step sets `status blocked` and reports which step and why.
