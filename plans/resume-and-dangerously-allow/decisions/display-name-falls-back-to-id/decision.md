# Decision: a resumed-from-list session's model displayName

**Reached by**: user decision (the developer, 2026-09-27)
**Raised by**: web-impl's smoke run and daemon-impl's log: the approved contract said
`model.displayName` is null on a resumed-from-list session, while the daemon sends the model id,
as every launch does until the status line confirms the name.

**Options.** (a) Keep the contract: the daemon sends `null`. (b) Keep the daemon: `displayName` is
the model id until the status line confirms it, and the contract follows.

**Outcome.** (b): "Then we do id as it is today." Both options are cosmetic for the few seconds
before the status line lands; (b) matches every other launch. The plan's Protocol Contract and
`docs/protocol.md` were amended; the one E2E assertion expecting `displayName: null` follows.
→ kb:adr/launch-resume-display-name-falls-back-to-id
