# Doc delta: sweep-2026-11-12-1

**lifecycle** — becomes true: a main-agent tool start (PreToolUse) or permission request on a
closed prompt reopens it as the current turn; every other unmarked event on a closed prompt (tool
end, batch end, notification, idle notice) is a straggler that changes nothing. A prompt reopened
after a transcript interrupt is closed again only by a new interrupt, never by the one that
already closed it. In `docs/protocol.md` the
`kb:anchor/state.transitions` rows for closed-prompt turn activity and PermissionRequest, and
`kb:anchor/state.ordering` rule 2, say so; `docs/features/lifecycle/spec.md` § Ordering and loss
says so. Stops being true: "later-arriving unmarked events for a closed prompt never reopen a turn".
**ingest** — becomes true: a prompt beginning `<agent-message` is, like `<task-notification>`,
never a last prompt (the `lastPrompt` clause in the transitions table). No wire shape change, no
protocol version bump.


## Folded in

- Review cycle 2 note 3 (review-work): the "every other unmarked event on a closed prompt changes
  nothing" sentence covers only the events listed in its brackets (tool end, batch end,
  notification, idle notice). A Stop/StopFailure on an already-closed prompt still lands idle or
  failed as today; the promoted prose must not read as covering closers.
- The interrupt detection prose (lifecycle spec / `kb:anchor/state.transitions` interrupt row):
  becomes true — an interrupt already acted on never closes a prompt that was later reopened;
  only a newer interrupt of it does.
- Docs that cite the superseded `kb:adr/lifecycle-prompt-ordering-guards` for the closed-prompt
  rule should cite `kb:adr/lifecycle-awaited-main-event-reopens-closed-prompt`.
- impl logs: `doc-delta: none beyond the plan's.`
