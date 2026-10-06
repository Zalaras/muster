# Doc delta — plan `launch-inflight-guard`

Seeded by the /fix session from `plan.md` § Doc Delta on 2026-10-06, then amended with every
`doc-delta:` line from the implementation log (there were none: "doc-delta: none beyond the plan's
## Doc Delta") and one measured behaviour the implementation log records under Decisions.
`doc-reconcile` promotes what is true of the code; `plan.md` stays as approved.

The launch spec body sits at 797 of its 800 words (kb counts words outside mermaid fences), so the
additions below are paid for by the cuts; the reconciled body must still fit the cap.

## From the plan

**launch** — becomes true:
- Launch is disabled from the press until the daemon answers, and a second press meanwhile sends nothing. A success closes the dialog, and any refusal lifts that hold, though a `model_unrecognized` refusal still blocks Launch until another model is picked. (Reworded after review cycle 1 Major 2: the plan's "a refusal re-enables it" overreached for `model_unrecognized`.)
- Every launch remembers its directory as a repo row (kb:adr/launch-hybrid-mru-directory-memory).

**launch** — stops being true:
- Directory memory is hybrid: every launch remembers its directory as a repo row, with promotion reserved for rows that carry per-repo config, which nothing writes yet (kb:adr/launch-hybrid-mru-directory-memory).
- The dialog checks first, so Launch itself pays no subprocess on the common path.

## From the implementation log (`web-implementation.md` § Decisions, "Measured")

**launch** — becomes true:
- When Launch held focus at the press, a refusal that lifts the hold hands focus back to it if focus has not moved meanwhile (it fires only when focus fell to `<body>`); a `model_unrecognized` refusal still moves focus to the invalid control. (Disabling a focused button drops focus to `<body>`; fold this into the sentence above if the cap demands, or state it in the shortest clause that fits.)

## Reconcile notes (review cycle 1)

- The two "stops being true" lines are word-budget cuts of claims the cited records already carry, not behaviour changes (review-work Note 2); do not look for code that made them false.
