# Doc Reconcile: terminal-fixes-cleanup

**Verdict**: reconciled
**Features derived**: surfaces, theme (plan header: surfaces, theme)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| surfaces | Shell surface's wheel scrolls the pane's tmux history via a `scroll` control frame the daemon turns into copy-mode commands; tmux mouse mode stays off | `web/src/terminal/shellkeys.ts:wheelDeltaToScrollLines`, `internal/server/terminal.go:471` `applyShellTextFrame`/`case "scroll"`, `internal/tmux/tmux.go:404` `ScrollCopyMode`, `internal/tmux/tmux.go:104` `{"set-option", "-g", "mouse", "off"}` | added |
| surfaces | Option+Arrow / Cmd+Arrow translated to readline equivalents, shell surface only | `web/src/terminal/shellkeys.ts:shellKeyBytes` (ESC_B/ESC_F/CTRL_A/CTRL_E), `web/src/terminal/pane.ts` header comment: "`pane.ts` installs neither for `kind === "claude"`" | added |
| surfaces | Shell busy flag derived from three gates — foreground command, alternate-screen flag, pane tty line discipline — spinner while busy, tick once done | `internal/server/shellactivity.go:tick` (`pa.AlternateOn`, `pa.CurrentCommand == p.shellBase`, `p.canonical(pa.Tty)`), `internal/tty/canonical.go:IsCanonical` (`ICANON` via `TIOCGETA`) | added, kept all three gates per instruction — a two-gate sentence would contradict `docs/protocol.md:1018-1021`, which already states all three |
| surfaces | "A running shell shows a pip with its own token" no longer true | `web/src/terminal/surfaceswitch.ts:22` ("the running-shell pip ... is retired"), `web/src/style.css:658` (pip token removed) | deleted |
| surfaces | "no scroll affordance is built" narrows to the Claude pane only; xterm still keeps none | `kb:adr/surfaces-scrollback-affordance-claude-pane-only` (supersedes `surfaces-scrollback-affordance-not-built`), shell wheel-scroll code above (a real affordance now exists for the shell) | narrowed |
| surfaces | 8 files owned by no feature need surfaces globs | `internal/tty/canonical.go`, `internal/tty/canonical_test.go` (new `internal/tty/**` glob); `internal/server/shellactivity.go`, `internal/server/shellactivity_test.go` (new `internal/server/shellactivity*.go` glob); `web/e2e/helpers/shellinput.ts`, `web/e2e/shell-activity.spec.ts`, `web/e2e/shell-keys.spec.ts`, `web/e2e/shell-scroll.spec.ts` (added explicitly to the `e2e` list) — all four E2E files' own headers name "Plan terminal-fixes-cleanup" | added |
| theme | Pip's own token never named in theme spec body | grep confirmed no "pip" text in `docs/features/theme/spec.md` prior to this run | no change (delta explicitly required none) |

Also added to `surfaces/spec.md` frontmatter (not distinct prose claims but required so `kb for <path>` surfaces the new records): `protocol: ws.shell-activity`; `refs:` gained `kb:adr/surfaces-shell-scroll-via-daemon-copy-mode`, `kb:adr/surfaces-shell-busy-from-tmux-process-state`, `kb:adr/surfaces-snapshot-restored-tick-always-self-clears`, and `kb:adr/surfaces-scrollback-affordance-claude-pane-only` in place of the now-superseded `surfaces-scrollback-affordance-not-built`.

Did not add the reconnect self-clear nuance (`kb:adr/surfaces-snapshot-restored-tick-always-self-clears`) to the tick sentence's prose — the delta marked it optional ("may note ... if it descends to implementation detail") and the plan's own wording doesn't specify the clearing mechanism, so no change was needed there; the ADR is still linked in `refs` for `kb for` discoverability.

## Contradictions

None.

## For the orchestrator

None.

## Checks

```
$ make gen-kb
go run ./tools/kb gen
kb: all generated files fresh

$ make check-kb
go run ./tools/kb check
kb: 383 records, 23 features, 0 problem(s)
kb: all checks pass
```

`docs/features/surfaces/spec.md` body: ~581 words (budget 800). `docs/features/theme/spec.md`: unchanged.

Committed as `a1bba9d docs(terminal-fixes-cleanup): reconcile surfaces spec with what shipped` on `plan/terminal-fixes-cleanup` (4 files: `.claude/rules/surfaces.md`, `docs/features/surfaces/INDEX.md`, `docs/features/surfaces/contract.md`, `docs/features/surfaces/spec.md`). No `theme` commit — its spec body required no edit.
