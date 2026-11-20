# Minor check: better-terminal

Every agent-tagged and orchestrator Minor from the review cycles, the commit that answers it, and how
its "what a fix must make true" is satisfied (read from the diff since its cycle's review commit).

| Minor | Commit | Satisfied how |
|---|---|---|
| cycle 1 code Minor 1 `[web-impl]` popover changed menu behaviour | bdcf47e1 | `render/popover.ts` gains `ignoreOpenDialogs` and `keepOnInnerScroll`, both default off and set only by `features/terminalspanel.ts`; `web/render/popover.spec.ts` (cd2c1ddc) shows a plain menu closing on an inner scroll and on a pointerdown in an open dialog, and the panel staying open |
| cycle 1 code Minor 2 `[daemon-impl]` PTY end did not broadcast | b437aef2 | the shell pump's `nudge` calls `f.changed`; `TestHandleShellTerminal_PTYEndBroadcastsTheRemainingList` (f7a1d681) asserts the broadcast with no poll tick |
| cycle 1 code Minor 3 `[web-impl]` stale list after a spawn | — | below the confidence bar; in `proposed-backlog.md` |
| cycle 1 code Minor 4 `[web-tests]` W4 controller path | 210ee74f | `features/surfaces.test.ts` drives rename and close with a `no_shell` result and asserts no throw and no notice |
| cycle 1 code Minor 5 `[orchestrator]` promote focus | 03d76423 | `**Features**: surfaces, focus`; focus removed from `**Touches**` |
| cycle 1 maint Minor 1 `[web-impl]` third inline rename field | bdcf47e1 | the web-implementation.md `design:` line pastes the grep and states why neither editor fits (blur cancels in the panel, Enter/Esc must not bubble to the popover) — the fix's second option |
| cycle 1 maint Minor 2 `[daemon-impl]` shellActivity names | b437aef2 | the terminal wire moved to `terminalswire.go`; the `design:` line states why the poller types keep their names (a rename breaks test files the impl agent may not edit) — the fix's second option |
| cycle 1 maint Minor 3 `[daemon-impl]` spawnInSession success by side effect | b437aef2 | `spawnInSession` returns a bool both handlers branch on, as `parseSessionID`/`sessionOr404` do; table-tested in f7a1d681 |
| cycle 1 maint Minor 4 `[daemon-impl]` renderfix.go size | b437aef2, 273dcb29 | the fake tmux moved to `renderfix_tmux.go` (540 lines left, under main's 564) with a Decisions reason; the split file carries the `renderfix` tag (cycle 3 maintainability confirmed) |
| cycle 2 code Minor 1 `[render-tests]` criterion ids in titles | 4f956943, ef2afab0 | every title in `web/render/popover.spec.ts` and `terminals.spec.ts` cites the REQ its criterion falsifies; cycle 3 correctness checked each against plan.md |
