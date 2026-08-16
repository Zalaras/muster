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

Read before planning; never contradict them:

1. `SPEC.md` — decisions there are settled; don't re-litigate or reintroduce cut features.
2. `spikes/FINDINGS.md` + `spikes/canary-fields.md` — measured wire-format facts; they beat Claude Code's official docs.
3. `docs/conventions.md` — the stack and code patterns are chosen; a plan never picks libraries.
4. `docs/protocol.md` — the daemon↔UI protocol (born in M0 planning). Plans state **deltas** against it.
5. `CLAUDE.md` hard rules — a plan that requires violating one is wrong by construction.

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

Ask the user to elaborate on what this adds or fixes and which milestone it serves. Read relevant existing code (Grep/Glob) and the relevant SPEC.md sections to understand current patterns.

### 2. Determine Work Type

Establish which tracks are affected. Ask the user to confirm:
- **daemon**: Go only — ingest, state machine, storage, tmux/PTY, HTTP/WS server
- **web**: TypeScript dashboard only
- **full-stack**: both

This determines which agents the orchestrator will invoke later.

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

### 5. Define the Protocol Contract (Critical for Parallel Execution)

**This section is essential.** The daemon and web implementation agents run in parallel and use the daemon↔UI protocol as their shared interface — neither reads the other's code. The contract must be complete and unambiguous.

State this plan's **delta against `docs/protocol.md`**: every WS message and HTTP endpoint added or changed, with full shapes. For each:
- **WS messages**: direction (daemon→UI / UI→daemon), `type`, full JSON shape with types, which fields are optional/nullable and exactly when (e.g. null before a session's first API response), ordering/delivery caveats
- **HTTP endpoints**: method and path, request body, response body, error responses with status codes, auth (localhost token per SPEC §2.6)

Example of sufficient detail:

```
WS daemon→UI  session_state
{ "type": "session_state", "target": "muster:3.0", "state": "needs-input",
  "since": "ISO8601", "title": "string" }
Sent on every state transition. `target` is the tmux target — the session key.
```

**On approval, merge the delta into `docs/protocol.md`** (create the file if this is the first plan to need it), so both agents code against the canonical doc. No agent may change the contract unilaterally mid-pipeline — a contract problem stops the pipeline and comes back to the user.

### 6. Schema Changes

If SQLite schema changes are needed:
- New tables or columns with exact types and constraints (schema direction per SPEC §7)
- A numbered, forward-only migration (no down migrations)
- Note: don't plan tests for what SQLite guarantees — constraint enforcement is the platform's job

### 7. UI Specifications (for web or full-stack)

Define the user-facing behavior clearly enough that the web agent can work without seeing the daemon code:
- Which views/screens are added or modified
- What the DOM structure is at feature level (render functions / `<template>` elements — no framework)
- User interaction flows
- **The three mandatory states for every view**: no data yet (**render "unknown", never an empty gauge** — SPEC §2.3), data, and daemon-down
- Any specific patterns from the existing codebase to follow

**Design system**: none exists yet (arrives with the UX-design work, next-steps item 4). Until then, specify semantic markup and minimal styling consistent with what exists; when a design system lands in `docs/design/`, plans must reference it here instead.

#### Testable UI Elements

For each key interactive element that E2E tests will target, define its expected accessible name. This is the shared contract between the planning, E2E, and web agents: `web-impl` implements these names exactly, and `e2e-specs` writes its locators against them without seeing the code.

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| e.g., New session button | `button` | `New session` | — |
| e.g., a `<details><summary>` disclosure | — | `<its summary text>` | no implicit role — locator strategy is e2e-specs' call |

**Only assert a `Role` you can actually guarantee.** A role you assert here becomes a `getByRole()` in the E2E suite, and a wrong one produces a locator that can never match — which reads as a mysterious test failure rather than a plan defect. This codebase is hand-rolled HTML (no component library), so assert a role only when:

- a native element guarantees it (`<button>` → `button`, `<a href>` → `link`, `<input>` → `textbox`, `<select>` → `combobox`), **or**
- you are explicitly mandating an attribute that creates it (`role="status"`, `aria-label="Usage"` on an `<aside>` → `complementary`)

Bare `<details><summary>`, `<div>` and `<span>` carry **no** implicit ARIA role. When unsure what role a piece of markup exposes, put `—` in the Role column and describe the intent in Notes — `e2e-specs` verifies its locators against a real DOM and will pick a working one. Never resolve the uncertainty by requiring an extra `role=` attribute purely so a test can find the element — that trades away native semantics for test convenience.

### 8. Edge Cases and Error Handling

Discuss edge cases and failure scenarios on both sides. For Muster, always cover the standing ones that apply: hook loss/duplication/reordering, `/clear` minting a new `session_id` in the same pane, daemon restart mid-session, no-data-yet nulls, tmux pane death without `SessionEnd`.

### 9. Acceptance Criteria

Define clear acceptance criteria that the review agent will check against. Write them as prose, one behaviour per criterion, covering daemon-verifiable and web-verifiable outcomes.

**Two rules:**

1. **One clause per criterion.** Never mix a runnable command with a judgement call in the same item. "`make test` and `make lint` pass; no `any` types; the gauge shows unknown before first response" is four separate criteria — and a reader who watches the build go green marks the whole thing done, quietly discarding the constraints most likely to be violated. If you find yourself typing `;` or `and also`, start a new criterion.
2. **Number criteria uniquely across the whole section**, not per subsection. Prefix by area: `D1, D2…` (Daemon), `W1, W2…` (Web), `E1, E2…` (E2E). Restarting the count per subsection makes "criterion 12 passed" ambiguous in a review.

Then, with the user, distil the criteria into an **Automated Checks** block: the subset where "satisfied" is exactly "this one shell command exits 0". You author this deliberately — you are the only one who knows which backticked things in your prose are commands and which are type names or identifiers, so this cannot be left to a parser. Anything needing a human read stays in prose and is listed under `### Reviewer-Verified`, so the non-runnable half of a split criterion is assigned rather than lost.

The orchestrator and the review agent execute the block **verbatim**, so every line must run from the project root with no arguments, no environment setup and no interactive prompt. Prefer the Make entry points (`make test`, `make lint`, `make web-build`, `make web-test`, `make e2e`) over ad-hoc pipelines.

## Plan Document Format

Write the plan to `plans/<plan-name>/plan.md` using this structure. The template is wrapped in a four-backtick fence so the triple-backtick blocks inside it nest correctly — in the plan file itself they are ordinary triple-backtick fences.

````markdown
# Plan: <Plan Name>

**Created**: <date>
**Status**: draft | approved | in-progress | completed
**Work Type**: daemon | web | full-stack
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

Delta against `docs/protocol.md` (merged there on approval). "No protocol changes" if none.

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

1. <edge case and how to handle it>

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

<any additional context, patterns to follow, gotchas — cite spikes/FINDINGS.md sections where
the behaviour being handled is a measured Claude Code quirk>
````

## Important Behaviors

- Read existing code before proposing changes. Understand current patterns.
- Be opinionated but open to the user's preferences.
- If the user's description is vague, ask pointed questions rather than guessing.
- Keep the plan practical and implementable — avoid over-engineering.
- Reference actual file paths from the codebase, not hypothetical ones.
- Save the plan file after each major section so progress isn't lost.
- Mark the plan status as "draft" until the user explicitly approves it, then mark it "approved" — and merge the Protocol Contract delta into `docs/protocol.md` at that moment.
- **The protocol contract and UI specs must be detailed enough that the daemon and web agents can work in parallel without needing to see each other's code.**
