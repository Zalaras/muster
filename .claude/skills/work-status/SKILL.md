---
name: work-status
description: "Shows progress on one or all plans. Reads plan directory and summarizes pipeline status."
argument-hint: "[plan-name]"
allowed-tools: Read, Glob, Bash
---

> Maintainer note: read-only and inline in the main session for simplicity; it could run as a cheap subagent.

Read the plan directory and summarise where things stand. This is a read of files already on disk:
use output-file summaries and **Verdict** fields rather than re-reading code, and run no tests or
builds.

## Arguments

This command was invoked with: **$ARGUMENTS** (optional `<plan-name>`)

- If a plan name is given, show detailed status for that plan
- If no plan name is given, list all plans and their high-level status

## All Plans Overview

When no plan name is given:

For each directory under `plans/`, take Status and Work Type from `plan.md` and progress from
`orchestration-state.json` (or, without one, from which output files exist):

```
| Plan | Status | Work Type | Steps Completed | Current Step |
|------|--------|-----------|----------------|--------------|
| session-list-ui | in-progress | full-stack | 3/8 | daemon-tests |
```

The pipeline has **8 steps**, in `orch-state.py`'s `STEPS` order: `e2e-specs` (authoring),
`daemon-impl`, `web-impl`, `daemon-tests`, `web-tests`, `e2e-validate`, `review`, `doc-reconcile`.

**Missing vs skipped.** A step the plan's Work Type or E2E Scope skips (web steps for `daemon`
plans, daemon steps for `web` plans, the E2E steps for `daemon` plans without `E*` criteria or
with `E2E Scope: none`) is `skipped` — count it out of the total, and give the reason from
`completed_steps` when there is one. Any other step whose output file does not exist yet is
`pending`.

## Detailed Plan Status

When a plan name is given:

Read `plan.md`, `orchestration-state.json` if it exists, and the **Verdict** field of each
output file that exists:

```
# Status: <Plan Name>

**Status**: <from plan.md>
**Work Type**: <daemon/web/full-stack>

## Pipeline

| Step | Status | Verdict | Details |
|------|--------|---------|---------|
| Plan | done | — | Approved |
| e2e-specs (authoring) | done | authored | 5 tests created, collection clean |
| daemon-impl | done | — | 3 files created |
| web-impl | done | — | 4 files created |
| daemon-tests | done | pass | 10/10 passing |
| web-tests | in-progress | implementation-bug | 8/10 passing, 2 impl bugs |
| e2e-validate | pending | — | — |
| review | pending | — | — |
| doc-reconcile | pending | — | — |

## Retries

e2e-specs: 0 | daemon-impl: 0 | web-impl: 0 | daemon-tests: 0 | web-tests: 1 | e2e-validate: 0 | review: 0 | doc-reconcile: 0

## Knowledge

Per feature in the plan's `**Features**` and `**Touches**`: `go run ./tools/kb ls --feature <f>` — <N> proposed
ADR(s) with `refs: plan:<plan>`, <M> accepted, <K> fact(s). A `completed` plan with a
`proposed` ADR has not finished Completion step 4.

## Current Issues (if any)

<summary of failing tests or review issues>
```

`test-specs.md` is written by both the authoring step and the E2E Validate step — read its **Mode** field to tell them apart. `Mode: authoring` / `Verdict: authored` means E2E Validate has **not** run yet; report it as pending (or skipped, per the rule above), not done.

Retry counts come from `retry_counts`, keyed by the same step names; `e2e-validate` counts validate re-invocations, `e2e-specs` counts authoring plus review-routed fixes, and `review` counts review cycles.
