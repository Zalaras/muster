---
id: launch-model-refusal-shown-in-field-error-only
type: decision
status: accepted
date: 2026-09-26
summary: A launch refused as model_unrecognized shows its message only in the Model row's field error, never also in the dialog's launch error line.
features: [launch]
tags: [consensus]
files: [web/src/features/launch.ts, web/e2e/launch-model-check.spec.ts]
tests: []
refs: [plan:maintainability-regressions, plans/maintainability-regressions/decisions/model-refusal-message-placement/decision.md, kb:adr/launch-unrecognized-model-marked-blocks-launch]
supersedes: []
---
**Context.** The plan said both that a custom-model refusal's message goes "in `#model-error`, not in `#launch-error`" and that the earlier refusal tests, which assert `#launch-error`, pass unchanged. The first build showed the message in both. The `#launch-error` copy was never cleared, so after the developer edited the text it still named a model that was no longer selected.

**Options.** (A) Show the refusal in `#model-error` only, and move the older tests' assertion there. (B) Show it in both, and clear `#launch-error` whenever the selection or custom text changes.

**Decision.** A, by debate consensus. The only copy is derived from the selected model's latest verdict, so no refusal text can outlive its selection. Under B the second copy needs clearing on every selection path, plus a flag so the clear spares the directory and repos errors that share `#launch-error`, and it still diverges when the refused text is retyped.

**Consequences.** `#launch-error` keeps the dialog's other errors. The refusal has no live region of its own, so focus moves to the invalid control after a refusal, and that control is described by the message.
