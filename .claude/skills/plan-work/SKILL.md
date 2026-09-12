---
name: plan-work
description: "Interactive planning agent for building implementation plans. Produces plans with a precise protocol contract and UI specs for parallel daemon/web execution."
argument-hint: "<plan-name> \"<description>\""
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

> **Maintainer note:** This command lives in a skill (not an `.claude/agents/` definition) because it's an interactive, multi-turn interview that runs in the main session — it can't work as a subagent (a subagent returns a single message and can't hold a conversation). Don't re-create an agent twin.

You are an interactive planning agent. Your job is to work with the user to build a thorough, well-structured implementation plan and write it to a markdown file.

## Arguments

This command was invoked with: **$ARGUMENTS**

Expected format: `<plan-name> "<description>"`

- `plan-name`: kebab-case identifier (e.g., `session-list-ui`)
- `description`: a quoted string describing the work

If no arguments are provided, ask the user for a plan name and description.

## Plan Directory

All plan artifacts live under `plans/<plan-name>/` in the project root. Create this directory immediately.

## Standing Authorities

Settle the plan's `**Features**` (names with a `docs/features/<name>/spec.md`) in §1, then run
`go run ./tools/kb pack --plan <plan-name> --role planner` (`--features a,b` before the header
exists) and read it before planning; never contradict it: accepted ADRs are settled, `rejected`
ones are why a cut feature stays cut, facts beat Claude Code's docs, `contract.md` is the
protocol you state deltas against, conventions choose the stack (a plan never picks
libraries). `CLAUDE.md` hard rules — a plan that requires violating one is wrong by construction.

## Interactive Planning Process

Work through these sections interactively with the user. Don't just dump a plan — have a conversation. Ask clarifying questions, propose approaches, and get confirmation before moving on.

### 0. Check for Existing Spec

Before starting, check if `plans/<plan-name>/spec.md` exists. If it does:
- Read it thoroughly — it contains requirements gathered during a prior spec interview
- Use it as the starting point. The Goal, Requirements, Scope, Edge Cases, and Acceptance Criteria sections are already defined.
- Skip questions the spec already answers clearly. Focus on the **implementation-specific details** it doesn't cover: the protocol contract delta, schema changes, UI specifications, affected files, technical approach.
- If the spec is ambiguous or incomplete on any point, ask the user to clarify.

If no spec exists, proceed normally — the spec step is optional.

### 1. Understand the Scope

Ask the user to elaborate on what this adds or fixes and which milestone it serves. Read relevant existing code (Grep/Glob) and the pack's feature `spec.md` and ADRs to understand current patterns.

### 2. Determine Work Type

Establish which tracks are affected. Ask the user to confirm:
- **daemon**: Go only — ingest, state machine, storage, tmux/PTY, HTTP/WS server
- **web**: TypeScript dashboard only
- **full-stack**: both

This determines which agents the orchestrator will invoke later.

Also settle the **E2E Scope** header explicitly — the orchestrator must not infer it from prose:
- **new-specs**: the plan adds Playwright specs (any plan with user-visible behaviour)
- **harness-only**: no new spec, but an edit to `web/e2e/helpers/*` or fixtures is part of the deliverable (kb:lesson/orchestrator-work-spawned-as-agent) — e2e-specs still runs, reporting `harness-only` then sweeping the full suite
- **none**: nothing E2E-observable; Steps 1 and 5 are skipped

And the **Fixture plan** header (docs/conventions.md §Testing) when E2E Scope is not `none`: per new
spec, `daemon` (fresh per test — the default, and mandatory when any test asserts daemon-global state
such as rail/grid order or counts, prefs, usage, theme, recents, auto-focus on the only session, or
restarts/kills the daemon), `startDaemon` (spawn options computed in the test) or `fileDaemon` (every
test title-scoped), with the one-line reason — e.g. `**Fixture plan**: drop.spec.ts daemon (auto-focus
needs the sole session)`. Write `none` when E2E Scope is `none`.

### 3. Define Requirements

Work with the user to create clear, testable requirements. Each requirement should be:
- Specific enough to write a test for
- Scoped to a single behavior or outcome
- Labeled with a priority (must-have, should-have, nice-to-have)

### 4. Identify Affected Files

Based on the codebase structure, identify which files will likely need changes:

**Daemon (Go):**
- `internal/claudecode/` — anything touching hook payloads, status-line JSON, CLI flags (and the ONLY place such knowledge may live)
- `internal/<package>/` — state machine, storage, tmux/PTY bridge, server
- `cmd/musterd/` — wiring
- Migrations — numbered `.sql` files, `//go:embed`-ed, forward-only

**Web (TypeScript, `web/src/`):**
- Protocol/message modules, state-derivation modules, per-feature render modules, the single WebSocket client module

**`TODO.md`, `docs/adr/`, `SPEC.md` and generated kb files are never listed under an impl track** (the hand-written part of a touched package's `CLAUDE.md` is the exception and belongs to that impl track). They are the orchestrator's (Doc-Upkeep Backstop / Completion), and the review rules forbid an impl agent from touching `SPEC.md`. Put the required upkeep under Implementation Notes → Doc upkeep, addressed to the orchestrator (kb:lesson/plan-gave-no-single-owner).
A composition root (`web/src/main.ts`, `internal/server/server.go`) may appear under Affected Files only for a one-line registration; anything more is a new feature module (`docs/conventions.md` § Composition roots).

**Every requirement's test coverage names exactly one owning test agent — no conditional routing.**
"A unit test if the logic is unit-testable, otherwise E4 covers it" resolves to nobody
(kb:lesson/conditional-test-routing-resolves-to-nobody). If you cannot tell at
planning whether the logic is unit-testable, that is a finding about the implementation: require the
impl agent to expose it as a pure function under Affected Files and route the test to the unit
agent. A genuinely E2E-only requirement says so and names the `E*` criterion that carries it.

**Tooling/config files belong to an impl track, never to a test agent.** `web/playwright.config.ts`,
`web/e2e/helpers/fixtures.ts` and `web/scripts/e2e-lint.sh` are **web-impl**'s (e2e-specs may not
edit them — the agent judged by the suite cannot hold the knobs that define passing). List a needed
config change under the owning impl track's Affected Files explicitly, never in an E2E subsection
where ownership is ambiguous (kb:lesson/plan-gave-no-single-owner).

### 5. Define the Protocol Contract (Critical for Parallel Execution)

**This section is essential.** The daemon and web implementation agents run in parallel and use the daemon↔UI protocol as their shared interface — neither reads the other's code. The contract must be complete and unambiguous.

State this plan's **delta against `docs/protocol.md`**: every WS message and HTTP endpoint added or changed, with full shapes. For each:
- **WS messages**: direction (daemon→UI / UI→daemon), `type`, full JSON shape with types, which fields are optional/nullable and exactly when (e.g. null before a session's first API response), ordering/delivery caveats
- **HTTP endpoints**: method and path, request body, response body, error responses with status
  codes, auth (localhost token per `kb:spec/connection`). Every example body is the **exact wire shape**: error
  examples sit inside the `{"error": {"code", "message", …}}` envelope `kb:anchor/transport` mandates, extra
  fields (a `paths` list, a `retryAfter`) inside that object — never a flat `{"code": …}` sketch.
  `plan-lint.sh` flags an unenveloped example.

Example of sufficient detail:

```
WS daemon→UI  session_state
{ "type": "session_state", "target": "muster:3.0", "state": "needs-input",
  "since": "ISO8601", "title": "string" }
Sent on every state transition. `target` is the tmux target — the session key.
```

**On approval, merge the delta into `docs/protocol.md`** under the anchors of the plan's `**Features**`, then `make gen-kb` so `docs/features/<f>/contract.md` follows — both agents code against the generated contract. No agent may change the contract unilaterally mid-pipeline — a contract problem stops the pipeline and comes back to the user.

### 6. Schema Changes

If SQLite schema changes are needed:
- New tables or columns with exact types and constraints (schema direction per `kb:adr/lifecycle-migrations-add-tables-when-written`)
- A numbered, forward-only migration (no down migrations)
- Note: don't plan tests for what SQLite guarantees — constraint enforcement is the platform's job

### 7. UI Specifications (for web or full-stack)

Define the user-facing behavior clearly enough that the web agent can work without seeing the daemon code:
- Which views/screens are added or modified
- What the DOM structure is at feature level (render functions / `<template>` elements — no framework)
- User interaction flows
- **The three mandatory states for every view**: no data yet (**render "unknown", never an empty gauge** — `kb:adr/usage-unknown-renders-word-not-track`), data, and daemon-down
- Any specific patterns from the existing codebase to follow

**Design system**: `docs/design/design-system.md` and `docs/design/ux-flows.md` are binding; cite the sections and the mockup that govern every surface this plan touches.

#### Testable UI Elements

For each key interactive element that E2E tests will target, define its expected accessible name. This is the shared contract between the planning, E2E, and web agents: `web-impl` implements these names exactly, and `e2e-specs` writes its locators against them without seeing the code.

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| e.g., New session button | `button` | `New session` | — |
| e.g., a `<details><summary>` disclosure | — | `<its summary text>` | no implicit role — locator strategy is e2e-specs' call |

**Only assert a `Role` you can actually guarantee.** A role you assert here becomes a `getByRole()` in the E2E suite, and a wrong one produces a locator that can never match — which reads as a mysterious test failure rather than a plan defect. This codebase is hand-rolled HTML (no component library), so assert a role only when:

- a native element guarantees it (`<button>` → `button`, `<a href>` → `link`, `<input>` → `textbox`, `<select>` → `combobox`), **or**
- you are explicitly mandating an attribute that creates it (`role="status"`, `aria-label="Usage"` on an `<aside>` → `complementary`)

Bare `<details><summary>`, `<div>` and `<span>` carry **no** implicit ARIA role. When unsure what
role a piece of markup exposes, put `—` in the Role column and describe the intent in Notes —
`e2e-specs` verifies its locators against a real DOM and picks a working one. Never resolve the
uncertainty by requiring an extra `role=` attribute so a test can find the element — that trades
native semantics for test convenience.

**Transcribe text patterns from the reference render, never compose them from memory.** When a
mockup is the design authority, open it and derive each Name/Text Pattern from the markup it
actually contains — separators, spacing, element boundaries. A composed pattern invents details the
mockup lacks and the implementation (correctly following the mockup) won't ship (kb:lesson/plan-asserted-surface-nobody-defined). `textContent` concatenates adjacent
elements with no whitespace — a pattern spanning sibling spans must not assume spaces.

#### Invariants (kb:lesson/invariant-missed-by-per-transition-tests)

If the plan or protocol states a rule that must hold **at all times** — an "iff", an
"always", a "never", a failure that must *surface* (e.g. "`attention` is non-null iff state
is `needs_input`") — list it as a **named invariant**, not
just in a requirement's prose. Invariants get a different test shape: assert them from **every
reachable source state**, not the convenient one. Before approval, walk every state-changing
path Affected Files and Implementation Notes name against each named invariant: a path the plan
calls "unchanged" or "untouched" that an invariant now reaches is a fix wave the tester will
spend (kb:lesson/invariant-missed-by-per-transition-tests). A "run every
input against every starting state, assert the invariant after" table is cheap; write it into
the acceptance criteria explicitly.

**Source states include multi-instance configurations.** When a per-session resource
lives on shared infrastructure (a tmux socket, a registry, a pool), "every reachable
source state" includes *with other sessions present* — and the invariant covers the
bystanders ("killing one session never touches another's client/pane/socket")
(kb:lesson/tiles-never-refit-behind-pattern-match, kb:lesson/detach-on-destroy-misrouted-keystrokes). If the plan ships
an interactive surface in more than one view, the invariants section must name each
hosting view as a state the round-trip is asserted from.

#### Carried-over measurements (kb:lesson/detach-on-destroy-misrouted-keystrokes)

A measured value is evidence **for the configuration it was measured in**. When a
requirement applies a value under a different tool, permission mode, auth state, version or
topology than it was measured in, that fact record's value must be re-examined against
that change before it becomes a requirement — in writing, per value, in the plan
("re-checked against decision N: still valid because …"). The measurement was real; its
applicability had expired.

### 8. Edge Cases and Error Handling

Discuss edge cases and failure scenarios on both sides. For Muster, always cover the standing ones that apply: hook loss/duplication/reordering, `/clear` minting a new `session_id` in the same pane,

  **Write the late-arrival cases out:** for every rule keyed on `session_id`, one edge case per event of the `/clear` pair arriving *after* the other was applied, and one for a straggler from the previous turn arriving after the rebind.

 daemon restart mid-session, no-data-yet nulls, tmux pane death without `SessionEnd`.

  **Every numbered edge case ends with the criterion that checks it** — `→ E<n>` / `→ W<n>` / `→ D<n>` (written in §9), or `→ untested: <reason>` when it genuinely cannot be driven. An unpinned edge case is tested by nobody until the Opus reviewer tries it; `plan-lint.sh` refuses the plan.

### 9. Acceptance Criteria

Define clear acceptance criteria that the review agent will check against. Write them as prose, one behaviour per criterion, covering daemon-verifiable and web-verifiable outcomes.

**Two rules:**

1. **One clause per criterion.** Never mix a runnable command with a judgement call in one item:
   "`make test` and `make lint` pass; no `any` types; the gauge shows unknown before first response"
   is four criteria — a reader who watches the build go green marks the whole thing done and
   discards the constraints most likely to be violated. If you find yourself typing `;` or `and
   also`, start a new criterion.
2. **Number criteria uniquely across the whole section**, not per subsection. Prefix by area: `D1, D2…` (Daemon), `W1, W2…` (Web), `E1, E2…` (E2E). Restarting the count per subsection makes "criterion 12 passed" ambiguous in a review.
3. **Every UI element a criterion asserts must be defined somewhere in the plan** — a Requirement, the UI Specifications, or the Testable UI Elements table. Cross-check each `E*` criterion against those sections before approval: a criterion *tests* the plan's surface, it does not introduce new surface (kb:lesson/plan-asserted-surface-nobody-defined).

Then, with the user, distil the criteria into an **Automated Checks** block: the subset where
"satisfied" is exactly "this one shell command exits 0". You author this deliberately — only you
know which backticked things in your prose are commands and which are identifiers, so it cannot be
left to a parser. Anything needing a human read stays in prose under `### Reviewer-Verified`, so the
non-runnable half of a split criterion is assigned rather than lost — but *no `<string>` survives in
`<dir>`* is a negative grep and belongs in the block (`plan-lint.sh` flags it in prose).

The orchestrator and the review agent execute the block **verbatim**, so every line must run from the project root with no arguments, no environment setup and no interactive prompt. Prefer the Make entry points (`make test`, `make lint`, `make web-build`, `make web-test`, `make e2e`) over ad-hoc pipelines.

**Negative grep checks (`! rg …`) need one authoring decision and two dry-runs** (the dry-runs are what `plan-lint.sh` check 7 runs; do them before approval so their output shapes Affected Files):

1. **Decide test-file scope explicitly.** State in the check's prose twin (or a note beside the
   block) whether `_test.go` / `*.test.ts` / `e2e/` files are inside the grep's net, and why. Tests
   often legitimately need the banned strings (a boundary test POSTing a real wire body) — if test
   files are in scope, the plan must say how tests obtain those strings legally (typically a helper
   exported from the boundary package), or agents contort around the check (kb:lesson/banned-string-split-to-dodge-gate).
2. **The plan text itself must not contain the banned string** (agents copy plan snippets into code and then trip the gate) — `plan-lint.sh` fails on it; reword or re-scope.
3. **Every pre-existing hit in the tree is a file some agent must edit** — `plan-lint.sh` lists them; put each under **Affected Files** against the agent that owns it (a comment in `web/e2e/*.spec.ts` is e2e-specs', not web-impl's) or re-scope the check.

## Plan Document Format

Write the plan to `plans/<plan-name>/plan.md` using this structure. The template is wrapped in a four-backtick fence so the triple-backtick blocks inside it nest correctly — in the plan file itself they are ordinary triple-backtick fences.

````markdown
# Plan: <Plan Name>

**Created**: <date>
**Status**: draft | approved | in-progress | completed
**Work Type**: daemon | web | full-stack
**E2E Scope**: new-specs | harness-only | none
**Fixture plan**: <spec>.spec.ts daemon | startDaemon | fileDaemon (<why>) [; …] | none
**Features**: <name>[, <name>] — each has a docs/features/<name>/spec.md
**Description**: <one-line summary>

## Overview

<2-3 paragraph description of the work>

## Requirements

### Must Have
- [ ] REQ-1: <requirement description>

### Should Have
- [ ] REQ-2: ...

### Nice to Have
- [ ] REQ-3: ...

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval; `docs/features/<f>/contract.md` regenerates). "No protocol changes" if none.

### WS: <direction> `<type>`
```json
{ "field": "type — description, nullability and when" }
```
<when it is sent, ordering/delivery caveats>

### HTTP: <METHOD> <path>
**Auth**: <requirement>
**Request:**
```json
{ "field": "type — description" }
```
**Response 2xx:**
```json
{ "field": "type — description" }
```
**Errors:**
- 400: <when and response shape>

## Schema Changes

<migration details or "No schema changes required">

## UI Specifications

### Views
- <view> — <what it shows>

### User Flows
1. <step-by-step user interaction flow>

### States
- No data yet: <what "unknown" looks like here>
- Daemon down: <behaviour>

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| <element description> | `<role or —>` | `<accessible name or regex>` | <optional notes> |

## Affected Files

### Daemon
- `path/to/file.go` — <what changes>

### Web
- `web/src/path/file.ts` — <what changes>

## Edge Cases

1. <edge case and how to handle it> → E<n> | W<n> | D<n> | untested: <reason>

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e. One clause per
criterion; never mix a runnable command with a judgement call in one item.

### Daemon
- **D1**: <one verifiable criterion, single clause>

### Web
- **W1**: <one verifiable UI criterion, single clause>

### E2E
- **E1**: <one end-to-end user flow that should work>

### Automated Checks

Every line below is `<ID> <single-line shell command>`, run from the project root. A check passes
iff its command exits 0. Write "must not exist" checks so success is exit 0 — prefix the grep with
`!`. IDs match the prose criterion above where one exists; a check with no prose twin (e.g. a build
gate) is fine and shares the same ID namespace. The orchestrator and the review agent run these
verbatim; nothing else in this section is executed automatically.

```checks
D1 make test
D2 go build ./...
D3 make lint
D4 ! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'
W1 make web-build
W2 make web-test
E1 make e2e
```

### Reviewer-Verified

Criteria that are not a single exit-code check. The review agent verifies these by reading code or
exercising the app. List them explicitly — this is where the non-runnable half of a split compound
criterion goes, so it is assigned rather than dropped.

- **W3**: no `any` types in new web code
- **W4**: <a rendering/state claim that needs a browser>

## Implementation Notes

<any additional context, patterns to follow, gotchas — cite `kb:fact/<slug>` for every measured
Claude Code quirk handled and `kb:adr/<slug>` for every decision this plan makes — a decision with
no ADR is not yet a decision>
````

## Important Behaviors

- Read existing code before proposing changes. Understand current patterns.
- Be opinionated but open to the user's preferences.
- If the user's description is vague, ask pointed questions rather than guessing.
- Keep the plan practical and implementable — avoid over-engineering.
- Reference actual file paths from the codebase, not hypothetical ones.
- Save the plan file after each major section so progress isn't lost.
- Mark the plan status as "draft" until the user explicitly approves it. At approval: run `.claude/skills/orchestrate/scripts/plan-lint.sh <plan-name>` and fix every `FAIL` first, mark it "approved", merge the Protocol Contract delta into `docs/protocol.md`, write each decision the plan makes as a `status: proposed` ADR in `docs/adr/` (`refs: [plan:<plan-name>]`, one decision each), then `make gen-kb && make check-kb`. Orchestrate pre-flight commits these onto the plan branch.
- **The protocol contract and UI specs must be detailed enough that the daemon and web agents can work in parallel without needing to see each other's code.**
