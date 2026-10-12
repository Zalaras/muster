# Decision: connection-dot-red-during-update-confirmation

**Outcome**: A — keep the red dot and amend the documents. No code change. INV-1, the ADR and the Doc Delta name the exception: "red while the socket is lost, even during the ≤ 3 s confirmation".
**Reached by**: user decision (review cycle 1, correctness Decision 1; asked 2026-10-12, answered "1 A")
**Decisive argument**: The dot reports the socket; a lost socket is down even while the post-update confirmation banner is still on screen for its last ≤ 3 s. Option B would have changed the update feature's banner, outside this plan.
**Dissent to honour**: For ≤ 3 s the dot and the banner disagree; the docs now say so rather than claiming they always agree.
**Landed in**: plans/masthead-indicators/plan.md (INV-1, Doc Delta), docs/adr/connection-health-dot.md (Decision wording), docs/adr/connection-dot-red-during-update-confirmation.md
