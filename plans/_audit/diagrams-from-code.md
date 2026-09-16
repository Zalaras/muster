# Diagrams drawn from the code — sources

Scratch note, 2026-09-15, branch `diagrams/system-wide`. Every node and edge in the seven
diagrams below was taken from the file:line listed here, not from prose. Not a kb record.

Method: the Go import graph came from `go list -f '{{range .Imports}}...'` over the module,
cross-checked against the import blocks with grep; the web graph from resolving every relative
`from "..."` specifier to a file and collapsing to its directory; the schema from reading all
eight migrations; the state machine, sequences and pipeline flow from the functions and SKILL.md
lines cited below.

## kb:diagram/daemon-components

Adjacency confirmed twice — `go list` over every package, then the import lines below. The
absences are as load-bearing as the edges: `internal/store`, `internal/tmux` and
`internal/claudecode` import nothing internal.

| Edge | Import site |
|---|---|
| cmd/musterd → claudecode | `cmd/musterd/main.go:29` |
| cmd/musterd → locate | `cmd/musterd/main.go:30` |
| cmd/musterd → selfupdate | `cmd/musterd/main.go:31`, `cmd/musterd/update.go:13` |
| cmd/musterd → server | `cmd/musterd/main.go:32` |
| cmd/musterd → store | `cmd/musterd/main.go:33` |
| cmd/musterd → tmux | `cmd/musterd/main.go:34`, `cmd/musterd/preflight.go:9` |
| cmd/musterd → webui | `cmd/musterd/main.go:35` |
| server → claudecode | `internal/server/ingest.go:13`, `sessions.go:18`, `reader.go:21`, `state.go:8`, `themepoll.go:11`, `usage.go:10`, `usagepoll.go:12`, `issue.go:23` |
| server → session | `internal/server/server.go:13`, `ingest.go:14`, `terminal.go:15`, `sessions.go:20` (+7 more) |
| server → store | `internal/server/server.go:14`, `ingest.go:15`, `prefs.go:10`, `repos.go:11`, `issue.go:26`, `usage.go:11` |
| server → termbridge | `internal/server/server.go:15` |
| server → tmux | `internal/server/server.go:16`, `sessions.go:22`, `shells.go:18`, `update.go:18` |
| server → webui | `internal/server/server.go:17` |
| server → locate | `internal/server/server.go:12`, `locate.go:12` |
| server → usage | `internal/server/ingest.go:16`, `usage.go:12`, `usagewire.go:6`, `usagepoll.go:13` |
| server → selfupdate | `internal/server/state.go:9`, `update.go:16` |
| server → ghissue | `internal/server/issue.go:24` |
| server → gitutil | `internal/server/browse.go:11`, `repos.go:10`, `sessions.go:19` |
| session → claudecode | `internal/session/manager.go:14`, `machine.go:6`, `status.go:3` |
| session → store | `internal/session/manager.go:15` |
| session → tmux | `internal/session/manager.go:16` |
| termbridge → tmux | `internal/termbridge/termbridge.go:22` |
| usage → store | `internal/usage/aggregator.go:11`, `modelscoped.go:12` |
| kb → claudecode | `internal/kb/load.go:13` |
| tools/kb → kb | `tools/kb/main.go:25` |
| tools/triage → triage | `tools/triage/main.go:26` |
| tools/versions → claudecode | `tools/versions/main.go:26` |

Claims in the body: session's consumer-side ports `PaneChecker` / `PaneSnapshotter` / `Killer` at
`internal/session/manager.go:22,29,36`, satisfied by `*tmux.Client` and injected at
`internal/server/server.go:135` and `server.go:155-157`; ingest is a feature file, not a package —
`internal/server/ingest.go:222` (`ingestFeature`), `ingest.go:30` (`ingestQueue`).

### External wires (added when the C4 review found the diagram had none)

Each external in the component diagram is owned by exactly one component; these are the call
sites. Names match kb:diagram/containers.

| External | Owning component | Evidence |
|---|---|---|
| SQLite | `internal/store` | `internal/store/store.go:28` open, `:34` WAL, `:38` `PRAGMA foreign_keys = ON`, `:32` single connection |
| Data directory | `cmd/musterd` | wrapper scripts written at `cmd/musterd/main.go:381`, paths handed on at `:420-421`; writer is `internal/claudecode/settings.go:276` |
| tmux server | `internal/tmux`, `internal/termbridge` | `internal/tmux/tmux.go:54` socket flag, `:107`/`:134` new-session, `:461` capture-pane; `internal/termbridge/termbridge.go:59` attach argv, `:89-97` resize |
| Claude Code | hosted by tmux, posts to `internal/server` | spawn `internal/server/sessions.go:271`; posts land at `internal/server/ingest.go:252-268` |
| Repositories | `internal/server` | settings write `internal/server/sessions.go:396-413`; `.md` reads `internal/server/reader.go:172`, `:200` |
| Claude Code files | `internal/claudecode` | transcript/plan `internal/claudecode/plan.go:87`, theme `internal/claudecode/theme.go:60` |
| Anthropic usage API | `internal/claudecode` | `internal/claudecode/usageapi.go:69` `GET <base>/api/oauth/usage`, bearer at `:78` |
| macOS Keychain | `internal/claudecode` | `internal/claudecode/credentials.go:33` exec, `:50` 2 s timeout, `security` named at `:26` |
| GitHub | `internal/ghissue`, `internal/selfupdate` | issues `internal/ghissue/ghissue.go:166`; release tag `internal/selfupdate/release.go:24-31` HEAD redirect |
| gh | `internal/ghissue` | `gh auth token` bounded at `internal/ghissue/ghissue.go:45`, reader at `:77` |
| git | `internal/gitutil` | `internal/gitutil/gitutil.go:50` `exec.CommandContext(ctx, "git", ...)` |
| Spotlight | `internal/locate` | `internal/locate/spotlight.go:12-14`, exec at `:33` |
| Dashboard | `internal/webui` | `internal/webui/webui.go:21` embedded FS, served at `internal/server/server.go:295-301` |

Browser `localStorage`, the dashboard's only external: `web/src/theme.ts:52`, `:80` (theme hint);
`web/src/reader/memory.ts:3`, used at `web/src/features/reader.ts:132`, `:171` and cleared at
`web/src/features/actions.ts:97`.

## kb:diagram/web-components

Counts are the number of distinct import statements behind each directory-level edge.

| Edge | Count | Example site |
|---|---|---|
| features → render | 26 | `web/src/features/actions.ts:20` |
| features → app | 16 | `web/src/features/actions.ts:11` |
| features → protocol | 13 | `web/src/features/actions.ts:24` |
| features → dom | 12 | `web/src/features/actions.ts:13` |
| features → api | 11 | `web/src/features/actions.ts:12` |
| features → sessions | 8 | `web/src/features/focus.ts:29` |
| features → terminal | 7 | `web/src/features/focus.ts:26` |
| features → reader | 6 | `web/src/features/actions.ts:14` |
| features → theme | 2 | `web/src/features/settings.ts:8` |
| features → shortcuts | 2 | `web/src/features/launch.ts:28` |
| render → sessions | 12 | `web/src/render/confirm.ts:7` |
| render → protocol | 9 | `web/src/render/confirm.ts:6` |
| render → terminal | 3 | `web/src/render/dead.ts:13` |
| render → api | 2 | `web/src/render/dead.ts:9` |
| render → reader | 2 | `web/src/render/reader.ts:17` |
| main → features | 16 | `web/src/main.ts:17` |
| main → app / ws / render | 1 each | `web/src/main.ts:16`, `:34`, `:33` |
| doc → features | 2 | `web/src/doc.ts:23` |
| doc → app / dom / ws | 1 each | `web/src/doc.ts:21`, `:22`, `:25` |
| app → protocol / render / sessions | 1 each | `web/src/app.ts:16`, `:5`, `:17` |
| sessions → protocol | 6 | `web/src/sessions/card.ts:4` |
| terminal → api | 2 | `web/src/terminal/drop.ts:5` |
| terminal → render / protocol | 1 each | `web/src/terminal/pane.ts:12`, `:11` |
| reader → sessions | 1 | `web/src/reader/freshness.ts:5` |
| api → protocol | 1 | `web/src/api.ts:6` |
| ws → protocol | 1 | `web/src/ws.ts:20` |
| theme → protocol | 1 | `web/src/theme.ts:5` |

No `features/*` module imports another — checked, the edge set above has no features→features
entry. Two Vite entries: `web/vite.config.ts:47-48`. The seam's state, events and render phases:
`web/src/app.ts:19-48`.

## kb:diagram/store-schema

Every table and column read from the migrations verbatim.

- `kv` — `internal/store/migrations/0001_init.sql:4-7`
- `event` — `0001_init.sql:9-21`; `UNIQUE (claude_session_id, seq)` at `:20`; `session_id` added
  `0002_sessions.sql:49`; `idx_event_session_id` at `0002_sessions.sql:51`
- `repo` — `0002_sessions.sql:5-16`; `path` UNIQUE at `:7`
- `session` — `0002_sessions.sql:18-47`; **the schema's only FK**, `repo_id INTEGER NOT NULL
  REFERENCES repo(id)`, no `ON DELETE`, at `0002_sessions.sql:26`; `tmux_target`'s deliberate
  absence of UNIQUE explained inline at `:20-23`
- `session` later columns — `0003_gauges.sql:17-20`, `0004_reconcile.sql:3-4`,
  `0006_rail_order.sql:4-5` (backfill `UPDATE` at `:6`), `0007_title_override.sql:3`,
  `0008_reader.sql:3-5`
- `usage_sample` — `0003_gauges.sql:5-15`
- `usage_model_sample` — `0005_usage_model.sql:6-13`
- `schema_migrations` — created in Go, `internal/store/migrate.go:59-64`
- `PRAGMA foreign_keys = ON` (so the FK is enforced) — `internal/store/store.go:38`;
  `PRAGMA journal_mode = WAL` at `:34`

## kb:diagram/pipeline-execution-order

- `/spec` sets `Status: Approved | Draft`; "`/plan-work` refuses a `Draft` spec" —
  `.claude/skills/spec/SKILL.md:149-150`, template `:160`
- `/plan-work` refuses a spec not `Approved` — `.claude/skills/plan-work/SKILL.md:44`
- On approval: plan-lint, merge the protocol delta, write `proposed` ADRs —
  `.claude/skills/plan-work/SKILL.md:137`, `:439`
- `/orchestrate` refuses a draft plan or any FAIL, "spawn nobody" —
  `.claude/skills/orchestrate/SKILL.md:23`
- Stage order, parallel pairs, retry loops cited as this diagram —
  `.claude/skills/orchestrate/SKILL.md:54`
- `/retro` commits on the plan branch so it rides the squash — `.claude/skills/retro/SKILL.md:106-108`
- `/land` preflight: `**Verdict**: approved` read from disk, state `completed`, clean tree, no
  remaining `proposed` ADR — `.claude/skills/land/SKILL.md:32`, `:34`, `:35-36`, `:49-50`; never
  land an unapproved verdict at `:172`

## Inline: lifecycle state diagram

One arm per input kind in `applyInput`, `internal/session/machine.go:22-110`:

| Transition | Line |
|---|---|
| bind / clear_rebind → started | `machine.go:24-25`, `applyBind` `:120`, escalation `:122-124`, `setState(StateStarted)` `:175` |
| resume_bind → idle | `machine.go:172-174` |
| turn_activity → working or planning | `machine.go:27-46`, `sess.setState(sess.activeState(), now)` `:46` |
| straggler guard (returns, no transition) | `machine.go:29-32` |
| needs_input_permission → needs_input | `machine.go:48-62` |
| needs_input_idle → needs_input | `machine.go:64-71` |
| turn_closed → idle | `machine.go:73-84` |
| turn_failed → failed | `machine.go:86-98` |
| compaction — counter only | `machine.go:100-101` |
| death_hint — `alive=false`, no state change | `machine.go:103-106` |
| clear_death_hint / inert — no-op | `machine.go:108-110` |

The latch picks planning vs working: `activeState()` `internal/session/session.go:178-183`. The
six states: `internal/session/session.go:12-19`. The twelve input kinds:
`internal/claudecode/interpret.go:14-25`.

## Inline: ingest sequence

- Handler: token compare then 404, read body, enqueue, 200 — `internal/server/ingest.go:252-268`
- "No DB work happens on this path" — `internal/server/ingest.go:249-251`
- Queue drops rather than backpressures — `internal/server/ingest.go:66-74`
- Single worker goroutine — `internal/server/ingest.go:76-84`
- Parse → resolve → insert → apply, in that order — `internal/server/ingest.go:108-166`
- `seq = MAX(seq)+1` scoped to `claude_session_id`, in the insert itself —
  `internal/store/store.go:144-146`, safety note `:134-136`
- status_line branch bypasses Interpret/Apply — `internal/server/ingest.go:143-146`, `:169-196`
- status_line branch also hands the account sample to the usage aggregator, only when the payload
  carried one — `internal/server/ingest.go:172-196` (`processStatus`, `q.usage.Record`)
- Broadcast drops for a full outbox — `internal/server/ws.go:98-109`

## Inline: launch sequence

- gitutil probes, then `UpsertRepo` — `internal/server/sessions.go:185-196`
- `writeSettings` before any row or tmux — `internal/server/sessions.go:207-211`, merge at `:396-413`
- `BuildArgv` — `internal/server/sessions.go:213-217`
- `MaxSessionID` floor against orphans — `internal/server/sessions.go:222-227`
- `CreateSession` inserts in `started` — `internal/server/sessions.go:230-239`
- spawn under the per-session lock, `ErrSessionExists` → rollback, raise floor, retry —
  `internal/server/sessions.go:266-285`, retry at `:248-252`
- `MUSTER_SESSION` in the pane env — `internal/server/sessions.go:151-163`
- `RecordLaunch`, and the kill-window rollback if it fails — `internal/server/sessions.go:287-300`
