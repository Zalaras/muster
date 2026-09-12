# Debate: tmux-control-mode

### Turn 1 — advocate-a (argument)

Nothing to steelman yet.

**The record leaves this open.** `docs/adr/stack-terminal-backing-tmux.md` Consequences:
"Display is a pushed PTY attach, not polling, so the earlier premise that control mode might
be needed is stale." The premise it kills is *polling* — `surfaces-shared-attach-single-pty`
Context: the handoff "assumed the dashboard would poll capture-pane and maybe fall back to
control mode". `-CC` is itself a push path. S6 §8 says the same thing plainly: "SPEC.md §5's
`-CC` row records the option as skipped on a polling-latency premise; §3/§4 give it a
bandwidth rationale that premise never considered." And the only ADR to touch it since parks
it live: `surfaces-scrollback-affordance-not-built` Consequences — "Terminal bandwidth
through tmux control mode is a separate later item."

**The measured win is bigger than TODO.md's claim and on a cleaner axis.** Set S6's drifted
19.4× aside. The 2026-09-12 run — Muster's exact 11 server options, tmux 3.7b, and a *silent*
stub emitting zero application bytes (measurements.md:20-27): attach handshake **12,941 B →
78 B**; idle **6,407 B → exactly zero**. Every one of those bytes is tmux talking to itself.
They cross a WebSocket and get parsed by xterm.js carrying no information.

Muster amplifies that. `internal/tmux/tmux.go:5` — "Tiles needs up to 6 concurrent live
surfaces". Six idle tiles is ~38 KB per repaint round, and every view switch, tile
rearrangement and takeover pays a fresh ~13 KB handshake per target (`terminal.go`
`takeover`). Under `-CC`: 0 and 78 B.

**The blast radius is smaller than "rewrite the attach path" sounds.** `paneConn`
(`internal/server/terminal.go:21-25` — Read/Write/Resize/Close) is unchanged, so both pumps,
the registry, every close code and the protocol stay put. measurements.md §2 findings 2-4:
input over the running client's stdin (no fork per keystroke); `resize-window` still required
alongside `refresh-client -C`; death is `%exit` → EOF, so the EIO→EOF mapping, 4001 and the
liveness nudge survive verbatim. `termbridge.go` is 101 lines.

**What I am not claiming**: the opening-frame reconstruction (measurements.md:114-117) is
inferred, not built. That is the one real risk — and a *measurable* one: attach a real Claude
pane over `-CC`, feed `capture-pane -e -p` plus the §3 mode preamble, diff against today's
frame. Note `capture-pane` as a **display** source is explicitly blessed (CLAUDE.md:70);
only state is forbidden.

### Turn 1 — advocate-b (argument)

**Steelman.** The record does leave this open: the premise `stack-terminal-backing-tmux` calls stale is *polling*, `-CC` is itself a push path, and `surfaces-scrollback-affordance-not-built:20` parks bandwidth as a live later item. The 12,941→78 B and 6,407→0 B figures are real, and `paneConn` (`internal/server/terminal.go:21-25`) genuinely absorbs the change. I accept all of that and won't re-argue it.

**But the win is in a unit with no measured consequence.** Those bytes cross loopback. The only user-facing number anyone has measured is S4 §6's keystroke→frame p50 **5.0 ms** / p95 **12.2 ms** *with tmux already in the loop* (S6:153-155). measurements.md:118-120: CPU, latency and battery unmeasured on both paths; a real-session A/B unmeasured (:108-111). Your six-tile arithmetic multiplies a figure whose "trigger and cadence are unidentified — one such repaint in one 11 s window" (:40-41, :112-113). ~38 KB per round on loopback, at an unknown rate, one user, one Mac: neither of us can name the symptom.

**The reconstruction hole is measured, not merely unbuilt.** `#{pane_bracketed_paste}` returned **empty** on 3.7b (measurements.md:100-102). `web/src/terminal/pane.ts:306-313`: drops and text pastes go through xterm's paste routine, which "wraps in bracketed-paste markers **iff the application enabled mode 2004**" — and xterm.js learns 2004 only from the stream. Plain attach replays the pane's modes inside that 12,941 B; `-CC` sends nothing (:70-74), and §3 offers no variable to synthesize this one. Option A therefore ships unbracketed paste into Claude Code *and* into the shell surface (`contract.md:57-61` — byte-identical frames, same bridge). `drop.spec.ts` pastes only newline-free paths, so the E2E suite stays green while multi-line paste breaks. That is exactly "a green verdict hiding one".

**Finding, per the brief.** Option A does require a `docs/protocol.md` edit: :912-914 states the binary frame is "raw PTY output bytes (tmux attach stream), verbatim — the daemon transforms nothing". Frame *shapes* are unchanged; that sentence becomes false, and the generated `surfaces/contract.md` with it.

**Cost.** `surfaces-shared-attach-single-pty:20` — capture-pane is "a test oracle and a snapshot source, never the display path" — needs a superseding ADR. And TODO.md:69-71 makes every Pre-v1 item blocking: this is the only one with no user-visible symptom and the largest unbuilt risk. "Later" is what its own ADR already calls it.

### Turn 2 — advocate-a (concession)

**Steelman.** The byte win is real but denominated in a unit with no measured consequence:
the only user-facing number anyone has, S4 §6's keystroke→frame p50 5.0 ms / p95 12.2 ms,
was measured *with tmux's amplification already inside it*; CPU, latency and battery are
unmeasured on both paths; and the reconstruction Option A depends on has an identified hole
(bracketed paste) that today's E2E suite would not catch.

**I concede: the measured user-facing path already has three orders of magnitude of headroom
over the bytes Option A removes, so the win has nowhere to land.** I verified your S4 citation
and found the rest of §6 (`spikes/S4-findings.md:194-213`): 1.06 MB/s sustained to the browser,
2.71 MB/s peak, catch-up lag 51 ms, Chrome renderer **~0% CPU idle**, browser heap flat. A
6.4 KB sporadic idle repaint and a 13 KB attach handshake sit ~1000× under that. My six-tile
arithmetic multiplied a number that was never near a limit.

**And §6 carries evidence against my own side that I missed, which belongs in the record.**
Same table: a 50 MB burst reached the browser as **21 MB** — "tmux coalesces screen updates
rather than forwarding the raw stream". S6 §4 says `%output` is "exactly what the application
running in the pane sent to tmux", plus 1.39× octal escaping and 13 B/line framing. So in the
one regime where CPU is actually measured to be high (120–136% of a core during a firehose),
control mode plausibly sends **more** bytes than plain attach, not fewer. Unmeasured, and
directional only — but my whole case framed `-CC` as strictly dominant, and it is not.

**One correction to your paste point, which does not change the outcome.** The `#{pane_bracketed_paste}`
empty reading is expected for that probe pane: S6 §1's measured Claude Code startup sequence
is `1049h 2J H 1000h 1002h 1003h 1006h` — no 2004 — so the probe cannot distinguish "no such
variable" from "mode legitimately off", and measurements.md:101-102 says as much. That weakens
the hole for the Claude surface. It does not rescue the shell surface, and it is moot given
the above.

My reading of what this records: Option B's "defer past v1, and record why", with the trigger
named — a measured symptom (CPU, battery, or latency outside S4 §6's envelope), not a byte count.
