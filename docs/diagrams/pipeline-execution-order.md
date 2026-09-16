---
id: pipeline-execution-order
type: diagram
status: active
date: 2026-09-15
kind: flow
summary: The whole feature pipeline — spec, plan-work, orchestrate's stages and their retry loops, retro and land — and the gate each step refuses at.
features: []
tags: [pipeline]
files: [.claude/skills/spec/SKILL.md, .claude/skills/plan-work/SKILL.md, .claude/skills/orchestrate/SKILL.md, .claude/skills/retro/SKILL.md, .claude/skills/land/SKILL.md, .claude/agents/*.md]
tests: []
refs: [kb:adr/process-doc-reconcile-after-review, kb:lesson/squash-merge-never-empties-log-range, plans/_audit/diagrams-from-code.md]
---
One feature, end to end. Each arrow into a skill is a gate that refuses rather than warns:
`/plan-work` refuses a spec whose `Status` is not `Approved`; `/orchestrate` refuses a `draft`
plan or any `plan-lint` FAIL and spawns nobody; `/land` refuses a review verdict that is not
`approved`, a dirty tree, or a `proposed` ADR still carrying this plan's name.

Inside `/orchestrate`, a full-stack plan runs both tracks; a `daemon` or `web` plan drops the
other track's two boxes, and an E2E Scope of `none` drops both E2E stages. E2E Specs authors
against a feature that does not exist yet, so it gates on collection, never on a pass. Each
tester starts as soon as its own track is green — the daemon tester never waits for the web
coder. Doc Reconcile is reached only by an `approved` review, and only its `reconciled` verdict
completes the run (kb:adr/process-doc-reconcile-after-review). Retry budgets and the wave
ordering a `needs-changes` verdict follows are in the orchestrate skill's tables, not here.

`/retro` runs in the session that ran `/orchestrate`, while the stumbles are still in context,
and commits on the plan branch so its changes ride `/land`'s squash — which is why it comes
before the merge, not after.

```mermaid
%%{init: {"layout": "dagre", "flowchart": {"curve": "stepAfter"}}}%%
flowchart TD
    SPEC["/spec — interview, requirements as observable consequence"] -->|Status: Approved| PW["/plan-work — protocol delta, Testable UI, Doc Delta, checks block"]
    SPEC -.->|Status: Draft — refused| SPEC
    PW -->|user approves, plan-lint green, proposed ADRs written| ORCH

    subgraph ORCH["/orchestrate — branch plan/&lt;name&gt;"]
        direction TB
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
        DR -->|reconciled| C[Completion — accept ADRs, record closes]
    end

    ORCH --> RETRO["/retro — one lesson or nothing, commits on the plan branch"]
    RETRO --> LAND["/land — squash to main, closes #N, push, delete branch"]
    ORCH -.->|blocked verdict — never completed| USER([Back to the user])
    LAND -.->|verdict not approved, or a proposed ADR remains| USER
```

Trivial fixes and doc work skip all of this; the pipeline is for anything with acceptance
criteria.
