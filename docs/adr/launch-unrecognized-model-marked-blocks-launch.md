---
id: launch-unrecognized-model-marked-blocks-launch
type: decision
status: accepted
date: 2026-09-26
summary: An unrecognised selected model stays selected, is marked with the invalid-field pattern and blocks Launch; unrecognised unselected presets are disabled.
features: [launch]
tags: [ux, user-decision]
files: [web/src/features/launch*.ts, web/src/render/launch*.ts, web/src/style.css, web/index.html]
tests: []
refs: [plan:maintainability-regressions, kb:adr/launch-model-check-cached-per-binary-identity, docs/design/design-system.md]
supersedes: []
---
**Context.** Once the dialog knows which models the installed Claude Code does not recognise, it has to show that. A directory's remembered model, or the default, may be one of them.

**Options.** (A) Move the selection to the first available preset. (B) Keep the selection, mark it invalid, and block Launch. (C) Mark nothing and let Launch refuse, as before.

**Decision.** B, the developer's choice: "the user knows what's wrong and needs to change and cannot launch until it's solved." The mark is the standard invalid-field pattern: `aria-invalid`, an outline and text in the error tone the launch error already uses (`--banner-line`, `--banner-fg`, never `--rose`, which means Failed), and an inline message with a `⚠` glyph under the Model row carrying the daemon's refusal text. An asterisk is not used, because it conventionally means required. Unrecognised presets that are not selected are disabled.

**Consequences.** Launch is disabled iff the selected model's latest verdict is unrecognised. No verdict, or `unchecked`, marks nothing. A custom model is marked after a refused launch, and editing it clears the mark.
