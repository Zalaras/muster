# Decision brief: tmux-control-mode

**Question**: Should Muster move the terminal attach path to tmux control mode (`tmux -CC`), or keep plain `tmux attach`?
**Source**: User question, 2026-09-13, during `/plan-work tmux-cc-flag` (TODO.md § Pre-v1 Cleanup, "Terminal bandwidth — `tmux -CC` control mode")
**Option A**: Move the terminal attach path to tmux control mode (`tmux -CC attach-session`). `internal/termbridge` becomes a control-mode protocol client: it parses `%output` notifications back into raw application bytes, sends input as `send-keys -H` commands on the control client's stdin, resizes with `refresh-client -C` plus `resize-window`, and reconstructs the opening screen itself with `capture-pane -e -p` plus synthesized terminal modes.
**Option B**: Keep plain `tmux attach`. `internal/termbridge` stays a raw byte pipe between a PTY and the WebSocket. Close the TODO entry as won't-fix (or defer it past v1), and record why.

## Pinned reading list (both advocates read all of it before turn 1)

- `TODO.md` — § Pre-v1 Cleanup, the "Terminal bandwidth" entry (quoted verbatim below), and the surrounding list, so you can see what else is blocking v1 and what this competes with for time.
- `spikes/S6-scroll-bandwidth.md` — the original measurement (§3 the 19.4×/2.1× table, §4 why 2.1× is irreducible, §7 the ranked options table, §8 follow-ups). Note its own version-drift warning at the top.
- `plans/decisions/tmux-control-mode/measurements.md` — **fresh measurements taken 2026-09-12 during planning**, on tmux 3.7b with Muster's exact server options. These confirm some of S6 and correct one of its headline claims. Read this before arguing from S6's numbers.
- `internal/termbridge/termbridge.go` — the whole file. This is what Option A rewrites; it is ~100 lines today.
- `internal/server/terminal.go` — the socket handler, the takeover registry, and the two byte pumps that sit on top of the bridge.
- `internal/tmux/tmux.go` — the CLI wrapper, and in particular `serverOptions` (the 11 options and the long comments explaining why each is set) and `AttachArgv`.
- `docs/features/surfaces/spec.md` and `docs/features/surfaces/contract.md` — the feature and the daemon↔UI contract for `kb:anchor/terminal.ws`.
- `docs/adr/stack-terminal-backing-tmux.md` — **accepted**. Read its Consequences paragraph closely; it contains the sentence "the earlier premise that control mode might be needed is stale". Both advocates must engage with whether that sentence binds here.
- `docs/adr/surfaces-shared-attach-single-pty.md` — **accepted**. Note "never resize-pane or capture-pane polling".
- `docs/adr/surfaces-scrollback-affordance-not-built.md` — **rejected**. Its Consequences paragraph explicitly parks control-mode bandwidth as "a separate later item".
- `docs/adr/surfaces-one-live-client-per-attach-target.md` and `docs/adr/surfaces-detach-on-destroy-on.md` — the invariants any new attach path must preserve.
- `docs/conventions.md` — § Testing (what a change like this owes in tests), § Commits.
- `CLAUDE.md` — the Hard rules, especially "NEVER derive session state by parsing terminal output — hooks and status line only. tmux `capture-pane` is a test oracle and display source, never a state source", and the testing bar.
- `web/e2e/terminal.spec.ts`, `web/e2e/shell.spec.ts`, `web/e2e/drop.spec.ts` — the E2E surface area that must keep passing either way.
- `web/src/terminal/pane.ts` — the xterm.js consumer, to see what actually parses these bytes.

## The question, verbatim

From `TODO.md` § Pre-v1 Cleanup:

> - [ ] **Terminal bandwidth — `tmux -CC` control mode** — moved here from the #13 scroll-fix
>   follow-ups on 2026-09-09 (Damian): a plan of its own rather than a loose end of that fix.
>   Today's `tmux attach` path costs **19.4×** the bytes of a bare PTY for the same repaint, and
>   1,759 bytes/sec while idle against zero (S6 §3). `tmux -CC` control mode measured **2.1×**
>   and would keep tmux, session identity, reconcile and the existing tests intact (S6 §4).
>   Complementary to the `CLAUDE_CODE_SCROLL_SPEED` fix that shipped for #13: `SCROLL_SPEED` cuts
>   the *number* of repaints, `-CC` would cut the cost of each.

## What is NOT in scope for this debate

Settle the question above only. These are explicitly out of bounds — do not argue for them,
and do not let them decide the question:

- Dropping tmux entirely (S6 §7 row 3). Rejected by `kb:adr/stack-terminal-backing-tmux`.
- `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN` and scrollback affordances. Settled by
  `kb:adr/surfaces-scrollback-affordance-not-built`.
- Any change to `docs/protocol.md`. Both options leave the daemon↔UI wire contract identical;
  if you think an option requires a protocol change, say so explicitly as a finding rather
  than proposing the change.
- Whether the work goes behind a runtime toggle. That is a follow-on implementation question
  for the plan, not this decision. Assume for the debate that Option A ships as the single
  attach path.

## Rules

Up to 3 turns each, ≤400 words per turn, advocate-a opens. Argue from the pinned docs and
measurable consequences; cite `file:line`; steelman before rebutting; concede when convinced.
No underhanded tactics — no straw-manning your opponent's position, no citing a document for
something it does not say, no inventing numbers. If a number you need has not been measured,
say it is unmeasured and argue about what its absence means. The goal is the best outcome for
this codebase, not a win. Append each turn to `debate.md` before sending it. The ending turn's
author reports once to `main`. Agent names: advocate-a (Option A), advocate-b (Option B).
