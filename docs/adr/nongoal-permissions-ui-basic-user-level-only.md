---
id: nongoal-permissions-ui-basic-user-level-only
type: decision
status: rejected
date: 2026-08-16
summary: The roadmap's permissions editor is a basic user-level allow, ask and deny list; per-project scoping, a live decision queue and settings-diff previews are cut.
features: []
tags: [ux, revisit]
files: []
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, kb:adr/launch-bypass-and-dontask-unoffered]
supersedes: []
---
**Context.** The mockup's permissions view had a live queue of pending permission decisions framed by blast radius, a preview of the settings diff each decision would write, and rules scoped per project. Damian runs mostly in auto-accept mode, so routine permission prompts are not his pain; plan mode is.

**Options.** (A) Build the full view: queue, blast-radius framing, diff preview, per-project scopes. (B) A basic editor of user-level allow, ask and deny rules, one set for all projects, and route the plan-mode approval into its own flow.

**Decision.** B. Per-project scoping is cut; the queue and the diff preview are cut for now.

**Consequences.** The permissions UI stays on the roadmap as a small editor. The bypass and dont-ask launch modes wait on it for guardrails. Plan-mode approval is a separate feature rather than a permission-queue item.
