# Doc Reconcile: general-cleanup

**Verdict**: reconciled
**Features derived**: ingest, lifecycle, surfaces, actions, launch, connection, reader, theme, triage (plan header: ingest, lifecycle, surfaces, actions, connection, theme, reader, triage, launch)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| ingest | Envelope routes only when `tmuxPane` corroborates the session's recorded pane; absent/mismatched persists unrouted; unrecorded pane routes on `musterSession` alone | `internal/server/ingest.go:232` `resolveSessionID` | added |
| ingest | Unqualified "never guessed from cwd" sentence | — | replaced (not appended) with the qualified sentence above |
| lifecycle | Once shutdown begins, the periodic poll and PTY-EOF nudge stop persisting `alive=false`; on-exit policy or next boot's reconcile is sole authority; End's own path unaffected | `internal/session/manager.go:1477` `checkOneLiveness` (`endOnCheckError`/`stopped` guard), `:189` `Stop` | added |
| lifecycle | `kill` also kills every shell and the prompt counts them; `leave` leaves shells as it leaves sessions | `cmd/musterd/main.go:513` `shutdownGracefully`, `:525` `ShellCount`, `:548` `KillAllShells`, `:770` `askKillPrompt` | added |
| lifecycle | "unknown Muster-shaped tmux sessions are logged and never adopted, and every shell tmux session is killed" | — | compressed to "unknown `muster-` names are logged, never adopted; shells are killed" (readability choice per amended R4, not a budget necessity — body measures 700 words, well under 800) |
| surfaces | Shell "dies on exit, Remove, reconcile or a kill shutdown" | `docs/adr/surfaces-shell-dies-at-kill-shutdown-too.md` (supersedes the lifetime ADR); code as above | replaced "dies on exit, Remove or reconcile" and its citation of the now-superseded ADR |
| surfaces, actions, launch | A failed request returns a fixed-phrase `message`; the raw tmux/OS error is in the daemon log only | `internal/server/sessions.go:82-87` (`msgEndFailed`/`msgLaunchFailed`/…), `internal/server/shells.go:190` (`msgShellSpawnFailed`) | one sentence added to each of the three specs |
| launch | "A settings file that exists but is not valid JSON fails the launch and names the file" | `internal/server/sessions.go:223-226` `writeSettings` error path returns `launchFailed()` (fixed phrase); only the adjacent `log.Error()` carries the directory | **contradiction found and fixed** — the body no longer names the file; rewritten to say the fixed-phrase body and log-only detail |
| connection | The pop-out reads `connecting…` until its first `hello` and follows theme broadcasts, sharing `kb:adr/connection-banner-only-after-first-hello`'s rule | `web/src/doc.ts:74-99` wires `onConnecting`/`onHello`/`onDisconnected` through `createConnectionState`, `onPrefs`/`onClaudeTheme` through `app.emit` | added |
| reader | Pop-out's status line shows `connecting…` until first `hello`, unreachable text after a lost connection, theme follows the dashboard's live broadcasts (one sentence) | `web/src/reader/notice.ts:19-27` `deriveNotice`, `web/src/doc.ts:64` `initTheme` | added |
| theme | The pop-out applies `prefs` and `claudeTheme` broadcasts like the dashboard | `web/src/doc.ts:64,90-94` | added |
| triage | Version check accepts `git describe` dev-build strings (`v`, `-N-gHASH`, `-dirty`) | `internal/triage/checks.go:47-63` `reVersion`/`CheckVersion`, `internal/triage/schema.go:21` (`musterd.version`) | added — no prior sentence on this existed in the spec |
| actions/launch/surfaces | "stops being true: Nothing" | — | no action, confirmed no existing spec sentence claimed raw errors |
| triage/connection/theme/reader | "stops being true: Nothing" | — | no action |
| protocol.md | Both Protocol Contract sentences (pane corroboration, fixed-phrase `message`) | `docs/protocol.md:57-58`, `:718-724` | already landed at plan-approval commit `38f0115`, verified present and matching code — not re-applied |

## Contradictions

One found and fixed in the same pass, not left standing: `docs/features/launch/spec.md` claimed
a corrupt-settings launch failure "names the file" in the response body. REQ-10 removed that —
`writeSettings`'s error path now returns the fixed `msgLaunchFailed` phrase with no detail; only
the daemon log (`Str("directory", dir)`) names the file. Rewritten to state the fixed-phrase body
and log-only file/error, matching `internal/server/sessions.go:221-226`. Since I fixed it as part
of promoting the doc-delta's own "actions, launch, surfaces — becomes true" fixed-phrase claim
(the sentence that stopped being true wasn't in the delta's own "stops being true" list — a defect
the delta missed, not one it flagged), the verdict stays `reconciled`, not `contradiction`: the
spec after my edit matches the code, and nothing shipped disagrees with a delta claim I left
standing.

## For the orchestrator

None.

## Checks

```
$ make gen-kb
go run ./tools/kb gen
kb: all generated files fresh

$ make check-kb
go run ./tools/kb check
kb: 374 records, 23 features, 0 problem(s)
kb: all checks pass
```

Word counts (body, frontmatter and mermaid fences excluded, budget 800):
ingest 526, lifecycle 700, surfaces 477, actions 399, launch 529, connection 483, reader 687,
theme 297, triage 355 — all under budget, confirmed by `check-kb`'s own pass.

Commits (one per feature, generated files unchanged so nothing rides them):
`3d75b91` ingest, `70db3ae` lifecycle, `71d48fd` surfaces, `877ae3a` actions, `1878f93` launch,
`e552298` connection, `720d30e` reader, `1558dc3` theme, `3972d69` triage.

`plans/general-cleanup/orchestration-state.json` is modified in the working tree but was not
touched by this run and is not mine to commit.
