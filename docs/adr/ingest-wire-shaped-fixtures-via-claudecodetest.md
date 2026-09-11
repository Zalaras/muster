---
id: ingest-wire-shaped-fixtures-via-claudecodetest
type: decision
status: accepted
date: 2026-08-22
summary: Tests outside the Claude Code package get wire-shaped bodies from a claudecodetest helper package rather than narrowing the boundary check.
features: [ingest]
tags: [testing, claude-code-format, user-decision]
files: [internal/claudecode/claudecodetest/**]
tests: []
refs: [docs/history/spec-changelog.md, plan:m0-skeleton]
supersedes: []
---
**Context.** All Claude Code format knowledge lives in one package by hard rule, and a review check flags the format leaking elsewhere. Server tests needed realistic hook and status-line bodies, and writing them inline violated that check.

**Options.** (A) Narrow the check so test files may spell out payload shapes. (B) Add a helper package inside the boundary that builds wire-shaped bodies for any test to call.

**Decision.** B, Damian's choice, so the check stands unchanged.

**Consequences.** A payload shape change touches the helper once and every dependent test follows. The helper is the only place outside the adapter proper that spells a hook field name, and it is inside the same package tree. E2E helpers that synthesize posts mirror the same shapes in TypeScript.
