# Doc Delta — terminal-fixes-cleanup

Seeded from the approved plan's `## Doc Delta` by the orchestrator, to be amended with every
`doc-delta:` line the implementation logs (fix waves included) produce before `doc-reconcile`
is spawned. `plan.md` itself stays as approved.

## surfaces — becomes true

- `docs/features/surfaces/spec.md` states that the shell surface's wheel scrolls the pane's tmux
  history, driven by a `scroll` control frame the daemon translates into copy-mode commands,
  and that tmux mouse mode stays off so browser text selection is preserved.
- It states that Option+Arrow and Cmd+Arrow are translated to their readline equivalents on a
  shell surface only.
- It states that a shell reports a busy flag derived from **three** gates — tmux's foreground
  command, its alternate-screen flag, **and the pane tty's line discipline** — and that the
  segment shows a spinner while busy and a tick once work finishes. The tty gate is
  load-bearing and must not be dropped when this is promoted: it separates a program *waiting*
  for the user (a REPL, a pager, Claude Code's trust prompt — all raw mode) from silent *work*
  (`sleep`, a quiet build — canonical mode). It is why `internal/tty` exists and is the subject
  of `kb:adr/surfaces-shell-busy-from-tmux-process-state`. `docs/protocol.md` already states
  all three; a two-gate sentence here would make the feature spec contradict it.

## surfaces — stops being true

- "A running shell shows a pip with its own token." — deleted; a running, idle shell now shows
  nothing.
- The sentence "tmux owns scrollback, so xterm keeps none and no scroll affordance is built
  (kb:adr/surfaces-scrollback-affordance-not-built)" is narrowed: xterm still keeps none, but
  "no scroll affordance is built" now holds for the Claude pane only.

## theme — becomes true

- Nothing. The pip's token was never named in `docs/features/theme/spec.md`.

## theme — stops being true

- Nothing in the spec body. The retired claim lives in `kb:adr/theme-shell-pip-own-token`'s
  consequence "a new theme must supply it", which `kb:adr/theme-shell-pip-retired-for-activity-indicator`
  retires.

## Amendments from the implementation logs

- From `web-implementation.md`: `docs/features/surfaces/spec.md`'s tick sentence may note the
  reconnect-path nuance if it descends to implementation detail — the plan's own Doc Delta text
  ("the segment shows a spinner while busy and a tick once work finishes") needs no change,
  since it does not specify the clearing mechanism. See
  `kb:adr/surfaces-snapshot-restored-tick-always-self-clears`.
- The new files this plan ships are `owned by no feature` in `make check-kb` and need globs in
  a feature spec: `internal/tty/canonical.go`, `internal/tty/canonical_test.go`,
  `internal/server/shellactivity.go`, `internal/server/shellactivity_test.go`,
  `web/e2e/helpers/shellinput.ts`, `web/e2e/shell-activity.spec.ts`,
  `web/e2e/shell-keys.spec.ts`, `web/e2e/shell-scroll.spec.ts`. These belong under **surfaces**;
  `make check-kb` must be green before the run completes.
