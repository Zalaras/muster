---
id: theme-type-scale-tokens-15px-root
type: decision
status: accepted
date: 2026-09-03
summary: A seven-step rem type ramp on a 15px root replaces hardcoded sizes; the terminal is outside the ramp and a user text-size control is deferred.
features: [theme]
tags: [ux, user-decision, deferred]
files: [web/src/style.css, docs/design/design-system.md]
tests: [web/e2e/type-scale.spec.ts]
refs: [docs/history/spec-changelog.md, plan:ui-text-and-focus, docs/design/design-system.md, TODO.md, "#19"]
supersedes: []
---
**Context.** The stylesheet carried dozens of hardcoded font sizes across many distinct values and no size tokens; the body size was set but almost nothing inherited it, so text could not be grown as a whole.

**Options.** (A) Leave pixel sizes and enlarge the few that read small. (B) A tokenised ramp anchored to the existing root size. (C) A tokenised ramp with the root raised one step, plus a user-facing text-size control in Settings.

**Decision.** A ramp with the root raised, Damian's decision at planning, without the control: tokens first, the control later as a text-size pref with a Settings segmented control and a first-paint hint, recorded in the backlog.

**Consequences.** The whole chrome grows slightly and together. A negative grep check pins that every font-size references a step, so a hardcoded size is caught. The terminal keeps its own xterm font size, outside the ramp. The Settings dialog is where the control lands when it is built.
