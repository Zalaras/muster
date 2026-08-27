---
name: orchestrate
description: "Runs the full multi-agent implementation pipeline for an approved plan. Spawns subagents for E2E authoring, implementation, testing, and review."
argument-hint: "<plan-name>"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Task
---

Your job is to orchestrate the execution of a plan through the multi-agent development pipeline by spawning subagents (Task tool) for each step. You control the flow, handle retries, and ensure each agent's output feeds correctly into the next.

> **Maintainer note:** This orchestration logic lives in a **skill** (not an `.claude/agents/` definition) on purpose. The orchestrator must run in the main conversation context so it can spawn worker subagents via the Task tool — and a subagent cannot spawn other subagents in Claude Code. A skill is always loaded into the main session, so this constraint is satisfied structurally. **Do not** convert this into an agent definition.

## Arguments

This pipeline runs for the plan: **$ARGUMENTS**

If no plan name was provided, list available plans from the `plans/` directory and ask the user to pick one.

## Pre-flight Checks

Before starting:

1. Read `plans/<plan-name>/plan.md`
2. Verify the plan status is "approved" (not "draft"). If draft, tell the user to approve it first via `/plan-work`.
3. Check the **Work Type** field to determine which agents to run:
   - `daemon` → skip web agents; run the E2E steps only if the plan defines `E*` acceptance criteria (a daemon-only change can still be E2E-observable through the dashboard)
   - `web` → skip daemon agents
   - `full-stack` → run all agents
3a. Check the **E2E Scope** field (plans before 2026-08-25 lack it — infer from the `E*` criteria and say so):
   - `new-specs` → Step 1 authors tests; expected verdict `authored`
   - `harness-only` → the plan's E2E deliverable is an edit to `web/e2e/helpers/*` or fixtures with no new spec (e.g. m4's space-bearing data dir); Step 1 still runs e2e-specs, expected verdict `harness-only`; Step 5 runs as the full-suite sweep
   - `none` → skip Steps 1 and 5
4. Determine the project root (the directory containing `.claude/`)
5. Update plan status to "in-progress"

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
- Spawn daemon-impl and web-impl simultaneously using two Task tool calls in a single message
- Wait for both to complete
- Then spawn daemon-tests and web-tests simultaneously
- Wait for both to complete
- Then run E2E Validate & Repair (Step 5) — a single agent, not parallel
- Then run review

For `daemon` or `web` only plans, run the relevant track sequentially. Skip Steps 1 and 5 for `daemon` plans with no `E*` criteria (no E2E tests were authored).

## Agent Invocation

Spawn each step as a subagent using the Task tool with the step's own `subagent_type`:

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
5. **Require path enumeration for Critical/Major fixes** — always include:
   ```
   For each Critical or Major issue, enumerate in your Fix Attempt section EVERY code
   path that reaches the defect and state how each one is now closed. When an issue
   names a category ("clear-rebind and plain re-bind"), the fix must close every door
   in the category, not just the branch the reviewer's example used.
   ```
   Learned from m1-sessions: a Critical naming two paths got a one-path fix, and the
   identical bug came back through the other path a full review cycle later.

### Step 1: E2E Specs Agent

Spawn `subagent_type: "e2e-specs"` with prompt:
```
Execute in AUTHORING MODE the E2E specs task for plan: <plan-name>
Project root: <project-root>

The implementation does not exist yet, so your tests are expected to fail if executed. Your gate
is the collection check only. Finish with Verdict: authored — do not report `pass`.
```

For an `E2E Scope: harness-only` plan, replace the last sentence with:
```
This plan authors no new spec: its E2E deliverable is the harness/fixture edit named in the
plan's Affected Files. Make that edit, prove collection is still clean, list the existing
spec files the change now covers, and finish with Verdict: harness-only — not `authored`
(nothing was authored) and not `pass` (nothing ran).
```

Wait for completion. Verify `plans/<plan-name>/test-specs.md` was created and reports `**Verdict**: authored` (or `harness-only` for a harness-only plan). A `pass` verdict here means the agent misread its mode — the feature cannot exist yet. Step 5 is where these tests are proven to actually run.

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

Wait for both to complete. Verify both output files were created.

**For daemon-only or web-only** — spawn just the relevant agent.

### Step 3: Test Agents

**For full-stack plans** — spawn BOTH in the same message (parallel):

`subagent_type: "daemon-tests"` and `subagent_type: "web-tests"`, each with:
```
Execute the <daemon|web> testing task for plan: <plan-name>
Project root: <project-root>
```

Wait for both to complete.

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
- `plans/<plan-name>/test-specs.md` does not exist, or reports `Tests created: 0`
- The spec file(s) named in test-specs.md's Tests table do not exist on disk
- `npx playwright test --list` (run from `web/`) lists 0 tests from those files

No port pre-flight is needed: the Playwright config allocates a fresh per-run port and never reuses an existing server. If that config property has been changed, treat it as a Critical defect and stop.

Spawn `subagent_type: "e2e-specs"`:
```
Execute in VALIDATE MODE for plan: <plan-name>
Project root: <project-root>

Implementation and unit tests are complete. Run your spec file(s) live and repair your own
locators. This is validate attempt <N> of 2.
Spec file(s): <paths from the File column of test-specs.md's Tests table>
Read plans/<plan-name>/daemon-implementation.md and
plans/<plan-name>/web-implementation.md for what was built and where.
Rebuild before running (make build web-build — the harness serves prebuilt binaries, so a stale
web/dist means you are testing the previous tree; note `make web-build` runs tsc over web/e2e/ too,
so a type error in any spec — including a throwaway one — fails the build and leaves dist stale), and
once your own file passes, sweep the FULL suite (make e2e) per your Validate Mode step 5:
pre-existing specs superseded by this plan's approved protocol delta are yours to update
as sanctioned breakage; failures the delta does not explain are implementation-bugs.
You may NOT change implementation code, and you may NOT weaken or delete an assertion to make
a test green. If the only way to pass is to weaken the test, report implementation-bug.
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
```

**Review Retry Logic**: If the review verdict is `needs-changes`:

1. Read `review.md` and bucket every tagged issue by tag: `[daemon-impl]`, `[web-impl]`, `[daemon-tests]`, `[web-tests]`, `[e2e-specs]`. Issues tagged `[orchestrator]` are yours — never spawn an agent for them; handle them in the Doc-Upkeep Backstop / Completion step.
1a. **Decision items first.** For every issue tagged `[orchestrator:decision]`, run the `decide` skill (`.claude/skills/decide/SKILL.md`) **before** spawning any fix wave: two `debater` agents argue the two options directly to each other, a fresh `judge` breaks a tie, and `plans/<plan>/decisions/<slug>/decision.md` records the outcome. Quote the outcome verbatim in the fix-wave prompt of the agent that implements it. Max 2 debates per run; a third decision item, or any item on the skill's never-debated list (protocol contract, scope, a recorded SPEC decision, spending money), stops the pipeline and asks the user. Learned from m4-reconcile: two decision items were carried through three review cycles, one was then decided inside a fix wave by an impl agent and produced the next cycle's Critical.
2. **Do not fan all five out at once — they are not independent.** Group the non-empty buckets into waves per `## Fix Wave Ordering` below, and run the waves strictly in order. Within a wave, spawn its agents in parallel (multiple Task calls in one message); between waves, wait for completion and run the wave's gate.
3. If a wave's gate fails, that wave's fix was incomplete. End the cycle there — count it against the review budget and report — rather than starting the next wave on a broken tree.
4. **MANDATORY**: after the last wave completes and its gate passes, re-run the full suite fresh:
   - `go build ./...` and `make test` — exit 0
   - `make lint` — exit 0
   - `make web-build` and `make web-test` — exit 0
   - `make e2e` — required whenever this cycle included a `[daemon-impl]`, `[web-impl]` or `[e2e-specs]` wave. May be skipped only for a cycle whose waves were unit-test-only. If wave 3's gate already ran the full suite and nothing has changed since, that run satisfies this requirement — do not run it twice.
   - Every line of the plan's ```checks block (see `## Final Validation`)
   - If any of these fail, the fix was incomplete — count it against the retry budget
5. Only AFTER all of the above pass, re-spawn the review agent.
6. Increment `retry_counts["review"]` **once per cycle**, not once per wave. Max 3 review cycles total.

**The sequence is always: wave 1 → gate → wave 2 → gate → wave 3 → gate → full test run → review. Never skip the test step, and never start a later wave before an earlier one has landed.**

### Review Cycle Exhaustion

If all 3 review cycles are used and the final verdict is still `needs-changes`:
1. Do NOT mark the pipeline as "completed"
2. Update orchestration state to `status: "blocked"`, `current_step: "review"`
3. Report to the user exactly what issues remain, referencing the review.md file
4. Ask the user whether to: (a) continue with more review cycles, (b) fix manually, or (c) abort. (Decision items are never the reason to reach this point — they are settled by the `decide` skill in cycle 1a.)

**CRITICAL**: The pipeline can ONLY be marked "completed" when the review verdict is "approved". Any other verdict means the pipeline is either "in-progress" or "blocked". Never override a review verdict.

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
- **Both impl agents tagged** → they run in parallel; their file trees are disjoint (`cmd/`/`internal/` vs `web/src/`). **Exception:** if any review issue asks for a change to the protocol contract (the plan's **Protocol Contract** section or `docs/protocol.md`), do NOT run them in parallel. Stop and report to the user. The contract is the shared source of truth that lets the two agents work independently at all, and neither may redefine it unilaterally.
- **Wave-1 web gate vs test-file compilation** (learned from m2-terminal): `make web-build` runs `tsc` over test files too, so a *sanctioned* wave-1 signature change can fail the gate purely inside a test file that only wave 2 may edit. The gate still passes iff **all** of: (a) the tsc failures are confined to `*.test.ts` files the impl agent's Handoff explicitly names as needing the wave-2 update, (b) `tsc --noEmit` with those test files excluded exits 0, and (c) a standalone `vite build` exits 0 — the impl agent must paste (b) and (c) as evidence. Any failure outside the named test files is a real gate failure. The wave-2 gate (`make web-test`, and full `make web-build` before review) then proves the handoff was honoured.
- **Plan amendments mid-run** (learned from m2-terminal, where the plan's own REQ contradicted its acceptance criteria): a review issue may prove a plan requirement wrong. Protocol-contract changes always stop the pipeline (rule above). A **non-protocol** requirement may be amended by the orchestrator without stopping iff all of: the review demonstrates the defect **by measurement** (not argument), the amendment restores consistency with the plan's own acceptance criteria or a structural decision the user already approved, and the amendment is recorded in three places — an *Amended* note inline in the plan's requirement citing the review issue, a SPEC.md changelog entry, and the completion summary to the user. If the amendment would change scope or contradict a decision the user made, stop and ask instead.
- **Every wave-3 prompt says "rebuild first (`make build web-build`)"** and every `make e2e` you run yourself is preceded by `make web-build`. The harness serves prebuilt binaries; a stale `web/dist` silently tests the previous tree (m4-reconcile review cycle 4 briefly measured a defect that was already fixed in source for exactly this reason).
- **`[e2e-specs]` always lands in wave 3**, even when its issue looks self-contained. A locator repaired against pre-fix markup is worthless, and its fix mode ends in a live run — which must happen against the post-fix tree.
- **New user-facing behaviour added by a fix wave must get E2E coverage in the same cycle.** When a cycle's `[web-impl]`/`[daemon-impl]` fixes *add* user-visible behaviour (a new error display, marker, shortcut, field), the wave-3 e2e-specs prompt must include: "read this cycle's ## Fix Attempt sections in both implementation logs and assert any new user-facing behaviour they added" — and e2e-specs runs in wave 3 for this purpose **even with no tagged `[e2e-specs]` issue** (this is a concrete coverage task, so it doesn't violate the never-spawn-with-nothing-to-fix rule). Learned from m1-sessions: seven behaviours shipped untested because the unit-test agent correctly said "DOM is Playwright's job" while e2e-specs was only prompted with its one tagged issue — the gap lives *between* agents, and only the orchestrator sees all waves.
- **This same wave order governs `implementation-bug` verdicts** from Step 4 and Step 5, not just review cycles. When Step 5 reports `implementation-bug`: run the routed impl agent (wave 1), gate, re-run that side's unit test agent (wave 2), gate, then re-spawn Step 5 (wave 3).
- **Two agents may never be spawned concurrently if one may write a file the other may write.** The wave table already guarantees this for the five pipeline tags; apply the same test before any ad-hoc parallel spawn.

## State Tracking

After each agent completes, update `plans/<plan-name>/orchestration-state.json` **via the
bundled script** — never by hand-editing or ad-hoc Python (the m4 run lost a step to a
stale `cd`). Run from the project root:

```bash
S=.claude/skills/orchestrate/scripts/orch-state.py
python3 $S <plan> init                              # pre-flight, fresh plan
python3 $S <plan> done <step> --next <next-step>    # after a step's verdict is read
python3 $S <plan> retry <step>                      # each fix/validate/review cycle
python3 $S <plan> status blocked --step <step>      # on exhaustion
python3 $S <plan> status completed                  # only after review = approved
python3 $S <plan> reopen <step>                     # resume from blocked/completed (keeps retry count; add --reset-retries only when the user grants a fresh budget)
python3 $S <plan> show
```

The file it maintains has this shape:

```json
{
  "plan_name": "<plan-name>",
  "status": "in-progress",
  "current_step": "review",
  "retry_counts": {
    "e2e-specs": 0,
    "daemon-impl": 0,
    "web-impl": 0,
    "daemon-tests": 0,
    "web-tests": 0,
    "e2e-validate": 0,
    "review": 1
  },
  "completed_steps": ["e2e-specs", "daemon-impl", "web-impl", "daemon-tests", "web-tests", "e2e-validate"],
  "failed_steps": [],
  "started_at": "<timestamp>",
  "updated_at": "<timestamp>"
}
```

### Resume Logic

When `/orchestrate` is invoked for a plan that already has an `orchestration-state.json`:

1. Read the state file
2. Determine how to proceed based on `status`:

**`"in-progress"`** — Resume from `current_step`:
- Skip any step listed in `completed_steps`
- For the `current_step`, check if there's an existing output file with a verdict:
  - If the verdict is `needs-changes` or `implementation-bug`, enter the retry loop for that step (respecting existing `retry_counts`)
  - If no output file exists, run the step fresh
- `test-specs.md` is written by **both** `e2e-specs` (Step 1) and `e2e-validate` (Step 5). Read its `**Mode**` field, not just its existence: `Mode: authoring` with `Verdict: authored` or `harness-only` means Step 1 completed and Step 5 has not run. **Never treat `Verdict: authored`/`harness-only` as satisfying Step 5.**
- Continue the pipeline from there

**`"blocked"`** — The pipeline previously hit max retries or an unrecoverable error:
- Report what failed (read `current_step` and the relevant output file)
- Ask the user: resume from the failed step (reset its retry count), or abort?
- If resuming: set `status` back to `"in-progress"`, reset the retry count for the blocked step to 0, and re-enter the pipeline at `current_step`

**`"completed"`** — The pipeline previously finished, but the user wants to re-run:
- Ask the user which step to re-run from (typically `"review"`)
- Set `status` to `"in-progress"`, set `current_step` to the chosen step, remove it from `completed_steps`, and resume from there

## Final Validation

Before marking the pipeline as completed, run the baseline gates fresh and verify each passes:

```bash
# Daemon
go build ./...          # Must exit 0
make test               # Must show all tests passing, exit 0
make lint               # Must exit 0

# Web
make web-build          # Must exit 0 (tsc + Vite)
make web-test           # Must show all tests passing (Vitest)

# E2E (whenever e2e-specs ran)
make e2e                # Must show all tests passing
```

Then run the plan's **authored acceptance checks**. Locate the block:

```bash
grep -n '^```checks' plans/<plan-name>/plan.md
```

Each line in that block is `<ID> <single-line shell command>`. Run each command from the project root exactly as written; it passes iff it exits 0. Report results by ID. Dedupe by exact command string against the baseline gates above: run each distinct command once, but report it under every ID that claims it.

**Every baseline gate and every authored check must pass.** If any fail, the pipeline is NOT complete — investigate and fix before proceeding.

If the plan has no ```checks block, run the baseline gates and state in the completion summary that the plan predates the Automated Checks convention. Do NOT parse the prose criteria for backticked commands to substitute — a prose criterion routinely combines one runnable clause with several that are not, and running only the runnable clause reports a pass the plan never earned.

Do NOT rely on cached test results or previous agent verdicts. Run the commands fresh. Agent verdict files may be stale if fixes were applied after the test agent last ran.

## Doc-Upkeep Backstop

CLAUDE.md's "Doc upkeep" section binds every session, this pipeline included. **You verify and amend — you are the backstop, not primarily the author.**

Do this after Final Validation passes and before marking the pipeline completed:

1. Read the implementation logs (including `## Fix Attempt` sections) so you know what actually shipped. You don't need to re-read source.
2. Check, and fix what's missing:
   - **`TODO.md`** — if this plan finishes a backlog item (or a sub-bullet of one), tick it. If the work surfaced a new follow-up, add it to the right milestone rather than letting it evaporate.
   - **`SPEC.md` changelog** — if the pipeline changed or settled a decision (a deviation recorded in an impl agent's `## Decisions`, a contract adjustment the user approved mid-run), add a changelog entry. Routine implementation of already-settled decisions needs no entry.
   - **`spikes/canary-fields.md`** (and `spikes/FINDINGS.md` if substantive) — if the work exposed a new **measured** wire-format fact about Claude Code. Only measured facts, never assumptions.
   - **`docs/protocol.md`** — must match what shipped. If plan-work merged the delta at approval and an approved mid-run adjustment changed it, reconcile the doc now.
3. If nothing qualifies, say so in the completion summary rather than inventing entries.

State what you found and changed in the completion summary.

## Completion

When all steps pass AND the review verdict is "approved":
1. Verify the review.md file on disk contains `**Verdict**: approved` — do NOT rely on memory
2. Run the Doc-Upkeep Backstop above
2a. Resolve every `[orchestrator]`-tagged issue in review.md: do the doc edit, or record it as a TODO.md entry in the right milestone if it is genuinely follow-up work. List each one and its disposition in the completion summary. An approved review may carry these; a `completed` pipeline may not leave them unaddressed.
3. Update plan status to "completed"
4. Update orchestration state status to "completed"
5. Print a summary: what was done, files changed, retry count, and any notable issues
6. **Decisions section** — for every debate run this pipeline (`plans/<plan>/decisions/*/decision.md`): the two options, the outcome, consensus-or-judged, the decisive argument in one or two sentences, and any dissent. The user may overrule with one line; if they do, `reopen` the affected wave and re-run it with the user's choice quoted.

**NEVER mark the pipeline as completed if:**
- The review.md verdict is anything other than "approved"
- Any test suite has failing tests
- Build failures exist in either the daemon or the web tree

## Error Handling

- If any agent produces no output file, treat it as a failure and retry
- If an agent times out, retry once before reporting to user
- If max retries are exceeded at any step, stop the pipeline, update state to "blocked", and report which step failed and why
- Always preserve output files from failed runs — append a `.failed.<N>` suffix before retrying
