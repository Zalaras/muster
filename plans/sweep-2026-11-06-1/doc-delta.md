# Doc Delta: sweep-2026-11-06-1

**notes** — becomes true: the popped panel draws below the daemon-down banner, and below the
masthead's connection readout only while that readout shows the outage; while musterd is connected
or connecting the panel draws above the readout
(kb:adr/notes-readout-above-popped-panel-only-while-down). Stops being true: the readout draws above
the popped panel in every state, and the citation of kb:adr/notes-banner-above-popped-panel (now
superseded). Sentences: `docs/features/notes/spec.md` § popping out ("…and below the daemon-down
banner and the masthead's connection readout, so a placed panel never hides an outage") and
`docs/design/design-system.md` § Note panel ("…and below the daemon-down banner and the masthead's
connection readout, which stay readable over any placement").

Impl log doc-delta lines: none beyond the plan's Doc Delta.
