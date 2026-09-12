# web/src/terminal — xterm pane and bridge

**Owns**: the `TerminalSurface` in `pane.ts` (xterm.js instance, `/ws/terminal/{id}` socket, one overlay element) plus pure halves: close-code to overlay mapping, drop classification and path escaping, the shared `role="status"` notice, the `claude | shell` control. Which surfaces exist is `web/src/features/surfaces.ts`'s decision. **Features**: drop, surfaces.

**Invariants** (violations are review-Critical):
- Only the surface manager constructs or disposes a `TerminalSurface`; no render path opens a socket, never for an `alive:false` session.
- One live client per attach target: a session's Claude socket and shell socket coexist and never supersede each other (kb:adr/surfaces-one-live-client-per-attach-target).
- `4000 superseded` and `4001 pane_ended` are the only close codes with their own meaning; everything else reads as "disconnected" (kb:anchor/terminal.ws).
- Session state is never derived from terminal output; the pane and its snapshot are display only (kb:adr/actions-pane-snapshot-display-only).
- The terminal ground follows Claude Code's theme family regardless of the dashboard theme (kb:adr/theme-terminal-ground-follows-claude-family).
- Pure modules (`overlay.ts`, `drop.ts`, `notice.ts`) take no `HTMLElement` and no WebSocket.

**Exemplar**: `overlay.ts` + `overlay.test.ts` — a pure mapping beside the DOM module that calls it; copy this shape for new bridge logic.

**Gotchas**:
- The `4001` overlay lives about 25 ms before the dead surface replaces it; no test asserts it (kb:lesson/transient-display-is-not-an-oracle).
- `surfaceswitch.ts` is built once per host and mutated afterwards, never rebuilt on a render tick (kb:lesson/select-rebuilt-every-tick-passed-selectoption).
- Fit is observed, never pattern-matched from footer geometry (kb:lesson/tiles-never-refit-behind-pattern-match).
- Dropped paths escape Terminal.app-style: backslash before every space and metacharacter, non-ASCII untouched (`drop.ts`).

<!-- kb:trailer -->
<!-- kb:hash 74d4e13ee2d16612 -->
- **drop** — File drop pastes the original on-disk path into the pane. → `docs/features/drop/INDEX.md`
- **surfaces** — PTY bridge, xterm pane, the ephemeral shell surface, sizing, one live client per target. → `docs/features/surfaces/INDEX.md`
- 6 records name files in this directory: `go run ./tools/kb for <path>` lists them for one file.
<!-- /kb:trailer -->
