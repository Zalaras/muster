---
id: pipeline-execution-order
type: diagram
status: active
date: 2026-09-15
kind: flow
summary: The order /orchestrate runs its stages in, which pairs run in parallel, and where a failing verdict sends work back.
features: []
tags: [pipeline]
files: [.claude/skills/orchestrate/SKILL.md, .claude/agents/*.md]
tests: []
refs: [kb:adr/process-doc-reconcile-after-review]
---
Stage order for a full-stack plan. A `daemon` or `web` plan drops the other track's two boxes; an
E2E Scope of `none` drops both E2E stages. Retry budgets and the wave ordering a `needs-changes`
verdict follows are in the orchestrate skill's tables, not here.

```mermaid
flowchart TD
    S[E2E Specs — authoring only] --> DI[Daemon Impl]
    S --> WI[Web Impl]
    DI --> DT[Daemon Tests]
    WI --> WT[Web Tests]
    DT -->|implementation-bug| DI
    WT -->|implementation-bug| WI
    DT --> V[E2E Validate and Repair]
    WT --> V
    V -->|implementation-bug| DI
    V -->|implementation-bug| WI
    V --> R[Review — full suite, Opus]
    R -->|needs-changes, in waves| DI
    R -->|needs-changes, in waves| WI
    R -->|approved| DR[Doc Reconcile]
    DR -->|contradiction| R
    DR -->|reconciled| C[Completion]
```

E2E Specs authors against a feature that does not exist yet, so it gates on collection, never on a
pass. Each tester starts as soon as its own track's implementation is green — the daemon tester
never waits for the web coder. Doc Reconcile is reached only by an `approved` review, and only its
`reconciled` verdict completes the run.
