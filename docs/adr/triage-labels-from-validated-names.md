---
id: triage-labels-from-validated-names
type: decision
status: accepted
date: 2026-10-15
summary: apply labels each filed issue through gh with names from closed lists a test holds to conventions § Issue labels; the comment stays a manual gh call.
features: [triage]
tags: [pipeline, user-decision]
files: [internal/triage/labels.go, internal/triage/apply.go, tools/triage/main.go, docs/conventions.md]
tests: [TestLabelNamesAppearInConventions, TestLabel, TestApplyFilesByKind]
refs: [kb:adr/issue-daemon-creates-issues-only, kb:adr/triage-state-derived-from-todo]
supersedes: []
---
**Context.** A label scheme was set on 2026-10-15 (#43): kind, area and modifier axes mirroring how `TODO.md` groups. The skill forbade labels and the proposer's enums could not produce an area, so every label was applied by hand.

**Options.** (A) Keep labelling manual. (B) The proposer picks from the lists and the program applies them after the commit. (C) Also move the triage comment into the program.

**Decision.** B, settled with the developer; C declined. The lists live in `labels.go`; a test slices `docs/conventions.md` § Issue labels and requires every Go name to appear there, so the doc stays the thing the developer edits and the code cannot drift from it silently. `apply` runs `gh issue edit N --repo <repo> --add-label <names>` once per filed issue, only after the commit exists and never for a held issue; failures are reported, not fatal. The comment remains the skill's own `gh issue comment`, which prompts — correct for an outward write whose text is constant but whose timing the developer wants to see.

**Consequences.** Nothing a model wrote reaches the `gh` command line. A label GitHub lacks fails that one edit; the entry is filed regardless, and the test guards the doc, not GitHub. Priority is still never a label: `TODO.md` order is the ranking. The daemon's involvement still ends at creation.
