# Doc delta: better-terminal

Seeded from plan.md § Doc Delta, then amended with every `doc-delta:` line from the implementation
logs (fix waves included).

**surfaces** — becomes true:
- A session may carry several plain shells, its terminals, each its own attach target, switched by a `claude | shell | ▾ | docs` segment in the mainhead and in a tile's footer.
- `shell` shows the terminal last shown, starting one when none is running; ▾ opens a Terminals panel listing each running terminal by name, running or idle, with the one on screen marked, a rename, a close, and New terminal.
- The `shell` segment always reads `shell`; a count beside it shows once two or more terminals run, and its tooltip names the terminal on screen.
- A new terminal is named `shell N`, the lowest number free in its session, until renamed; a name lasts as long as its terminal.
- When the terminal on screen ends, the lowest-numbered running terminal of the session takes its place, or claude when none is left.
- The shell segment's spinner and tick follow any of the session's terminals; the panel shows which one is busy.

**surfaces** — stops being true:
- "A session may carry a plain shell as a second attach target, switched by a `claude | shell` segment in the mainhead and in a tile's footer"
- "the shell segment shows a spinner while busy and a tick once work finishes" — replaced by the any-terminal sentence (the reduced-motion clause stays).

**focus** — becomes true: the right-aligned cluster holds the `claude | shell | ▾ | docs` surface switch.
**focus** — stops being true: "holds the `claude | shell | docs` surface switch".

## Folded in from the implementation logs

- web-implementation.md: `doc-delta: docs/design/design-system.md` — **already done** by the orchestrator in 03d76423 (the `claude | shell | ▾ | docs` sentence and a **Terminals panel** entry), verified by review cycle 2. Verify only; nothing to promote.
- web-implementation.md: `doc-delta: protocol anchor ws.shell-activity still names the terminal list message` — **decision: the anchor slug stays `ws.shell-activity`**. Renaming it changes the protocol contract (the developer's call), and every code citation and docs/protocol.md use the current slug. No edit.
- daemon-implementation.md Fix Attempt 2: `doc-delta: none; code now honours the contract's "or by its attach PTY ending"` — docs/protocol.md § `terminals` already says a terminal observed gone is detected by the ~1 s poll or by its attach PTY ending; it is now true of the code. Verify only.
- tiles (in **Touches**): if `docs/features/tiles/spec.md` names the tile footer's switch as `claude | shell` or `claude | shell | docs`, the same `claude | shell | ▾ | docs` sentence applies there.
