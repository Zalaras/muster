# Doc Reconcile: better-terminal

**Verdict**: reconciled
**Pack**: not recorded (pack not run; claims verified directly against source)
**Features derived**: surfaces, focus, connection, groups, actions, launch, lifecycle, reader, tiles (plan header: Features surfaces, focus; Touches tiles, lifecycle, connection, update, actions, groups, launch, reader). Every changed file maps inside the header sets.

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| surfaces | several terminals, switched by `claude \| shell \| ▾ \| docs` | `web/src/render/surfaceseg.ts` (root.append claude, shell, terminalsBtn, docs) | rewritten |
| surfaces | Terminals panel: name, running/idle, shown marker, rename, close, New terminal | `web/src/render/terminalspanel.ts` (stateWord, aria-current, renameBtn, closeBtn, New terminal) | added |
| surfaces | segment reads `shell`; count at 2+; tooltip names shown terminal | `surfaceseg.ts` (view.count < 2, title = shownName) | added |
| surfaces | name `shell N`, lowest free, lasts as long as the terminal | `internal/server/shellregistry.go:lowestFree`, `terminalnames.go:defaultTerminalName/forget` | added |
| surfaces | on end, lowest-numbered running terminal takes over, else claude | `web/src/terminal/surfaceswitch.ts:terminalsChanged` | added |
| surfaces | spinner/tick follow any terminal | `web/src/terminal/shellactivity.ts` (any-terminal-busy) | replaced |
| surfaces | old single-shell `claude \| shell` sentence | — | deleted |
| focus | cluster holds `claude \| shell \| ▾ \| docs` | `surfaceseg.ts` | edited |
| design-system | already promoted (03d76423) | verify only | none |
| protocol | `ws.shell-activity` slug stays | decision, no edit | none |
| protocol | PTY-ending detection clause | already in docs/protocol.md § terminals; code honours it | none |
| tiles | footer switch sentence | spec contains no "shell" mention | none |

## Contradictions
None

## For the orchestrator
None. Tiles spec needs no edit; `**Touches**` features were not behaviourally changed beyond the delta.

## Checks
`make gen-kb && make check-kb`: all generated files fresh; 709 records, 29 features, 0 problems; all checks pass.
Words: surfaces 931 (cap 1000), focus 835.
Commits: 2a7aa7a6 (surfaces), 278d1ab5 (focus).
