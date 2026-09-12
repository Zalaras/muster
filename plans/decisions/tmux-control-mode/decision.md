# Decision: tmux-control-mode

**Outcome**: B — Keep plain `tmux attach`. `internal/termbridge` stays a raw byte pipe
between a PTY and the WebSocket.

The debate's own recommendation was to defer past v1. **Damian overruled that on 2026-09-13:
"We're not deferring, drop it."** So the backlog entry is removed outright rather than carried
— this is won't-fix, recorded as `kb:adr/surfaces-control-mode-not-adopted` (`status: rejected`).
Dissent 1 below is therefore a reopening bar, not a scheduled revisit.

**Reached by**: consensus (advocate-a conceded in turn 2, before either side spent its third turn)

**Decisive argument**: The byte win is real but denominated in a unit with no measured
consequence. advocate-b, turn 1: "the win is in a unit with no measured consequence… The only
user-facing number anyone has measured is S4 §6's keystroke→frame p50 5.0 ms / p95 12.2 ms
*with tmux already in the loop*." advocate-a verified the citation, found the rest of the table
(`spikes/S4-findings.md:194-213` — 1.06 MB/s sustained to the browser, 2.71 MB/s peak, 51 ms
catch-up lag, Chrome renderer ~0% CPU idle, JS heap flat) and conceded: "the measured
user-facing path already has three orders of magnitude of headroom over the bytes Option A
removes, so the win has nowhere to land. My six-tile arithmetic multiplied a number that was
never near a limit."

## Dissent to honour

1. **Any reopening needs a measured symptom, not a byte count.** Both advocates proposed
   deferral on this basis; with the item dropped, it becomes the bar for raising it again at
   all — CPU, battery or latency observed outside `spikes/S4-findings.md` §6's envelope. The
   byte ratio on its own is not a reason and has now been argued and rejected once.

2. **Control mode may be *worse* under real load.** Raised by advocate-a against its own side
   in turn 2, and the strongest reason the deferral may become permanent: S4 §6 measured a
   50 MB producer burst reaching the browser as **21 MB** — "tmux coalesces screen updates
   rather than forwarding the raw stream". `%output` carries "exactly what the application
   running in the pane sent to tmux" (S6 §4) plus 1.39× octal escaping and 13 B/line framing.
   So in the one regime where CPU is measured to be high (120–136% of a core during a
   firehose), `-CC` plausibly sends **more** bytes than plain attach. Directional and
   unmeasured, but it means `-CC` is not strictly dominant, which was the premise of the
   whole entry.

3. **Two record edits Option A would have required, unbudgeted by the TODO entry.**
   `docs/protocol.md:912-913` states the binary frame is "raw PTY output bytes (tmux attach
   stream), verbatim — the daemon transforms nothing"; that sentence becomes false under
   `-CC`, and the generated `docs/features/surfaces/contract.md` with it. And
   `kb:adr/surfaces-shared-attach-single-pty` Consequences — "capture-pane is a test oracle
   and a snapshot source, never the display path" — would need a superseding ADR, because
   `-CC` puts `capture-pane` on the display path at every attach.

4. **Bracketed paste is an open question for the shell surface**, partly resolved.
   advocate-b argued `-CC` ships unbracketed paste because xterm.js learns mode 2004 only
   from the stream and `#{pane_bracketed_paste}` read empty (`measurements.md:100-102`).
   advocate-a correctly narrowed it: S6 §1's measured Claude Code startup sequence contains no
   2004, so the probe cannot distinguish "no such variable" from "mode legitimately off" —
   which weakens the hole for the Claude surface but not for the shell surface, where an
   ordinary interactive shell does enable 2004. Unresolved, and it would need measuring before
   any future `-CC` attempt.

5. **`drop.spec.ts` would not have caught it.** It pastes only newline-free paths, so the E2E
   suite stays green while multi-line paste breaks — "exactly a green verdict hiding one"
   (advocate-b, turn 1). Any future attempt owes a multi-line paste test first.

**Landed in**:
- `docs/adr/surfaces-control-mode-not-adopted.md` (new, `status: rejected`)
- `TODO.md` — the "Terminal bandwidth — `tmux -CC` control mode" entry removed from
  § Pre-v1 Cleanup (issue #13's triage is unaffected; it is anchored at
  `docs/history/todo-done.md:1082` with its full link)
- generated: `docs/INDEX.md`, `docs/features/surfaces/INDEX.md`, `.claude/rules/surfaces.md`
