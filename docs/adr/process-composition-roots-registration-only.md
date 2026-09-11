---
id: process-composition-roots-registration-only
type: decision
status: accepted
date: 2026-09-11
summary: The web entry module and server constructor are composition roots only; each feature is a controller or handler type registered in one line, files not packages.
features: [connection]
tags: [pipeline, user-decision]
files: [web/src/main.ts, internal/server/server.go, web/src/features/usage.ts, internal/server/usage.go, docs/conventions.md, .claude/skills/plan-work/SKILL.md, .claude/agents/review-work.md]
tests: []
refs: [docs/history/spec-changelog.md, docs/history/todo-done.md, plan:code-breakup, docs/conventions.md, kb:adr/process-one-name-per-feature]
supersedes: []
---
**Context.** The web entry module had grown to well over a thousand lines carrying every feature's element lookups, listeners and module-level state, and every server feature added a field to one struct, a twin in the config and a line in the route table. Any two plans collided on the same three files. The cause was structural: plans listed the root under affected files, agents complied, and review judged against the plan.

**Options.** (A) Accept the collisions and serialise plans. (B) Split each side into sub-packages per feature. (C) Keep files where they are but make the two roots registration-only: each web feature is a controller module with a single init taking the app and its dependencies, each server feature a small type with explicit dependencies and a mount, both registered in one line; rules in the conventions, the planner and the reviewer keep logic from landing in a root again.

**Decision.** C, Damian's call: one plan for both sides, files not sub-packages for now. Behaviour was unchanged throughout and the full E2E suite was the oracle.

**Consequences.** A controller never imports another controller; cross-feature needs go through init dependencies or app events, and a small app module owns the shared store, state and event bus. The planner may list a root under affected files only for a one-line registration. Sub-packages remain available if the directory itself becomes the coupling.
