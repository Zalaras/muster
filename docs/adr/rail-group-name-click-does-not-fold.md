---
id: rail-group-name-click-does-not-fold
type: decision
status: accepted
date: 2026-10-05
summary: A click on a renameable group's name does not fold its section, so a double-click can rename it; the rest of the header still folds.
features: [rail, groups]
tags: [ux]
files: [web/src/render/railsections.ts, web/src/features/groups.ts]
tests: []
refs: [plan:groups, plans/groups/web-implementation.md, kb:spec/groups, kb:adr/rail-new-group-is-named-before-it-exists]
supersedes: []
---
**Context.** The spec folds a section on a header click and renames on a double-click of the name. The collapse round-trips through the daemon, so the two clicks of a double-click both read the same state and would fold the group being renamed; the rename field then opens inside a collapsed section.

**Options.** (A) Fold on every click and debounce the first click until the double-click window closes. (B) The name text of a renameable group neither folds nor toggles; the caret, the summary and the free space still fold, and ⋯ opens the header menu. The Ungrouped name, which cannot be renamed, folds like the rest.

**Decision.** B. A debounce delays every ordinary fold by the double-click window for the sake of a rarer action, and the name is a small target. Reasoned from the code path before the rename spec ran; the spec passes with it.

**Consequences.** Clicking a group's name does nothing on a single click; the caret, the summary and the header's free space are the fold target, and ⋯ is the menu opener. Ungrouped keeps a whole-header fold.
