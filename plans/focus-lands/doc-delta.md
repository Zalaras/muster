# Doc delta: focus-lands

Seeded from plan.md § Doc Delta, with the impl log's `doc-delta:` line and review notes folded in.

**surfaces** — becomes true: switching a session's surface from the Focus header or a tile
footer, by pointer or keyboard, moves keyboard focus into the surface switched to — the
terminal for claude and shell (the shell's once its spawn resolves), the reader's body for
docs. It does not take focus back from somewhere the developer moved it while a shell was
starting, and a claude switch on an ended session has no terminal to focus. (Review cycle 1
note 1: qualify the unconditional wording.) The impl log adds: the move travels as the in-app
`surfaceSwitched` event — mention only if the spec already lists app events.

**update** — becomes true: Check now keeps keyboard focus through a check; while one is in
flight it reads as unavailable (`aria-disabled`, `aria-busy`) and ignores a press, without
being disabled; it is disabled outright only when the daemon cannot check.

**usage** — (the context row) no sentence changes: the row shows what it showed; it now
updates in place. Check the spec claims nothing about a rebuild.
