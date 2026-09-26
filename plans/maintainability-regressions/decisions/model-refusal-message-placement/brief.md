# Decision brief: model-refusal-message-placement

**Question**: When Launch is refused with `400 model_unrecognized`, does the refusal message show in `#model-error` only, or in both `#model-error` and `#launch-error`?
**Source**: review.md cycle 1 — browser Major 1 `[web-impl] [orchestrator:decision]`; the same fork is code Major 6 `[orchestrator:decision]` (its options are the same two, with the labels swapped).
**Option A**: "A `model_unrecognized` refusal goes to `#model-error` only (no `showError` for that code). E6's two existing tests move their assertion to `#model-error`, and the plan records that E6 changed."
**Option B**: "Keep both, but clear `#launch-error` whenever the model selection or custom text changes, and amend Flow 5 to say both show."

Either option must make this true (browser Major 1): "once the mark has cleared, no visible refusal text names a model that is no longer selected."

## Pinned reading list (both advocates read all of it before turn 1)
- plans/maintainability-regressions/review.browser.md — Major 1, Minor 2 (quoted below)
- plans/maintainability-regressions/review.code.md — Major 5, Major 6
- plans/maintainability-regressions/plan.md — REQ-8, REQ-9, REQ-10; § UI Specifications (the invalid-field pattern, User Flows 5, Testable UI Elements rows "Model error message" and "Launch button"); Invariants INV-1, INV-2; Acceptance Criteria E4, E6
- web/src/features/launch.ts — `submit()` (the `showError` call and the verdict merge for `model_unrecognized`)
- web/e2e/launch-model-check.spec.ts — the two pre-existing refusal tests (their `launchError(...)` assertions) and the E4 test
- docs/design/design-system.md §5 — the "Invalid field" paragraph (added by this plan) and §1/§3 on tone
- docs/design/ux-flows.md §1.2 "The form"
- docs/adr/launch-unrecognized-model-marked-blocks-launch.md (proposed, this plan) and docs/adr/launch-refuses-model-outside-binary-catalog.md (accepted, being superseded by launch-model-check-cached-per-binary-identity)
- The browser reviewer's measurements: the two copies sit about 125 px apart; after Backspace in the field or picking `haiku`, `#launch-error` still names the refused model while Launch is enabled.

## The issue, verbatim

Browser Major 1:

> **[web-impl] [orchestrator:decision]** A `model_unrecognized` refusal shows the same sentence twice, and one copy goes stale. `web/src/features/launch.ts` `submit()` calls `showError(result.error.message)` for every refusal as well as folding it into the verdict store. So `#launch-error` and `#model-error` both show the refusal, about 125 px apart (P4, Q2, and the custom-invalid screenshots in all three themes). Plan User Flow 5 says the message goes "in `#model-error`, not in `#launch-error`". Worse, `#launch-error` is never cleared by the edit or re-selection that clears the mark. After Backspace in the field, or after picking `haiku`, the dialog still says `Claude Code doesn't recognise the model "muster-e2e-unrecognized-zz"` while Launch is enabled and the field holds a different value. That contradicts REQ-8's "clears the mark and the message". web-impl kept the call on purpose, because E6's two pre-existing tests assert `#launch-error`. The plan contradicts itself (Flow 5 against "E6 passes unchanged"), which is why this needs a decision:
>    - **(A)** A `model_unrecognized` refusal goes to `#model-error` only (no `showError` for that code). E6's two existing tests move their assertion to `#model-error`, and the plan records that E6 changed.
>    - **(B)** Keep both, but clear `#launch-error` whenever the model selection or custom text changes, and amend Flow 5 to say both show.
>
>    Either fix must make this true: once the mark has cleared, no visible refusal text names a model that is no longer selected.

Code Major 6:

> **[orchestrator:decision]** The plan contradicts itself on where a custom-model refusal's message goes. UI Flow 5 says the message goes "in `#model-error`, not in `#launch-error`". E6 says the pre-existing refusal tests "pass unchanged", and both of them assert `#launch-error` shows that message (`launch-model-check.spec.ts:59-60,117-118`). The shipped code shows it in both (`features/launch.ts:415` `showError` is unconditional, then the verdict merge). The two options:
>    - **A — both (as shipped):** the message appears in `#launch-error` and in `#model-error`. E6 holds as written; Flow 5 and the launch spec/ADR wording are amended to say both. It costs a duplicated message on screen.
>    - **B — `#model-error` only:** `submit()` skips `showError` for `model_unrecognized`. Flow 5 holds; E6 is amended and the two pre-existing tests change to assert `#model-error`. It costs editing tests an approved criterion froze, a web-impl and e2e-specs wave, and possibly a user decision if amending E6 counts as scope.

Note: in this brief, **Option A = `#model-error` only** and **Option B = both, with `#launch-error` cleared on change** (the browser part's labels).

## Rules
Up to 3 turns each, ≤400 words per turn, advocate-a opens. Argue from the pinned docs and
measurable consequences; cite file:line; steelman before rebutting; concede when convinced.
Append each turn to debate.md before sending it. The ending turn's author reports once to
`main`. Agent names: advocate-a (Option A), advocate-b (Option B).
