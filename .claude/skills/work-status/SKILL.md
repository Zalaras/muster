---
name: work-status
description: "Shows progress on one or all plans. Reads plan directory and summarizes pipeline status."
argument-hint: "[plan-name]"
allowed-tools: Read, Glob, Bash
---

> **Maintainer note:** This command lives in a skill and runs in the main session, on your session model. It's read-only and could run as a cheap subagent, but it's kept inline for simplicity (a status read is trivial and fast).

You are the status agent. Your job is to quickly read the plan directory and present a clear summary of where things stand.

## Arguments

This command was invoked with: **$ARGUMENTS** (optional `<plan-name>`)

- If a plan name is given, show detailed status for that plan
- If no plan name is given, list all plans and their high-level status

## All Plans Overview

When no plan name is given:

1. List all directories under `plans/`
2. For each, read `plan.md` and extract the Status and Work Type fields
3. Check which output files exist
4. Present a summary table

Format:
```
| Plan | Status | Work Type | Steps Completed | Current Step |
|------|--------|-----------|----------------|--------------|
| session-list-ui | in-progress | full-stack | 3/7 | daemon-tests |
```

The pipeline has **7 steps**: e2e specs (authoring), daemon impl, web impl, daemon tests, web tests, e2e validate, review. Steps a plan's Work Type skips (web agents for `daemon` plans, daemon agents for `web` plans, the E2E steps for `daemon` plans without `E*` criteria) — count those out of the total rather than showing them as pending forever.

## Detailed Plan Status

When a plan name is given:

1. Read `plans/<plan-name>/plan.md` for overview
2. Read `plans/<plan-name>/orchestration-state.json` if it exists
3. Check which output files exist and read their **Verdict** fields (for test and review files)
4. Present detailed status

Format:
```
# Status: <Plan Name>

**Status**: <from plan.md>
**Work Type**: <daemon/web/full-stack>

## Pipeline

| Step | Status | Verdict | Details |
|------|--------|---------|---------|
| Plan | done | — | Approved |
| E2E Specs (authoring) | done | authored | 5 tests created, collection clean |
| Daemon Impl | done | — | 3 files created |
| Daemon Tests | done | pass | 10/10 passing |
| Web Impl | done | — | 4 files created |
| Web Tests | in-progress | impl-bug | 8/10 passing, 2 impl bugs |
| E2E Validate | pending | — | — |
| Review | pending | — | — |

## Retries

Daemon: 0 | Web: 1 | E2E Specs: 0 | E2E Validate: 0 | Review: 0

## Knowledge

Per feature in the plan's `**Features**`: `go run ./tools/kb ls --feature <f>` — <N> proposed
ADR(s) with `refs: plan:<plan>`, <M> accepted, <K> fact(s). A `completed` plan with a
`proposed` ADR has not finished Completion 2e.

## Current Issues (if any)

<summary of failing tests or review issues>
```

`test-specs.md` is written by both the authoring step and the E2E Validate step — read its **Mode** field to tell them apart. `Mode: authoring` / `Verdict: authored` means E2E Validate has **not** run yet; don't report it as done. If E2E Validate was skipped, show `skipped` with the reason from `completed_steps` rather than `pending`.

Retry counts come from `retry_counts`; `e2e-validate` counts validate re-invocations, `e2e-specs` counts authoring plus review-routed fixes.

## Behaviors

- Be fast — just read and summarize, don't run any tests or builds
- Use output file summaries and verdict fields rather than re-reading all code
- If a file doesn't exist, mark that step as "pending"
- Present information clearly and concisely
