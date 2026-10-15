# Doc delta: claude-version-watch

Seeded from plan.md § Doc Delta, plus the impl log's `doc-delta:` lines and review notes.

**connection** — becomes true:
- The Claude version readout updates live: the daemon checks the version in the background after it starts serving, re-checks whenever the `claude` binary file changes (a stat every 30 s; `claude --version` runs once per new identity, bounded at 30 s), and pushes each new result in a `claudeCode` message (`kb:anchor/ws.claude-code`).
- `hello.claudeCode` is the latest result; `unknown` also covers "not checked yet".
- A daemon that cannot resolve `claude` logs "could not resolve the claude binary; keeping the last claude code version result" once per unresolved stretch, not on every look; the line carries the held result's status (and installed version when one is held). A `claude --version` that fails or is unparseable still logs "could not determine claude code version".
- The Claude version readout keeps one width whatever it shows (the widest realistic version plus its glyph), right-aligned, so the masthead controls beside it do not move when it changes live (kb:adr/connection-claude-version-readout-short-unknown-fixed-width).
- The unknown state reads "claude unknown" (was "Claude installation unknown"), with hover text "The Claude Code version check failed or hasn't completed yet".
- The spec's `refs:` names `kb:adr/connection-claude-version-watched-and-pushed`; its `protocol:` list names `ws.claude-code`.

**connection** — stops being true:
- The version is classified once, at daemon startup.

**issue** — becomes true:
- The issue snapshot's Claude Code row carries the daemon's latest version result at capture time.

Already landed by the orchestrator (verify, do not redo): `docs/protocol.md` `ws.hello` wording and the new `ws.claude-code` section (0ea22cd4); `docs/diagrams/containers.md`, `docs/diagrams/daemon-components.md`, `docs/claude-code-versions.md`.
