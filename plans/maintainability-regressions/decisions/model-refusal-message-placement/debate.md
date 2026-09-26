# Debate: model-refusal-message-placement

### Turn 1 — advocate-a (argument)

Steelman of B, before B has spoken: E6 is an approved acceptance criterion ("the existing refusal tests … pass unchanged", plan.md:406), `#launch-error` is the dialog's established error channel, and B fixes the stale copy with a web-impl-only change, leaving frozen tests untouched.

Why A is still right:

1. **The plan already decided placement, specifically.** Flow 5: the message goes "in `#model-error`, not in `#launch-error`" (plan.md:238-239). E6 is a blanket regression guard. In my reading its purpose is that the prior plan's refusal behaviour survives: exact message, dialog stays open, fields as typed, nothing written (spec.ts:58-73, 116-121). Under A every one of those assertions stands. Only the locator changes, in four lines (spec.ts:59-60, 117-118). B rewrites the specific user-facing flow to preserve a generic test clause. B also contradicts the §5 pattern, which names one message: "a `.field-error` paragraph directly after the field" (design-system.md:261).

2. **A makes the required property structural. B makes it procedural.** Under A the only refusal text is `#model-error`. INV-2 (plan.md:267) derives it from the *selected* model's latest verdict. So "no visible refusal text names a model no longer selected" holds by construction. Under B, `#launch-error` is a second copy that no invariant governs. It holds only if every path that changes the selection clears it: the radio `change` (launch.ts:490-495), the custom `input` (:497), and `setModel`/`applyModelRestore` (:162-177). The copies also diverge on a retype. Retyping `zz` re-marks the field and brings the message back in `#model-error` (review.browser.md:38), but B's cleared `#launch-error` stays empty.

3. **B's clear collides with the existing error lifetimes.** `#launch-error` also carries "Choose a directory to launch into." (launch.ts:397), "Enter a model." (:402), browse failures (:308), and the repos error that `reposErrorPersistent` protects (:207-217). Clearing it on every model change would wipe the directory and repos errors when someone clicks a preset. So B needs a second flag, "this copy is a model refusal". A needs one `code !== "model_unrecognized"` guard on an existing call.

4. **The cost gap is small.** An e2e-specs wave happens under both options. Browser Minor 2 asks the spec to "assert that option's `#launch-error` state after the refusal and after the edit". Code Major 5 rewrites the E4 comment (spec.ts:256-257) either way. On top of that, A adds only four lines.

5. **The duplicate is the defect.** Major 1 opens with it: "shows the same sentence twice" (review.browser.md:65). B keeps it and relabels it intended.

### Turn 1 — advocate-b (concession)

Steelman of A: Flow 5 is the plan's specific placement decision, and E6 is a generic regression clause. Under A the stale-copy property follows from INV-2 by construction. Under B it holds only while every selection path remembers to clear a second, ungoverned copy.

I checked A's claims and they hold. The clear under B has to fire from the radio `change` handler (launch.ts:490-495), the custom `input` handler (:497), and `setModel` (:162-170). `#launch-error` also carries the directory, model-empty, browse and repos errors (:308, :397, :402, :207-217). A blanket clear on a model change would therefore wipe a repos error that `reposErrorPersistent` exists to keep. And a retype of the refused text re-marks the field (review.browser.md:38) while B's cleared `#launch-error` stays empty. So B's amended Flow 5 ("both show") would already be false on that path.

The best case I had for B was accessibility. `#launch-error` is `role="alert"` (web/index.html:169) and `#model-error` has no live-region role (index.html:153), so under A nothing announces the refusal. Browser Minor 1 answers that. Its required fix puts focus on the invalid control after the refusal (review.browser.md:73), and that control is `aria-describedby="model-error"` (plan.md:210). So the message is read out through the standard invalid-field route. I drop that point. The E6 "frozen criterion" point doesn't separate the options either. The plan contradicts itself, so one of Flow 5 or E6 has to change. Changing the generic clause (four locator lines) costs less than changing the specific flow, the §5 pattern (design-system.md:261) and the ADR's "inline message … under the Model row".

I concede: A's point 2, together with point 3. Under A, "no visible refusal text names a model no longer selected" is structural, because INV-2 derives the only copy from the selected model's latest verdict. B's second copy needs clears at several call sites and a new flag to keep it from wiping `#launch-error`'s other errors, and it still diverges on a retype.
