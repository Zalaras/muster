# Decision: readout-reserved-width

**Outcome**: B — the unknown state reads "claude unknown", and the readout reserves only the widest version text's width.
**Reached by**: user decision (2026-10-15, at /land, browser review cycle 3 Major 1)
**Decisive argument**: reserving the width of "Claude installation unknown" (~201 px) kept the masthead controls still but pushed the connection dot off-screen at 1280 px with every gauge known, and cut the version text at 900 px. A short unknown text lets one reservation cover every state, so the controls hold still and the masthead fits as before.
**Dissent to honour**: the unknown state says less than "Claude installation unknown"; its hover text carries the longer explanation.
**Landed in**: plans/claude-version-watch/plan.md (REQ-5 amended), docs/adr/connection-claude-version-readout-short-unknown-fixed-width.md, docs/design/design-system.md, docs/protocol.md
